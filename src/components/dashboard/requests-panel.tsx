"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, ChevronDown, Mail, Plus, RefreshCcw, X, XCircle } from "@/components/ui/solar-icons";
import { renderHistoryAction, renderHistoryMessage, renderRequestStatus, type RequestStatus } from "@/lib/labels";
import { formatDate, formatShortDate, splitEmails } from "@/lib/utils";
import type { DispatchRetrySeed, EventItem, ManagerStat, Outlet, RequestQuickFilter, TicketRequest, Tone } from "./types";
import {
  api,
  buildEmailDraftUrl,
  dispatchLabel,
  dispatchTone,
  inputClass,
  requestApprovedWithoutDispatch,
  requestHasFailedDispatch,
  requestQuickFilterLabel,
  requestTicketTotal,
  statusTone,
} from "./helpers";
import { ActionButton, Badge, CompactRequestMetric, EmptyState, Field, Notice, PanelIntro, RequestInfo, Step } from "./ui-primitives";
import { ManagerAnalytics, FlowMap } from "./reports-panel";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { localeMap } from "@/lib/i18n/translations";

const INITIAL_VISIBLE_REQUESTS = 8;

export function NewRequestPanel({ events, onDone, notify }: { events: EventItem[]; outlets: Outlet[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const { t } = useTranslation();
  const published = events.filter((event) => event.status === "published");
  const [eventId, setEventId] = useState("");
  const outletIdCounter = useRef(1);
  const [outletRows, setOutletRows] = useState([{ id: "outlet-1", name: "", quantity: 1 }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState("");
  const effectiveEventId = eventId || published[0]?._id || "";
  const selectedEvent = published.find((event) => event._id === effectiveEventId);
  const ticketTypes = selectedEvent?.ticketTypes.filter((type) => type.active) ?? [];
  const validOutletRows = outletRows
    .map((outlet) => ({ name: outlet.name.trim(), quantity: outlet.quantity }))
    .filter((outlet) => outlet.name);
  const blockedReason =
    submittedMessage
      ? ""
      : published.length === 0
      ? t("requests.noPublishedEvents")
      : validOutletRows.length === 0
        ? t("requests.addOutletName")
        : ticketTypes.length === 0
          ? t("requests.noActiveTicketTypes")
          : "";

  function addOutletName() {
    outletIdCounter.current += 1;
    setOutletRows((current) => [...current, { id: `outlet-${outletIdCounter.current}`, name: "", quantity: 1 }]);
  }

  function updateOutletName(id: string, name: string) {
    setOutletRows((current) => current.map((outlet) => (outlet.id === id ? { ...outlet, name } : outlet)));
  }

  function updateOutletQuantity(id: string, quantity: number) {
    setOutletRows((current) => current.map((outlet) => (outlet.id === id ? { ...outlet, quantity } : outlet)));
  }

  function removeOutletName(id: string) {
    setOutletRows((current) => (current.length === 1 ? current : current.filter((outlet) => outlet.id !== id)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockedReason) return notify(blockedReason, "bad");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setFormError("");
    setSubmittedMessage("");
    try {
      await api("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          eventId: form.get("eventId"),
          outlets: validOutletRows,
          recipientEmails: form.get("recipientEmails"),
          items: [{ ticketType: form.get("ticketType"), quantity: 1 }],
          notes: form.get("notes"),
        }),
      });
      formElement.reset();
      outletIdCounter.current = 1;
      setOutletRows([{ id: "outlet-1", name: "", quantity: 1 }]);
      const successMessage = validOutletRows.length > 1 ? t("requests.multipleSent", { count: validOutletRows.length }) : t("requests.oneSent");
      setSubmittedMessage(successMessage);
      notify(successMessage);
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("requests.unableToSubmit");
      setFormError(message);
      notify(message, "bad");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-5xl overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
      <PanelIntro
        eyebrow={t("requests.newRequest")}
        title={t("requests.requestTickets")}
        description={t("requests.requestDescription")}
      />
      <div className="space-y-0 px-5 pb-5">
      <Step title={t("requests.step1")}>
        <div className="grid gap-3">
          <Field label={t("requests.selectEvent")}>
            <select name="eventId" className={inputClass} value={effectiveEventId} onChange={(event) => setEventId(event.target.value)} required disabled={published.length === 0}>
              {published.map((event) => <option key={event._id} value={event._id}>{event.name}{event.eventKind === "festival" ? t("requests.festivalSuffix") : ""}</option>)}
            </select>
          </Field>
          {selectedEvent && (
            <div className="space-y-1 rounded-md bg-stone-100 p-3 text-sm text-stone-700">
              <p>{t("requests.upToTickets", { count: selectedEvent.maxTicketsPerOutlet, plural: selectedEvent.maxTicketsPerOutlet === 1 ? "" : "s" })}</p>
            </div>
          )}
        </div>
      </Step>

      <Step title={t("requests.step2")}>
        <div className="grid gap-3" aria-label={t("requests.step2")}>
          {outletRows.map((outlet, index) => (
            <div key={outlet.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
              <Field label={index === 0 ? t("requests.clientName") : t("requests.clientNameN", { index: index + 1 })}>
                <input
                  value={outlet.name}
                  onChange={(event) => updateOutletName(outlet.id, event.target.value)}
                  autoFocus={index === 0}
                  placeholder={t("requests.clientNamePlaceholder")}
                  className={inputClass}
                  required={index === 0}
                />
              </Field>
              <Field label={t("requests.quantity")}>
                <input
                  value={outlet.quantity}
                  onChange={(event) => updateOutletQuantity(outlet.id, Number(event.target.value))}
                  type="number"
                  min={1}
                  max={selectedEvent?.maxTicketsPerOutlet ?? undefined}
                  className={inputClass}
                  required
                />
              </Field>
              <div className="flex gap-2">
                {outletRows.length > 1 && (
                  <ActionButton
                    type="button"
                    variant="secondary"
                    aria-label={t("requests.removeOutletClient", { index: index + 1 })}
                    title={t("requests.removeOutlet")}
                    className="aspect-square min-h-9 w-9 px-0"
                    onClick={() => removeOutletName(outlet.id)}
                  >
                    <X size={17} />
                  </ActionButton>
                )}
                {index === outletRows.length - 1 && (
                  <ActionButton
                    type="button"
                    variant="ghost"
                    aria-label={t("requests.addAnotherOutletClient")}
                    title={t("requests.addOutlet")}
                    className="aspect-square min-h-9 w-9 px-0"
                    onClick={addOutletName}
                  >
                    <Plus size={18} />
                  </ActionButton>
                )}
              </div>
            </div>
          ))}
        </div>
      </Step>

      <Step title={t("requests.step3")}>
        <div className="grid gap-3">
          <Field label={t("requests.ticketType")}>
            <select name="ticketType" className={inputClass} disabled={ticketTypes.length === 0}>
              {ticketTypes.map((type) => <option key={type.name} value={type.name}>{type.name}</option>)}
            </select>
          </Field>
        </div>
      </Step>

      <Step title={t("requests.step4")}>
        <div className="grid gap-3">
          <Field label={t("requests.recipientEmails")} hint={t("requests.recipientEmailsHint")}>
            <input name="recipientEmails" type="text" inputMode="email" required placeholder={t("requests.recipientEmailsPlaceholder")} className={inputClass} />
          </Field>
          <Field label={t("requests.notes")}><textarea name="notes" className={inputClass} rows={4} /></Field>
        </div>
      </Step>

      <Step title={t("requests.step5")}>
        <div className="grid gap-3">
          {blockedReason && <Notice message={blockedReason} tone="bad" />}
          {formError && <Notice message={formError} tone="bad" />}
          {submittedMessage && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                <div className="grid gap-3">
                  <div>
                    <p className="font-semibold">{t("requests.requestSent")}</p>
                    <p className="mt-1">{submittedMessage}</p>
                  </div>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    className="w-fit"
                    onClick={() => {
                      setSubmittedMessage("");
                      setFormError("");
                    }}
                  >
                    <Plus size={16} />
                    {t("requests.sendAnother")}
                  </ActionButton>
                </div>
              </div>
            </div>
          )}
          {!submittedMessage && <ActionButton disabled={Boolean(blockedReason) || submitting}>{submitting ? t("requests.submitting") : t("requests.submit")}</ActionButton>}
        </div>
      </Step>
      </div>
    </form>
  );
}


export function AdminRequests({
  requests,
  events,
  outlets,
  quickFilter = "attention",
  onQuickFilterChange,
  onClearQuickFilter,
  onDone,
  notify,
}: {
  requests: TicketRequest[];
  events: EventItem[];
  outlets: Outlet[];
  quickFilter?: RequestQuickFilter;
  onQuickFilterChange?: (filter: RequestQuickFilter) => void;
  onClearQuickFilter?: () => void;
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("");
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_REQUESTS });
  const managerStats = useMemo(() => {
    const stats = new Map<string, ManagerStat>();
    for (const request of requests) {
      const email = request.requestedBy || "Unknown manager";
      const current =
        stats.get(email) ??
        ({
          email,
          name: request.accountManagerName || email,
          requests: 0,
          tickets: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          dispatches: 0,
          outlets: new Map<string, number>(),
          events: new Map<string, number>(),
          latestRequest: undefined,
        } satisfies ManagerStat);
      current.requests += 1;
      current.tickets += requestTicketTotal(request);
      current.dispatches += request.dispatches.length;
      if (request.status === "pending") current.pending += 1;
      if (request.status === "approved" || request.status === "partially_approved") current.approved += 1;
      if (request.status === "rejected") current.rejected += 1;
      if (request.outlet?.name) current.outlets.set(request.outlet.name, (current.outlets.get(request.outlet.name) ?? 0) + 1);
      if (request.event?.name) current.events.set(request.event.name, (current.events.get(request.event.name) ?? 0) + 1);
      if (!current.latestRequest || new Date(request.createdAt) > new Date(current.latestRequest)) current.latestRequest = request.createdAt;
      stats.set(email, current);
    }
    return [...stats.values()].sort((a, b) => b.requests - a.requests || b.tickets - a.tickets);
  }, [requests]);
  const filtered = requests.filter((request) => {
    const needsAttention = request.status === "pending" || requestApprovedWithoutDispatch(request) || requestHasFailedDispatch(request);
    const matchesQuick =
      (quickFilter === "attention" && needsAttention) ||
      quickFilter === "all" ||
      (quickFilter === "pending" && request.status === "pending") ||
      (quickFilter === "approved_not_sent" && requestApprovedWithoutDispatch(request)) ||
      (quickFilter === "email_failed" && requestHasFailedDispatch(request));
    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    const matchesEvent = eventFilter === "all" || request.event?._id === eventFilter;
    const matchesOutlet = outletFilter === "all" || request.outlet?._id === outletFilter;
    const managerHaystack = [request.accountManagerName, request.requestedBy].filter(Boolean).join(" ").toLowerCase();
    const matchesManager = !managerFilter || managerHaystack.includes(managerFilter.toLowerCase());
    return matchesQuick && matchesStatus && matchesEvent && matchesOutlet && matchesManager;
  });
  const filterKey = [quickFilter, statusFilter, eventFilter, outletFilter, managerFilter.trim().toLowerCase()].join("|");
  const visibleCount = visibleState.key === filterKey ? visibleState.count : INITIAL_VISIBLE_REQUESTS;
  const visibleRequests = filtered.slice(0, visibleCount);
  const hiddenCount = Math.max(filtered.length - visibleRequests.length, 0);
  const filterChips: RequestQuickFilter[] = ["attention", "pending", "approved_not_sent", "email_failed", "all"];

  return (
    <div className="space-y-4">
      <ManagerAnalytics rows={managerStats} />
      <FlowMap />
      <div className="flex flex-wrap items-center gap-2">
        {filterChips.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onQuickFilterChange?.(filter)}
            className={`glass-pill rounded-full border px-4 py-2 text-sm font-medium transition ${
              quickFilter === filter ? "border-[#5B4228] bg-[#5B4228] text-white shadow-sm" : "border-[#ECDFC8] bg-white text-stone-700 hover:border-[#EB6A1C]"
            }`}
          >
            {requestQuickFilterLabel(filter)}
          </button>
        ))}
      </div>
      {quickFilter !== "attention" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#ECDFC8] bg-[#FFFCF6] p-3 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#EB6A1C]">{t("requests.requestFilter")}</p>
            <p className="text-sm font-medium text-stone-900">{requestQuickFilterLabel(quickFilter)}</p>
          </div>
          <ActionButton type="button" variant="secondary" onClick={onClearQuickFilter}>{t("requests.backToAttention")}</ActionButton>
        </div>
      )}
      <div className="grid gap-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("requests.status")}>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            <option value="all">{t("requests.allStatuses")}</option>
            <option value="pending">{t("requests.pending")}</option>
            <option value="approved">{t("requests.approvedStatus")}</option>
            <option value="partially_approved">{t("requests.partiallyApproved")}</option>
            <option value="rejected">{t("requests.rejectedStatus")}</option>
          </select>
        </Field>
        <Field label={t("requests.eventOrFestival")}>
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className={inputClass}>
            <option value="all">{t("requests.allEventsFestivals")}</option>
            {events.map((event) => <option key={event._id} value={event._id}>{event.name}{event.eventKind === "festival" ? t("requests.festivalSuffix") : ""}</option>)}
          </select>
        </Field>
        <Field label={t("requests.outlet")}>
          <select value={outletFilter} onChange={(event) => setOutletFilter(event.target.value)} className={inputClass}>
            <option value="all">{t("requests.allOutlets")}</option>
            {outlets.map((outlet) => <option key={outlet._id} value={outlet._id}>{outlet.name}</option>)}
          </select>
        </Field>
        <Field label={t("requests.accountManager")}>
          <input value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} className={inputClass} placeholder={t("requests.searchNameEmail")} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm">
        <span>{t("requests.showing", { visible: visibleRequests.length, total: filtered.length })}</span>
        {quickFilter === "attention" && <span className="text-xs uppercase tracking-[0.12em] text-[#EB6A1C]">{t("requests.operationalQueue")}</span>}
      </div>

      {visibleRequests.map((request) => <RequestCard key={request._id} request={request} onDone={onDone} notify={notify} />)}
      {hiddenCount > 0 && (
        <div className="flex justify-center">
          <ActionButton type="button" variant="secondary" onClick={() => setVisibleState({ key: filterKey, count: visibleCount + INITIAL_VISIBLE_REQUESTS })}>
            {t("requests.showMore", { count: Math.min(INITIAL_VISIBLE_REQUESTS, hiddenCount) })}
          </ActionButton>
        </div>
      )}
      {filtered.length === 0 && <EmptyState text={quickFilter === "attention" ? t("requests.noneNeedAttention") : t("requests.noneMatch")} />}
    </div>
  );
}


