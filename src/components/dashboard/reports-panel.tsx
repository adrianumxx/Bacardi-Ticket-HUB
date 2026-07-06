"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Store, Ticket, Users, X } from "@/components/ui/solar-icons";
import { renderRequestStatus } from "@/lib/labels";
import { formatDate, formatShortDate } from "@/lib/utils";
import type { FestivalSummary, ManagerStat, ReportFocus, ReportRow, Tone } from "./types";
import {
  api,
  buildManagerSummaries,
  downloadTextFile,
  inputClass,
  mapSummary,
  rankedTotals,
  reportCsv,
  reportFilename,
  summarizeReportRows,
} from "./helpers";
import { ActionButton, Badge, EmptyState, Field, Kpi, MiniMetric, MiniStat, Notice } from "./ui-primitives";
import {
  DispatchCoverageChart,
  EventPerformanceChart,
  InsightMetric,
  ManagerActivityMatrix,
  RankedBarChart,
  StatusBreakdownChart,
  TicketsOverTimeChart,
} from "./charts";

export function ManagerAnalytics({ rows }: { rows: ManagerStat[] }) {
  const top = rows.slice(0, 3);
  const maxRequests = Math.max(...rows.map((row) => row.requests), 1);
  const totals = rows.reduce(
    (sum, row) => ({
      managers: sum.managers + 1,
      tickets: sum.tickets + row.tickets,
      outlets: sum.outlets + row.outlets.size,
    }),
    { managers: 0, tickets: 0, outlets: 0 },
  );

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
      <div className="rounded-md border border-[#3A2A18] bg-[#3A2A18] p-5 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ECDFC8]">Manager performance</p>
        <h2 className="mt-2 text-2xl font-semibold">Requests by account manager</h2>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <MiniStat label="Managers" value={totals.managers} />
          <MiniStat label="Tickets" value={totals.tickets} />
          <MiniStat label="Outlets" value={totals.outlets} />
        </div>
        <div className="mt-5 space-y-3">
          {top.map((row) => (
            <div key={row.email}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{row.name}</span>
                <span className="text-[#ECDFC8]">{row.requests} requests</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#ECDFC8]" style={{ width: `${Math.max(8, (row.requests / maxRequests) * 100)}%` }} />
              </div>
            </div>
          ))}
          {top.length === 0 && <p className="text-sm text-white/70">No manager activity yet.</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-lg font-semibold">Account manager breakdown</h2>
        </div>
        <div className="divide-y">
          {rows.map((row) => (
            <article key={row.email} className="grid gap-3 p-4 text-sm xl:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="break-words text-xs text-stone-500">{row.email}</p>
                <p className="mt-2 text-xs text-stone-500">Latest request: {row.latestRequest ? formatShortDate(row.latestRequest) : "-"}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniMetric label="Requests" value={row.requests} />
                <MiniMetric label="Tickets" value={row.tickets} />
                <MiniMetric label="Approved" value={row.approved} tone="good" />
                <MiniMetric label="Pending" value={row.pending} tone="warn" />
                <MiniMetric label="Rejected" value={row.rejected} tone="bad" />
                <MiniMetric label="Outlets" value={row.outlets.size} />
              </div>
              <p className="text-stone-600 xl:col-span-2">Outlets: {mapSummary(row.outlets, "No outlets")}</p>
              <p className="text-stone-600 xl:col-span-2">Events/Festivals: {mapSummary(row.events, "No events")}</p>
            </article>
          ))}
        </div>
        {rows.length === 0 && <EmptyState text="No account manager statistics are available yet." />}
      </div>
    </section>
  );
}


