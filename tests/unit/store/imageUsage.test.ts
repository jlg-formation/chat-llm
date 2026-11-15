import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { addImageUsage, resetUsage, useImageUsage } from "@/store/usageStore";

describe("usageStore image counter", () => {
  beforeEach(() => {
    act(() => resetUsage());
  });

  it("ignore les appels sans image", () => {
    const { result } = renderHook(() => useImageUsage());
    act(() => addImageUsage(0, "gpt-image-2.6-flare", 100));
    expect(result.current).toEqual({
      count: 0,
      costUsd: 0,
      costUnknown: false,
      imageInputTokens: 0,
      imageOutputTokens: 0,
    });
  });

  it("accumule le nombre et le coût estimé", () => {
    const { result } = renderHook(() => useImageUsage());
    act(() => addImageUsage(1, "gpt-image-2.6-flare", 1_000_000));
    act(() => addImageUsage(1, "gpt-image-2.6-flare", 1_000_000));
    expect(result.current.count).toBe(2);
    expect(result.current.costUsd).toBeCloseTo(60);
    expect(result.current.costUnknown).toBe(false);
  });

  it("marque le coût comme inconnu sans répartition ou prix", () => {
    const { result } = renderHook(() => useImageUsage());
    act(() => addImageUsage(1, "gpt-image-1.5", 500));
    expect(result.current.count).toBe(1);
    expect(result.current.costUnknown).toBe(true);
  });

  it("resetUsage remet le compteur image à zéro", () => {
    const { result } = renderHook(() => useImageUsage());
    act(() => addImageUsage(2, "gpt-image-2.6-flare", 10));
    act(() => resetUsage());
    expect(result.current).toEqual({
      count: 0,
      costUsd: 0,
      costUnknown: false,
      imageInputTokens: 0,
      imageOutputTokens: 0,
    });
  });
});
