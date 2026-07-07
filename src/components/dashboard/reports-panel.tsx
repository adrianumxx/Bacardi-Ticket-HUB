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
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { localeMap } from "@/lib/i18n/translations";

export function ManagerAnalytics({ rows }: { rows: ManagerStat[] }) {
  const { t, language } = useTranslation();
  const locale = localeMap[language];
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ECDFC8]">{t("reports.managerPerformance")}</p>
        <h2 className="mt-2 text-2xl font-semibold">{t("reports.requestsByManager")}</h2>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <MiniStat label={t("reports.managers")} value={totals.managers} />
          <MiniStat label={t("reports.tickets")} value={totals.tickets} />
          <MiniStat label={t("reports.outlets")} value={totals.outlets} />
        </div>
        <div className="mt-5 space-y-3">
          {top.map((row) => (
            <div key={row.email}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{row.name}</span>
                <span className="text-[#ECDFC8]">{t("reports.requestsCount", { count: row.requests })}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#ECDFC8]" style={{ width: `${Math.max(8, (row.requests / maxRequests) * 100)}%` }} />
              </div>
            </div>
          ))}
          {top.length === 0 && <p className="text-sm text-white/70">{t("reports.noManagerActivity")}</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-lg font-semibold">{t("reports.managerBreakdown")}</h2>
        </div>
        <div className="divide-y">
          {rows.map((row) => (
            <article key={row.email} className="grid gap-3 p-4 text-sm xl:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="break-words text-xs text-stone-500">{row.email}</p>
                <p className="mt-2 text-xs text-stone-500">{t("reports.latestRequest", { date: row.latestRequest ? formatShortDate(row.latestRequest, locale) : "-" })}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniMetric label={t("reports.requests")} value={row.requests} />
                <MiniMetric label={t("reports.tickets")} value={row.tickets} />
                <MiniMetric label={t("reports.approved")} value={row.approved} tone="good" />
                <MiniMetric label={t("reports.pending")} value={row.pending} tone="warn" />
                <MiniMetric label={t("reports.rejected")} value={row.rejected} tone="bad" />
                <MiniMetric label={t("reports.outlets")} value={row.outlets.size} />
              </div>
              <p className="text-stone-600 xl:col-span-2">{t("reports.outletsSummary", { summary: mapSummary(row.outlets, t("reports.noOutlets")) })}</p>
              <p className="text-stone-600 xl:col-span-2">{t("reports.eventsSummary", { summary: mapSummary(row.events, t("reports.noEvents")) })}</p>
            </article>
          ))}
        </div>
        {rows.length === 0 && <EmptyState text={t("reports.noManagerStats")} />}
      </div>
    </section>
  );
}


