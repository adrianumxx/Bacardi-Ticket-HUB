import { errorResponse, json, serializeDoc } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AuditLog } from "@/lib/models";
import { endOfDay } from "@/lib/utils";

function csvEscape(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

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
    const critical = searchParams.get("critical") === "true";
    const format = searchParams.get("format") || "json";
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
    if (critical) {
      query.action = {
        $regex: "(user\\.|mail\\.webhook|ticket_request\\.dispatch|ticket_request\\.updated|event\\.deleted|outlet\\.merged|report\\.export)",
        $options: "i",
      };
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    if (format === "csv") {
      const columns = [
        ["createdAt", "Date"],
        ["actor", "Actor"],
        ["action", "Action"],
        ["target", "Target"],
        ["payload", "Payload"],
      ] as const;
      const rows = serializeDoc(logs) as Array<Record<string, unknown>>;
      const csv = [
        columns.map(([, label]) => csvEscape(label)).join(","),
        ...rows.map((row) => columns.map(([key]) => csvEscape(row[key])).join(",")),
      ].join("\n");
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=bacardi-audit-${new Date().toISOString().slice(0, 10)}.csv`,
        },
      });
    }

    return json({ logs: serializeDoc(logs) });
  } catch (error) {
    return errorResponse(error);
  }
}
