import type {
  AppConfig,
  ChatMessage as ChatMessageType,
  HostedActivity,
} from "../../types";
import { sendMessage } from "../../services/llm";
import type { SkillRef, LLMToolCall } from "../../services/llm";
import { callMcpTool } from "../../services/mcp";
import { genId } from "../../services/id";
import {
  loadSkills,
  getSkillContent,
  parseSkillFrontmatter,
} from "../../store/skillsStore";
import { addUsage, addImageUsage } from "../../store/usageStore";
import { addSpend, estimateCallCostUsd } from "../../store/spendGuard";
import { buildToolMessages } from "./toolMessages";

export const MAX_TOOL_ITERATIONS = 100;

type LLMResult = Awaited<ReturnType<typeof sendMessage>>;

export async function buildSystemAndSkills(
  config: AppConfig,
): Promise<{ systemPrompt: string; skillRefs: SkillRef[] }> {
  const skills = await loadSkills();
  const active = skills.filter((s) => s.enabled);
  let systemPrompt = config.systemPrompt ?? "";

  if (active.length === 0) {
    return { systemPrompt, skillRefs: [] };
  }

  const skillRefs: SkillRef[] = active.map((s) => parseSkillFrontmatter(s));

  const skillList = skillRefs
    .map((r) => `- **${r.name}**${r.description ? ` : ${r.description}` : ""}`)
    .join("\n");

  systemPrompt +=
    `\n\n## Skills disponibles\n\n` +
    `Utilise l'outil \`get_skill_details\` pour obtenir les instructions complètes d'un skill si tu en as besoin avant de répondre.\n\n` +
    skillList;

  return { systemPrompt, skillRefs };
}

export async function resolveToolCall(
  call: LLMToolCall,
  mcpServers: AppConfig["mcpServers"],
): Promise<string> {
  if (call.name !== "get_skill_details") {
    for (const server of mcpServers) {
      if (!server.enabled) continue;
      const tool = server.tools.find((t) => t.name === call.name && t.enabled);
      if (tool)
        return callMcpTool(
          server,
          call.name,
          call.args as Record<string, unknown>,
        );
    }
  }

  const skillName = (call.args.name as string) ?? "";
  const skills = await loadSkills();
  const skill = skills.find(
    (s) => s.name === skillName || parseSkillFrontmatter(s).name === skillName,
  );
  if (!skill) return `Skill "${skillName}" non trouvé.`;
  return getSkillContent(skill);
}

export interface AgentLoopParams {
  /** Config d'exécution (plafond de dépense appliqué) */
  config: AppConfig;
  systemPrompt: string;
  skillRefs: SkillRef[];
  messages: ChatMessageType[];
  prevId: string | undefined;
  signal: AbortSignal;
  onContent: (content: string, isStreaming: boolean) => void;
  onThinking: (token: string) => void;
  onToolMessages: (msgs: ChatMessageType[]) => void;
  onResetAssistant: () => void;
  onResponseId: (id: string) => void;
}

export interface AgentLoopResult {
  result: LLMResult;
  finalContent: string;
  hosted: HostedActivity;
}

/** Boucle agentique : appels LLM successifs tant que le modèle demande des outils. */
export async function runAgentLoop(
  p: AgentLoopParams,
): Promise<AgentLoopResult> {
  const { config, systemPrompt, skillRefs, signal } = p;
  let apiMessages = [...p.messages];
  let finalContent = "";
  let partialText = "";
  const hosted: HostedActivity = { searches: [], sources: [], images: [] };

  const activeMcpTools = config.mcpServers
    .filter((s) => s.enabled)
    .flatMap((s) => s.tools.filter((t) => t.enabled));

  const onToken = (token: string) => {
    finalContent += token;
    p.onContent(finalContent, true);
  };

  const callLLM = async () => {
    const res = await sendMessage(
      config,
      apiMessages,
      systemPrompt,
      skillRefs,
      activeMcpTools,
      onToken,
      signal,
      p.prevId,
      p.onThinking,
    );
    if (res.usage) addUsage(res.usage);
    addSpend(estimateCallCostUsd(config, res.usage));
    addImageUsage(
      res.hosted?.images.length ?? 0,
      config.hostedTools.imageModel,
      res.usage?.imageOutputTokens,
      res.usage?.imageInputTokens,
    );
    if (res.hosted) {
      hosted.searches.push(...res.hosted.searches);
      hosted.sources.push(...res.hosted.sources);
      hosted.images.push(...res.hosted.images);
    }
    return res;
  };

  let result = await callLLM();
  if (result.responseId) p.onResponseId(result.responseId);

  let iterations = 0;
  while (
    (result.type === "tool_calls" ||
      (result.type === "text" && result.pausedContent)) &&
    iterations < MAX_TOOL_ITERATIONS
  ) {
    iterations++;
    if (result.type === "text") {
      // Hors streaming, le texte partiel n'est pas émis par onToken
      if (!config.streamEnabled) partialText += result.content;
      apiMessages = [
        ...apiMessages,
        {
          id: genId(),
          role: "assistant",
          content: "",
          rawContent: result.pausedContent,
        },
      ];
      result = await callLLM();
      continue;
    }
    finalContent = "";
    partialText = "";

    const toolResults = await Promise.all(
      result.calls.map(async (call) => ({
        call,
        content: await resolveToolCall(call, config.mcpServers),
      })),
    );

    // Construire les messages tool_call + tool_result et les ajouter à l'historique
    const toolMsgs = buildToolMessages(toolResults, result.thinkingBlocks);
    apiMessages = [...apiMessages, ...toolMsgs];
    p.onToolMessages(toolMsgs);
    p.onResetAssistant();

    result = await callLLM();
  }

  if (!config.streamEnabled && result.type === "text") {
    finalContent = partialText + result.content;
  }

  return { result, finalContent, hosted };
}
