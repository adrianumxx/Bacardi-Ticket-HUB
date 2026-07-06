"use client";

import { useMemo, useState } from "react";
import { formatShortDate } from "@/lib/utils";
import type { ReportRow, Tone } from "./types";
import { buildManagerSummaries, rankedTotals } from "./helpers";
import { CountPill, EmptyState, MetricCell, TextMetric } from "./ui-primitives";

export const magnitudeRamp = ["#14b8a6", "#f59e0b", "#ef4444", "#6366f1", "#7A4A1C"];

export const statusChartColors: Record<string, string> = {
  Pending: "#a8a29e",
  Approved: "#10b981",
  "Partially approved": "#f59e0b",
  Rejected: "#ef4444",
};

export function RankedBarChart({
  title,
  subtitle,
  data,
  emptyText,
  onSelect,
}: {
  title: string;
  subtitle: string;
  data: [string, number][];
  emptyText: string;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(...data.map(([, value]) => value), 1);
  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="mt-4"><EmptyState text={emptyText} /></div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {data.map(([label, value]) => (
            <button
              key={label}
              type="button"
              disabled={!onSelect}
              onClick={onSelect ? () => onSelect(label) : undefined}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md text-left transition enabled:hover:bg-stone-50 enabled:focus:outline-none enabled:focus:ring-2 enabled:focus:ring-[#EB6A1C]/30 disabled:cursor-default"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-stone-700" title={label}>{label}</p>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: `linear-gradient(90deg, ${magnitudeRamp[0]}, ${magnitudeRamp[1]})` }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-stone-800">{value}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function InsightMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-white text-stone-950",
    good: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warn: "border-amber-200 bg-amber-50 text-amber-950",
    bad: "border-red-200 bg-red-50 text-red-950",
  };
  return (
    <div className={`rounded-md border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">{detail}</p>
    </div>
  );
}
export function DispatchCoverageChart({ rows }: { rows: ReportRow[] }) {
  const totals = rows.reduce<{ requests: number; dispatched: number; emails: number }>(
    (acc, row) => {
      acc.requests += 1;
      acc.dispatched += Number(row.dispatches || 0) > 0 ? 1 : 0;
      acc.emails += Number(row.dispatches || 0);
      return acc;
    },
    { requests: 0, dispatched: 0, emails: 0 },
  );
  const coverage = totals.requests ? Math.round((totals.dispatched / totals.requests) * 100) : 0;
  const circumference = 2 * Math.PI * 42;
  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Dispatch coverage</h3>
      <p className="mt-0.5 text-xs text-stone-500">How many approved workflows already recorded ticket dispatches.</p>
      {totals.requests === 0 ? (
        <div className="mt-4"><EmptyState text="No requests match the current filters." /></div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-[130px_1fr] sm:items-center">
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#f5f5f4" strokeWidth="10" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#14b8a6"
                strokeLinecap="round"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (coverage / 100) * circumference}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <span className="text-2xl font-semibold tabular-nums">{coverage}%</span>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4 rounded-md bg-stone-50 px-3 py-2"><span>Requests with dispatch</span><strong>{totals.dispatched}</strong></div>
            <div className="flex justify-between gap-4 rounded-md bg-stone-50 px-3 py-2"><span>Total request rows</span><strong>{totals.requests}</strong></div>
            <div className="flex justify-between gap-4 rounded-md bg-stone-50 px-3 py-2"><span>Dispatch records</span><strong>{totals.emails}</strong></div>
          </div>
        </div>
      )}
    </section>
  );
}

export function EventPerformanceChart({ rows, onSelectEvent }: { rows: ReportRow[]; onSelectEvent?: (event: string) => void }) {
  const data = rankedTotals(rows, "event", "quantity", 6);
  const max = Math.max(...data.map(([, value]) => value), 1);
  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Event demand map</h3>
      <p className="mt-0.5 text-xs text-stone-500">Highest ticket pressure by sponsored event or festival.</p>
      {data.length === 0 ? (
        <div className="mt-4"><EmptyState text="No event demand in the current filters." /></div>
      ) : (
        <div className="mt-4 grid gap-3">
          {data.map(([label, value], index) => (
            <button key={label} type="button" onClick={() => onSelectEvent?.(label)} className="grid gap-1 rounded-md text-left transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[#EB6A1C]/30">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-stone-700" title={label}>{label}</span>
                <span className="font-semibold tabular-nums text-stone-950">{value}</span>
              </div>
              <div className="h-7 overflow-hidden rounded-md bg-stone-100">
                <div
                  className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-semibold text-white"
                  style={{
                    width: `${Math.max(12, (value / max) * 100)}%`,
                    background: `linear-gradient(90deg, ${magnitudeRamp[index % magnitudeRamp.length]}, #181412)`,
                  }}
                >
                  {Math.round((value / max) * 100)}%
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function TicketsOverTimeChart({ rows }: { rows: ReportRow[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const byDay = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const createdAt = row.createdAt ? new Date(row.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
      const key = createdAt.toISOString().slice(0, 10);
      totals.set(key, (totals.get(key) ?? 0) + Number(row.quantity || 0));
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  }, [rows]);
  const max = Math.max(...byDay.map(([, value]) => value), 1);
  const points = byDay
    .map(([, value], index) => {
      const x = byDay.length === 1 ? 50 : (index / (byDay.length - 1)) * 100;
      const y = 92 - (value / max) * 78;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = points ? `0,96 ${points} 100,96` : "";

  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Tickets requested over time</h3>
      <p className="mt-0.5 text-xs text-stone-500">Daily requested ticket volume, last {byDay.length || 0} day{byDay.length === 1 ? "" : "s"} with activity in the current filters.</p>
      {byDay.length === 0 ? (
        <div className="mt-4"><EmptyState text="No dated requests match the current filters." /></div>
      ) : (
        <div className="relative mt-5">
          {hoverIndex !== null && (
            <div className="pointer-events-none absolute -top-2 left-0 -translate-y-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `${(hoverIndex / byDay.length) * 100}%` }}>
              <p className="font-semibold text-stone-800">{byDay[hoverIndex][1]} ticket{byDay[hoverIndex][1] === 1 ? "" : "s"}</p>
              <p className="text-stone-500">{formatShortDate(byDay[hoverIndex][0])}</p>
            </div>
          )}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-36 w-full overflow-visible rounded-md bg-stone-50">
            <defs>
              <linearGradient id="ticketTrendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polyline points={areaPoints} fill="url(#ticketTrendFill)" stroke="none" />
            <polyline points={points} fill="none" stroke="#14b8a6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="mt-2 flex h-10 items-end gap-1">
            {byDay.map(([day, value], index) => (
              <div
                key={day}
                className="group flex-1 cursor-default"
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
              >
                <div
                  className="mx-auto w-full rounded-t transition-all group-hover:opacity-80"
                  style={{ height: `${Math.max(8, (value / max) * 100)}%`, background: "#f59e0b" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-stone-400">
            <span>{formatShortDate(byDay[0][0])}</span>
            <span>{formatShortDate(byDay[byDay.length - 1][0])}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function StatusBreakdownChart({ rows }: { rows: ReportRow[] }) {
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const status = String(row.status || "Unknown");
      map.set(status, (map.get(status) ?? 0) + 1);
    }
    return [...map.entries()].filter(([, count]) => count > 0);
  }, [rows]);
  const total = totals.reduce((sum, [, count]) => sum + count, 0);

  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Requests by status</h3>
      <p className="mt-0.5 text-xs text-stone-500">Share of the {total} request{total === 1 ? "" : "s"} matching the current filters.</p>
      {total === 0 ? (
        <div className="mt-4"><EmptyState text="No requests match the current filters." /></div>
      ) : (
        <>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
            {totals.map(([status, count]) => (
              <div
                key={status}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(count / total) * 100}%`, background: statusChartColors[status] || "#a8a29e", marginRight: 2 }}
                title={`${status}: ${count}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {totals.map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusChartColors[status] || "#a8a29e" }} />
                <span className="text-stone-700">{status}</span>
                <span className="font-semibold tabular-nums text-stone-900">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}


export function ManagerActivityMatrix({ rows, selectedManager, onSelectManager }: { rows: ReportRow[]; selectedManager: string | null; onSelectManager: (manager: string) => void }) {
  const managers = useMemo(() => buildManagerSummaries(rows), [rows]);
  const maxTickets = Math.max(...managers.map((manager) => manager.tickets), 1);

  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Account manager activity matrix</h3>
          <p className="mt-0.5 text-xs text-stone-500">Who requested what, where they focused, and what still needs manager attention.</p>
        </div>
        <CountPill label="Managers" value={managers.length} />
      </div>
      {managers.length === 0 ? (
        <div className="mt-4"><EmptyState text="No account manager activity in the current filters." /></div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md border border-stone-200">
          <div className="hidden grid-cols-[minmax(210px,1.2fr)_90px_90px_150px_1fr_1fr_110px_110px] gap-3 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:grid">
            <span>Manager</span>
            <span>Requests</span>
            <span>Tickets</span>
            <span>Status mix</span>
            <span>Top outlet</span>
            <span>Top event</span>
            <span>Latest</span>
            <span className="text-center">Report</span>
          </div>
          <div className="divide-y divide-stone-200">
            {managers.map((manager) => {
              const topOutlet = [...manager.outlets.entries()].sort((a, b) => b[1] - a[1])[0];
              const topEvent = [...manager.events.entries()].sort((a, b) => b[1] - a[1])[0];
              const approvalRate = manager.requests ? Math.round((manager.approved / manager.requests) * 100) : 0;
              return (
                <button
                  key={manager.key}
                  type="button"
                  className={`grid w-full cursor-pointer gap-3 px-3 py-3 text-left text-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[#EB6A1C]/40 xl:grid-cols-[minmax(210px,1.2fr)_90px_90px_150px_1fr_1fr_110px_110px] xl:items-center ${selectedManager === manager.key ? "bg-amber-50/60" : ""}`}
                  onClick={() => onSelectManager(manager.key)}
                  aria-label={`View report for ${manager.manager}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-950" title={manager.manager}>{manager.manager}</p>
                    {manager.email !== manager.manager && <p className="mt-0.5 truncate text-xs text-stone-500" title={manager.email}>{manager.email}</p>}
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-[#14b8a6]" style={{ width: `${Math.max(6, (manager.tickets / maxTickets) * 100)}%` }} />
                    </div>
                  </div>
                  <MetricCell label="Requests" value={manager.requests} />
                  <MetricCell label="Tickets" value={manager.tickets} />
                  <div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-stone-100">
                      <span className="bg-emerald-500" style={{ width: `${approvalRate}%` }} />
                      <span className="bg-amber-400" style={{ width: `${manager.requests ? (manager.pending / manager.requests) * 100 : 0}%` }} />
                      <span className="bg-red-500" style={{ width: `${manager.requests ? (manager.rejected / manager.requests) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">{manager.approved} approved · {manager.pending} pending · {manager.rejected} rejected</p>
                  </div>
                  <TextMetric label="Top outlet" value={topOutlet ? `${topOutlet[0]} (${topOutlet[1]})` : "No outlet"} />
                  <TextMetric label="Top event" value={topEvent ? `${topEvent[0]} (${topEvent[1]})` : "No event"} />
                  <TextMetric label="Latest" value={manager.latest ? formatShortDate(manager.latest) : "-"} />
                  <span className="inline-flex min-h-9 items-center justify-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 shadow-sm">View report</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}


