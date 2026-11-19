import { useRef, useEffect, useState } from "react";
import type {
  AppConfig,
  ChatMessage as ChatMessageType,
  MessageImage,
} from "../types";
import { ChatMessageView } from "./chat/ChatMessage";
import { ChatInput } from "./chat/ChatInput";
import { buildSystemAndSkills, runAgentLoop } from "./chat/agentLoop";
import { useConfig } from "../store/configStore";
import { genId } from "../services/id";
import { SquarePen } from "lucide-react";
import { resetUsage } from "../store/usageStore";
import {
  getSpendLimitUsd,
  isSpendLimitReached,
  useSpentUsd,
} from "../store/spendGuard";

export function Chat() {
  const [config] = useConfig();
  // Abonnement : redessine le bandeau à chaque dépense
  useSpentUsd();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lmStudioResponseIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text: string, images: MessageImage[]) {
    // Plafond atteint : pas d'images ni de MCP pour cet envoi
    const runConfig: AppConfig = isSpendLimitReached()
      ? {
          ...config,
          mcpServers: [],
          hostedTools: { ...config.hostedTools, imageGeneration: false },
        }
      : config;
    const userMsg: ChatMessageType = {
      id: genId(),
      role: "user",
      content: text,
      images: images.length > 0 ? images : undefined,
    };

    const assistantId = genId();
    const assistantMsg: ChatMessageType = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      thinkingClosed: config.llm.apiFormat === "responses",
    };

    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, assistantMsg]);
    setSending(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const patchAssistant = (patch: Partial<ChatMessageType>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      );
    };
    const updateAssistant = (
      content: string,
      isStreaming: boolean,
      isJson = false,
    ) => patchAssistant({ content, isStreaming, isJson });

    try {
      const { systemPrompt, skillRefs } = await buildSystemAndSkills(runConfig);

      let thinkingText = "";
      // showReasoning ne concerne que OpenAI ; Anthropic reste piloté par showThinking
      const showThinkingBlock =
        config.llm.apiFormat !== "responses" || config.llm.showReasoning;
      const onThinking = (token: string) => {
        thinkingText += token;
        if (showThinkingBlock) patchAssistant({ thinking: thinkingText });
      };
      // Formats stateful : l'historique est porté côté serveur via l'identifiant précédent
      const prevId =
        config.llm.apiFormat === "lmstudio_chat" ||
        config.llm.apiFormat === "google_interactions"
          ? lmStudioResponseIdRef.current
          : undefined;

      const { result, finalContent, hosted } = await runAgentLoop({
        config: runConfig,
        systemPrompt,
        skillRefs,
        messages: newMessages,
        prevId,
        signal: ctrl.signal,
        onContent: updateAssistant,
        onThinking,
        onToolMessages: (toolMsgs) => {
          // Insérer les messages tool avant le message assistant en cours
          setMessages((prev) => {
            const withoutLast = prev.slice(0, -1);
            return [...withoutLast, ...toolMsgs, prev[prev.length - 1]];
          });
        },
        onResetAssistant: () => {
          thinkingText = "";
          patchAssistant({ thinking: undefined });
          updateAssistant("", true);
        },
        onResponseId: (id) => {
          lmStudioResponseIdRef.current = id;
        },
      });

      const isJson =
        !!config.jsonSchema &&
        (() => {
          try {
            JSON.parse(finalContent);
            return true;
          } catch {
            return false;
          }
        })();

      updateAssistant(finalContent, false, isJson);
      // Non-streaming : la réflexion n'arrive qu'avec le résultat final
      if (result.thinking && showThinkingBlock)
        patchAssistant({ thinking: result.thinking });

      const sources = hosted.sources.filter(
        (s, i, all) => all.findIndex((o) => o.url === s.url) === i,
      );
      if (hosted.searches.length > 0 || sources.length > 0)
        patchAssistant({ webSearches: hosted.searches, sources });
      if (hosted.images.length > 0)
        patchAssistant({ generatedImages: hosted.images });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Arrêt demandé par l'utilisateur — on conserve le contenu partiel déjà affiché
        patchAssistant({ isStreaming: false });
      } else {
        patchAssistant({
          content: `Erreur : ${(err as Error).message}`,
          isStreaming: false,
          isError: true,
        });
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  return (
    <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 bg-white border-b border-gray-200">
        <span className="text-sm font-medium text-gray-600">Conversation</span>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              resetUsage();
              lmStudioResponseIdRef.current = undefined;
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            <SquarePen className="w-3.5 h-3.5" />
            Nouvelle discussion
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <p className="text-sm font-medium text-gray-500">
              Commencez une conversation
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Configurez votre provider LLM et envoyez un message
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessageView key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {isSpendLimitReached() && (
        <div className="px-4 py-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-200">
          Plafond de {getSpendLimitUsd().toFixed(2).replace(".", ",")} $ atteint
          : la génération d'images et les outils MCP sont désactivés.
        </div>
      )}
      <ChatInput
        onSend={handleSend}
        onStop={() => abortRef.current?.abort()}
        disabled={sending}
      />
    </main>
  );
}
