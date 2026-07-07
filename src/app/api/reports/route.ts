import { errorResponse, json } from "@/lib/api";
import { requireWorkspaceManager, visibleAccountManagerEmails } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { TicketRequest } from "@/lib/models";
import { auditLog } from "@/lib/audit";
import { endOfDay } from "@/lib/utils";
import { buildKpis, buildReportRows, type ReportLine } from "@/lib/reports";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const user = await requireWorkspaceManager();
    await connectDb();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const exportFormat = searchParams.get("export") || "";
    const status = searchParams.get("status") || "all";
    const eventId = searchParams.get("eventId") || "all";
    const outletId = searchParams.get("outletId") || "all";
    const accountManager = searchParams.get("accountManager") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const visibleEmails = await visibleAccountManagerEmails(user);
    const query: Record<string, unknown> = {};
    const andFilters: Record<string, unknown>[] = [];
    if (visibleEmails) andFilters.push({ requestedBy: { $in: visibleEmails } });
    if (status !== "all") query.status = status;
    if (eventId !== "all") query.event = eventId;
    if (outletId !== "all") query.outlet = outletId;
    if (accountManager) {
      andFilters.push({
        $or: [
        { requestedBy: { $regex: accountManager, $options: "i" } },
        { accountManagerName: { $regex: accountManager, $options: "i" } },
        ],
      });
    }
    if (dateFrom || dateTo) {
      query.createdAt = {
        ...(dateFrom ? { $gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { $lte: endOfDay(dateTo) } : {}),
      };
    }
    if (andFilters.length > 0) query.$and = andFilters;

    const requests = await TicketRequest.find(query)
      .populate("event")
      .populate("outlet")
      .sort({ createdAt: -1 })
      .lean();

    const rawRows = requests as ReportLine[];
    const rows = buildReportRows(rawRows);

    if (format === "csv") {
      const columns = [
        ["id", "ID"],
        ["createdAt", "Created At"],
        ["event", "Event/Festival"],
        ["eventKind", "Type"],
        ["sponsorshipName", "Sponsorship Name"],
        ["sponsorshipTier", "Sponsorship Role"],
        ["market", "Market"],
        ["outlet", "Outlet"],
        ["outletCity", "Outlet City"],
        ["outletType", "Outlet Type"],
        ["accountManager", "Account Manager"],
        ["accountManagerEmail", "Account Manager Email"],
        ["status", "Status"],
        ["quantity", "Requested Tickets"],
        ["approved", "Approved Tickets"],
        ["ticketTypes", "Ticket Types"],
        ["dispatches", "Dispatches"],
      ] as const;
      const csv = [
        columns.map(([, label]) => csvEscape(label)).join(","),
        ...rows.map((row) => columns.map(([key]) => csvEscape(row[key as keyof typeof row])).join(",")),
      ].join("\n");
      await auditLog({ actor: user.email, action: "report.export_csv", target: "ticket_requests", payload: { filters: Object.fromEntries(searchParams) } });
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=bacardi-ticket-report.csv",
        },
      });
    }

    if (exportFormat === "pdf") {
      await auditLog({ actor: user.email, action: "report.export_pdf", target: "ticket_requests", payload: { filters: Object.fromEntries(searchParams), rows: rows.length } });
    }

    const kpis = buildKpis(rawRows, rows);
    await auditLog({ actor: user.email, action: "report.viewed", target: "ticket_requests", payload: { filters: Object.fromEntries(searchParams), rows: rows.length } });

    return json({ rows, kpis });
  } catch (error) {
    return errorResponse(error);
  }
}
