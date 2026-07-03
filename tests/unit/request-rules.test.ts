import { describe, expect, it } from "vitest";
import {
  approvedQuantity,
  normalizeItemsForStatus,
  quantityThatConsumesLimit,
  requestedQuantity,
  validateStatusQuantities,
  validateTicketTypes,
} from "@/lib/request-rules";

const event = {
  _id: "event-1",
  name: "Test Festival",
  maxTicketsPerOutlet: 2,
  ticketTypes: [
    { name: "Regular", active: true },
    { name: "VIP", active: false },
  ],
};

describe("request rules", () => {
  it("calculates requested and approved quantities", () => {
    const items = [{ ticketType: "Regular", quantity: 2, approvedQuantity: 1 }];
    expect(requestedQuantity(items)).toBe(2);
    expect(approvedQuantity(items)).toBe(1);
  });

  it("normalizes status quantities", () => {
    expect(normalizeItemsForStatus("approved", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 0 }])[0].approvedQuantity).toBe(2);
    expect(normalizeItemsForStatus("rejected", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 2 }])[0].approvedQuantity).toBe(0);
    expect(normalizeItemsForStatus("partially_approved", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 5 }])[0].approvedQuantity).toBe(2);
  });

  it("enforces partial approval semantics", () => {
    expect(validateStatusQuantities("partially_approved", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 1 }])).toBe("");
    expect(validateStatusQuantities("partially_approved", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 2 }])).toContain("Partially approved");
    expect(validateStatusQuantities("approved", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 1 }])).toContain("Approved requests");
  });

  it("counts only non-rejected quantities against outlet limits", () => {
    expect(quantityThatConsumesLimit("pending", [{ ticketType: "Regular", quantity: 2 }])).toBe(2);
    expect(quantityThatConsumesLimit("approved", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 2 }])).toBe(2);
    expect(quantityThatConsumesLimit("rejected", [{ ticketType: "Regular", quantity: 2, approvedQuantity: 0 }])).toBe(0);
  });

  it("rejects inactive ticket types", () => {
    expect(validateTicketTypes(event, [{ ticketType: "Regular", quantity: 1 }])).toBe("");
    expect(validateTicketTypes(event, [{ ticketType: "VIP", quantity: 1 }])).toContain("not available");
  });
});