export function SendTicketPanel({
  request,
  retrySeed,
  onDone,
  notify,
}: {
  request: TicketRequest;
  retrySeed?: DispatchRetrySeed | null;
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [showSendWindow, setShowSendWindow] = useState(false);
  const [recording, setRecording] = useState(false);
  const [draftRecipients, setDraftRecipients] = useState(request.recipientEmails.join(", "));
  const [draftSubject, setDraftSubject] = useState(t("requests.emailSubject", { event: request.event?.name || "" }));
  const [draftMessage, setDraftMessage] = useState(t("requests.emailBody", { event: request.event?.name || "", name: session?.user?.name || "" }));
  const canSendTickets = request.status === "approved" || request.status === "partially_approved";
  const approvedTotal = request.items.reduce((sum, item) => sum + (item.approvedQuantity || 0), 0);
  const preferredEmailApp = session?.user?.preferredEmailApp || "default";
  const officialEmail = session?.user?.officialEmail || session?.user?.email || "";
  const dispatchSummary = request.dispatches.reduce(
    (summary, dispatch) => {
      summary.total += 1;
      if (dispatch.status === "manual") summary.manual += 1;
      if (dispatch.status === "sent") summary.sent += 1;
      if (dispatch.status === "simulated") summary.simulated += 1;
      if (dispatch.status === "failed") summary.failed += 1;
      if (dispatch.status === "skipped") summary.skipped += 1;
      return summary;
    },
    { total: 0, manual: 0, sent: 0, simulated: 0, failed: 0, skipped: 0 },
  );

  useEffect(() => {
    if (!retrySeed) return;
    const timer = window.setTimeout(() => {
      setDraftRecipients(retrySeed.recipients);
      setDraftSubject(t("requests.retrySubject", { event: request.event?.name || "" }));
      setDraftMessage(t("requests.retryEmailBody", { event: request.event?.name || "", name: session?.user?.name || "" }));
      setShowSendWindow(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [request.event?.name, retrySeed, session?.user?.name, t]);

  async function openEmailDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSendTickets) return notify(t("requests.approveFirst"), "bad");
    const recipientList = splitEmails(draftRecipients);
    if (recipientList.length === 0) return notify(t("requests.addRecipient"), "bad");
    const url = buildEmailDraftUrl(preferredEmailApp, recipientList, draftSubject, draftMessage);
    window.open(url, "_blank", "noopener,noreferrer");
    setRecording(true);
    try {
      await api(`/api/requests/${request._id}/manual-dispatch`, {
        method: "POST",
        body: JSON.stringify({ recipients: recipientList, subject: draftSubject, message: draftMessage, mailtoUrl: url }),
      });
      setShowSendWindow(false);
      notify(t("requests.draftOpenedNotice"));
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("requests.unableToRecordDispatch"), "bad");
    } finally {
      setRecording(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 p-3">
        <div>
          <h4 className="text-sm font-semibold">{t("requests.ticketFiles")}</h4>
          <p className="text-sm text-stone-600">
            {canSendTickets
              ? t("requests.readyToDispatch", { count: approvedTotal || t("requests.approvedStatus"), plural: approvedTotal === 1 ? "" : "s" })
              : t("requests.approveFirstShort")}
          </p>
          {dispatchSummary.total > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {dispatchSummary.manual > 0 && <Badge tone="good">{t("requests.manual", { count: dispatchSummary.manual })}</Badge>}
              {dispatchSummary.sent > 0 && <Badge tone="good">{t("requests.sent", { count: dispatchSummary.sent })}</Badge>}
              {dispatchSummary.simulated > 0 && <Badge tone="neutral">{t("requests.simulated", { count: dispatchSummary.simulated })}</Badge>}
              {dispatchSummary.failed > 0 && <Badge tone="bad">{t("requests.failed", { count: dispatchSummary.failed })}</Badge>}
              {dispatchSummary.skipped > 0 && <Badge tone="warn">{t("requests.skipped", { count: dispatchSummary.skipped })}</Badge>}
            </div>
          )}
        </div>
        <ActionButton type="button" disabled={!canSendTickets} onClick={() => setShowSendWindow(true)}>
          <Mail size={16} /> {t("requests.openEmailDraft")}
        </ActionButton>
      </div>

      {showSendWindow && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{t("requests.officialMailboxDraft")}</p>
                <h3 className="mt-1 text-xl font-semibold">{request.event?.name}</h3>
              </div>
              <ActionButton type="button" variant="ghost" className="min-h-9 px-2" onClick={() => setShowSendWindow(false)}>
                <X size={18} />
              </ActionButton>
            </div>
            <form onSubmit={openEmailDraft} className="mt-4 grid gap-3">
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <p className="font-semibold">{t("requests.sendFromOfficial")}</p>
                <p className="mt-1">{t("requests.sendFromOfficialDescription", { email: officialEmail || t("requests.yourOfficialEmail") })}</p>
              </div>
              <Field label={t("requests.emailRecipients")} hint={t("requests.emailRecipientsHint")}>
                <input name="recipients" required value={draftRecipients} onChange={(event) => setDraftRecipients(event.target.value)} className={inputClass} />
              </Field>
              <Field label={t("requests.subject")}>
                <input name="subject" required value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} className={inputClass} />
              </Field>
              <Field label={t("requests.messageBody")}>
                <textarea name="message" required value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} className={inputClass} rows={4} />
              </Field>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <p className="font-semibold">{t("requests.attachments")}</p>
                <p className="mt-1">{t("requests.attachmentsNote")}</p>
              </div>
              <ActionButton disabled={!canSendTickets || recording}><Mail size={16} /> {recording ? t("requests.opening") : t("requests.openEmailDraft")}</ActionButton>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


export function RequestCard({ request, onDone, notify }: { request: TicketRequest; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const { t, language } = useTranslation();
  const locale = localeMap[language];
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [adminNotes, setAdminNotes] = useState(request.adminNotes || "");
  const [recipients, setRecipients] = useState(request.recipientEmails.join(", "));
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [retrySeed, setRetrySeed] = useState<DispatchRetrySeed | null>(null);
  const [approvedByIndex, setApprovedByIndex] = useState<Record<number, number>>(() =>
    Object.fromEntries(request.items.map((item, index) => [index, item.approvedQuantity ?? (request.status === "approved" ? item.quantity : 0)])),
  );
  const [quickAction, setQuickAction] = useState<"" | "approved" | "rejected">("");
  const requestedTotal = request.items.reduce((sum, item) => sum + item.quantity, 0);
  const approvedTotal = request.items.reduce((sum, item) => sum + (item.approvedQuantity || 0), 0);
  const managerName = request.accountManagerName || request.requestedBy;
  const dispatchCount = request.dispatches.length;

  // One-click approve/reject for the common case, visible directly on the
  // collapsed row so the manager never has to open a request just to approve
  // it in full. Partial approval and note-taking still happen in the
  // expanded detail below.
  async function quickDecision(nextStatus: "approved" | "rejected") {
    setQuickAction(nextStatus);
    setActionError("");
    try {
      await api(`/api/requests/${request._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          items: request.items.map((item) => ({
            ...item,
            approvedQuantity: nextStatus === "approved" ? item.quantity : 0,
          })),
        }),
      });
      notify(nextStatus === "approved" ? t("requests.approved") : t("requests.rejected"));
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("requests.unableToUpdate");
      notify(message, "bad");
    } finally {
      setQuickAction("");
    }
  }

  async function update() {
    const nextItems = request.items.map((item, index) => {
      const partialApproved = Math.min(Math.max(Number(approvedByIndex[index] ?? 0), 0), item.quantity);
      return {
        ...item,
        approvedQuantity: status === "approved" ? item.quantity : status === "rejected" || status === "pending" ? 0 : partialApproved,
      };
    });
    const approvedTotal = nextItems.reduce((sum, item) => sum + (item.approvedQuantity || 0), 0);
    if (status === "partially_approved" && (approvedTotal <= 0 || approvedTotal >= requestedTotal)) {
      return notify(t("requests.partialApprovalError"), "bad");
    }
    setUpdating(true);
    setActionError("");
    try {
      await api(`/api/requests/${request._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          adminNotes,
          recipientEmails: splitEmails(recipients),
          items: nextItems,
        }),
      });
      notify(t("requests.updated"));
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("requests.unableToUpdate");
      setActionError(message);
      notify(message, "bad");
    } finally {
      setUpdating(false);
    }
  }

  const borderTones = {
    neutral: "border-l-stone-300",
    good: "border-l-emerald-400",
    warn: "border-l-amber-400",
    bad: "border-l-red-400",
  } as const;

  return (
    <details className={`group overflow-hidden rounded-md border border-l-4 border-stone-250 bg-white shadow-sm transition hover:border-[#ECDFC8] hover:shadow-md ${borderTones[statusTone(request.status)]}`}>
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 lg:grid-cols-[minmax(260px,1.2fr)_minmax(360px,0.95fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status, t)}</Badge>
            <h3 className="min-w-0 truncate text-base font-semibold">{request.event?.name}</h3>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-stone-800">{request.outlet?.name}</p>
          <p className="mt-0.5 truncate text-xs text-stone-500" title={request.requestedBy}>
            {managerName}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <CompactRequestMetric label={t("requests.req")} value={requestedTotal} />
          <CompactRequestMetric label={t("requests.appr")} value={approvedTotal} tone={approvedTotal > 0 ? "good" : "neutral"} />
          <CompactRequestMetric label={t("requests.to")} value={request.recipientEmails.length} />
          <CompactRequestMetric label={t("requests.sentShort")} value={dispatchCount} tone={dispatchCount > 0 ? "good" : "neutral"} />
        </div>
        <div className="flex items-center justify-between gap-2 lg:justify-end">
          {request.status === "pending" && (
            <div className="flex items-center gap-2">
              <ActionButton
                type="button"
                variant="primary"
                className="min-h-9 px-3 text-xs"
                disabled={quickAction !== ""}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void quickDecision("approved");
                }}
              >
                <CheckCircle2 size={14} /> {quickAction === "approved" ? t("requests.approving") : t("requests.approve")}
              </ActionButton>
              <ActionButton
                type="button"
                variant="secondary"
                className="min-h-9 px-3 text-xs"
                disabled={quickAction !== ""}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void quickDecision("rejected");
                }}
              >
                <XCircle size={14} /> {quickAction === "rejected" ? t("requests.rejecting") : t("requests.reject")}
              </ActionButton>
            </div>
          )}
          <span className="whitespace-nowrap text-sm text-stone-500">{formatShortDate(request.createdAt, locale)}</span>
          <ChevronDown size={18} className="text-stone-400 transition group-open:rotate-180" />
        </div>
      </summary>

      <div className="grid gap-4 border-t border-stone-200 p-4">
        {actionError && <Notice message={actionError} tone="bad" />}
        <div className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 lg:grid-cols-3">
          <RequestInfo label={t("requests.ticketTypes")} value={request.items.map((item) => `${item.ticketType} x${item.quantity}`).join(", ")} />
          <RequestInfo label={t("requests.recipients")} value={request.recipientEmails.join(", ") || t("requests.noRecipients")} />
          <RequestInfo label={t("requests.created")} value={formatDate(request.createdAt, locale)} />
        </div>
        {request.notes && (
          <section className="rounded-md border border-stone-200 bg-white p-3">
            <h4 className="text-sm font-semibold">{t("requests.managerNotes")}</h4>
            <p className="mt-2 text-sm text-stone-700">{request.notes}</p>
          </section>
        )}

        <section className="rounded-md border border-stone-200 bg-stone-50 p-3">
          <h4 className="text-sm font-semibold">{t("requests.approvalQuantities")}</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {request.items.map((item, index) => (
              <div key={`${item.ticketType}-${index}`} className="grid gap-2 rounded-md border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.ticketType}</span>
                  <Badge>{t("requests.requestedX", { count: item.quantity })}</Badge>
                </div>
                <Field label={t("requests.approvedQuantity")}>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={item.quantity}
                    value={status === "approved" ? item.quantity : status === "rejected" || status === "pending" ? 0 : approvedByIndex[index] ?? 0}
                    disabled={status !== "partially_approved"}
                    onChange={(event) =>
                      setApprovedByIndex((current) => ({
                        ...current,
                        [index]: Number(event.target.value),
                      }))
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
        </section>

        <div className="grid items-end gap-3 lg:grid-cols-[180px_1fr_1fr_auto]">
          <Field label={t("requests.status")}>
            <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as RequestStatus)}>
              <option value="pending">{t("requests.pending")}</option>
              <option value="approved">{t("requests.approvedStatus")}</option>
              <option value="partially_approved">{t("requests.partiallyApproved")}</option>
              <option value="rejected">{t("requests.rejectedStatus")}</option>
            </select>
          </Field>
          <Field label={t("requests.ticketRecipientEmails")}>
            <input className={inputClass} value={recipients} onChange={(event) => setRecipients(event.target.value)} />
          </Field>
          <Field label={t("requests.adminNotes")}>
            <input className={inputClass} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} />
          </Field>
          <ActionButton variant="secondary" disabled={updating} onClick={update}>{updating ? t("requests.saving") : t("requests.save")}</ActionButton>
        </div>

        <SendTicketPanel request={request} retrySeed={retrySeed} onDone={onDone} notify={notify} />

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <HistoryList history={request.history} />
          <DispatchList
            dispatches={request.dispatches}
            onRetry={(dispatch) => setRetrySeed({ recipients: dispatch.recipients.join(", "), token: Date.now() })}
          />
        </div>
      </div>
    </details>
  );
}


