import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("openclawDispatchActions URL validation", () => {
  it("re-validates instance URL before sending dispatch requests", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawDispatchActions.ts"),
      "utf8"
    );

    expect(source).toContain(
      'import { getOpenClawInstanceUrlValidationError } from "../lib/openclaw-instance-validation";'
    );
    expect(source).toContain(
      "const urlError = getOpenClawInstanceUrlValidationError(args.url);"
    );
    expect(source).toContain("if (urlError) {");
    expect(source).toContain("throw new Error(urlError);");
  });
});
