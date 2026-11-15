import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setConfig } from "./helpers";
import { MCP_URL, mockMcpServer } from "./mcpMock";
import { MISTRAL_CONFIG, interceptMistral } from "./mistralMock";

const MCP_CONFIG = {
  mcpUrl: MCP_URL,
  mcpName: "Test MCP",
  mcpEnabled: true,
  mcpTools: [
    {
      name: "recherche",
      description: "Recherche",
      enabled: true,
      inputSchema: {},
    },
  ],
};

const FORMATS = ["chat_completions", "responses"] as const;

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("textbox", { name: "Message" }).press("Enter");
}

test.describe("TC-100 · Provider Mistral — boucle d'outils MCP", () => {
  for (const apiFormat of FORMATS) {
    for (const stream of [false, true]) {
      test(`${apiFormat} : appel d'outil puis réponse finale (streaming ${stream ? "ON" : "OFF"})`, async ({
        page,
      }) => {
        await setConfig(page, {
          ...MISTRAL_CONFIG,
          ...MCP_CONFIG,
          llm: { ...MISTRAL_CONFIG.llm, apiFormat },
          streamEnabled: stream,
        });
        await mockMcpServer(page);
        const requests = await interceptMistral(page, (_body, n) =>
          n === 1
            ? {
                tool: {
                  id: "abc123XYZ",
                  name: "recherche",
                  args: { q: "chats" },
                },
              }
            : { text: "Voici le résultat final" },
        );
        await page.goto("/");
        await send(page, "Cherche");

        await expect(page.locator("main")).toContainText(
          "Voici le résultat final",
          {
            timeout: 15_000,
          },
        );
        await expect(
          page.locator("main").getByText("Appel outil :"),
        ).toBeVisible();

        expect(requests[0].body.tools[0]).toBeDefined();

        const second = requests[1].body;
        if (apiFormat === "responses") {
          expect(second.input).toContainEqual({
            type: "function_call",
            call_id: "abc123XYZ",
            name: "recherche",
            arguments: '{"q":"chats"}',
          });
          expect(second.input).toContainEqual({
            type: "function_call_output",
            call_id: "abc123XYZ",
            output: "Résultat MCP de test",
          });
        } else {
          expect(second.messages).toContainEqual(
            expect.objectContaining({
              role: "assistant",
              tool_calls: [
                expect.objectContaining({
                  id: "abc123XYZ",
                  function: { name: "recherche", arguments: '{"q":"chats"}' },
                }),
              ],
            }),
          );
          expect(second.messages).toContainEqual({
            role: "tool",
            tool_call_id: "abc123XYZ",
            content: "Résultat MCP de test",
          });
        }
      });
    }
  }
});
