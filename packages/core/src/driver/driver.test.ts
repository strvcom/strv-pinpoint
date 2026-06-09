import { describe, expect, it } from "vitest";
import type { Driver, DriverSession, HealthResult } from "./driver.js";

describe("Driver contract", () => {
  it("a conforming object satisfies the Driver interface", async () => {
    const session: DriverSession = {
      page: {} as DriverSession["page"],
      sessionId: "s1",
      close: async () => {},
    };
    const driver: Driver = {
      name: "fake",
      healthCheck: async (): Promise<HealthResult> => ({ ok: true }),
      connect: async () => session,
    };
    expect(driver.name).toBe("fake");
    expect(await driver.healthCheck()).toEqual({ ok: true });
    expect((await driver.connect({ appUrl: "http://x", bridgeUrl: "http://y" })).sessionId).toBe(
      "s1",
    );
  });
});
