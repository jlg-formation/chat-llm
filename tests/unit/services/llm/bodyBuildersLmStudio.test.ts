import { describe, it, expect } from "vitest";
import { buildLmStudioChatBody, buildBody } from "@/services/llm/bodyBuilders";
import { makeConfig, makeMessage } from "../../fixtures";

describe("buildLmStudioChatBody", () => {
  it("sends only the last user turn with images", () => {
    const messages = [
      makeMessage({ role: "user", content: "premier" }),
      makeMessage({ role: "assistant", content: "ok" }),
      makeMessage({
        role: "user",
        content: "dernier",
        images: [{ dataUrl: "data:z", mimeType: "image/png" }],
      }),
    ];
    const body = buildLmStudioChatBody(
      makeConfig({ streamEnabled: true }),
      messages,
      "sys",
      "resp-1",
    ) as Record<string, unknown>;
    expect(body.input).toEqual([
      { type: "text", content: "dernier" },
      { type: "image", data_url: "data:z" },
    ]);
    expect(body.previous_response_id).toBe("resp-1");
    expect(body.system_prompt).toBe("sys");
    expect(body.store).toBe(true);
  });

  it("ignores errored user messages and sends an empty input when none remain", () => {
    const messages = [
      makeMessage({ role: "user", content: "x", isError: true }),
    ];
    const body = buildLmStudioChatBody(makeConfig(), messages, "") as Record<
      string,
      unknown
    >;
    expect(body.input).toEqual([]);
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("system_prompt");
  });

  it("skips an empty user text but keeps images", () => {
    const messages = [
      makeMessage({
        role: "user",
        content: "",
        images: [{ dataUrl: "data:i", mimeType: "image/png" }],
      }),
    ];
    const body = buildLmStudioChatBody(makeConfig(), messages, "") as {
      input: unknown[];
    };
    expect(body.input).toEqual([{ type: "image", data_url: "data:i" }]);
  });

  it("applies sampling parameters when set", () => {
    const body = buildLmStudioChatBody(
      makeConfig({}, { temperature: 0.1, topP: 0.2, maxTokens: 7 }),
      [],
      "",
    ) as Record<string, unknown>;
    expect(body.temperature).toBe(0.1);
    expect(body.top_p).toBe(0.2);
    expect(body.max_output_tokens).toBe(7);
  });

  it("declares one integration per enabled MCP server with allowed tools", () => {
    const config = makeConfig({
      mcpServers: [
        {
          id: "1",
          name: "Alpha",
          url: "http://a",
          enabled: true,
          tools: [
            { name: "t1", description: "", enabled: true },
            { name: "t2", description: "", enabled: false },
          ],
        },
        {
          id: "2",
          name: "",
          url: "http://b",
          enabled: true,
          tools: [{ name: "t3", description: "", enabled: false }],
        },
        { id: "3", name: "Off", url: "http://c", enabled: false, tools: [] },
        { id: "4", name: "NoUrl", url: "", enabled: true, tools: [] },
      ],
    });
    const body = buildLmStudioChatBody(config, [], "") as {
      integrations: unknown[];
    };
    expect(body.integrations).toEqual([
      { type: "plugin", id: "mcp/Alpha", allowed_tools: ["t1"] },
      { type: "plugin", id: "mcp/2" },
    ]);
  });

  it("omits integrations when no server is enabled", () => {
    expect(buildLmStudioChatBody(makeConfig(), [], "")).not.toHaveProperty(
      "integrations",
    );
  });
});

describe("buildBody", () => {
  it("routes to the LM Studio builder", () => {
    const body = buildBody(
      makeConfig({}, { apiFormat: "lmstudio_chat" }),
      [],
      "",
      [],
      [],
      {
        previousResponseId: "p",
      },
    ) as Record<string, unknown>;
    expect(body.previous_response_id).toBe("p");
    expect(body).toHaveProperty("store", true);
  });

  it("routes to the Responses builder", () => {
    const body = buildBody(
      makeConfig({}, { apiFormat: "responses" }),
      [],
      "",
      [],
      [],
    ) as Record<string, unknown>;
    expect(body).toHaveProperty("store", false);
  });

  it("routes to the Chat Completions builder otherwise", () => {
    const body = buildBody(
      makeConfig({}, { apiFormat: "chat_completions" }),
      [],
      "",
      [],
      [],
    ) as Record<string, unknown>;
    expect(body).toHaveProperty("messages");
  });
});
