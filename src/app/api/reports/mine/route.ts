import { errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { TicketRequest } from "@/lib/models";
import { auditLog } from "@/lib/audit";
import { avgResponseHours, buildKpis, buildReportRows, type ReportLine } from "@/lib/reports";

export async function GET() {
  try {
    const user = await requireUser();
    await connectDb();

    const requests = await TicketRequest.find({ requestedBy: user.email })
      .populate("event")
      .populate("outlet")
      .sort({ createdAt: -1 })
      .lean();

    const rawRows = requests as ReportLine[];
    const rows = buildReportRows(rawRows);
    const kpis = {
      ...buildKpis(rawRows, rows),
      approvalRate: rows.length > 0 ? Math.round((rawRows.filter((row) => row.status === "approved" || row.status === "partially_approved").length / rows.length) * 100) : 0,
      avgResponseHours: avgResponseHours(rawRows),
    };

    await auditLog({ actor: user.email, action: "report.viewed_mine", target: "ticket_requests", payload: { rows: rows.length } });

    return json({ rows, kpis });
  } catch (error) {
    return errorResponse(error);
  }
}
