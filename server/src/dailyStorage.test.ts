import { describe, expect, it } from "vitest";
import {
  DAILY_SESSION_STORAGE_KEYS,
  PRESERVED_LOCAL_STORAGE_KEYS,
} from "../../client/src/dailyStorage.ts";

describe("daily session storage", () => {
  it("does not include solve stats keys in daily session clears", () => {
    for (const preserved of PRESERVED_LOCAL_STORAGE_KEYS) {
      expect(DAILY_SESSION_STORAGE_KEYS).not.toContain(preserved);
    }
  });

  it("tracks solve average and streak under preserved keys", () => {
    expect(PRESERVED_LOCAL_STORAGE_KEYS).toContain("connections-solve-stats");
    expect(PRESERVED_LOCAL_STORAGE_KEYS).toContain("pathways-win-streak");
  });
});
