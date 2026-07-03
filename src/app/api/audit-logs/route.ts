import { errorResponse, json, serializeDoc } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AuditLog } from "@/lib/models";
import { endOfDay } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();
    await connectDb();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "";
    const actor = searchParams.get("actor") || "";
    const target = searchParams.get("target") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    const query: Record<string, unknown> = {};
    if (action) query.action = { $regex: action, $options: "i" };
    if (actor) query.actor = { $regex: actor, $options: "i" };
    if (target) query.target = { $regex: target, $options: "i" };
    if (dateFrom || dateTo) {
      query.createdAt = {
        ...(dateFrom ? { $gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { $lte: endOfDay(dateTo) } : {}),
      };
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return json({ logs: serializeDoc(logs) });
  } catch (error) {
    return errorResponse(error);
  }
}
