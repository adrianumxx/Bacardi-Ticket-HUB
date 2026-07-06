"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Search } from "@/components/ui/solar-icons";
import { renderEventStatus, renderRequestStatus, type EventStatus } from "@/lib/labels";
import { formatDate, formatShortDate } from "@/lib/utils";
import type { EventItem, TicketRequest, Tone } from "./types";
import { api, approvedTicketTotal, dateInputValue, dateTimeFromForm, inputClass, requestTicketTotal, statusTone, timeInputValue } from "./helpers";
import { ActionButton, Badge, CountPill, EmptyState, Field, MiniMetric, Notice, PanelIntro } from "./ui-primitives";

export function EventPage({
  event,
  requests,
  onClose,
}: {
  event: EventItem;
  requests: TicketRequest[];
  onClose: () => void;
}) {
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

  return (
    <section className="overflow-hidden rounded-md border border-[#ECDFC8] bg-white shadow-sm">
      <div className="border-b border-[#ECDFC8] bg-[#3A2A18] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ECDFC8]">{event.eventKind === "festival" ? "Festival page" : "Event page"}</p>
            <h2 className="mt-2 text-2xl font-semibold">{event.name}</h2>
            <p className="mt-2 text-sm text-white/75">
              {[event.market, event.city, event.venue, formatDate(event.startsAt)].filter(Boolean).join(" - ") || "No location or date added yet."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={event.status === "published" ? "good" : event.status === "closed" ? "bad" : "neutral"}>{renderEventStatus(event.status)}</Badge>
            <ActionButton type="button" variant="secondary" onClick={onClose}>Close page</ActionButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {event.description && <p className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">{event.description}</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="Requests" value={totals.requests} />
            <MiniMetric label="Requested" value={totals.requested} />
            <MiniMetric label="Approved" value={totals.approved} tone="good" />
            <MiniMetric label="Pending" value={totals.pending} tone="warn" />
            <MiniMetric label="Rejected" value={totals.rejected} tone="bad" />
            <MiniMetric label="Outlets" value={outlets.length} />
            <MiniMetric label="Recipients" value={totals.recipients} />
            <MiniMetric label="Dispatches" value={totals.dispatches} tone={totals.dispatches > 0 ? "good" : "neutral"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Ticket rule</p>
              <p className="mt-1 text-sm text-stone-800">Max {event.maxTicketsPerOutlet} ticket{event.maxTicketsPerOutlet === 1 ? "" : "s"} per outlet.</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Latest request</p>
              <p className="mt-1 text-sm text-stone-800">{latestRequest ? formatShortDate(latestRequest) : "No requests yet."}</p>
            </div>
          </div>
          <div className="rounded-md border border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Ticket types</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {event.ticketTypes.map((type) => <Badge key={type.name} tone={type.active ? "neutral" : "bad"}>{type.name}</Badge>)}
              {event.ticketTypes.length === 0 && <p className="text-sm text-stone-500">No ticket types configured.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-stone-200">
          <div className="border-b border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#EB6A1C]">Linked requests</p>
          </div>
          <div className="max-h-[420px] divide-y overflow-auto">
            {requests.slice(0, 8).map((request) => (
              <div key={request._id} className="grid gap-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{request.outlet?.name || "Outlet"}</p>
                    <p className="truncate text-xs text-stone-500">{request.accountManagerName || request.requestedBy}</p>
                  </div>
                  <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{requestTicketTotal(request)} requested</Badge>
                  <Badge tone={approvedTicketTotal(request) > 0 ? "good" : "neutral"}>{approvedTicketTotal(request)} approved</Badge>
                  <Badge tone={request.dispatches.length > 0 ? "good" : "neutral"}>{request.dispatches.length} dispatch</Badge>
                </div>
              </div>
            ))}
            {requests.length === 0 && <div className="p-4"><EmptyState text="No requests have been created for this event yet." /></div>}
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
      notify("Sponsored event or festival created.");
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create the sponsored item.";
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
      notify("Sponsored event or festival updated.");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update the sponsored item.", "bad");
    } finally {
      setEventActionId("");
    }
  }

  async function updateEventStatus(id: string, status: EventStatus) {
    setEventActionId(id);
    try {
      await api(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      notify(status === "closed" ? "Sponsored item closed." : "Sponsored item published.");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update the sponsored item status.", "bad");
    } finally {
      setEventActionId("");
    }
  }

  async function deleteEvent(event: EventItem) {
    if (!window.confirm(`Delete "${event.name}" permanently? This cannot be undone.`)) return;
    setEventActionId(event._id);
    try {
      const result = await api<{ affectedRequests: number }>(`/api/events/${event._id}`, { method: "DELETE" });
      notify(
        result.affectedRequests > 0
          ? `Sponsored item deleted. ${result.affectedRequests} existing ticket request${result.affectedRequests === 1 ? "" : "s"} keep their history but no longer reference an event.`
          : "Sponsored item deleted.",
      );
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete the sponsored item.", "bad");
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
          name: `${event.name} copy`,
          startsAt: event.startsAt,
          status: "draft",
          maxTicketsPerOutlet: event.maxTicketsPerOutlet,
          ticketTypes: event.ticketTypes.map((type) => ({ name: type.name, active: type.active })),
        }),
      });
      notify("Sponsored item duplicated as a draft.");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to duplicate the sponsored item.", "bad");
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Setup</p>
          <h2 className="mt-1 text-lg font-semibold">New event or festival</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">Create the item account managers can request tickets for.</p>
        </div>
        <Field label="Name"><input name="name" required autoFocus placeholder="Tomorrowland" className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.75fr)]">
          <Field label="Date">
            <input name="startsDate" type="date" className={inputClass} />
          </Field>
          <Field label="Time">
            <input name="startsTime" type="time" className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(170px,0.9fr)]">
          <Field label="Status">
            <select name="status" className={inputClass} defaultValue="published">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <Field label="Ticket limit per outlet">
            <input name="maxTicketsPerOutlet" type="number" min={1} defaultValue={2} className={inputClass} />
          </Field>
        </div>
        <Field label="Ticket types" hint="Separate with commas, e.g. Regular, VIP.">
          <input value={ticketTypes} onChange={(event) => setTicketTypes(event.target.value)} className={inputClass} />
        </Field>
        {formError && <Notice message={formError} tone="bad" />}
        <ActionButton disabled={creating}>{creating ? "Creating..." : "Create event"}</ActionButton>
      </form>

      <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
        <PanelIntro
          eyebrow="Registry"
          title="Events and festivals"
          description="Open an item to adjust its status, ticket types, outlet rule, and sponsorship details."
          meta={<CountPill label="Items" value={events.length} />}
        />
        <div className="border-b border-stone-200 p-4">
          <Field label="Search events and festivals">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-stone-400" size={16} />
              <input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} className={`${inputClass} w-full pl-9`} placeholder="Search name, city, market, status" />
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
                <p className="text-sm text-stone-600">{formatDate(event.startsAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={event.status === "published" ? "good" : event.status === "closed" ? "bad" : "neutral"}>{renderEventStatus(event.status)}</Badge>
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
                <Field label="Event or festival name"><input name="name" defaultValue={event.name} className={inputClass} /></Field>
                <Field label="Status">
                  <select name="status" defaultValue={event.status} className={inputClass}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                  </select>
                </Field>
                <Field label="Date">
                  <input name="startsDate" type="date" defaultValue={dateInputValue(event.startsAt)} className={inputClass} />
                </Field>
                <Field label="Time">
                  <input name="startsTime" type="time" defaultValue={timeInputValue(event.startsAt)} className={inputClass} />
                </Field>
                <Field label="Max tickets per outlet"><input name="maxTicketsPerOutlet" type="number" min={1} defaultValue={event.maxTicketsPerOutlet} className={inputClass} /></Field>
              </div>
              <Field label="Ticket types"><input name="ticketTypes" defaultValue={event.ticketTypes.map((type) => type.name).join(", ")} className={inputClass} /></Field>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="secondary" disabled={eventActionId === event._id}>{eventActionId === event._id ? "Saving..." : "Save sponsored item"}</ActionButton>
                <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void duplicateEvent(event)}>Duplicate</ActionButton>
                {event.status === "closed" ? (
                  <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void updateEventStatus(event._id, "published")}>Publish again</ActionButton>
                ) : (
                  <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void updateEventStatus(event._id, "closed")}>Close item</ActionButton>
                )}
                <ActionButton type="button" variant="ghost" disabled={eventActionId === event._id} onClick={() => void deleteEvent(event)}>Delete</ActionButton>
              </div>
            </form>
          </details>
        ))}
        {filteredEvents.length === 0 && <div className="p-4"><EmptyState text={events.length === 0 ? "No sponsored events or festivals have been created yet." : "No sponsored items match the current search."} /></div>}
        </div>
      </div>
      </div>
    </div>
  );
}


