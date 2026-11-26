import { expect, test } from "@playwright/test";

// The app server runs with the fake issuer (playwright.config.ts), so the sign-in screens can be
// tried end to end. This only checks the set-up: the test provider is offered.
test("the test sign-in provider is offered", async ({ request }) => {
  const res = await request.get("/api/auth/providers");
  expect(res.status()).toBe(200);
  const { providers } = (await res.json()) as { providers: { id: string; label: string; kind: string }[] };
  expect(providers).toContainEqual({ id: "test", label: "Test issuer", kind: "oidc" });
});
