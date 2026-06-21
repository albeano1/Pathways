import { describe, expect, it } from "vitest";
import { shouldMergeLemmaPair } from "./lemmaMerge.js";

describe("shouldMergeLemmaPair", () => {
  it("merges low-degree plural duplicates", () => {
    expect(
      shouldMergeLemmaPair(
        { id: 1, lemma: "line", degree: 786 },
        { id: 2, lemma: "lines", degree: 46 },
        0.01
      )
    ).toBe(true);
  });

  it("keeps distinct lemmas with high overlap requirement unmet and similar degree", () => {
    expect(
      shouldMergeLemmaPair(
        { id: 1, lemma: "arm", degree: 120 },
        { id: 2, lemma: "arms", degree: 100 },
        0.05
      )
    ).toBe(false);
  });

  it("merges when neighbor overlap is high", () => {
    expect(
      shouldMergeLemmaPair(
        { id: 1, lemma: "word", degree: 250 },
        { id: 2, lemma: "words", degree: 80 },
        0.3
      )
    ).toBe(true);
  });
});
