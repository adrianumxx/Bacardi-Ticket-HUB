"use client";

import { useMemo } from "react";
import { AlertCircle, CalendarDays, Clock, Send, Ticket, Users, type LucideIcon } from "@/components/ui/solar-icons";
import { formatShortDate } from "@/lib/utils";
import type { AccountRequest, Role, RequestQuickFilter, TicketRequest, Tone } from "./types";
import { isToday, isWithinLastDays, requestApprovedWithoutDispatch, requestHasFailedDispatch, requestTicketTotal } from "./helpers";
import { ActionButton, Badge, EmptyState } from "./ui-primitives";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { localeMap } from "@/lib/i18n/translations";

export function ManagerTodayPanel({
  requests,
  users,
  onOpenRequests,
  onOpenUsers,
  onOpenReports,
}: {
  requests: TicketRequest[];
  users: {
    allowedUsers: { email: string; role: Role; createdBy?: string; createdAt?: string }[];
    profiles: { email: string; name?: string; role: Role; status?: "active" | "blocked"; lastLoginAt?: string; managerEmail?: string }[];
    accountRequests: AccountRequest[];
  };
  onOpenRequests: (filter: RequestQuickFilter) => void;
  onOpenUsers: () => void;
  onOpenReports: () => void;
}) {
  const { t, language } = useTranslation();
  const today = useMemo(() => {
    const pending = requests.filter((request) => request.status === "pending");
    const approvedNotSent = requests.filter(requestApprovedWithoutDispatch);
    const emailFailed = requests.filter(requestHasFailedDispatch);
    const pendingAccess = users.accountRequests.filter((request) => request.status === "pending");
    const unassignedManagers = users.profiles.filter((user) => user.role === "account_manager" && !user.managerEmail);
    const createdToday = requests.filter((request) => isToday(request.createdAt));
    const createdThisWeek = requests.filter((request) => isWithinLastDays(request.createdAt, 7));
    const ticketsToday = createdToday.reduce((sum, request) => sum + requestTicketTotal(request), 0);
    const ticketsThisWeek = createdThisWeek.reduce((sum, request) => sum + requestTicketTotal(request), 0);
    const eventPressure = new Map<string, { name: string; tickets: number; requests: number }>();
    const managerPulse = new Map<string, { name: string; email: string; tickets: number; pending: number; requests: number }>();

    for (const request of requests) {
      const eventName = request.event?.name || t("today.untitledEvent");
      const eventRow = eventPressure.get(eventName) ?? { name: eventName, tickets: 0, requests: 0 };
      eventRow.tickets += requestTicketTotal(request);
      eventRow.requests += 1;
      eventPressure.set(eventName, eventRow);

      const email = request.requestedBy || t("today.unknown");
      const managerRow = managerPulse.get(email) ?? { name: request.accountManagerName || email, email, tickets: 0, pending: 0, requests: 0 };
      managerRow.tickets += requestTicketTotal(request);
      managerRow.requests += 1;
      if (request.status === "pending") managerRow.pending += 1;
      managerPulse.set(email, managerRow);
    }

    return {
      pending,
      approvedNotSent,
      emailFailed,
      pendingAccess,
      unassignedManagers,
      createdToday,
      createdThisWeek,
      ticketsToday,
      ticketsThisWeek,
      eventPressure: [...eventPressure.values()].sort((a, b) => b.tickets - a.tickets).slice(0, 4),
      managerPulse: [...managerPulse.values()].sort((a, b) => b.tickets - a.tickets || b.requests - a.requests).slice(0, 4),
    };
  }, [requests, users.accountRequests, users.profiles, t]);

  const attentionItems = [
    ...today.emailFailed.slice(0, 3).map((request) => ({
      key: `failed-${request._id}`,
      tone: "bad" as Tone,
      label: t("today.emailFailed"),
      title: request.event?.name || t("today.dispatchFailed"),
      detail: `${request.outlet?.name || t("today.outlet")} · ${request.accountManagerName || request.requestedBy}`,
      action: () => onOpenRequests("email_failed"),
    })),
    ...today.approvedNotSent.slice(0, 3).map((request) => ({
      key: `unsent-${request._id}`,
      tone: "warn" as Tone,
      label: t("today.sendTickets"),
      title: request.event?.name || t("today.approvedRequest"),
      detail: `${t("today.ticketsApproved", { count: requestTicketTotal(request) })} · ${request.outlet?.name || t("today.outlet")}`,
      action: () => onOpenRequests("approved_not_sent"),
    })),
    ...today.pending.slice(0, 4).map((request) => ({
      key: `pending-${request._id}`,
      tone: "neutral" as Tone,
      label: t("today.review"),
      title: request.event?.name || t("today.pendingRequest"),
      detail: `${request.outlet?.name || t("today.outlet")} · ${formatShortDate(request.createdAt, localeMap[language])}`,
      action: () => onOpenRequests("pending"),
    })),
    ...today.pendingAccess.slice(0, 3).map((request) => ({
      key: `access-${request._id}`,
      tone: "warn" as Tone,
      label: t("today.access"),
      title: request.name || request.email,
      detail: t("today.requestedAccess", { email: request.email }),
      action: onOpenUsers,
    })),
  ].slice(0, 8);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <TodayActionCard title={t("today.pending")} value={today.pending.length} detail={t("today.reviewRequests")} tone="warn" icon={Clock} onClick={() => onOpenRequests("pending")} />
        <TodayActionCard title={t("today.approvedNotSent")} value={today.approvedNotSent.length} detail={t("today.needDraft")} tone="neutral" icon={Send} onClick={() => onOpenRequests("approved_not_sent")} />
        <TodayActionCard title={t("today.failedDispatch")} value={today.emailFailed.length} detail={t("today.needsRetry")} tone="bad" icon={AlertCircle} onClick={() => onOpenRequests("email_failed")} />
        <TodayActionCard title={t("today.unassignedAm")} value={today.unassignedManagers.length} detail={t("today.noManagerOwner")} tone="neutral" icon={Users} onClick={onOpenUsers} />
        <TodayActionCard title={t("today.thisWeek")} value={today.createdThisWeek.length} detail={t("today.todayCount", { count: today.createdToday.length })} tone="good" icon={CalendarDays} onClick={onOpenReports} />
        <TodayActionCard title={t("today.ticketsThisWeek")} value={today.ticketsThisWeek} detail={t("today.todayCount", { count: today.ticketsToday })} tone="good" icon={Ticket} onClick={onOpenReports} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{t("today.needsAttention")}</p>
              <h3 className="mt-1 text-lg font-semibold">{t("today.handleFirst")}</h3>
            </div>
            <ActionButton type="button" variant="secondary" onClick={() => onOpenRequests("all")}>{t("today.openRequests")}</ActionButton>
          </div>
          <div className="mt-4 divide-y divide-stone-100">
            {attentionItems.map((item) => (
              <button key={item.key} type="button" onClick={item.action} className="grid w-full gap-2 py-3 text-left transition hover:bg-stone-50 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                <Badge tone={item.tone}>{item.label}</Badge>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-stone-950">{item.title}</span>
                  <span className="block truncate text-xs text-stone-500">{item.detail}</span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#EB6A1C]">{t("today.open")}</span>
              </button>
            ))}
            {attentionItems.length === 0 && <EmptyState text={t("today.nothingUrgent")} />}
          </div>
        </div>

        <div className="rounded-md border border-[#3A2A18] bg-[#3A2A18] p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ECDFC8]">{t("today.teamPulse")}</p>
          <h3 className="mt-1 text-lg font-semibold">{t("today.whoIsDriving")}</h3>
          <div className="mt-4 space-y-3">
            {today.managerPulse.map((manager) => (
              <button key={manager.email} type="button" onClick={onOpenReports} className="w-full text-left">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{manager.name}</span>
                  <span className="shrink-0 text-[#ECDFC8]">{t("today.tickets", { count: manager.tickets })}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#ECDFC8]" style={{ width: `${Math.max(8, Math.min(100, manager.tickets * 8))}%` }} />
                </div>
                <p className="mt-1 text-xs text-white/60">{t("today.requestsPending", { requests: manager.requests, pending: manager.pending })}</p>
              </button>
            ))}
            {today.managerPulse.length === 0 && <p className="text-sm text-white/70">{t("today.noManagerActivity")}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{t("today.festivalPressure")}</p>
            <h3 className="mt-1 text-lg font-semibold">{t("today.eventsWithDemand")}</h3>
          </div>
          <ActionButton type="button" variant="secondary" onClick={onOpenReports}>{t("today.openReports")}</ActionButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {today.eventPressure.map((event) => (
            <button key={event.name} type="button" onClick={onOpenReports} className="rounded-md border border-stone-200 bg-stone-50 p-3 text-left transition hover:border-[#EB6A1C] hover:bg-white">
              <p className="truncate text-sm font-semibold">{event.name}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{event.tickets}</p>
              <p className="text-xs text-stone-500">{t("today.requestsCount", { count: event.requests })}</p>
            </button>
          ))}
          {today.eventPressure.length === 0 && <EmptyState text={t("today.noEventActivity")} />}
        </div>
      </section>
    </div>
  );
}


export function TodayActionCard({
  title,
  value,
  detail,
  tone,
  icon: Icon,
  onClick,
}: {
  title: string;
  value: number;
  detail: string;
  tone: Tone;
  icon: LucideIcon;
  onClick: () => void;
}) {
  const tones = {
    neutral: "border-stone-250 hover:border-[#EB6A1C]",
    good: "border-emerald-200 hover:border-emerald-400",
    warn: "border-amber-200 hover:border-amber-400",
    bad: "border-red-200 hover:border-red-400",
  };
  return (
    <button type="button" onClick={onClick} className={`rounded-md border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</p>
        <span className="glass-pill grid h-9 w-9 place-items-center rounded-full border border-stone-200/70 bg-stone-50 text-stone-700">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{detail}</p>
    </button>
  );
}
