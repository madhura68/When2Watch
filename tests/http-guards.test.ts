import { describe, expect, it } from "vitest";
import { requireSameOrigin } from "@/server/http-guards";

describe("Calendar mutation CSRF boundary", () => {
  const origin = "https://when2watch.example.com";
  const request = (value?: string) => new Request(`${origin}/api/probe`, { method: "POST", headers: value ? { origin: value } : {} });
  it("accepts the configured HTTPS origin", () => {
    expect(() => requireSameOrigin(request(origin), origin)).not.toThrow();
  });
  it("rejects absent and foreign origins regardless of the request URL", () => {
    expect(() => requireSameOrigin(request(), origin)).toThrow();
    expect(() => requireSameOrigin(request("https://attacker.example.com"), origin)).toThrow();
    expect(() => requireSameOrigin(request("null"), origin)).toThrow();
  });
});
