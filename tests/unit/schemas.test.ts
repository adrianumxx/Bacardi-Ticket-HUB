import { describe, expect, it } from "vitest";
import { createRequestSchema, requestItemSchema } from "@/lib/schemas";

describe("schemas", () => {
  it("requires at least one valid recipient email", () => {
    expect(() =>
      createRequestSchema.parse({
        eventId: "event",
        outletId: "outlet",
        recipientEmails: "",
        items: [{ ticketType: "Regular", quantity: 1 }],
      }),
    ).toThrow(/Add at least one recipient email/);
  });

  it("splits recipient emails from comma separated input", () => {
    const parsed = createRequestSchema.parse({
      eventId: "event",
      outletId: "outlet",
      recipientEmails: "one@example.com, two@example.com",
      items: [{ ticketType: "Regular", quantity: 1 }],
    });
    expect(parsed.recipientEmails).toEqual(["one@example.com", "two@example.com"]);
  });

  it("blocks approved quantity above requested quantity", () => {
    expect(() => requestItemSchema.parse({ ticketType: "Regular", quantity: 1, approvedQuantity: 2 })).toThrow(
      /Approved quantity/,
    );
  });
});
