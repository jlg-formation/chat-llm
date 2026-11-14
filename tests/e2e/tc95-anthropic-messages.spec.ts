import { test, expect } from "@playwright/test";
import { setConfig } from "./helpers";
import { ANTHROPIC_CONFIG, interceptAnthropic } from "./anthropicMock";

// PNG 1×1 pixel minimal encodé en base64
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function send(page: import("@playwright/test").Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("textbox", { name: "Message" }).press("Enter");
}

test.describe("TC-95 · Provider Anthropic — sélection et configuration", () => {
  test.beforeEach(async ({ page }) => {
    await setConfig(page);
    await page.goto("/");
    await page.getByRole("combobox", { name: "Provider" }).waitFor();
  });

  test("sélectionner Anthropic applique format natif, Haiku et URL éditable", async ({
    page,
  }) => {
    await page
      .getByRole("combobox", { name: "Provider" })
      .selectOption("anthropic");

    await expect(
      page.getByRole("radio", { name: /API Messages/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("radio", { name: /OpenAI compatible/ }),
    ).toBeVisible();
    await expect(page.getByLabel("URL de base")).toBeEnabled();
    await expect(page.getByLabel("URL de base")).toHaveValue(
      "https://api.anthropic.com",
    );
    await expect(page.getByRole("combobox", { name: "Modèle" })).toHaveValue(
      "claude-haiku-5-5",
    );
  });

  test("la liste statique de repli propose les 4 modèles Claude", async ({
    page,
  }) => {
    await page
      .getByRole("combobox", { name: "Provider" })
      .selectOption("anthropic");
    const options = page.locator('select[aria-label="Modèle"] option');
    await expect(options).toHaveCount(4);
    for (const id of [
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "claude-opus-5-5",
      "claude-fable-5-2",
    ])
      await expect(
        page.locator(`select[aria-label="Modèle"] option[value="${id}"]`),
      ).toHaveCount(1);
  });

  test("le chargement dynamique des modèles utilise les headers Anthropic", async ({
    page,
  }) => {
    let headers: Record<string, string> = {};
    await page.route("**/v1/models*", async (route) => {
      headers = route.request().headers();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ data: [{ id: "claude-nouveau-9" }] }),
      });
    });
    await page
      .getByRole("combobox", { name: "Provider" })
      .selectOption("anthropic");
    await page.getByLabel(/Clé API/).fill("sk-ant-load");
    await page.getByRole("button", { name: /Charger/ }).click();

    await expect(page.locator('option[value="claude-nouveau-9"]')).toHaveCount(
      1,
      { timeout: 5_000 },
    );
    expect(headers["x-api-key"]).toBe("sk-ant-load");
    expect(headers["anthropic-version"]).toBe("2026-10-21");
  });

  test("temperature et top-p sont désactivés, la réflexion est réglable", async ({
    page,
  }) => {
    await page
      .getByRole("combobox", { name: "Provider" })
      .selectOption("anthropic");
    await page.getByRole("button", { name: "Sampling" }).click();

    await expect(
      page.getByRole("switch", { name: "Activer Temperature" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("switch", { name: "Activer Top-P (nucleus)" }),
    ).toBeDisabled();

    const thinking = page.getByRole("switch", {
      name: "Afficher la réflexion",
    });
    await expect(thinking).toBeEnabled();
    await page.getByRole("radio", { name: /OpenAI compatible/ }).click();
    await expect(thinking).toBeDisabled();
  });
});

