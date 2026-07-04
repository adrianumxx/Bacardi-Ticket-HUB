import { badRequest, errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Event, Outlet, TicketRequest } from "@/lib/models";
import { createRequestSchema } from "@/lib/schemas";
import { adminNotifyEmails, emailHtml } from "@/lib/mail";
import { requestedQuantity, usedTicketsForOutlet, validateTicketTypes } from "@/lib/request-rules";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";

type LeanEvent = {
  _id: unknown;
  name: string;
  status: string;
  maxTicketsPerOutlet: number;
  ticketTypes: { name: string; active: boolean }[];
};

type LeanOutlet = { _id: unknown; name: string; status: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await connectDb();
    const query: Record<string, unknown> = user.role === "super_admin" ? {} : { requestedBy: user.email };

    // Pagination is opt-in via `limit`/`cursor` (an updatedAt ISO timestamp
    // from the last item of the previous page). Without these params the
    // endpoint keeps returning the full list, unchanged, since the dashboard
    // relies on the complete set for client-side stats and filtering.
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 0, 1), 200) : undefined;
    if (cursor) query.updatedAt = { $lt: new Date(cursor) };

    let cursorQuery = TicketRequest.find(query).populate("event").populate("outlet").sort({ updatedAt: -1 });
    if (limit) cursorQuery = cursorQuery.limit(limit + 1);
    const rows = await cursorQuery.lean();

    if (!limit) return json({ requests: rows });

    const hasMore = rows.length > limit;
    const requests = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (requests.at(-1)?.updatedAt as Date | undefined)?.toISOString() ?? null : null;
    return json({ requests, nextCursor, hasMore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await connectDb();
    const input = createRequestSchema.parse(await request.json());
    const event = (await Event.findById(input.eventId).lean()) as LeanEvent | null;
    if (!event || event.status !== "published") {
      return badRequest("This event or festival is not available for new requests.");
    }

    const requestedQty = requestedQuantity(input.items);
    if (requestedQty > event.maxTicketsPerOutlet) {
      return badRequest(`This event or festival allows a maximum of ${event.maxTicketsPerOutlet} ticket(s) per outlet.`);
    }
    const ticketTypeError = validateTicketTypes(event, input.items);
    if (ticketTypeError) return badRequest(ticketTypeError);

    const outletInputs =
      input.outlets?.length
        ? input.outlets
        : input.newOutlet
          ? [{ name: input.newOutlet.name }]
          : [];
    const createdRequests: Array<{ _id: unknown }> = [];
    async function rollbackAndBadRequest(message: string) {
      if (createdRequests.length > 0) {
        await TicketRequest.deleteMany({ _id: { $in: createdRequests.map((requestDoc) => requestDoc._id) } });
      }
      return badRequest(message);
    }

    if (!input.outletId && outletInputs.length === 0) return badRequest("Add at least one outlet.");

    for (const outletInput of outletInputs.length > 0 ? outletInputs : [{ name: "" }]) {
      let outletId = input.outletId;
      let outlet: LeanOutlet | null = null;

      if (outletInput.name) {
        outlet = (await Outlet.findOne({
          name: { $regex: `^${escapeRegExp(outletInput.name.trim())}$`, $options: "i" },
          status: { $ne: "archived" },
        }).lean()) as LeanOutlet | null;

        if (!outlet) {
          outlet = (await Outlet.create({
            name: outletInput.name.trim(),
            status: "pending",
            proposedBy: user.email,
          })) as LeanOutlet;
        }
        outletId = String(outlet._id);
      }

      if (!outletId) return rollbackAndBadRequest("Add at least one outlet.");

      outlet = outlet ?? ((await Outlet.findById(outletId).lean()) as LeanOutlet | null);
      if (!outlet || outlet.status === "archived") return rollbackAndBadRequest("The selected outlet is not valid.");

      const existingQty = await usedTicketsForOutlet(input.eventId, outletId);
      if (existingQty + requestedQty > event.maxTicketsPerOutlet) {
        return rollbackAndBadRequest(
          `Outlet limit exceeded for ${outlet.name}: ${existingQty} ticket(s) already requested, maximum ${event.maxTicketsPerOutlet}.`,
        );
      }

      const ticketRequest = await TicketRequest.create({
        event: event._id,
        outlet: outlet._id,
        requestedBy: user.email,
        accountManagerName: user.name,
        recipientEmails: input.recipientEmails,
        items: input.items,
        notes: input.notes,
        history: [
          {
            by: user.email,
            action: "created",
            message: "Ticket request created.",
          },
        ],
      });

      // Compensating check: the read-then-write above has a race window under
      // concurrent requests for the same outlet. Re-verify right after insert
      // and roll back this request if the limit was exceeded in the meantime,
      // instead of relying on Mongo transactions (which require a replica set
      // we can't assume every deployment has).
      const confirmedQty = await usedTicketsForOutlet(input.eventId, outletId);
      if (confirmedQty > event.maxTicketsPerOutlet) {
        await TicketRequest.deleteOne({ _id: ticketRequest._id });
        return rollbackAndBadRequest(
          `Outlet limit exceeded for ${outlet.name}: another request was submitted at the same time. Maximum ${event.maxTicketsPerOutlet} ticket(s) per outlet.`,
        );
      }

      const adminRecipients = adminNotifyEmails();
      const adminSubject = `New sponsorship ticket request: ${event.name}`;
      const [adminNotification] = await notifyAdmins({
        actor: user.email,
        category: "requests",
        entityType: "ticket_request",
        entityId: String(ticketRequest._id),
        title: "New sponsorship ticket request",
        message: `${user.name} requested ${requestedQty} ticket(s) for ${outlet.name}.\nEvent/Festival: ${event.name}`,
        priority: "high",
        email: {
          subject: adminSubject,
          html: emailHtml(
            "New sponsorship ticket request",
            `${user.name} requested ${requestedQty} ticket(s) for ${outlet.name}.\nEvent/Festival: ${event.name}`,
          ),
        },
      });
      const adminDelivery = adminNotification.delivery;
      ticketRequest.history.push({
        by: "system",
        action: adminDelivery.status === "failed" ? "notification_failed" : adminDelivery.status === "skipped" ? "notification_skipped" : "notification_sent",
        message: `Manager alert ${adminDelivery.status} for ${adminRecipients.join(", ") || "no configured recipients"}.${adminDelivery.error ? ` ${adminDelivery.error}` : ""}`,
      });

      const requesterSubject = `Request received: ${event.name}`;
      const requesterNotification = await notifyUser({
        recipient: user.email,
        actor: user.email,
        category: "requests",
        entityType: "ticket_request",
        entityId: String(ticketRequest._id),
        title: "Request received",
        message: `Your request for ${outlet.name} has been registered and is pending manager review.`,
        email: {
          subject: requesterSubject,
          html: emailHtml(
            "Request received",
            `Your request for ${outlet.name} has been registered and is pending manager review.`,
          ),
        },
      });
      const requesterDelivery = requesterNotification.delivery;
      ticketRequest.history.push({
        by: "system",
        action: requesterDelivery.status === "failed" ? "notification_failed" : requesterDelivery.status === "skipped" ? "notification_skipped" : "notification_sent",
        message: `Requester confirmation ${requesterDelivery.status} for ${user.email}.${requesterDelivery.error ? ` ${requesterDelivery.error}` : ""}`,
      });
      await ticketRequest.save();
      await auditLog({ actor: user.email, action: "ticket_request.created", target: String(ticketRequest._id), payload: { eventId: input.eventId, outletId } });
      createdRequests.push(ticketRequest);
    }

    return json({ request: createdRequests[0], requests: createdRequests }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
