import { badRequest, errorResponse, json } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Event, TicketRequest } from "@/lib/models";
import { eventSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;
    const input = eventSchema.partial().parse(await request.json());
    if (input.status === "published" && input.ticketTypes && input.ticketTypes.filter((type) => type.active).length === 0) {
      return badRequest("Published events or festivals must have at least one active ticket type.");
    }
    const update = Object.fromEntries(Object.entries({
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
    }).filter(([, value]) => value !== undefined));
    const event = await Event.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!event) return badRequest("Event or festival not found.");
    await auditLog({ actor: user.email, action: "event.updated", target: id, payload: update });
    return json({ event });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;

    const event = await Event.findById(id).lean<{ _id: unknown; name: string } | null>();
    if (!event) return badRequest("Event or festival not found.");

    // Deleting an event that already has ticket requests would leave those
    // requests with a dangling reference and silently corrupt report/history
    // data. Require the requests to be dealt with (or the event kept closed)
    // instead of allowing an unsafe delete.
    const linkedRequests = await TicketRequest.countDocuments({ event: id });
    if (linkedRequests > 0) {
      return badRequest(
        `Cannot delete "${event.name}": ${linkedRequests} ticket request(s) reference it. Keep it closed instead, or delete those requests first.`,
        "EVENT_HAS_REQUESTS",
      );
    }

    await Event.deleteOne({ _id: id });
    await auditLog({ actor: user.email, action: "event.deleted", target: id, payload: { name: event.name } });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
