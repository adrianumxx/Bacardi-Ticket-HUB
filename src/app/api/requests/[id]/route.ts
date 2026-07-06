import { badRequest, errorResponse, json } from "@/lib/api";
import { requireWorkspaceManager } from "@/lib/authz";
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
  type RuleEvent,
  type TicketLineInput,
} from "@/lib/request-rules";
import { notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";
import { pluralize } from "@/lib/utils";

type RequestItemLine = TicketLineInput & {
  toObject?: () => TicketLineInput;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceManager();
    await connectDb();
    const { id } = await context.params;
    const input = updateRequestSchema.parse(await request.json());
    const current = await TicketRequest.findById(id).populate("event").populate("outlet");
    if (!current) return json({ error: "Request not found" }, { status: 404 });

    const eventDoc = current.event as unknown as RuleEvent | null;
    const outletDoc = current.outlet as unknown as { _id: unknown; name?: string } | null;

    const nextStatus = input.status ?? current.status;
    const baseItems = input.items ?? current.items.map((item: RequestItemLine) => (typeof item.toObject === "function" ? item.toObject() : item));
    const nextItems = normalizeItemsForStatus(nextStatus, baseItems);
    // Ticket types are validated once, when the account manager first creates
    // the request (POST /api/requests). Re-checking here would let a later,
    // unrelated edit to the event's ticket type list retroactively block
    // approving or rejecting a request that was already legitimately
    // submitted -- the manager must always be able to decide on it.
    const quantityStatusError = validateStatusQuantities(nextStatus, nextItems);
    if (quantityStatusError) return badRequest(quantityStatusError);

    // Rejecting never consumes the outlet limit, so it never needs the
    // linked event/outlet to still exist -- a manager must always be able
    // to reject (or re-decide pending/rejected) a request even after its
    // event was deleted. Only approving/partially approving needs the
    // event's maxTicketsPerOutlet to validate against.
    const nextQty = quantityThatConsumesLimit(nextStatus, nextItems);
    if (nextQty > 0) {
      if (!eventDoc?._id || !outletDoc?._id) {
        return badRequest(
          "Cannot approve this request: its event or outlet was deleted. You can still reject it.",
          "EVENT_OR_OUTLET_MISSING",
        );
      }
      const existingQty = await usedTicketsForOutlet(String(eventDoc._id), String(outletDoc._id), id);
      if (existingQty + nextQty > eventDoc.maxTicketsPerOutlet) {
        return badRequest(
          `Outlet limit exceeded: ${pluralize(existingQty, "ticket")} already reserved by other requests, maximum ${eventDoc.maxTicketsPerOutlet}.`,
        );
      }
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
          replyTo: user.email,
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
    // Only relevant when this update actually consumes the limit.
    if (nextQty > 0 && eventDoc?._id && outletDoc?._id) {
      const confirmedQty = await usedTicketsForOutlet(String(eventDoc._id), String(outletDoc._id), id);
      if (confirmedQty > eventDoc.maxTicketsPerOutlet) {
        current.status = previousStatus;
        current.items = previousItems;
        await current.save();
        return badRequest(
          `Outlet limit exceeded: another update was made at the same time. Maximum ${pluralize(eventDoc.maxTicketsPerOutlet, "ticket")} per outlet.`,
        );
      }
    }

    await auditLog({ actor: user.email, action: "ticket_request.updated", target: id, payload: { status: nextStatus, previousStatus } });

    const updated = await TicketRequest.findById(id).populate("event").populate("outlet").lean();
    return json({ request: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
