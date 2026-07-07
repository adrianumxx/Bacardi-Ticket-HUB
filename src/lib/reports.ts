import { renderRequestStatus } from "@/lib/labels";

export type ReportLine = {
  _id: unknown;
  createdAt?: string | Date;
  event?: { name?: string; eventKind?: string; sponsorshipName?: string; sponsorshipTier?: string; market?: string };
  outlet?: { name?: string; city?: string; type?: string };
  requestedBy: string;
  accountManagerName?: string;
  status: string;
  items: { ticketType: string; quantity: number; approvedQuantity?: number }[];
  dispatches: unknown[];
  history?: { at: string | Date; by: string; action: string; message: string }[];
};

export function buildReportRows(rawRows: ReportLine[]) {
  return rawRows.map((item) => {
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
}

export function buildKpis(rawRows: ReportLine[], rows: ReturnType<typeof buildReportRows>) {
  return {
    total: rows.length,
    pending: rawRows.filter((row) => row.status === "pending").length,
    approved: rawRows.filter((row) => row.status === "approved" || row.status === "partially_approved").length,
    rejected: rawRows.filter((row) => row.status === "rejected").length,
    dispatched: rows.reduce((sum, row) => sum + row.dispatches, 0),
    requestedTickets: rows.reduce((sum, row) => sum + row.quantity, 0),
  };
}

// The manager's first response is the earliest history entry logged by
// someone other than the requester, after the "created" entry -- that marks
// when a human reviewer (not the automated notification system) acted on it.
export function avgResponseHours(rawRows: ReportLine[]) {
  const diffsHours: number[] = [];
  for (const row of rawRows) {
    if (!row.history?.length || !row.createdAt) continue;
    const createdAt = new Date(row.createdAt).getTime();
    const response = row.history.find((entry) => entry.by !== row.requestedBy && entry.by !== "system" && entry.action !== "created");
    if (!response) continue;
    const respondedAt = new Date(response.at).getTime();
    if (Number.isNaN(respondedAt) || respondedAt < createdAt) continue;
    diffsHours.push((respondedAt - createdAt) / (1000 * 60 * 60));
  }
  if (diffsHours.length === 0) return null;
  return diffsHours.reduce((sum, value) => sum + value, 0) / diffsHours.length;
}