export function FlowMap() {
  const { t } = useTranslation();
  const steps = [
    ["1", t("reports.step1Title"), t("reports.step1Text")],
    ["2", t("reports.step2Title"), t("reports.step2Text")],
    ["3", t("reports.step3Title"), t("reports.step3Text")],
    ["4", t("reports.step4Title"), t("reports.step4Text")],
  ];

  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-4">
        {steps.map(([number, title, text]) => (
          <div key={number} className="border-l-2 border-[#ECDFC8] pl-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#EB6A1C]">{t("reports.step", { number })}</span>
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
  const { t, language } = useTranslation();
  const locale = localeMap[language];
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
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label={t("reports.closeManagerReport")} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-stone-200 bg-[#FFFCF6] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{t("reports.accountManagerReport")}</p>
            <h2 className="mt-1 truncate text-xl font-semibold">{summary?.manager || manager}</h2>
            {summary?.email && summary.email !== summary.manager && <p className="mt-0.5 truncate text-xs text-stone-500">{summary.email}</p>}
            <p className="mt-1 text-sm text-stone-600">{t("reports.filteredReportDescription")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ActionButton type="button" variant="secondary" onClick={() => onExportCsv(managerRows, `manager-${summary?.manager || manager}`)}>
              <Download size={14} /> {t("reports.csv")}
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={() => onExportPdf(managerRows, `manager-${summary?.manager || manager}`)}>
              <Download size={14} /> {t("reports.pdf")}
            </ActionButton>
            <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={onClose} aria-label={t("reports.closeReport")}>
              <X size={18} />
            </ActionButton>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {summary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InsightMetric label={t("reports.requests")} value={summary.requests} detail={t("reports.requestsDetail")} />
                <InsightMetric label={t("reports.ticketsRequested")} value={summary.tickets} detail={t("reports.approvedTicketsDetail", { count: summary.approvedTickets })} tone="good" />
                <InsightMetric label={t("reports.pendingRejected")} value={`${summary.pending} / ${summary.rejected}`} detail={t("reports.pendingRejectedDetail")} tone={summary.pending > 0 ? "warn" : "neutral"} />
                <InsightMetric label={t("reports.dispatches")} value={summary.dispatches} detail={t("reports.latestActivity", { date: summary.latest ? formatShortDate(summary.latest, locale) : "-" })} />
              </div>

              <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">{t("reports.festivalEventBreakdown")}</h3>
                <p className="mt-0.5 text-xs text-stone-500">{t("reports.festivalEventBreakdownDetail")}</p>
                <div className="mt-4 space-y-3">
                  {festivals.map((festival) => (
                    <div key={festival.key} className="rounded-md border border-stone-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate font-semibold text-stone-950">{festival.event}</h4>
                            <Badge tone={festival.eventKind === "Festival" ? "warn" : "neutral"}>{festival.eventKind}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-stone-500">{t("reports.outletsCount", { count: festival.outlets.size, date: festival.latest ? formatShortDate(festival.latest, locale) : "-" })}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="neutral">{t("reports.requestedBadge", { count: festival.requested })}</Badge>
                          <Badge tone="good">{t("reports.approvedBadge", { count: festival.approvedTickets })}</Badge>
                          <Badge tone={festival.pending > 0 ? "warn" : "neutral"}>{t("reports.pendingBadge", { count: festival.pending })}</Badge>
                          <Badge tone={festival.rejected > 0 ? "bad" : "neutral"}>{t("reports.rejectedBadge", { count: festival.rejected })}</Badge>
                          <Badge tone="neutral">{t("reports.dispatchesBadge", { count: festival.dispatches })}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">{t("reports.requestDetails")}</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b text-stone-600">
                      <tr><th className="py-2">{t("reports.date")}</th><th>{t("reports.festivalEvent")}</th><th>{t("reports.outlet")}</th><th>{t("reports.ticketTypes")}</th><th>{t("reports.status")}</th><th>{t("reports.dispatches")}</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {managerRows.map((row) => (
                        <tr key={String(row.id)}>
                          <td className="py-3">{row.createdAt ? formatShortDate(String(row.createdAt), locale) : "-"}</td>
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
            <EmptyState text={t("reports.noManagerActivityFiltered")} />
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
  const { t, language } = useTranslation();
  const locale = localeMap[language];
  const focusRows = useMemo(
    () => rows.filter((row) => String(row[focus.kind] || "").trim() === focus.label),
    [focus, rows],
  );
  const summary = useMemo(() => summarizeReportRows(focusRows), [focusRows]);
  const breakdownKey = focus.kind === "event" ? "accountManager" : "event";
  const breakdownTitle = focus.kind === "event" ? t("reports.accountManagers") : t("reports.eventsAndFestivals");
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
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label={t("reports.closeReportDetail")} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-stone-200 bg-[#FFFCF6] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{focus.kind === "event" ? t("reports.eventReport") : t("reports.outletReport")}</p>
            <h2 className="mt-1 truncate text-xl font-semibold">{focus.label}</h2>
            <p className="mt-1 text-sm text-stone-600">{t("reports.detailFromFilters")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ActionButton type="button" variant="secondary" onClick={() => onExportCsv(focusRows, `${focus.kind}-${focus.label}`)}>
              <Download size={14} /> {t("reports.csv")}
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={() => onExportPdf(focusRows, `${focus.kind}-${focus.label}`)}>
              <Download size={14} /> {t("reports.pdf")}
            </ActionButton>
            <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={onClose} aria-label={t("reports.closeReport")}>
              <X size={18} />
            </ActionButton>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightMetric label={t("reports.requests")} value={summary.requests} detail={t("reports.rowsInFilters")} />
            <InsightMetric label={t("reports.tickets")} value={summary.tickets} detail={t("reports.approvedTicketsDetail", { count: summary.approvedTickets })} tone="good" />
            <InsightMetric label={t("reports.pendingRejected")} value={`${summary.pending} / ${summary.rejected}`} detail={t("reports.openDeclined")} tone={summary.pending > 0 ? "warn" : "neutral"} />
            <InsightMetric label={t("reports.dispatches")} value={summary.dispatches} detail={t("reports.latest", { date: summary.latest ? formatShortDate(summary.latest, locale) : "-" })} />
          </div>
          <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{breakdownTitle}</h3>
            <ReportBreakdownList data={breakdown} emptyText={t("reports.noBreakdownData")} />
          </section>
          <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{t("reports.requestDetails")}</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-stone-600">
                  <tr><th className="py-2">{t("reports.date")}</th><th>{t("reports.eventFestival")}</th><th>{t("reports.outlet")}</th><th>{t("reports.accountManager")}</th><th>{t("reports.status")}</th><th>{t("reports.ticketsCol")}</th><th>{t("reports.dispatches")}</th></tr>
                </thead>
                <tbody className="divide-y">
                  {focusRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td className="py-3">{row.createdAt ? formatShortDate(String(row.createdAt), locale) : "-"}</td>
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
  const { t } = useTranslation();
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
        <InsightMetric label={t("reports.approvalRate")} value={`${approvalRate}%`} detail={t("reports.approvalRateDetail", { approved, total: totalRequests, plural: totalRequests === 1 ? "" : "s" })} tone={approvalRate >= 70 ? "good" : approvalRate >= 35 ? "warn" : "neutral"} />
        <InsightMetric label={t("reports.averageTickets")} value={avgTickets} detail={t("reports.averageTicketsDetail")} />
        <InsightMetric label={t("reports.pendingQueue")} value={pending} detail={t("reports.pendingQueueDetail")} tone={pending > 0 ? "warn" : "good"} />
        <InsightMetric label={t("reports.dispatches")} value={totalDispatches} detail={t("reports.dispatchesDetail")} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <TicketsOverTimeChart rows={rows} />
        <DispatchCoverageChart rows={rows} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RankedBarChart
          title={t("reports.ticketsByManager")}
          subtitle={t("reports.ticketsByManagerSubtitle")}
          data={rankedTotals(rows, "accountManager")}
          emptyText={t("reports.noManagerFiltered")}
        />
        <RankedBarChart
          title={t("reports.ticketsByOutlet")}
          subtitle={t("reports.ticketsByOutletSubtitle")}
          data={rankedTotals(rows, "outlet")}
          emptyText={t("reports.noOutletFiltered")}
          onSelect={(label) => onSelectFocus({ kind: "outlet", label })}
        />
        <RankedBarChart
          title={t("reports.clientsInvitedMost")}
          subtitle={t("reports.clientsInvitedMostSubtitle")}
          data={rankedTotals(rows, "outlet", "dispatches")}
          emptyText={t("reports.noDispatchesFiltered")}
          onSelect={(label) => onSelectFocus({ kind: "outlet", label })}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <StatusBreakdownChart rows={rows} />
        <EventPerformanceChart rows={rows} onSelectEvent={(label) => onSelectFocus({ kind: "event", label })} />
      </div>
      <ManagerActivityMatrix rows={rows} selectedManager={selectedManager} onSelectManager={onSelectManager} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t("reports.ticketsRequestedKpi")} value={totalTickets} icon={Ticket} tone="gold" />
        <Kpi label={t("reports.accountManagersKpi")} value={uniqueManagers} icon={Users} tone="neutral" />
        <Kpi label={t("reports.outletsInvolvedKpi")} value={uniqueOutlets} icon={Store} tone="neutral" />
      </div>
    </div>
  );
}


export function ReportsPanel() {
  const { t, language } = useTranslation();
  const locale = localeMap[language];
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
        const matchesStatus = statusFilter === "all" || String(row.status) === renderRequestStatus(statusFilter, t);
        const haystack = [row.event, row.eventKind, row.market, row.outlet, row.accountManager, row.accountManagerEmail, row.status].join(" ").toLowerCase();
        return matchesStatus && haystack.includes(reportSearch.toLowerCase());
      }),
    [reportSearch, rows, statusFilter, t],
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
      const title = scope === "workspace-report" ? t("reports.workspaceReportTitle") : `Bacardi Ticket Hub · ${scope.replace(/-/g, " ")}`;

      doc.setFillColor(58, 42, 24);
      doc.rect(0, 0, 595, 88, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text(title, 40, 38);
      doc.setFontSize(9);
      doc.text(t("reports.reportGenerated", { date: formatDate(new Date().toISOString(), locale) }), 40, 58);
      doc.setTextColor(236, 223, 200);
      doc.text(t("reports.reportSummary", { count: exportRows.length, status: statusFilter === "all" ? t("reports.all") : renderRequestStatus(statusFilter, t), search: reportSearch || t("reports.none") }), 40, 74);

      doc.setTextColor(58, 42, 24);
      doc.setFontSize(11);
      const metrics = [
        `${t("reports.requests")}: ${summary.requests}`,
        `${t("reports.tickets")}: ${summary.tickets}`,
        `${t("reports.approved")} ${t("reports.tickets").toLowerCase()}: ${summary.approvedTickets}`,
        `${t("reports.dispatches")}: ${summary.dispatches}`,
      ];
      metrics.forEach((metric, index) => {
        doc.setFillColor(255, 252, 246);
        doc.roundedRect(40 + index * 128, 112, 116, 42, 6, 6, "F");
        doc.text(metric, 52 + index * 128, 137);
      });

      autoTable.default(doc, {
        head: [[t("reports.eventFestival"), t("reports.type"), t("reports.outlet"), t("reports.accountManager"), t("reports.status"), t("reports.ticketsCol"), t("reports.approved"), t("reports.dispatches")]],
        body: exportRows.map((row) => [row.event, row.eventKind, row.outlet, row.accountManager, row.status, row.quantity, row.approved, row.dispatches]),
        startY: 178,
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [58, 42, 24], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [255, 252, 246] },
      });
      doc.save(filename);
      setExportNotice({ message: t("reports.pdfExported", { filename }), tone: "good" });
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : t("reports.unableToExportPdf"), tone: "bad" });
    } finally {
      setExporting("");
    }
  }

  function exportCsvRows(exportRows: ReportRow[], scope: string) {
    const filename = reportFilename(scope, "csv");
    downloadTextFile(reportCsv(exportRows), filename, "text/csv;charset=utf-8");
    setExportNotice({ message: t("reports.csvExported", { filename }), tone: "good" });
  }

  const load = useCallback(async () => {
    const params = reportParams();
    setLoadingReport(true);
    try {
      const data = await api<{ rows: ReportRow[] }>(`/api/reports?${params.toString()}`);
      setRows(data.rows);
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : t("reports.unableToLoadReport"), tone: "bad" });
    } finally {
      setLoadingReport(false);
    }
  }, [reportParams, t]);

  async function exportPdf() {
    try {
      await api(`/api/reports?${reportParams({ export: "pdf" }).toString()}`);
      await exportPdfRows(filteredRows, "workspace-report");
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : t("reports.unableToExportPdf"), tone: "bad" });
    }
  }

  async function exportCsv() {
    setExportNotice(null);
    setExporting("csv");
    try {
      const response = await fetch(`/api/reports?${reportParams({ format: "csv" }).toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: t("reports.unableToExportCsv") }));
        setExportNotice({ message: payload.error || t("reports.unableToExportCsv"), tone: "bad" });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFilename("workspace-report", "csv");
      link.click();
      URL.revokeObjectURL(url);
      setExportNotice({ message: t("reports.csvExported", { filename: link.download }), tone: "good" });
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : t("reports.unableToExportCsv"), tone: "bad" });
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
            <h2 className="text-lg font-semibold">{t("reports.filters")}</h2>
            <p className="mt-1 text-sm text-stone-600">{t("reports.filtersDescription")}</p>
          </div>
          <div className="flex gap-2">
            <ActionButton variant="secondary" disabled={Boolean(exporting)} onClick={() => void exportCsv()}>
              <Download size={16} /> {exporting === "csv" ? t("reports.exportingCsv") : t("reports.csv")}
            </ActionButton>
            <ActionButton variant="secondary" disabled={Boolean(exporting)} onClick={() => void exportPdf()}>
              <Download size={16} /> {exporting === "pdf" ? t("reports.exportingPdf") : t("reports.pdf")}
            </ActionButton>
          </div>
        </div>
        {exportNotice && <div className="mt-4"><Notice message={exportNotice.message} tone={exportNotice.tone} /></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_1fr_180px_180px]">
          <Field label={t("reports.status")}>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">{t("reports.allStatuses")}</option>
              <option value="pending">{t("reports.pending")}</option>
              <option value="approved">{t("reports.approved")}</option>
              <option value="partially_approved">{t("requests.partiallyApproved")}</option>
              <option value="rejected">{t("reports.rejected")}</option>
            </select>
          </Field>
          <Field label={t("reports.searchReport")}>
            <input className={inputClass} value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder={t("reports.searchPlaceholder")} />
          </Field>
          <Field label={t("reports.from")}>
            <input className={inputClass} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label={t("reports.to")}>
            <input className={inputClass} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
        </div>
        {loadingReport && <p className="mt-3 text-sm text-stone-500">{t("reports.loadingReport")}</p>}
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
        <h2 className="text-lg font-semibold">{t("reports.requestReport")}</h2>
        <div className="mt-4 grid gap-3 lg:hidden">
          {filteredRows.map((row) => (
            <article key={String(row.id)} className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-950">{row.event}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{row.eventKind} · {row.market || t("reports.noMarket")}</p>
                </div>
                <Badge tone={String(row.status) === "Rejected" ? "bad" : String(row.status) === "Pending" ? "warn" : "good"}>{String(row.status)}</Badge>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-stone-600">
                <p><strong>{t("reports.outlet")}:</strong> {row.outlet || "-"}</p>
                <p><strong>{t("reports.accountManager")}:</strong> {row.accountManager}</p>
                {row.accountManagerEmail && row.accountManagerEmail !== row.accountManager && <p><strong>Email:</strong> {row.accountManagerEmail}</p>}
                <p><strong>{t("reports.ticketsCol")}:</strong> {row.quantity} · <strong>{t("reports.dispatches")}:</strong> {row.dispatches}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b text-stone-600">
              <tr><th className="py-2">{t("reports.eventFestival")}</th><th>{t("reports.type")}</th><th>{t("reports.market")}</th><th>{t("reports.outlet")}</th><th>{t("reports.accountManager")}</th><th>{t("reports.status")}</th><th>{t("reports.ticketsCol")}</th><th>{t("reports.dispatches")}</th></tr>
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
        {filteredRows.length === 0 && <EmptyState text={rows.length === 0 ? t("reports.noRowsYet") : t("reports.noRowsMatch")} />}
      </div>
    </div>
  );
}
