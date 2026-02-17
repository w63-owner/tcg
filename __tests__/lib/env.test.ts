import { getRequiredEnvVar } from "@/lib/env";

describe("env helpers", () => {
  it("returns env var when present", () => {
    process.env.TEST_ENV_PRESENT = "value";
    expect(getRequiredEnvVar("TEST_ENV_PRESENT")).toBe("value");
    delete process.env.TEST_ENV_PRESENT;
  });

  it("throws clear error when env var is missing", () => {
    delete process.env.TEST_ENV_MISSING;
    expect(() => getRequiredEnvVar("TEST_ENV_MISSING")).toThrow(
      "Missing required environment variable: TEST_ENV_MISSING",
    );
  });
});
