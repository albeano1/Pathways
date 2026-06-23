import { describe, expect, it } from "vitest";
import {
  definitionLooksScientific,
  definitionLooksTechnical,
  hasGeneralAudienceDefinition,
  type DictionaryResult,
} from "./dictionary.js";

describe("dictionary scientific filtering", () => {
  it("flags technical definitions", () => {
    expect(
      definitionLooksTechnical(
        "a segment of a DNA or RNA molecule containing information coding for a protein"
      )
    ).toBe(true);
    expect(definitionLooksTechnical("a sedentary cnidarian aquatic animal")).toBe(true);
    expect(definitionLooksTechnical("The medulla oblongata.")).toBe(true);
    expect(definitionLooksTechnical("a small round fruit with red or green skin")).toBe(false);
    expect(definitionLooksTechnical("a very bright object in the night sky")).toBe(false);
  });

  it("requires a non-technical primary sense", () => {
    const scientificOnly: DictionaryResult = {
      senses: [
        {
          definition:
            "a segment of a DNA or RNA molecule containing information coding for a protein",
        },
      ],
    };
    const mixed: DictionaryResult = {
      senses: [
        { definition: "a segment of a DNA or RNA molecule" },
        { definition: "a person who is particularly knowledgeable about a subject" },
      ],
    };
    const technicalPrimary: DictionaryResult = {
      senses: [
        { definition: "The medulla oblongata." },
        { definition: "The soft inner part of something, especially the pith of a fruit." },
      ],
    };

    expect(hasGeneralAudienceDefinition(scientificOnly)).toBe(false);
    expect(hasGeneralAudienceDefinition(mixed)).toBe(false);
    expect(hasGeneralAudienceDefinition(technicalPrimary)).toBe(false);
    expect(
      hasGeneralAudienceDefinition({
        senses: [
          { definition: "a very bright object in the night sky" },
          { definition: "a luminous sphere of plasma" },
        ],
      })
    ).toBe(true);
  });
});
