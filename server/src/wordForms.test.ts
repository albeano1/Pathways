import { describe, expect, it } from "vitest";
import {
  buildPluralAliasMap,
  generatePlurals,
  IRREGULAR_PLURALS,
  morphologicalVariants,
  resolveLemmaWithAliases,
  singularizeCandidates,
} from "./wordForms.js";

describe("generatePlurals", () => {
  it("handles regular s plurals", () => {
    expect(generatePlurals("word")).toContain("words");
    expect(generatePlurals("dog")).toContain("dogs");
  });

  it("handles consonant y to ies", () => {
    expect(generatePlurals("story")).toContain("stories");
    expect(generatePlurals("city")).toContain("cities");
  });

  it("handles sibilant es plurals", () => {
    expect(generatePlurals("box")).toContain("boxes");
    expect(generatePlurals("class")).toContain("classes");
  });

  it("handles f/fe to ves", () => {
    expect(generatePlurals("wolf")).toContain("wolves");
    expect(generatePlurals("knife")).toContain("knives");
  });

  it("handles irregular plurals", () => {
    for (const [singular, plural] of Object.entries(IRREGULAR_PLURALS)) {
      expect(generatePlurals(singular)).toContain(plural);
    }
  });
});

describe("singularizeCandidates", () => {
  it("singularizes common plural patterns", () => {
    expect(singularizeCandidates("words")).toContain("word");
    expect(singularizeCandidates("stories")).toContain("story");
    expect(singularizeCandidates("boxes")).toContain("box");
    expect(singularizeCandidates("wolves")).toContain("wolf");
    expect(singularizeCandidates("children")).toContain("child");
    expect(singularizeCandidates("people")).toContain("person");
    expect(singularizeCandidates("mice")).toContain("mouse");
  });
});

describe("morphologicalVariants", () => {
  it("includes singular and plural graph lemmas", () => {
    const lemmas = new Set(["line", "lines", "sentence"]);
    const exists = (lemma: string) => lemmas.has(lemma);
    expect(morphologicalVariants("lines", exists)).toEqual(["lines", "line"]);
  });
});

describe("buildPluralAliasMap", () => {
  it("maps generated plurals back to graph lemmas", () => {
    const lemmas = ["word", "story", "box", "wolf", "child", "person", "mouse"];
    const aliasMap = buildPluralAliasMap(lemmas);
    const lemmaSet = new Set(lemmas);
    const lookup = (lemma: string) => lemmaSet.has(lemma);

    expect(resolveLemmaWithAliases("words", lemmaSet, aliasMap, lookup)).toBe("word");
    expect(resolveLemmaWithAliases("stories", lemmaSet, aliasMap, lookup)).toBe("story");
    expect(resolveLemmaWithAliases("boxes", lemmaSet, aliasMap, lookup)).toBe("box");
    expect(resolveLemmaWithAliases("wolves", lemmaSet, aliasMap, lookup)).toBe("wolf");
    expect(resolveLemmaWithAliases("children", lemmaSet, aliasMap, lookup)).toBe("child");
    expect(resolveLemmaWithAliases("people", lemmaSet, aliasMap, lookup)).toBe("person");
    expect(resolveLemmaWithAliases("mice", lemmaSet, aliasMap, lookup)).toBe("mouse");
  });
});