test.describe("TC-95b · Provider Anthropic — API Messages", () => {
  for (const stream of [false, true]) {
    test(`envoi d'un message (streaming ${stream ? "ON" : "OFF"})`, async ({
      page,
    }) => {
      await setConfig(page, { ...ANTHROPIC_CONFIG, streamEnabled: stream });
      const requests = await interceptAnthropic(page, () => [
        { type: "text", text: "Bonjour depuis Claude" },
      ]);
      await page.goto("/");
      await send(page, "Salut");

      await expect(page.locator("main")).toContainText(
        "Bonjour depuis Claude",
        {
          timeout: 10_000,
        },
      );
      const { headers, body } = requests[0];
      expect(headers["x-api-key"]).toBe("sk-ant-test-key");
      expect(headers["anthropic-version"]).toBe("2026-10-21");
      expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
      expect(headers["authorization"]).toBeUndefined();
      expect(body.stream).toBe(stream);
      expect(body.model).toBe("claude-haiku-5-5");
    });
  }

  test("max_tokens est toujours envoyé, temperature et top_p jamais", async ({
    page,
  }) => {
    await setConfig(page, {
      ...ANTHROPIC_CONFIG,
      llm: { ...ANTHROPIC_CONFIG.llm, temperature: 0.7, topP: 0.5 },
      streamEnabled: false,
    });
    const requests = await interceptAnthropic(page, () => [
      { type: "text", text: "ok" },
    ]);
    await page.goto("/");
    await send(page, "Test");
    await expect(page.locator("main")).toContainText("ok", { timeout: 10_000 });

    const { body } = requests[0];
    expect(body.max_tokens).toBe(4096);
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body.thinking).toEqual({ type: "adaptive", display: "omitted" });
  });

  test("le system prompt est envoyé dans le champ system", async ({ page }) => {
    await setConfig(page, {
      ...ANTHROPIC_CONFIG,
      streamEnabled: false,
      systemPrompt: "Tu es un pirate.",
    });
    const requests = await interceptAnthropic(page, () => [
      { type: "text", text: "Arr" },
    ]);
    await page.goto("/");
    await send(page, "Salut");
    await expect(page.locator("main")).toContainText("Arr", {
      timeout: 10_000,
    });
    expect(requests[0].body.system).toBe("Tu es un pirate.");
  });

  test("le structured output utilise output_config.format", async ({
    page,
  }) => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    };
    await setConfig(page, {
      ...ANTHROPIC_CONFIG,
      streamEnabled: false,
      jsonSchema: JSON.stringify({ name: "s", schema }),
    });
    const requests = await interceptAnthropic(page, () => [
      { type: "text", text: '{"a":"x"}' },
    ]);
    await page.goto("/");
    await send(page, "JSON");
    await expect(page.locator("main")).toContainText('"a"', {
      timeout: 10_000,
    });
    expect(requests[0].body.output_config).toEqual({
      format: { type: "json_schema", schema },
    });
  });

  test("une image collée est envoyée en bloc image base64", async ({
    page,
  }) => {
    await setConfig(page, { ...ANTHROPIC_CONFIG, streamEnabled: false });
    const requests = await interceptAnthropic(page, () => [
      { type: "text", text: "Vu" },
    ]);
    await page.goto("/");
    await page.getByRole("textbox", { name: "Message" }).click();
    await page.evaluate((b64: string) => {
      const textarea = document.querySelector("textarea")!;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "p.png", { type: "image/png" }));
      textarea.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, PNG_B64);
    await expect(page.locator('img[alt="Image jointe 1"]')).toBeVisible();
    await send(page, "Décris");
    await expect(page.locator("main")).toContainText("Vu", { timeout: 10_000 });

    const content = requests[0].body.messages[0].content;
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: PNG_B64 },
    });
    expect(content[1]).toEqual({ type: "text", text: "Décris" });
  });

  test("les tokens et le coût estimé s'affichent, la clé est masquée dans l'inspecteur", async ({
    page,
  }) => {
    await setConfig(page, { ...ANTHROPIC_CONFIG, streamEnabled: false });
    await interceptAnthropic(
      page,
      () => [{ type: "text", text: "Réponse OK" }],
      { input_tokens: 42, output_tokens: 17 },
    );
    await page.goto("/");
    await send(page, "Usage");
    await expect(page.locator("main")).toContainText("Réponse OK", {
      timeout: 10_000,
    });

    const usage = page.getByLabel("Usage de la conversation");
    await expect(usage.getByText("42")).toBeVisible({ timeout: 5_000 });
    await expect(usage.getByText("17")).toBeVisible();
    await expect(page.getByText("Coût total estimé")).toBeVisible();

    const inspector = page.getByRole("complementary", {
      name: "Inspecteur HTTP",
    });
    await expect(inspector).toContainText("api.anthropic.com/v1/messages");
    await expect(inspector).toContainText("anthropic-version");
    expect(await inspector.textContent()).not.toContain("sk-ant-test-key");
  });
});
