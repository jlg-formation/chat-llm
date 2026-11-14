import { test, expect } from "@playwright/test";
import { setConfig } from "./helpers";
import { ANTHROPIC_CONFIG } from "./anthropicMock";
import type { CapturedRequest } from "./anthropicMock";

test.describe("TC-98 · Provider Anthropic — mode compatible OpenAI", () => {
  test("utilise /v1/chat/completions sans sampling et avec strict: true", async ({
    page,
  }) => {
    await setConfig(page, {
      ...ANTHROPIC_CONFIG,
      llm: {
        ...ANTHROPIC_CONFIG.llm,
        apiFormat: "chat_completions",
        temperature: 0.7,
        topP: 0.5,
      },
      streamEnabled: false,
      jsonSchema: JSON.stringify({ name: "s", schema: { type: "object" } }),
    });
    let captured: CapturedRequest | undefined;
    await page.route("**/v1/chat/completions", async (route) => {
      captured = {
        headers: route.request().headers(),
        body: route.request().postDataJSON(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          choices: [
            { finish_reason: "stop", message: { content: "Compat OK" } },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
      });
    });
    await page.goto("/");
    await page.getByRole("textbox", { name: "Message" }).fill("Test");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(page.locator("main")).toContainText("Compat OK", {
      timeout: 10_000,
    });

    expect(captured!.headers["x-api-key"]).toBe("sk-ant-test-key");
    expect(captured!.body).not.toHaveProperty("temperature");
    expect(captured!.body).not.toHaveProperty("top_p");
    expect(captured!.body.max_completion_tokens).toBe(4096);
    expect(captured!.body.response_format.json_schema.strict).toBe(true);
  });
});
