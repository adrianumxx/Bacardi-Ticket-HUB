import { badRequest, errorResponse, json } from "@/lib/api";
import { requireWorkspaceManager } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Event, TicketRequest } from "@/lib/models";
import { eventSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceManager();
    await connectDb();
    const { id } = await context.params;
    const input = eventSchema.partial().parse(await request.json());
    if (input.status === "published" && input.ticketTypes && input.ticketTypes.filter((type) => type.active).length === 0) {
      return badRequest("Published events or festivals must have at least one active ticket type.", "EVENT_NEEDS_ACTIVE_TICKET_TYPE");
    }
    const update = Object.fromEntries(Object.entries({
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
    }).filter(([, value]) => value !== undefined));
    const event = await Event.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!event) return badRequest("Event or festival not found.", "EVENT_NOT_FOUND");
    await auditLog({ actor: user.email, action: "event.updated", target: id, payload: update });
    return json({ event });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceManager();
    await connectDb();
    const { id } = await context.params;

    const event = await Event.findById(id).lean<{ _id: unknown; name: string } | null>();
    if (!event) return badRequest("Event or festival not found.", "EVENT_NOT_FOUND");

    // A manager can always delete an event, even if ticket requests still
    // reference it. Those requests aren't deleted or hidden -- they keep
    // their history and dispatch records, and every place that reads
    // request.event already tolerates it being missing after this. Record
    // the deletion on each affected request so the gap is traceable instead
    // of silent.
    const linkedRequests = await TicketRequest.countDocuments({ event: id });
    if (linkedRequests > 0) {
      await TicketRequest.updateMany(
        { event: id },
        {
          $push: {
            history: {
              by: user.email,
              action: "event_deleted",
              message: `The sponsored event "${event.name}" was deleted by the manager.`,
            },
          },
        },
      );
    }

    await Event.deleteOne({ _id: id });
    await auditLog({
      actor: user.email,
      action: "event.deleted",
      target: id,
      payload: { name: event.name, affectedRequests: linkedRequests },
    });
    return json({ ok: true, affectedRequests: linkedRequests });
  } catch (error) {
    return errorResponse(error);
  }
}
