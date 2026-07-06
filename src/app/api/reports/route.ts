import { errorResponse, json } from "@/lib/api";
import { requireWorkspaceManager, visibleAccountManagerEmails } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { TicketRequest } from "@/lib/models";
import { renderRequestStatus } from "@/lib/labels";
import { auditLog } from "@/lib/audit";
import { endOfDay } from "@/lib/utils";

type ReportLine = {
  _id: unknown;
  createdAt?: string | Date;
  event?: { name?: string; eventKind?: string; sponsorshipName?: string; sponsorshipTier?: string; market?: string };
  outlet?: { name?: string; city?: string; type?: string };
  requestedBy: string;
  accountManagerName?: string;
  status: string;
  items: { ticketType: string; quantity: number; approvedQuantity?: number }[];
  dispatches: unknown[];
};

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
    const rows = rawRows.map((item) => {
      const event = item.event;
      const outlet = item.outlet;
      const quantity = item.items.reduce((sum, line) => sum + line.quantity, 0);
      const approved = item.items.reduce((sum, line) => sum + (line.approvedQuantity || 0), 0);
      return {
        id: String(item._id),
        createdAt: item.createdAt,
        event: event?.name || "",
        eventKind: event?.eventKind === "festival" ? "Festival" : "Event",
        sponsorshipName: event?.sponsorshipName || "",
        sponsorshipTier: event?.sponsorshipTier || "",
        market: event?.market || "",
        outlet: outlet?.name || "",
        outletCity: outlet?.city || "",
        outletType: outlet?.type || "",
        accountManager: item.accountManagerName || item.requestedBy,
        accountManagerEmail: item.requestedBy,
        status: renderRequestStatus(item.status),
        quantity,
        approved,
        ticketTypes: item.items.map((line) => `${line.ticketType} x${line.quantity}`).join(", "),
        dispatches: item.dispatches.length,
      };
    });

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

    const kpis = {
      total: rows.length,
      pending: rawRows.filter((row) => row.status === "pending").length,
      approved: rawRows.filter((row) => row.status === "approved" || row.status === "partially_approved").length,
      rejected: rawRows.filter((row) => row.status === "rejected").length,
      dispatched: rows.reduce((sum, row) => sum + row.dispatches, 0),
      requestedTickets: rows.reduce((sum, row) => sum + row.quantity, 0),
    };
    await auditLog({ actor: user.email, action: "report.viewed", target: "ticket_requests", payload: { filters: Object.fromEntries(searchParams), rows: rows.length } });

    return json({ rows, kpis });
  } catch (error) {
    return errorResponse(error);
  }
}
