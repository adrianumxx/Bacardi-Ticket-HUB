import { badRequest, errorResponse, json } from "@/lib/api";
import { requireSuperAdmin, requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Event } from "@/lib/models";
import { eventSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await requireUser();
    await connectDb();
    const query = user.role === "super_admin" ? {} : { status: "published" };
    const events = await Event.find(query).sort({ startsAt: 1, createdAt: -1 }).lean();
    return json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const input = eventSchema.parse(await request.json());
    if (input.status === "published" && input.ticketTypes.filter((type) => type.active).length === 0) {
      return badRequest("Published events or festivals must have at least one active ticket type.");
    }
    const event = await Event.create({
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      createdBy: user.email,
    });
    await auditLog({ actor: user.email, action: "event.created", target: String(event._id), payload: { name: event.name, status: event.status } });
    return json({ event }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
