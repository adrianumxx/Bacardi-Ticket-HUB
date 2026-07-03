import { describe, expect, it } from "vitest";
import { deliverMail } from "@/lib/mail";

describe("mail delivery", () => {
  it("skips empty recipients", async () => {
    await expect(deliverMail({ to: [], subject: "Test", html: "<p>Test</p>" })).resolves.toMatchObject({
      status: "skipped",
    });
  });

  it("simulates delivery when Resend is not configured", async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await expect(deliverMail({ to: ["test@example.com"], subject: "Test", html: "<p>Test</p>" })).resolves.toMatchObject({
      status: "simulated",
    });
    process.env.RESEND_API_KEY = original;
  });
});