export function HistoryList({ history }: { history: TicketRequest["history"] }) {
  const { t, language } = useTranslation();
  const locale = localeMap[language];
  return (
    <section className="rounded-md border border-stone-200 p-3">
      <h4 className="text-sm font-semibold">{t("requests.requestHistory")}</h4>
      <div className="mt-3 space-y-3">
        {history.map((item, index) => (
          <div key={`${item.at}-${index}`} className="text-sm">
            <p className="font-medium">{renderHistoryAction(item.action)}</p>
            <p className="text-stone-600">{renderHistoryMessage(item.message)} - {item.by}</p>
            <p className="text-xs text-stone-500">{formatDate(item.at, locale)}</p>
          </div>
        ))}
        {history.length === 0 && <p className="text-sm text-stone-500">{t("requests.noHistoryYet")}</p>}
      </div>
    </section>
  );
}


export function DispatchList({
  dispatches,
  onRetry,
}: {
  dispatches: TicketRequest["dispatches"];
  onRetry?: (dispatch: TicketRequest["dispatches"][number]) => void;
}) {
  const { t, language } = useTranslation();
  const locale = localeMap[language];
  return (
    <section className="rounded-md border border-stone-200 p-3">
      <h4 className="text-sm font-semibold">{t("requests.ticketDispatches")}</h4>
      <div className="mt-3 space-y-3">
        {dispatches.map((dispatch, index) => (
          <div key={`${dispatch.at}-${index}`} className={`rounded-md border p-3 text-sm ${dispatch.status === "failed" ? "border-red-200 bg-red-50" : "border-stone-100 bg-stone-50"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="break-words font-medium">
                <Mail className="mr-1 inline" size={14} /> {dispatch.recipients.join(", ")}
              </p>
              <Badge tone={dispatchTone(dispatch.status)}>{dispatchLabel(dispatch.status)}</Badge>
            </div>
            <p className="mt-1 text-stone-600">{dispatch.fileNames.join(", ") || t("requests.noFileNames")}</p>
            <p className="mt-1 text-xs text-stone-500">{formatDate(dispatch.at, locale)}</p>
            {dispatch.status === "failed" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-white/70 p-2">
                <p className="text-xs text-red-800">{t("requests.failedDeliveryNote")}</p>
                {onRetry && (
                  <ActionButton type="button" variant="secondary" className="min-h-8 px-2" onClick={() => onRetry(dispatch)}>
                    <RefreshCcw size={14} /> {t("requests.retry")}
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        ))}
        {dispatches.length === 0 && <p className="text-sm text-stone-500">{t("requests.noDispatches")}</p>}
      </div>
    </section>
  );
}


export function MinePanel({ requests, onDone, notify }: { requests: TicketRequest[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const { t } = useTranslation();
  const nextStep = (request: TicketRequest) => {
    if (request.status === "pending") return t("requests.nextPending");
    if (request.status === "approved") return request.dispatches.length > 0 ? t("requests.dispatchedByEmail") : t("requests.approvedOpenDraft");
    if (request.status === "partially_approved") return request.dispatches.length > 0 ? t("requests.partialDispatched") : t("requests.partialOpenDraft");
    return t("requests.rejectedReviewNote");
  };

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <article key={request._id} className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{request.event?.name}</h3>
              <p className="text-sm text-stone-600">{request.outlet?.name}</p>
            </div>
            <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status, t)}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{request.items.map((item) => <Badge key={item.ticketType}>{item.ticketType} x{item.quantity}</Badge>)}</div>
          {request.adminNotes && <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm">{request.adminNotes}</p>}
          <p className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">{nextStep(request)}</p>
          <div className="mt-3">
            <SendTicketPanel request={request} onDone={onDone} notify={notify} />
          </div>
        </article>
      ))}
      {requests.length === 0 && <EmptyState text={t("requests.noRequestsYet")} />}
    </div>
  );
}