export function FlowMap() {
  const steps = [
    ["1", "Request", "Account manager selects event, outlet, ticket type, quantity, and recipients."],
    ["2", "Review", "Manager checks rules, edits details, and confirms the final status."],
    ["3", "Approval", "Request is approved, partially approved, or rejected with notes."],
    ["4", "Send", "Open an email draft, attach ticket files in the official mailbox, and record the dispatch."],
  ];

  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-4">
        {steps.map(([number, title, text]) => (
          <div key={number} className="border-l-2 border-[#ECDFC8] pl-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#EB6A1C]">Step {number}</span>
            <h3 className="mt-1 font-semibold">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-stone-600">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}


export function ManagerDrilldownPanel({
  manager,
  rows,
  onClose,
  onExportCsv,
  onExportPdf,
}: {
  manager: string;
  rows: ReportRow[];
  onClose: () => void;
  onExportCsv: (rows: ReportRow[], scope: string) => void;
  onExportPdf: (rows: ReportRow[], scope: string) => void;
}) {
  const managerRows = useMemo(() => rows.filter((row) => String(row.accountManagerEmail || row.accountManager || "Unknown manager").trim() === manager), [manager, rows]);
  const summary = useMemo(() => buildManagerSummaries(managerRows)[0], [managerRows]);
  const festivals = useMemo(() => {
    const map = new Map<string, FestivalSummary>();
    for (const row of managerRows) {
      const event = String(row.event || "No event").trim() || "No event";
      const eventKind = String(row.eventKind || "Event");
      const key = `${eventKind}:${event}`;
      const current =
        map.get(key) ??
        {
          key,
          event,
          eventKind,
          requested: 0,
          approvedTickets: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          outlets: new Set<string>(),
          dispatches: 0,
          latest: undefined,
          rows: [],
        };
      const status = String(row.status || "");
      current.requested += Number(row.quantity || 0);
      current.approvedTickets += Number(row.approved || 0);
      current.dispatches += Number(row.dispatches || 0);
      if (status === "Pending") current.pending += 1;
      if (status === "Approved" || status === "Partially approved") current.approved += 1;
      if (status === "Rejected") current.rejected += 1;
      const outlet = String(row.outlet || "").trim();
      if (outlet) current.outlets.add(outlet);
      const createdAt = String(row.createdAt || "");
      if (createdAt && (!current.latest || new Date(createdAt) > new Date(current.latest))) current.latest = createdAt;
      current.rows.push(row);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.requested - a.requested || a.event.localeCompare(b.event));
  }, [managerRows]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[75]">
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label="Close account manager report" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-stone-200 bg-[#FFFCF6] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Account manager report</p>
            <h2 className="mt-1 truncate text-xl font-semibold">{summary?.manager || manager}</h2>
            {summary?.email && summary.email !== summary.manager && <p className="mt-0.5 truncate text-xs text-stone-500">{summary.email}</p>}
            <p className="mt-1 text-sm text-stone-600">Filtered report by festival/event, outlet, status, and dispatch activity.</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ActionButton type="button" variant="secondary" onClick={() => onExportCsv(managerRows, `manager-${summary?.manager || manager}`)}>
              <Download size={14} /> CSV
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={() => onExportPdf(managerRows, `manager-${summary?.manager || manager}`)}>
              <Download size={14} /> PDF
            </ActionButton>
            <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={onClose} aria-label="Close report">
              <X size={18} />
            </ActionButton>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {summary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InsightMetric label="Requests" value={summary.requests} detail="Created in the current filters." />
                <InsightMetric label="Tickets requested" value={summary.tickets} detail={`${summary.approvedTickets} approved ticket(s).`} tone="good" />
                <InsightMetric label="Pending / rejected" value={`${summary.pending} / ${summary.rejected}`} detail="Items needing attention or declined." tone={summary.pending > 0 ? "warn" : "neutral"} />
                <InsightMetric label="Dispatches" value={summary.dispatches} detail={`Latest activity ${summary.latest ? formatShortDate(summary.latest) : "-"}.`} />
              </div>

              <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Festival and event breakdown</h3>
                <p className="mt-0.5 text-xs text-stone-500">Each block shows what this account manager requested for a specific festival/event.</p>
                <div className="mt-4 space-y-3">
                  {festivals.map((festival) => (
                    <div key={festival.key} className="rounded-md border border-stone-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate font-semibold text-stone-950">{festival.event}</h4>
                            <Badge tone={festival.eventKind === "Festival" ? "warn" : "neutral"}>{festival.eventKind}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-stone-500">{festival.outlets.size} outlet(s) · latest {festival.latest ? formatShortDate(festival.latest) : "-"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="neutral">{festival.requested} requested</Badge>
                          <Badge tone="good">{festival.approvedTickets} approved</Badge>
                          <Badge tone={festival.pending > 0 ? "warn" : "neutral"}>{festival.pending} pending</Badge>
                          <Badge tone={festival.rejected > 0 ? "bad" : "neutral"}>{festival.rejected} rejected</Badge>
                          <Badge tone="neutral">{festival.dispatches} dispatches</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Request details</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b text-stone-600">
                      <tr><th className="py-2">Date</th><th>Festival/Event</th><th>Outlet</th><th>Ticket types</th><th>Status</th><th>Dispatches</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {managerRows.map((row) => (
                        <tr key={String(row.id)}>
                          <td className="py-3">{row.createdAt ? formatShortDate(String(row.createdAt)) : "-"}</td>
                          <td>{row.event}</td>
                          <td>{row.outlet}</td>
                          <td>{row.ticketTypes}</td>
                          <td>{String(row.status)}</td>
                          <td>{row.dispatches}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <EmptyState text="No activity for this account manager in the current filters." />
          )}
        </div>
      </aside>
    </div>
  );
}

export function ReportFocusPanel({
  focus,
  rows,
  onClose,
  onExportCsv,
  onExportPdf,
}: {
  focus: ReportFocus;
  rows: ReportRow[];
  onClose: () => void;
  onExportCsv: (rows: ReportRow[], scope: string) => void;
  onExportPdf: (rows: ReportRow[], scope: string) => void;
}) {
  const focusRows = useMemo(
    () => rows.filter((row) => String(row[focus.kind] || "").trim() === focus.label),
    [focus, rows],
  );
  const summary = useMemo(() => summarizeReportRows(focusRows), [focusRows]);
  const breakdownKey = focus.kind === "event" ? "accountManager" : "event";
  const breakdownTitle = focus.kind === "event" ? "Account managers" : "Events and festivals";
  const breakdown = useMemo(() => rankedTotals(focusRows, breakdownKey, "quantity", 8), [breakdownKey, focusRows]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[75]">
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label="Close report detail" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-stone-200 bg-[#FFFCF6] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{focus.kind === "event" ? "Event report" : "Outlet report"}</p>
            <h2 className="mt-1 truncate text-xl font-semibold">{focus.label}</h2>
            <p className="mt-1 text-sm text-stone-600">Detail from the current report filters.</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ActionButton type="button" variant="secondary" onClick={() => onExportCsv(focusRows, `${focus.kind}-${focus.label}`)}>
              <Download size={14} /> CSV
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={() => onExportPdf(focusRows, `${focus.kind}-${focus.label}`)}>
              <Download size={14} /> PDF
            </ActionButton>
            <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={onClose} aria-label="Close report">
              <X size={18} />
            </ActionButton>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightMetric label="Requests" value={summary.requests} detail="Rows in the current filters." />
            <InsightMetric label="Tickets" value={summary.tickets} detail={`${summary.approvedTickets} approved ticket(s).`} tone="good" />
            <InsightMetric label="Pending / rejected" value={`${summary.pending} / ${summary.rejected}`} detail="Open or declined requests." tone={summary.pending > 0 ? "warn" : "neutral"} />
            <InsightMetric label="Dispatches" value={summary.dispatches} detail={`Latest ${summary.latest ? formatShortDate(summary.latest) : "-"}.`} />
          </div>
          <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{breakdownTitle}</h3>
            <ReportBreakdownList data={breakdown} emptyText="No breakdown data in the current filters." />
          </section>
          <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Request details</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-stone-600">
                  <tr><th className="py-2">Date</th><th>Event/Festival</th><th>Outlet</th><th>Account manager</th><th>Status</th><th>Tickets</th><th>Dispatches</th></tr>
                </thead>
                <tbody className="divide-y">
                  {focusRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td className="py-3">{row.createdAt ? formatShortDate(String(row.createdAt)) : "-"}</td>
                      <td>{row.event}</td>
                      <td>{row.outlet}</td>
                      <td>{row.accountManager}</td>
                      <td>{String(row.status)}</td>
                      <td>{row.quantity}</td>
                      <td>{row.dispatches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function ReportBreakdownList({ data, emptyText }: { data: [string, number][]; emptyText: string }) {
  const max = Math.max(...data.map(([, value]) => value), 1);
  return data.length === 0 ? (
    <div className="mt-4"><EmptyState text={emptyText} /></div>
  ) : (
    <div className="mt-4 space-y-2.5">
      {data.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-stone-700" title={label}>{label}</p>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-[#14b8a6]" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums text-stone-800">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsSection({
  rows,
  selectedManager,
  onSelectManager,
  onSelectFocus,
}: {
  rows: ReportRow[];
  selectedManager: string | null;
  onSelectManager: (manager: string) => void;
  onSelectFocus: (focus: ReportFocus) => void;
}) {
  const totalRequests = rows.length;
  const totalTickets = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalDispatches = rows.reduce((sum, row) => sum + Number(row.dispatches || 0), 0);
  const uniqueManagers = new Set(rows.map((row) => String(row.accountManagerEmail || row.accountManager || ""))).size;
  const uniqueOutlets = new Set(rows.map((row) => String(row.outlet || ""))).size;
  const approved = rows.filter((row) => ["Approved", "Partially approved"].includes(String(row.status))).length;
  const pending = rows.filter((row) => String(row.status) === "Pending").length;
  const approvalRate = totalRequests ? Math.round((approved / totalRequests) * 100) : 0;
  const avgTickets = totalRequests ? (totalTickets / totalRequests).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightMetric label="Approval rate" value={`${approvalRate}%`} detail={`${approved} approved or partially approved of ${totalRequests} request${totalRequests === 1 ? "" : "s"}.`} tone={approvalRate >= 70 ? "good" : approvalRate >= 35 ? "warn" : "neutral"} />
        <InsightMetric label="Average tickets" value={avgTickets} detail="Requested tickets per request in the current filter." />
        <InsightMetric label="Pending queue" value={pending} detail="Requests still waiting for a manager decision." tone={pending > 0 ? "warn" : "good"} />
        <InsightMetric label="Dispatches" value={totalDispatches} detail="Manual or system dispatch records for approved ticket workflows." />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <TicketsOverTimeChart rows={rows} />
        <DispatchCoverageChart rows={rows} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RankedBarChart
          title="Tickets by account manager"
          subtitle="Top requesters by ticket volume in the current filters."
          data={rankedTotals(rows, "accountManager")}
          emptyText="No account manager activity in the current filters."
        />
        <RankedBarChart
          title="Tickets by outlet"
          subtitle="Which clients are requesting the most tickets."
          data={rankedTotals(rows, "outlet")}
          emptyText="No outlet activity in the current filters."
          onSelect={(label) => onSelectFocus({ kind: "outlet", label })}
        />
        <RankedBarChart
          title="Clients invited the most"
          subtitle="Outlets with the most recorded ticket dispatches."
          data={rankedTotals(rows, "outlet", "dispatches")}
          emptyText="No ticket dispatches have been recorded in the current filters."
          onSelect={(label) => onSelectFocus({ kind: "outlet", label })}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <StatusBreakdownChart rows={rows} />
        <EventPerformanceChart rows={rows} onSelectEvent={(label) => onSelectFocus({ kind: "event", label })} />
      </div>
      <ManagerActivityMatrix rows={rows} selectedManager={selectedManager} onSelectManager={onSelectManager} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Tickets Requested" value={totalTickets} icon={Ticket} tone="gold" />
        <Kpi label="Account Managers" value={uniqueManagers} icon={Users} tone="neutral" />
        <Kpi label="Outlets Involved" value={uniqueOutlets} icon={Store} tone="neutral" />
      </div>
    </div>
  );
}


export function ReportsPanel() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [reportSearch, setReportSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<ReportFocus | null>(null);
  const [exportNotice, setExportNotice] = useState<{ message: string; tone: Tone } | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | "">("");
  const [loadingReport, setLoadingReport] = useState(false);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesStatus = statusFilter === "all" || String(row.status) === renderRequestStatus(statusFilter);
        const haystack = [row.event, row.eventKind, row.market, row.outlet, row.accountManager, row.accountManagerEmail, row.status].join(" ").toLowerCase();
        return matchesStatus && haystack.includes(reportSearch.toLowerCase());
      }),
    [reportSearch, rows, statusFilter],
  );

  const reportParams = useCallback((extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set("status", statusFilter);
    if (reportSearch) params.set("accountManager", reportSearch);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    for (const [key, value] of Object.entries(extra || {})) {
      params.set(key, value);
    }
    return params;
  }, [dateFrom, dateTo, reportSearch, statusFilter]);

  async function exportPdfRows(exportRows: ReportRow[], scope: string) {
    setExportNotice(null);
    setExporting("pdf");
    try {
      const [{ default: jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ unit: "pt" });
      const summary = summarizeReportRows(exportRows);
      const filename = reportFilename(scope, "pdf");
      const title = scope === "workspace-report" ? "Bacardi Ticket Hub Report" : `Bacardi Ticket Hub · ${scope.replace(/-/g, " ")}`;

      doc.setFillColor(58, 42, 24);
      doc.rect(0, 0, 595, 88, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text(title, 40, 38);
      doc.setFontSize(9);
      doc.text(`Generated ${formatDate(new Date().toISOString())}`, 40, 58);
      doc.setTextColor(236, 223, 200);
      doc.text(`Rows ${exportRows.length} · Status ${statusFilter === "all" ? "All" : renderRequestStatus(statusFilter)} · Search ${reportSearch || "None"}`, 40, 74);

      doc.setTextColor(58, 42, 24);
      doc.setFontSize(11);
      const metrics = [
        `Requests: ${summary.requests}`,
        `Tickets: ${summary.tickets}`,
        `Approved tickets: ${summary.approvedTickets}`,
        `Dispatches: ${summary.dispatches}`,
      ];
      metrics.forEach((metric, index) => {
        doc.setFillColor(255, 252, 246);
        doc.roundedRect(40 + index * 128, 112, 116, 42, 6, 6, "F");
        doc.text(metric, 52 + index * 128, 137);
      });

      autoTable.default(doc, {
        head: [["Event/Festival", "Type", "Outlet", "Account Manager", "Status", "Tickets", "Approved", "Dispatches"]],
        body: exportRows.map((row) => [row.event, row.eventKind, row.outlet, row.accountManager, row.status, row.quantity, row.approved, row.dispatches]),
        startY: 178,
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [58, 42, 24], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [255, 252, 246] },
      });
      doc.save(filename);
      setExportNotice({ message: `PDF exported: ${filename}`, tone: "good" });
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : "Unable to export the PDF.", tone: "bad" });
    } finally {
      setExporting("");
    }
  }

  function exportCsvRows(exportRows: ReportRow[], scope: string) {
    const filename = reportFilename(scope, "csv");
    downloadTextFile(reportCsv(exportRows), filename, "text/csv;charset=utf-8");
    setExportNotice({ message: `CSV exported: ${filename}`, tone: "good" });
  }

  const load = useCallback(async () => {
    const params = reportParams();
    setLoadingReport(true);
    try {
      const data = await api<{ rows: ReportRow[] }>(`/api/reports?${params.toString()}`);
      setRows(data.rows);
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : "Unable to load the report.", tone: "bad" });
    } finally {
      setLoadingReport(false);
    }
  }, [reportParams]);

  async function exportPdf() {
    try {
      await api(`/api/reports?${reportParams({ export: "pdf" }).toString()}`);
      await exportPdfRows(filteredRows, "workspace-report");
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : "Unable to export the PDF.", tone: "bad" });
    }
  }

  async function exportCsv() {
    setExportNotice(null);
    setExporting("csv");
    try {
      const response = await fetch(`/api/reports?${reportParams({ format: "csv" }).toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to export CSV." }));
        setExportNotice({ message: payload.error || "Unable to export CSV.", tone: "bad" });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFilename("workspace-report", "csv");
      link.click();
      URL.revokeObjectURL(url);
      setExportNotice({ message: `CSV exported: ${link.download}`, tone: "good" });
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : "Unable to export CSV.", tone: "bad" });
    } finally {
      setExporting("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Filters</h2>
            <p className="mt-1 text-sm text-stone-600">Drives the charts below and the request table.</p>
          </div>
          <div className="flex gap-2">
            <ActionButton variant="secondary" disabled={Boolean(exporting)} onClick={() => void exportCsv()}>
              <Download size={16} /> {exporting === "csv" ? "Exporting CSV..." : "CSV"}
            </ActionButton>
            <ActionButton variant="secondary" disabled={Boolean(exporting)} onClick={() => void exportPdf()}>
              <Download size={16} /> {exporting === "pdf" ? "Exporting PDF..." : "PDF"}
            </ActionButton>
          </div>
        </div>
        {exportNotice && <div className="mt-4"><Notice message={exportNotice.message} tone={exportNotice.tone} /></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_1fr_180px_180px]">
          <Field label="Status">
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="partially_approved">Partially approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          <Field label="Search report">
            <input className={inputClass} value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Search event, outlet, market, account manager" />
          </Field>
          <Field label="From">
            <input className={inputClass} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <input className={inputClass} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
        </div>
        {loadingReport && <p className="mt-3 text-sm text-stone-500">Loading report...</p>}
      </div>

      <AnalyticsSection rows={filteredRows} selectedManager={selectedManager} onSelectManager={setSelectedManager} onSelectFocus={setSelectedFocus} />
      {selectedManager && (
        <ManagerDrilldownPanel
          manager={selectedManager}
          rows={filteredRows}
          onClose={() => setSelectedManager(null)}
          onExportCsv={exportCsvRows}
          onExportPdf={(exportRows, scope) => void exportPdfRows(exportRows, scope)}
        />
      )}
      {selectedFocus && (
        <ReportFocusPanel
          focus={selectedFocus}
          rows={filteredRows}
          onClose={() => setSelectedFocus(null)}
          onExportCsv={exportCsvRows}
          onExportPdf={(exportRows, scope) => void exportPdfRows(exportRows, scope)}
        />
      )}

      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Request report</h2>
        <div className="mt-4 grid gap-3 lg:hidden">
          {filteredRows.map((row) => (
            <article key={String(row.id)} className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-950">{row.event}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{row.eventKind} · {row.market || "No market"}</p>
                </div>
                <Badge tone={String(row.status) === "Rejected" ? "bad" : String(row.status) === "Pending" ? "warn" : "good"}>{String(row.status)}</Badge>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-stone-600">
                <p><strong>Outlet:</strong> {row.outlet || "-"}</p>
                <p><strong>Account manager:</strong> {row.accountManager}</p>
                {row.accountManagerEmail && row.accountManagerEmail !== row.accountManager && <p><strong>Email:</strong> {row.accountManagerEmail}</p>}
                <p><strong>Tickets:</strong> {row.quantity} · <strong>Dispatches:</strong> {row.dispatches}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b text-stone-600">
              <tr><th className="py-2">Event/Festival</th><th>Type</th><th>Market</th><th>Outlet</th><th>Account Manager</th><th>Status</th><th>Tickets</th><th>Dispatches</th></tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((row) => (
                <tr key={String(row.id)}>
                  <td className="py-3">{row.event}</td>
                  <td>{row.eventKind}</td>
                  <td>{row.market}</td>
                  <td>{row.outlet}</td>
                  <td>
                    <p>{row.accountManager}</p>
                    {row.accountManagerEmail && row.accountManagerEmail !== row.accountManager && <p className="text-xs text-stone-500">{row.accountManagerEmail}</p>}
                  </td>
                  <td>{String(row.status)}</td>
                  <td>{row.quantity}</td>
                  <td>{row.dispatches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 && <EmptyState text={rows.length === 0 ? "No report rows are available yet." : "No report rows match the current filters."} />}
      </div>
    </div>
  );
}


