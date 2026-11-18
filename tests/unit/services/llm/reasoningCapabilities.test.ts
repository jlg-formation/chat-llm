import { describe, it, expect } from "vitest";
import {
  getReasoningEfforts,
  resolveReasoningEffort,
} from "@/services/llm/reasoningCapabilities";
import { makeConfig } from "../../fixtures";

describe("resolveReasoningEffort", () => {
  it("returns medium by default for a supported model", () => {
    expect(resolveReasoningEffort(makeConfig({}, { model: "gpt-5.4" }))).toBe(
      "medium",
    );
  });

  it("returns undefined when the API default is chosen", () => {
    const config = makeConfig(
      {},
      { model: "gpt-5.4", reasoningEffort: "api_default" },
    );
    expect(resolveReasoningEffort(config)).toBeUndefined();
  });

  it("returns the explicit level when supported", () => {
    const config = makeConfig(
      {},
      { model: "gpt-6-luna", reasoningEffort: "max" },
    );
    expect(resolveReasoningEffort(config)).toBe("max");
  });

  it("omits the field for models outside the table or other API formats", () => {
    expect(
      resolveReasoningEffort(makeConfig({}, { model: "gpt-4.1" })),
    ).toBeUndefined();
    expect(
      resolveReasoningEffort(
        makeConfig({}, { model: "gpt-5.4", apiFormat: "chat_completions" }),
      ),
    ).toBeUndefined();
  });

  it("rejects levels that a model does not support", () => {
    expect(getReasoningEfforts("gpt-6-astra")).not.toContain("none");
    const config = makeConfig(
      {},
      { model: "gpt-6-astra", reasoningEffort: "none" },
    );
    expect(resolveReasoningEffort(config)).toBeUndefined();
  });
});
