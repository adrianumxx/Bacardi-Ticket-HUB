"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Search } from "@/components/ui/solar-icons";
import { renderEventStatus, renderRequestStatus, type EventStatus } from "@/lib/labels";
import { formatDate, formatShortDate } from "@/lib/utils";
import type { EventItem, TicketRequest, Tone } from "./types";
import { api, approvedTicketTotal, dateInputValue, dateTimeFromForm, inputClass, requestTicketTotal, statusTone, timeInputValue } from "./helpers";
import { ActionButton, Badge, CountPill, EmptyState, Field, MiniMetric, Notice, PanelIntro } from "./ui-primitives";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { localeMap } from "@/lib/i18n/translations";

export function EventPage({
  event,
  requests,
  onClose,
}: {
  event: EventItem;
  requests: TicketRequest[];
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const totals = requests.reduce(
    (sum, request) => {
      sum.requests += 1;
      sum.requested += requestTicketTotal(request);
      sum.approved += approvedTicketTotal(request);
      sum.recipients += request.recipientEmails.length;
      sum.dispatches += request.dispatches.length;
      if (request.status === "pending") sum.pending += 1;
      if (request.status === "rejected") sum.rejected += 1;
      return sum;
    },
    { requests: 0, requested: 0, approved: 0, pending: 0, rejected: 0, recipients: 0, dispatches: 0 },
  );
  const outlets = [...new Set(requests.map((request) => request.outlet?.name).filter(Boolean))] as string[];
  const latestRequest = requests
    .map((request) => request.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const locale = localeMap[language];

  return (
    <section className="overflow-hidden rounded-md border border-[#ECDFC8] bg-white shadow-sm">
      <div className="border-b border-[#ECDFC8] bg-[#3A2A18] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ECDFC8]">{event.eventKind === "festival" ? t("events.festivalPage") : t("events.eventPage")}</p>
            <h2 className="mt-2 text-2xl font-semibold">{event.name}</h2>
            <p className="mt-2 text-sm text-white/75">
              {[event.market, event.city, event.venue, formatDate(event.startsAt, locale)].filter(Boolean).join(" - ") || t("events.noLocationDate")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={event.status === "published" ? "good" : event.status === "closed" ? "bad" : "neutral"}>{renderEventStatus(event.status, t)}</Badge>
            <ActionButton type="button" variant="secondary" onClick={onClose}>{t("events.closePage")}</ActionButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {event.description && <p className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">{event.description}</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label={t("events.requests")} value={totals.requests} />
            <MiniMetric label={t("events.requested")} value={totals.requested} />
            <MiniMetric label={t("events.approved")} value={totals.approved} tone="good" />
            <MiniMetric label={t("events.pending")} value={totals.pending} tone="warn" />
            <MiniMetric label={t("events.rejected")} value={totals.rejected} tone="bad" />
            <MiniMetric label={t("events.outlets")} value={outlets.length} />
            <MiniMetric label={t("events.recipients")} value={totals.recipients} />
            <MiniMetric label={t("events.dispatches")} value={totals.dispatches} tone={totals.dispatches > 0 ? "good" : "neutral"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t("events.ticketRule")}</p>
              <p className="mt-1 text-sm text-stone-800">{t("events.maxPerOutlet", { count: event.maxTicketsPerOutlet, plural: event.maxTicketsPerOutlet === 1 ? "" : "s" })}</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t("events.latestRequest")}</p>
              <p className="mt-1 text-sm text-stone-800">{latestRequest ? formatShortDate(latestRequest, locale) : t("events.noRequestsYet")}</p>
            </div>
          </div>
          <div className="rounded-md border border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t("events.ticketTypes")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {event.ticketTypes.map((type) => <Badge key={type.name} tone={type.active ? "neutral" : "bad"}>{type.name}</Badge>)}
              {event.ticketTypes.length === 0 && <p className="text-sm text-stone-500">{t("events.noTicketTypes")}</p>}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-stone-200">
          <div className="border-b border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#EB6A1C]">{t("events.linkedRequests")}</p>
          </div>
          <div className="max-h-[420px] divide-y overflow-auto">
            {requests.slice(0, 8).map((request) => (
              <div key={request._id} className="grid gap-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{request.outlet?.name || t("events.outlet")}</p>
                    <p className="truncate text-xs text-stone-500">{request.accountManagerName || request.requestedBy}</p>
                  </div>
                  <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status, t)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{t("events.requestedBadge", { count: requestTicketTotal(request) })}</Badge>
                  <Badge tone={approvedTicketTotal(request) > 0 ? "good" : "neutral"}>{t("events.approvedBadge", { count: approvedTicketTotal(request) })}</Badge>
                  <Badge tone={request.dispatches.length > 0 ? "good" : "neutral"}>{t("events.dispatchBadge", { count: request.dispatches.length })}</Badge>
                </div>
              </div>
            ))}
            {requests.length === 0 && <div className="p-4"><EmptyState text={t("events.noRequestsForEvent")} /></div>}
          </div>
        </div>
      </div>
    </section>
  );
}


export function EventsPanel({
  events,
  requests,
  selectedEventId,
  onSelectEvent,
  onDone,
  notify,
}: {
  events: EventItem[];
  requests: TicketRequest[];
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const { t, language } = useTranslation();
  const locale = localeMap[language];
  const [ticketTypes, setTicketTypes] = useState("Regular, VIP");
  const [creating, setCreating] = useState(false);
  const [eventActionId, setEventActionId] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [formError, setFormError] = useState("");
  const filteredEvents = events.filter((event) =>
    [event.name, event.status].join(" ").toLowerCase().includes(eventSearch.toLowerCase()),
  );
  const selectedEvent = events.find((event) => event._id === selectedEventId) ?? null;
  const selectedEventRequests = selectedEvent ? requests.filter((request) => request.event?._id === selectedEvent._id) : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setCreating(true);
    setFormError("");
    const form = new FormData(formElement);
    try {
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          startsAt: dateTimeFromForm(form),
          status: form.get("status"),
          maxTicketsPerOutlet: form.get("maxTicketsPerOutlet"),
          ticketTypes: ticketTypes.split(",").map((name) => ({ name: name.trim(), active: true })).filter((type) => type.name),
        }),
      });
      formElement.reset();
      setTicketTypes("Regular, VIP");
      notify(t("events.createdNotice"));
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("events.unableToCreate");
      setFormError(message);
      notify(message, "bad");
    } finally {
      setCreating(false);
    }
  }

  async function updateEvent(id: string, form: HTMLFormElement) {
    const data = new FormData(form);
    setEventActionId(id);
    try {
      await api(`/api/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          startsAt: dateTimeFromForm(data),
          status: data.get("status"),
          maxTicketsPerOutlet: data.get("maxTicketsPerOutlet"),
          ticketTypes: String(data.get("ticketTypes") || "")
            .split(",")
            .map((name) => ({ name: name.trim(), active: true }))
            .filter((type) => type.name),
        }),
      });
      notify(t("events.updatedNotice"));
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("events.unableToUpdate"), "bad");
    } finally {
      setEventActionId("");
    }
  }

  async function updateEventStatus(id: string, status: EventStatus) {
    setEventActionId(id);
    try {
      await api(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      notify(status === "closed" ? t("events.closedNotice") : t("events.publishedNotice"));
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("events.unableToUpdateStatus"), "bad");
    } finally {
      setEventActionId("");
    }
  }

  async function deleteEvent(event: EventItem) {
    if (!window.confirm(t("events.deleteConfirm", { name: event.name }))) return;
    setEventActionId(event._id);
    try {
      const result = await api<{ affectedRequests: number }>(`/api/events/${event._id}`, { method: "DELETE" });
      notify(
        result.affectedRequests > 0
          ? t("events.deletedWithAffected", { count: result.affectedRequests, plural: result.affectedRequests === 1 ? "" : "s" })
          : t("events.deletedNotice"),
      );
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("events.unableToDelete"), "bad");
    } finally {
      setEventActionId("");
    }
  }

  async function duplicateEvent(event: EventItem) {
    setEventActionId(event._id);
    try {
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: `${event.name} ${t("events.copySuffix")}`,
          startsAt: event.startsAt,
          status: "draft",
          maxTicketsPerOutlet: event.maxTicketsPerOutlet,
          ticketTypes: event.ticketTypes.map((type) => ({ name: type.name, active: type.active })),
        }),
      });
      notify(t("events.duplicatedNotice"));
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("events.unableToDuplicate"), "bad");
    } finally {
      setEventActionId("");
    }
  }

  return (
    <div className="space-y-5">
      {selectedEvent && <EventPage event={selectedEvent} requests={selectedEventRequests} onClose={() => onSelectEvent(null)} />}
      <div className="grid gap-5 xl:grid-cols-[minmax(380px,500px)_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-md border border-stone-250 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:h-fit">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{t("events.setup")}</p>
          <h2 className="mt-1 text-lg font-semibold">{t("events.newEvent")}</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">{t("events.createDescription")}</p>
        </div>
        <Field label={t("events.name")}><input name="name" required autoFocus placeholder={t("events.namePlaceholder")} className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.75fr)]">
          <Field label={t("events.date")}>
            <input name="startsDate" type="date" className={inputClass} />
          </Field>
          <Field label={t("events.time")}>
            <input name="startsTime" type="time" className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(170px,0.9fr)]">
          <Field label={t("events.status")}>
            <select name="status" className={inputClass} defaultValue="published">
              <option value="draft">{t("events.statusDraft")}</option>
              <option value="published">{t("events.statusPublished")}</option>
              <option value="closed">{t("events.statusClosed")}</option>
            </select>
          </Field>
          <Field label={t("events.ticketLimitPerOutlet")}>
            <input name="maxTicketsPerOutlet" type="number" min={1} defaultValue={2} className={inputClass} />
          </Field>
        </div>
        <Field label={t("events.ticketTypes")} hint={t("events.ticketTypesHint")}>
          <input value={ticketTypes} onChange={(event) => setTicketTypes(event.target.value)} className={inputClass} />
        </Field>
        {formError && <Notice message={formError} tone="bad" />}
        <ActionButton disabled={creating}>{creating ? t("events.creating") : t("events.createEvent")}</ActionButton>
      </form>

      <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
        <PanelIntro
          eyebrow={t("events.registry")}
          title={t("events.eventsAndFestivals")}
          description={t("events.registryDescription")}
          meta={<CountPill label={t("events.items")} value={events.length} />}
        />
        <div className="border-b border-stone-200 p-4">
          <Field label={t("events.searchLabel")}>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-stone-400" size={16} />
              <input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} className={`${inputClass} w-full pl-9`} placeholder={t("events.searchPlaceholder")} />
            </div>
          </Field>
        </div>
        <div className="divide-y">
        {filteredEvents.map((event) => (
          <details key={event._id} className="p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
              <div>
                <h3>
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.preventDefault();
                      onSelectEvent(event._id);
                    }}
                    className="text-left font-semibold text-stone-950 underline-offset-4 hover:text-[#EB6A1C] hover:underline"
                  >
                    {event.name}
                  </button>
                </h3>
                <p className="text-sm text-stone-600">{formatDate(event.startsAt, locale)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={event.status === "published" ? "good" : event.status === "closed" ? "bad" : "neutral"}>{renderEventStatus(event.status, t)}</Badge>
                <ChevronDown size={18} />
              </div>
            </summary>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void updateEvent(event._id, submitEvent.currentTarget);
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("events.eventName")}><input name="name" defaultValue={event.name} className={inputClass} /></Field>
                <Field label={t("events.status")}>
                  <select name="status" defaultValue={event.status} className={inputClass}>
                    <option value="draft">{t("events.statusDraft")}</option>
                    <option value="published">{t("events.statusPublished")}</option>
                    <option value="closed">{t("events.statusClosed")}</option>
                  </select>
                </Field>
                <Field label={t("events.date")}>
                  <input name="startsDate" type="date" defaultValue={dateInputValue(event.startsAt)} className={inputClass} />
                </Field>
                <Field label={t("events.time")}>
                  <input name="startsTime" type="time" defaultValue={timeInputValue(event.startsAt)} className={inputClass} />
                </Field>
                <Field label={t("events.maxTicketsPerOutlet")}><input name="maxTicketsPerOutlet" type="number" min={1} defaultValue={event.maxTicketsPerOutlet} className={inputClass} /></Field>
              </div>
              <Field label={t("events.ticketTypes")}><input name="ticketTypes" defaultValue={event.ticketTypes.map((type) => type.name).join(", ")} className={inputClass} /></Field>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="secondary" disabled={eventActionId === event._id}>{eventActionId === event._id ? t("events.saving") : t("events.saveItem")}</ActionButton>
                <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void duplicateEvent(event)}>{t("events.duplicate")}</ActionButton>
                {event.status === "closed" ? (
                  <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void updateEventStatus(event._id, "published")}>{t("events.publishAgain")}</ActionButton>
                ) : (
                  <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void updateEventStatus(event._id, "closed")}>{t("events.closeItem")}</ActionButton>
                )}
                <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void deleteEvent(event)}>{t("events.delete")}</ActionButton>
              </div>
            </form>
          </details>
        ))}
        {filteredEvents.length === 0 && <div className="p-4"><EmptyState text={events.length === 0 ? t("events.noEventsYet") : t("events.noEventsMatch")} /></div>}
        </div>
      </div>
      </div>
    </div>
  );
}
