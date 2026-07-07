import { ClientSession, Types } from "mongoose";
import { TicketRequest } from "@/lib/models";

export type TicketLineInput = {
  ticketType: string;
  quantity: number;
  approvedQuantity?: number;
};

export type RuleEvent = {
  _id: unknown;
  name: string;
  maxTicketsPerOutlet: number;
  ticketTypes: { name: string; active: boolean }[];
};

export function activeTicketTypeSet(event: RuleEvent) {
  return new Set(event.ticketTypes.filter((type) => type.active).map((type) => type.name));
}

export function requestedQuantity(items: TicketLineInput[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function approvedQuantity(items: TicketLineInput[]) {
  return items.reduce((sum, item) => sum + Math.min(item.approvedQuantity ?? 0, item.quantity), 0);
}

export function normalizeItemsForStatus(status: string, items: TicketLineInput[]) {
  return items.map((item) => {
    if (status === "rejected") return { ...item, approvedQuantity: 0 };
    if (status === "approved") return { ...item, approvedQuantity: item.quantity };
    if (status === "partially_approved") {
      return {
        ...item,
        approvedQuantity: Math.min(Math.max(item.approvedQuantity ?? 0, 0), item.quantity),
      };
    }
    return { ...item, approvedQuantity: item.approvedQuantity ?? 0 };
  });
}

export function quantityThatConsumesLimit(status: string, items: TicketLineInput[]) {
  if (status === "rejected") return 0;
  if (status === "pending") return requestedQuantity(items);
  return approvedQuantity(items);
}

export function ticketTypeUnavailableMessage(ticketType: string) {
  return `Ticket type is not available: ${ticketType}.`;
}

export const STATUS_QUANTITY_MESSAGES = {
  approvedMustMatchRequested: "Approved requests must approve the full requested quantity.",
  partialApprovalRange: "Partially approved requests must approve at least one ticket but less than the requested quantity.",
  rejectedMustHaveZeroApproved: "Rejected requests cannot have approved tickets.",
} as const;

export function validateTicketTypes(event: RuleEvent, items: TicketLineInput[]) {
  const activeTypes = activeTicketTypeSet(event);
  for (const item of items) {
    if (!activeTypes.has(item.ticketType)) {
      return ticketTypeUnavailableMessage(item.ticketType);
    }
  }
  return "";
}

export function validateStatusQuantities(status: string, items: TicketLineInput[]) {
  const requested = requestedQuantity(items);
  const approved = approvedQuantity(items);

  if (status === "approved" && approved !== requested) {
    return STATUS_QUANTITY_MESSAGES.approvedMustMatchRequested;
  }
  if (status === "partially_approved" && (approved <= 0 || approved >= requested)) {
    return STATUS_QUANTITY_MESSAGES.partialApprovalRange;
  }
  if (status === "rejected" && approved !== 0) {
    return STATUS_QUANTITY_MESSAGES.rejectedMustHaveZeroApproved;
  }
  return "";
}

export async function usedTicketsForOutlet(
  eventId: string,
  outletId: string,
  excludeRequestId?: string,
  session?: ClientSession,
) {
  const match: Record<string, unknown> = {
    event: new Types.ObjectId(eventId),
    outlet: new Types.ObjectId(outletId),
    status: { $in: ["pending", "approved", "partially_approved"] },
  };
  if (excludeRequestId) match._id = { $ne: new Types.ObjectId(excludeRequestId) };

  const rows = await TicketRequest.aggregate<{ total: number }>(
    [
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                { $eq: ["$status", "pending"] },
                "$items.quantity",
                { $ifNull: ["$items.approvedQuantity", "$items.quantity"] },
              ],
            },
          },
        },
      },
    ],
    session ? { session } : undefined,
  );
  return rows[0]?.total ?? 0;
}
