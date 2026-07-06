"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "@/components/ui/solar-icons";
import { formatShortDate } from "@/lib/utils";
import type { AuditLogItem } from "./types";
import { api, inputClass, isCriticalAuditAction } from "./helpers";
import { Badge, CompactMetric, CountPill, EmptyState, Field, Notice, TextMetric } from "./ui-primitives";

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [target, setTarget] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const auditParams = useCallback((format?: "csv") => {
    const params = new URLSearchParams();
    if (actor) params.set("actor", actor);
    if (action) params.set("action", action);
    if (target) params.set("target", target);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (criticalOnly) params.set("critical", "true");
    if (format) params.set("format", format);
    params.set("limit", "150");
    return params;
  }, [action, actor, criticalOnly, dateFrom, dateTo, target]);

  const loadLogs = useCallback(async () => {
    const params = auditParams();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ logs: AuditLogItem[] }>(`/api/audit-logs?${params.toString()}`);
      setLogs(data.logs);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [auditParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const criticalLogs = logs.filter((log) => isCriticalAuditAction(log.action));
  const exportUrl = `/api/audit-logs?${auditParams("csv").toString()}`;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Audit trail</p>
            <h2 className="mt-1 text-xl font-semibold">System activity</h2>
            <p className="mt-1 text-sm text-stone-600">Track manager actions, exports, profile changes, approvals, and dispatches.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CountPill label="Logs" value={logs.length} />
            <a className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-[#EB6A1C] hover:text-[#EB6A1C]" href={exportUrl}>
              <Download size={16} />
              Export CSV
            </a>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactMetric label="Critical" value={criticalLogs.length} tone={criticalLogs.length > 0 ? "warn" : "neutral"} />
          <CompactMetric label="Exports" value={logs.filter((log) => log.action.includes("report.export")).length} />
          <CompactMetric label="User changes" value={logs.filter((log) => log.action.startsWith("user.")).length} />
          <CompactMetric label="Mail events" value={logs.filter((log) => log.action.startsWith("mail.")).length} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="Actor">
            <input className={inputClass} value={actor} onChange={(event) => setActor(event.target.value)} placeholder="email or system" />
          </Field>
          <Field label="Action">
            <input className={inputClass} value={action} onChange={(event) => setAction(event.target.value)} placeholder="request, user, report" />
          </Field>
          <Field label="Target">
            <input className={inputClass} value={target} onChange={(event) => setTarget(event.target.value)} placeholder="id or email" />
          </Field>
          <Field label="From">
            <input className={inputClass} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <input className={inputClass} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-stone-250 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm xl:mt-6">
            <input type="checkbox" checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} />
            Critical only
          </label>
        </div>
        {error && <div className="mt-3"><Notice message={error} tone="bad" /></div>}
        {loading && <p className="mt-3 text-sm text-stone-500">Loading audit logs...</p>}
      </div>

      <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
        <div className="hidden grid-cols-[180px_1fr_1fr_1fr] gap-4 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 lg:grid">
          <span>Date</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Target</span>
        </div>
        <div className="divide-y divide-stone-100">
          {logs.map((log) => (
            <details key={log._id} className="group">
              <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 text-sm transition hover:bg-stone-50 lg:grid-cols-[180px_1fr_1fr_1fr] lg:items-center">
                <TextMetric label="Date" value={formatShortDate(log.createdAt)} />
                <TextMetric label="Actor" value={log.actor || "system"} />
                <div className="min-w-0">
                  <TextMetric label="Action" value={log.action} />
                  {isCriticalAuditAction(log.action) && <Badge tone="warn">Critical</Badge>}
                </div>
                <TextMetric label="Target" value={log.target || "-"} />
              </summary>
              <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
                <pre className="max-h-64 overflow-auto rounded-md border border-stone-200 bg-white p-3 text-xs text-stone-700">
                  {JSON.stringify(log.payload || {}, null, 2)}
                </pre>
              </div>
            </details>
          ))}
          {logs.length === 0 && <div className="p-4"><EmptyState text="No audit logs match the current filters." /></div>}
        </div>
      </div>
    </div>
  );
}


