import { test, expect } from "@playwright/test";
import { setConfig } from "./helpers";
import { MCP_URL, mockMcpServer } from "./mcpMock";
import { ANTHROPIC_CONFIG, interceptAnthropic } from "./anthropicMock";

async function send(page: import("@playwright/test").Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("textbox", { name: "Message" }).press("Enter");
}

const MCP_CONFIG = {
  mcpUrl: MCP_URL,
  mcpName: "Test MCP",
  mcpEnabled: true,
  mcpTools: [
    { name: "recherche", description: "Recherche", enabled: true, inputSchema: {} },
  ],
};

test.describe("TC-96 · Anthropic — boucle d'outils MCP", () => {
  for (const stream of [false, true]) {
    test(`tool_use → tool_result → réponse finale (streaming ${stream ? "ON" : "OFF"})`, async ({
      page,
    }) => {
      await setConfig(page, {
        ...ANTHROPIC_CONFIG,
        ...MCP_CONFIG,
        streamEnabled: stream,
      });
      await mockMcpServer(page);
      const requests = await interceptAnthropic(page, (_body, n) =>
        n === 1
          ? [
              {
                type: "tool_use",
                id: "toolu_1",
                name: "recherche",
                input: { q: "chats" },
              },
            ]
          : [{ type: "text", text: "Voici le résultat final" }],
      );
      await page.goto("/");
      await send(page, "Cherche");

      await expect(page.locator("main")).toContainText("Voici le résultat final", {
        timeout: 15_000,
      });
      await expect(page.locator("main").getByText("Appel outil :")).toBeVisible();

      const first = requests[0].body;
      expect(first.tools[0]).toMatchObject({
        name: "recherche",
        input_schema: { type: "object" },
      });
      expect(first.tool_choice).toEqual({ type: "auto" });

      const second = requests[1].body.messages;
      expect(second[1]).toEqual({
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_1", name: "recherche", input: { q: "chats" } },
        ],
      });
      expect(second[2]).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: "Résultat MCP de test",
          },
        ],
      });
    });
  }

  test("les blocs de réflexion sont rejoués tels quels avec les tool_use", async ({
    page,
  }) => {
    await setConfig(page, {
      ...ANTHROPIC_CONFIG,
      ...MCP_CONFIG,
      llm: { ...ANTHROPIC_CONFIG.llm, showThinking: true },
      streamEnabled: true,
    });
    await mockMcpServer(page);
    const requests = await interceptAnthropic(page, (_body, n) =>
      n === 1
        ? [
            { type: "thinking", thinking: "Je dois chercher", signature: "SIG123" },
            { type: "redacted_thinking", data: "ENCRYPTED" },
            { type: "tool_use", id: "toolu_1", name: "recherche", input: {} },
          ]
        : [{ type: "text", text: "Fini" }],
    );
    await page.goto("/");
    await send(page, "Cherche");
    await expect(page.locator("main")).toContainText("Fini", { timeout: 15_000 });

    expect(requests[0].body.thinking).toEqual({
      type: "adaptive",
      display: "summarized",
    });
    expect(requests[1].body.messages[1].content).toEqual([
      { type: "thinking", thinking: "Je dois chercher", signature: "SIG123" },
      { type: "redacted_thinking", data: "ENCRYPTED" },
      { type: "tool_use", id: "toolu_1", name: "recherche", input: {} },
    ]);
  });
});

test.describe("TC-97 · Anthropic — affichage de la réflexion", () => {
  for (const stream of [false, true]) {
    test(`le bloc de réflexion est affiché (streaming ${stream ? "ON" : "OFF"})`, async ({
      page,
    }) => {
      await setConfig(page, {
        ...ANTHROPIC_CONFIG,
        llm: { ...ANTHROPIC_CONFIG.llm, showThinking: true },
        streamEnabled: stream,
      });
      await interceptAnthropic(page, () => [
        { type: "thinking", thinking: "Analyse de la question", signature: "S" },
        { type: "text", text: "Réponse après réflexion" },
      ]);
      await page.goto("/");
      await send(page, "Pourquoi ?");

      await expect(page.locator("main")).toContainText("Réponse après réflexion", {
        timeout: 10_000,
      });
      const toggle = page.getByRole("button", { name: /Réflexion/ });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.locator("main")).toContainText("Analyse de la question");
    });
  }

  test("le toggle « Afficher la réflexion » pilote display dans la requête", async ({
    page,
  }) => {
    await setConfig(page, { ...ANTHROPIC_CONFIG, streamEnabled: false });
    const requests = await interceptAnthropic(page, () => [
      { type: "text", text: "ok" },
    ]);
    await page.goto("/");
    await page.getByRole("button", { name: "Sampling" }).click();
    await page.getByRole("switch", { name: "Afficher la réflexion" }).click();
    await send(page, "Test");
    await expect(page.locator("main")).toContainText("ok", { timeout: 10_000 });
    expect(requests[0].body.thinking.display).toBe("summarized");
  });

  test("la réflexion est visible dans l'inspecteur HTTP (streaming)", async ({
    page,
  }) => {
    await setConfig(page, {
      ...ANTHROPIC_CONFIG,
      llm: { ...ANTHROPIC_CONFIG.llm, showThinking: true },
      streamEnabled: true,
    });
    await interceptAnthropic(page, () => [
      { type: "thinking", thinking: "Pensée visible", signature: "S" },
      { type: "text", text: "Fin" },
    ]);
    await page.goto("/");
    await send(page, "Test");
    await expect(page.locator("main")).toContainText("Fin", { timeout: 10_000 });
    await expect(
      page.getByRole("complementary", { name: "Inspecteur HTTP" }),
    ).toContainText("Pensée visible");
  });
});
