"use client";

import { useEffect, useState } from "react";
import { api } from "./helpers";
import { InsightMetric, StatusBreakdownChart, TicketsOverTimeChart, EventPerformanceChart } from "./charts";
import { EmptyState, PanelIntro } from "./ui-primitives";
import type { ReportRow } from "./types";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

type MyReportsResponse = {
  rows: ReportRow[];
  kpis: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    dispatched: number;
    requestedTickets: number;
    approvalRate: number;
    avgResponseHours: number | null;
  };
};

export function MyReportsPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<MyReportsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await api<MyReportsResponse>("/api/reports/mine");
        if (!cancelled) setData(result);
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : t("reports.unableToLoadReport"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const responseTimeLabel =
    data?.kpis.avgResponseHours == null
      ? t("reports.mine.noResponsesYet")
      : data.kpis.avgResponseHours < 24
        ? t("reports.mine.avgResponseHoursValue", { hours: Math.round(data.kpis.avgResponseHours) })
        : t("reports.mine.avgResponseDaysValue", { days: Math.round(data.kpis.avgResponseHours / 24) });

  return (
    <div className="space-y-4">
      <PanelIntro eyebrow={t("reports.mine.eyebrow")} title={t("reports.mine.title")} description={t("reports.mine.description")} />
      {error && <EmptyState text={error} />}
      {loading && !data && <EmptyState text={t("reports.mine.loading")} />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InsightMetric label={t("reports.mine.totalRequests")} value={data.kpis.total} detail={t("reports.mine.totalRequestsDetail")} />
            <InsightMetric
              label={t("reports.mine.approvalRate")}
              value={`${data.kpis.approvalRate}%`}
              detail={t("reports.mine.approvalRateDetail", { approved: data.kpis.approved, rejected: data.kpis.rejected })}
              tone={data.kpis.approvalRate >= 70 ? "good" : data.kpis.approvalRate >= 40 ? "warn" : "bad"}
            />
            <InsightMetric label={t("reports.mine.avgResponseTime")} value={responseTimeLabel} detail={t("reports.mine.avgResponseTimeDetail")} />
            <InsightMetric label={t("reports.mine.requestedTickets")} value={data.kpis.requestedTickets} detail={t("reports.mine.requestedTicketsDetail")} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TicketsOverTimeChart rows={data.rows} />
            <StatusBreakdownChart rows={data.rows} />
          </div>
          <EventPerformanceChart rows={data.rows} />
        </>
      )}
    </div>
  );
}
