import { describe, it, expect } from "vitest";
import { __packageName } from "../src/index.js";

describe("@gitmarks/core smoke", () => {
  it("exports the package marker", () => {
    expect(__packageName).toBe("@gitmarks/core");
  });
});
