import { badRequest, errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Event, Outlet } from "@/lib/models";
import { usedTicketsForOutlet } from "@/lib/request-rules";

type LeanEvent = { _id: unknown; maxTicketsPerOutlet: number };
type LeanOutlet = { _id: unknown };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    await requireUser();
    await connectDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || "";
    const outletName = (searchParams.get("outletName") || "").trim();
    if (!eventId) return badRequest("An event or festival is required.", "EVENT_NOT_AVAILABLE");

    const event = (await Event.findById(eventId).lean()) as LeanEvent | null;
    if (!event) return badRequest("This event or festival is not available for new requests.", "EVENT_NOT_AVAILABLE");

    let used = 0;
    if (outletName) {
      const outlet = (await Outlet.findOne({
        name: { $regex: `^${escapeRegExp(outletName)}$`, $options: "i" },
        status: { $ne: "archived" },
      }).lean()) as LeanOutlet | null;
      if (outlet) used = await usedTicketsForOutlet(eventId, String(outlet._id));
    }

    const max = event.maxTicketsPerOutlet;
    const remaining = Math.max(max - used, 0);
    return json({ max, used, remaining });
  } catch (error) {
    return errorResponse(error);
  }
}
