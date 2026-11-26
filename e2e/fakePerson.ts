import type { BrowserContext, Page } from "@playwright/test";

/**
 * Makes this browser a new person at the fake issuer (e2e/fake-issuer.mjs): a `fake_sub`
 * cookie for 127.0.0.1 names the subject of its next sign-in (cookies ignore the port). Per
 * browser, never a shared "next login", so a retry, a repeat or specs signing in side by side
 * are each somebody else. Returns the subject.
 */
export async function becomeSomeone(target: Page | BrowserContext, prefix = "e2e"): Promise<string> {
  const context = "context" in target ? target.context() : target;
  const sub = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await context.addCookies([{ name: "fake_sub", value: sub, domain: "127.0.0.1", path: "/" }]);
  return sub;
}
