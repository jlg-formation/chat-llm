import { describe, it, expect } from "vitest";
import { genId } from "./id";

describe("genId", () => {
  it("returns a non-empty string", () => {
    expect(genId().length).toBeGreaterThan(0);
  });
});
