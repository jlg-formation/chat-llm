import { test, expect, type Page, type Route } from "@playwright/test";
import { setConfig } from "./helpers";

const MCP_URL = "http://localhost:9999";

const MCP_TOOLS = [
  {
    name: "recherche",
    description: "Recherche sur le web",
    enabled: true,
    inputSchema: {},
  },
];

type Handler = (route: Route, body: Record<string, unknown>) => Promise<void>;

function sse(messages: unknown[]): string {
  return messages
    .map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`)
    .join("");
}

/** Faux serveur MCP Streamable HTTP : répond en text/event-stream. */
async function mockMcpStreamable(
  page: Page,
  handlers: Partial<Record<string, Handler>> = {},
) {
  await page.route(`${MCP_URL}**`, async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      if (handlers.DELETE) return handlers.DELETE(route, {});
      await route.fulfill({ status: 405 });
      return;
    }

    const body = (await request.postDataJSON()) as Record<string, unknown>;
    const method = (body.method as string) ?? "";

    const custom = handlers[method];
    if (custom) return custom(route, body);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    };

    if (method === "initialize") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { ...headers, "Mcp-Session-Id": "sess-sse" },
        body: sse([
          {
            jsonrpc: "2.0",
            method: "notifications/message",
            params: { level: "info" },
          },
          {
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-03-26", capabilities: {} },
          },
        ]),
      });
    } else if (method.startsWith("notifications/")) {
      await route.fulfill({ status: 202, headers });
    } else if (method === "tools/list") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers,
        body: sse([
          { jsonrpc: "2.0", id: body.id, result: { tools: MCP_TOOLS } },
        ]),
      });
    } else if (method === "tools/call") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers,
        body: sse([
          {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: "Résultat SSE de test" }],
            },
          },
        ]),
      });
    }
  });
}

/** Ouvre l'accordéon "Serveurs MCP" et déplie la carte du premier serveur. */
async function openMcpServerCard(page: Page) {
  await page.getByRole("button", { name: "Serveurs MCP" }).click();
  const region = page.getByRole("region", { name: "Serveurs MCP" });
  await region.getByRole("button", { name: "Développer" }).first().click();
  return region;
}

test.describe("TC-94 · Serveur MCP en Streamable HTTP (SSE)", () => {
  test("les outils sont chargés depuis des réponses text/event-stream", async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpUrl: MCP_URL,
      mcpName: "SSE MCP",
      mcpEnabled: false,
    });
    await mockMcpStreamable(page);
    await page.goto("/");

    const mcpRegion = await openMcpServerCard(page);
    await mcpRegion
      .locator('input[type="checkbox"]')
      .first()
      .click({ force: true });

    await expect(mcpRegion.getByText("recherche", { exact: true })).toBeVisible(
      { timeout: 10_000 },
    );
  });

  test("l'inspecteur HTTP affiche le content-type SSE et le résultat reconstruit", async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpUrl: MCP_URL,
      mcpName: "SSE MCP",
      mcpEnabled: false,
    });
    await mockMcpStreamable(page);
    await page.goto("/");

    const mcpRegion = await openMcpServerCard(page);
    await mcpRegion
      .locator('input[type="checkbox"]')
      .first()
      .click({ force: true });
    await mcpRegion
      .getByText("recherche", { exact: true })
      .waitFor({ timeout: 10_000 });

    const inspector = page.getByRole("complementary", {
      name: "Inspecteur HTTP",
    });
    await expect(
      inspector.getByText("content-type: text/event-stream").first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(inspector.getByText("protocolVersion").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("désactiver le serveur envoie DELETE avec le Mcp-Session-Id", async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpUrl: MCP_URL,
      mcpName: "SSE MCP",
      mcpEnabled: false,
    });

    const deletedSessions: string[] = [];
    await mockMcpStreamable(page, {
      DELETE: async (route) => {
        deletedSessions.push(route.request().headers()["mcp-session-id"] ?? "");
        await route.fulfill({ status: 200 });
      },
    });
    await page.goto("/");

    const mcpRegion = await openMcpServerCard(page);
    await mcpRegion
      .locator('input[type="checkbox"]')
      .first()
      .click({ force: true });
    await mcpRegion
      .getByText("recherche", { exact: true })
      .waitFor({ timeout: 10_000 });
    await mcpRegion
      .locator('input[type="checkbox"]')
      .first()
      .click({ force: true });

    await expect.poll(() => deletedSessions).toEqual(["sess-sse"]);
  });

  test("un flux SSE sans réponse remonte un timeout", async ({ page }) => {
    test.setTimeout(45_000);
    await setConfig(page, {
      streamEnabled: false,
      mcpUrl: MCP_URL,
      mcpName: "SSE MCP",
      mcpEnabled: false,
    });
    await mockMcpStreamable(page, {
      "tools/list": async () => {
        await new Promise(() => {
          /* flux bloqué */
        });
      },
    });
    await page.goto("/");

    const mcpRegion = await openMcpServerCard(page);
    await mcpRegion
      .locator('input[type="checkbox"]')
      .first()
      .click({ force: true });

    await expect(
      mcpRegion.getByText("MCP timeout", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("un tool_call vers un outil MCP SSE renvoie le résultat au LLM", async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: MCP_TOOLS,
    });
    await mockMcpStreamable(page);

    let llmCallCount = 0;
    await page.route("**/v1/responses", async (route) => {
      llmCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body:
          llmCallCount === 1
            ? JSON.stringify({
                id: "r1",
                output: [
                  {
                    type: "function_call",
                    call_id: "tc1",
                    name: "recherche",
                    arguments: '{"query":"test"}',
                  },
                ],
                usage: { input_tokens: 10, output_tokens: 5 },
              })
            : JSON.stringify({
                id: "r2",
                output: [
                  {
                    type: "message",
                    role: "assistant",
                    content: [
                      { type: "output_text", text: "Résultat SSE reçu." },
                    ],
                  },
                ],
                usage: { input_tokens: 20, output_tokens: 5 },
              }),
      });
    });

    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("Recherche quelque chose");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");

    await expect(
      page.locator("main").getByText("Résultat SSE reçu."),
    ).toBeVisible({ timeout: 15_000 });
  });
});
