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

export async function GET() {
  try {
    const user = await requireUser();
    await connectDb();
    const query = user.role === "super_admin" ? {} : { requestedBy: user.email };
    const requests = await TicketRequest.find(query)
      .populate("event")
      .populate("outlet")
      .sort({ updatedAt: -1 })
      .lean();
    return json({ requests });
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

    let outletId = input.outletId;
    if (!outletId && input.newOutlet) {
      const outlet = await Outlet.create({
        ...input.newOutlet,
        status: "pending",
        proposedBy: user.email,
      });
      outletId = String(outlet._id);
    }
    if (!outletId) return badRequest("Select an outlet or propose a new one.");

    const outlet = (await Outlet.findById(outletId).lean()) as { _id: unknown; name: string; status: string } | null;
    if (!outlet || outlet.status === "archived") return badRequest("The selected outlet is not valid.");

    const existingQty = await usedTicketsForOutlet(input.eventId, outletId);
    if (existingQty + requestedQty > event.maxTicketsPerOutlet) {
      return badRequest(
        `Outlet limit exceeded: ${existingQty} ticket(s) already requested, maximum ${event.maxTicketsPerOutlet}.`,
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

    return json({ request: ticketRequest }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
