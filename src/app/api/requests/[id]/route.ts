import { badRequest, errorResponse, json } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { TicketRequest } from "@/lib/models";
import { updateRequestSchema } from "@/lib/schemas";
import { emailHtml } from "@/lib/mail";
import { renderRequestStatus } from "@/lib/labels";
import {
  normalizeItemsForStatus,
  quantityThatConsumesLimit,
  usedTicketsForOutlet,
  validateStatusQuantities,
  validateTicketTypes,
  type RuleEvent,
  type TicketLineInput,
} from "@/lib/request-rules";
import { notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";

type RequestItemLine = TicketLineInput & {
  toObject?: () => TicketLineInput;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;
    const input = updateRequestSchema.parse(await request.json());
    const current = await TicketRequest.findById(id).populate("event").populate("outlet");
    if (!current) return json({ error: "Request not found" }, { status: 404 });

    const eventDoc = current.event as unknown as RuleEvent;
    const outletDoc = current.outlet as unknown as { _id: unknown; name?: string };
    if (!eventDoc?._id || !outletDoc?._id) return badRequest("Request event or outlet is no longer available.");

    const nextStatus = input.status ?? current.status;
    const baseItems = input.items ?? current.items.map((item: RequestItemLine) => (typeof item.toObject === "function" ? item.toObject() : item));
    const nextItems = normalizeItemsForStatus(nextStatus, baseItems);
    const ticketTypeError = validateTicketTypes(eventDoc, nextItems);
    if (ticketTypeError) {
      console.warn("[request:patch-rejected]", { id, reason: "ticket_type", ticketTypeError, activeTypes: eventDoc.ticketTypes });
      return badRequest(ticketTypeError);
    }
    const quantityStatusError = validateStatusQuantities(nextStatus, nextItems);
    if (quantityStatusError) {
      console.warn("[request:patch-rejected]", { id, reason: "status_quantity", quantityStatusError, nextStatus, nextItems });
      return badRequest(quantityStatusError);
    }

    const existingQty = await usedTicketsForOutlet(String(eventDoc._id), String(outletDoc._id), id);
    const nextQty = quantityThatConsumesLimit(nextStatus, nextItems);
    if (existingQty + nextQty > eventDoc.maxTicketsPerOutlet) {
      console.warn("[request:patch-rejected]", { id, reason: "outlet_limit", existingQty, nextQty, max: eventDoc.maxTicketsPerOutlet });
      return badRequest(
        `Outlet limit exceeded: ${existingQty} ticket(s) already reserved by other requests, maximum ${eventDoc.maxTicketsPerOutlet}.`,
      );
    }

    const previousStatus = current.status;
    const previousItems = current.items;
    current.status = nextStatus;
    if (input.recipientEmails) current.recipientEmails = input.recipientEmails;
    current.items = nextItems;
    if (input.adminNotes !== undefined) current.adminNotes = input.adminNotes;

    current.history.push({
      by: user.email,
      action: nextStatus !== previousStatus ? `status:${nextStatus}` : "updated",
      message: input.adminNotes || "Request updated by the manager.",
    });

    if (nextStatus !== previousStatus) {
      const subject = `Request ${renderRequestStatus(nextStatus)}`;
      const notification = await notifyUser({
        recipient: current.requestedBy,
        actor: user.email,
        category: "requests",
        entityType: "ticket_request",
        entityId: String(current._id),
        title: "Request status updated",
        message: `The request is now: ${renderRequestStatus(nextStatus)}.\n${input.adminNotes || ""}`,
        priority: nextStatus === "rejected" ? "high" : "normal",
        email: {
          subject,
          html: emailHtml(
            "Request status updated",
            `The request is now: ${renderRequestStatus(nextStatus)}.\n${input.adminNotes || ""}`,
          ),
        },
      });
      const delivery = notification.delivery;
      current.history.push({
        by: "system",
        action: delivery.status === "failed" ? "notification_failed" : delivery.status === "skipped" ? "notification_skipped" : "notification_sent",
        message: `Status notification ${delivery.status} for ${current.requestedBy}.${delivery.error ? ` ${delivery.error}` : ""}`,
      });
    }
    await current.save();

    // Compensating check: re-verify the outlet limit after the write to
    // close the race window against a concurrent update on a different
    // request for the same outlet, and roll back this change if exceeded.
    const confirmedQty = await usedTicketsForOutlet(String(eventDoc._id), String(outletDoc._id), id);
    if (confirmedQty > eventDoc.maxTicketsPerOutlet) {
      current.status = previousStatus;
      current.items = previousItems;
      await current.save();
      return badRequest(
        `Outlet limit exceeded: another update was made at the same time. Maximum ${eventDoc.maxTicketsPerOutlet} ticket(s) per outlet.`,
      );
    }

    await auditLog({ actor: user.email, action: "ticket_request.updated", target: id, payload: { status: nextStatus, previousStatus } });

    const updated = await TicketRequest.findById(id).populate("event").populate("outlet").lean();
    return json({ request: updated });
  } catch (error) {
    console.warn("[request:patch-error]", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error);
  }
}
