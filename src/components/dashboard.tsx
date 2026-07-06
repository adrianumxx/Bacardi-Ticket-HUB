"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  Store,
  Ticket,
  UserCircle,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "@/components/ui/solar-icons";
import {
  renderEventStatus,
  renderHistoryAction,
  renderHistoryMessage,
  renderRequestStatus,
  type EventStatus,
  type OutletStatus,
  type RequestStatus,
} from "@/lib/labels";
import { formatDate, formatShortDate, splitEmails } from "@/lib/utils";

type Role = "super_admin" | "workspace_manager" | "account_manager";
type Tone = "neutral" | "good" | "warn" | "bad";

function isSuperAdmin(role?: Role) {
  return role === "super_admin";
}

function isWorkspaceManager(role?: Role) {
  return role === "super_admin" || role === "workspace_manager";
}

function roleLabel(role?: Role) {
  if (role === "super_admin") return "Super admin";
  if (role === "workspace_manager") return "Workspace manager";
  if (role === "account_manager") return "Account manager";
  return "Unknown role";
}

function roleDescription(role?: Role) {
  if (role === "super_admin") return "Can control users, email status, audit, platform governance, and all operational workflows.";
  if (role === "workspace_manager") return "Can manage daily operations: requests, events, outlets, reports, approvals, and ticket dispatch.";
  if (role === "account_manager") return "Can create ticket requests and follow their approval and dispatch status.";
  return "Role permissions are not available.";
}

type EventItem = {
  _id: string;
  name: string;
  eventKind?: "event" | "festival";
  sponsorshipName?: string;
  sponsorshipTier?: string;
  market?: string;
  venue?: string;
  city?: string;
  startsAt?: string;
  status: EventStatus;
  description?: string;
  maxTicketsPerOutlet: number;
  ticketTypes: { name: string; active: boolean }[];
};

type Outlet = {
  _id: string;
  name: string;
  type: string;
  city?: string;
  status: OutletStatus;
};

type TicketRequest = {
  _id: string;
  event: EventItem;
  outlet: Outlet;
  requestedBy: string;
  accountManagerName?: string;
  status: RequestStatus;
  recipientEmails: string[];
  items: { ticketType: string; quantity: number; approvedQuantity?: number }[];
  notes?: string;
  adminNotes?: string;
  dispatches: { recipients: string[]; subject: string; fileNames: string[]; status: string; at: string }[];
  history: { at: string; by: string; action: string; message: string }[];
  createdAt: string;
};

type NotificationRecord = {
  at: string;
  type: string;
  recipients: string[];
  subject: string;
  status: EmailDeliveryStatus;
  providerId?: string;
  error?: string;
};

type AccountRequest = {
  _id: string;
  email: string;
  name: string;
  company?: string;
  reason?: string;
  requestedRole: "account_manager";
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notifications?: NotificationRecord[];
  createdAt: string;
};

type AppNotification = {
  _id: string;
  recipient: string;
  actor: string;
  category: "accounts" | "requests" | "tickets" | "users" | "outlets" | "events" | "reports" | "system";
  entityType?: string;
  entityId?: string;
  title: string;
  message: string;
  read: boolean;
  priority: "low" | "normal" | "high";
  emailStatus: EmailDeliveryStatus;
  emailError?: string;
  createdAt: string;
};

type AuditLogItem = {
  _id: string;
  actor: string;
  action: string;
  target?: string;
  payload?: unknown;
  createdAt: string;
};

type AdminUserRow = {
  email: string;
  name?: string;
  role: Role;
  status?: "active" | "blocked";
  lastLoginAt?: string;
  accessEnabled?: boolean;
  source?: string;
  managerEmail?: string;
};

type MailHealthStatus = {
  status: "ready" | "missing_api_key" | "invalid_sender" | "sender_not_verified" | "send_failed";
  tone: Tone;
  label: string;
  message: string;
  from: string;
  hasApiKey: boolean;
};

type EmailDeliveryStatus = "sent" | "simulated" | "failed" | "skipped" | "delivered" | "bounced" | "opened" | "clicked" | "complained" | "delivery_delayed";

type ManagerStat = {
  email: string;
  name: string;
  requests: number;
  tickets: number;
  approved: number;
  pending: number;
  rejected: number;
  dispatches: number;
  outlets: Map<string, number>;
  events: Map<string, number>;
  latestRequest?: string;
};

type RequestQuickFilter = "all" | "pending" | "approved_not_sent" | "email_failed";

type GlobalSearchResult = {
  id: string;
  group: "Requests" | "Events" | "Outlets" | "Account managers" | "Users" | "Notifications";
  title: string;
  detail: string;
  tab: string;
  quickFilter?: RequestQuickFilter;
};

type DispatchRetrySeed = {
  recipients: string;
  token: number;
};

const inputClass =
  "min-h-11 rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 shadow-sm transition focus:border-[#EB6A1C] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500";

function statusTone(status: RequestStatus): Tone {
  if (status === "approved") return "good";
  if (status === "rejected") return "bad";
  if (status === "partially_approved") return "warn";
  return "neutral";
}

function notificationTone(status: NotificationRecord["status"]): Tone {
  if (status === "sent") return "good";
  if (status === "failed") return "bad";
  if (status === "skipped") return "warn";
  return "neutral";
}

function requestTicketTotal(request: TicketRequest) {
  return request.items.reduce((sum, item) => sum + item.quantity, 0);
}

function requestHasFailedDispatch(request: TicketRequest) {
  return request.dispatches.some((dispatch) => ["failed", "bounced", "complained"].includes(dispatch.status));
}

function requestApprovedWithoutDispatch(request: TicketRequest) {
  return (request.status === "approved" || request.status === "partially_approved") && request.dispatches.length === 0;
}

function dispatchTone(status: string): Tone {
  if (status === "sent" || status === "delivered" || status === "opened" || status === "clicked") return "good";
  if (status === "failed" || status === "bounced" || status === "complained") return "bad";
  if (status === "skipped" || status === "delivery_delayed") return "warn";
  return "neutral";
}

function dispatchLabel(status: string) {
  const labels: Record<string, string> = {
    sent: "Sent",
    simulated: "Simulated",
    failed: "Failed",
    skipped: "Skipped",
    delivered: "Delivered",
    bounced: "Bounced",
    opened: "Opened",
    clicked: "Clicked",
    complained: "Complaint",
    delivery_delayed: "Delayed",
  };
  return labels[status] ?? status;
}

function requestQuickFilterLabel(filter: RequestQuickFilter) {
  const labels = {
    all: "All requests",
    pending: "Pending requests",
    approved_not_sent: "Approved without tickets sent",
    email_failed: "Email failed",
  };
  return labels[filter];
}

function isToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function isWithinLastDays(value: string | undefined, days: number) {
  if (!value) return false;
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return false;
  const now = Date.now();
  return date <= now && now - date <= days * 24 * 60 * 60 * 1000;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || "Request failed");
  }
  return response.json() as Promise<T>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-300/70 bg-white/70 text-stone-700",
    good: "border-emerald-200/70 bg-emerald-50/70 text-emerald-800",
    warn: "border-amber-200/70 bg-amber-50/70 text-amber-800",
    bad: "border-red-200/70 bg-red-50/70 text-red-800",
  };
  return <span className={`glass-pill inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-stone-500">{hint}</span>}
    </label>
  );
}

function Notice({ message, tone = "neutral" }: { message: string; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-white text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`flex items-start gap-2 rounded-md border px-4 py-3 text-sm shadow-xl ${tones[tone]}`}>
      {tone === "bad" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{message}</span>
    </div>
  );
}

function ActionButton({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const classes = {
    primary: "glass-button glass-button--dark text-white",
    secondary: "glass-button glass-button--light text-stone-800",
    ghost: "glass-button glass-button--gold text-stone-800",
  };
  return (
    <button
      {...props}
      className={`glass-button-text inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:cursor-not-allowed ${classes[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ManagerTodayPanel({
  requests,
  users,
  mailStatus,
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
  mailStatus: { mail: MailHealthStatus; lastError?: string; lastErrorAt?: string } | null;
  onOpenRequests: (filter: RequestQuickFilter) => void;
  onOpenUsers: () => void;
  onOpenReports: () => void;
}) {
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
      const eventName = request.event?.name || "Untitled event";
      const eventRow = eventPressure.get(eventName) ?? { name: eventName, tickets: 0, requests: 0 };
      eventRow.tickets += requestTicketTotal(request);
      eventRow.requests += 1;
      eventPressure.set(eventName, eventRow);

      const email = request.requestedBy || "Unknown";
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
  }, [requests, users.accountRequests, users.profiles]);

  const attentionItems = [
    ...today.emailFailed.slice(0, 3).map((request) => ({
      key: `failed-${request._id}`,
      tone: "bad" as Tone,
      label: "Email failed",
      title: request.event?.name || "Ticket dispatch failed",
      detail: `${request.outlet?.name || "Outlet"} · ${request.accountManagerName || request.requestedBy}`,
      action: () => onOpenRequests("email_failed"),
    })),
    ...today.approvedNotSent.slice(0, 3).map((request) => ({
      key: `unsent-${request._id}`,
      tone: "warn" as Tone,
      label: "Send tickets",
      title: request.event?.name || "Approved request",
      detail: `${requestTicketTotal(request)} ticket(s) approved · ${request.outlet?.name || "Outlet"}`,
      action: () => onOpenRequests("approved_not_sent"),
    })),
    ...today.pending.slice(0, 4).map((request) => ({
      key: `pending-${request._id}`,
      tone: "neutral" as Tone,
      label: "Review",
      title: request.event?.name || "Pending request",
      detail: `${request.outlet?.name || "Outlet"} · ${formatShortDate(request.createdAt)}`,
      action: () => onOpenRequests("pending"),
    })),
    ...today.pendingAccess.slice(0, 3).map((request) => ({
      key: `access-${request._id}`,
      tone: "warn" as Tone,
      label: "Access",
      title: request.name || request.email,
      detail: `${request.email} requested access`,
      action: onOpenUsers,
    })),
  ].slice(0, 8);

  return (
    <div className="space-y-5">
      {mailStatus && mailStatus.mail.status !== "ready" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{mailStatus.mail.label}</p>
              <p className="mt-1 leading-6">{mailStatus.mail.message}</p>
            </div>
            <Badge tone={mailStatus.mail.tone}>{mailStatus.mail.status.replaceAll("_", " ")}</Badge>
          </div>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <TodayActionCard title="Pending" value={today.pending.length} detail="Requests to review" tone="warn" icon={Clock} onClick={() => onOpenRequests("pending")} />
        <TodayActionCard title="Approved, not sent" value={today.approvedNotSent.length} detail="Need ticket email" tone="neutral" icon={Send} onClick={() => onOpenRequests("approved_not_sent")} />
        <TodayActionCard title="Email failed" value={today.emailFailed.length} detail="Needs retry" tone="bad" icon={AlertCircle} onClick={() => onOpenRequests("email_failed")} />
        <TodayActionCard title="Unassigned AM" value={today.unassignedManagers.length} detail="No manager owner" tone="neutral" icon={Users} onClick={onOpenUsers} />
        <TodayActionCard title="This week" value={today.createdThisWeek.length} detail={`${today.createdToday.length} today`} tone="good" icon={CalendarDays} onClick={onOpenReports} />
        <TodayActionCard title="Tickets this week" value={today.ticketsThisWeek} detail={`${today.ticketsToday} today`} tone="good" icon={Ticket} onClick={onOpenReports} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Needs attention</p>
              <h3 className="mt-1 text-lg font-semibold">Handle these first</h3>
            </div>
            <ActionButton type="button" variant="secondary" onClick={() => onOpenRequests("all")}>Open requests</ActionButton>
          </div>
          <div className="mt-4 divide-y divide-stone-100">
            {attentionItems.map((item) => (
              <button key={item.key} type="button" onClick={item.action} className="grid w-full gap-2 py-3 text-left transition hover:bg-stone-50 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                <Badge tone={item.tone}>{item.label}</Badge>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-stone-950">{item.title}</span>
                  <span className="block truncate text-xs text-stone-500">{item.detail}</span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#EB6A1C]">Open</span>
              </button>
            ))}
            {attentionItems.length === 0 && <EmptyState text="Nothing urgent right now." />}
          </div>
        </div>

        <div className="rounded-md border border-[#3A2A18] bg-[#3A2A18] p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ECDFC8]">Team pulse</p>
          <h3 className="mt-1 text-lg font-semibold">Who is driving ticket demand</h3>
          <div className="mt-4 space-y-3">
            {today.managerPulse.map((manager) => (
              <button key={manager.email} type="button" onClick={onOpenReports} className="w-full text-left">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{manager.name}</span>
                  <span className="shrink-0 text-[#ECDFC8]">{manager.tickets} tickets</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#ECDFC8]" style={{ width: `${Math.max(8, Math.min(100, manager.tickets * 8))}%` }} />
                </div>
                <p className="mt-1 text-xs text-white/60">{manager.requests} requests · {manager.pending} pending</p>
              </button>
            ))}
            {today.managerPulse.length === 0 && <p className="text-sm text-white/70">No account manager activity yet.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Festival pressure</p>
            <h3 className="mt-1 text-lg font-semibold">Events with the most ticket demand</h3>
          </div>
          <ActionButton type="button" variant="secondary" onClick={onOpenReports}>Open reports</ActionButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {today.eventPressure.map((event) => (
            <button key={event.name} type="button" onClick={onOpenReports} className="rounded-md border border-stone-200 bg-stone-50 p-3 text-left transition hover:border-[#EB6A1C] hover:bg-white">
              <p className="truncate text-sm font-semibold">{event.name}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{event.tickets}</p>
              <p className="text-xs text-stone-500">{event.requests} request(s)</p>
            </button>
          ))}
          {today.eventPressure.length === 0 && <EmptyState text="No event activity yet." />}
        </div>
      </section>
    </div>
  );
}

function TodayActionCard({
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

function GlobalSearch({
  query,
  results,
  open,
  onQueryChange,
  onFocus,
  onClose,
  onSelect,
}: {
  query: string;
  results: GlobalSearchResult[];
  open: boolean;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onClose: () => void;
  onSelect: (result: GlobalSearchResult) => void;
}) {
  const grouped = results.reduce((groups, result) => {
    const group = groups.get(result.group) ?? [];
    group.push(result);
    groups.set(result.group, group);
    return groups;
  }, new Map<GlobalSearchResult["group"], GlobalSearchResult[]>());

  return (
    <div className="relative hidden min-w-[260px] flex-1 md:block xl:max-w-2xl">
      <label className="relative block">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          className="h-10 w-full rounded-full border border-stone-200 bg-white/80 pl-10 pr-10 text-sm text-stone-950 shadow-sm outline-none transition focus:border-[#EB6A1C]"
          placeholder="Search requests, events, outlets, users..."
        />
        {query && (
          <button type="button" onClick={() => onQueryChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700" aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </label>
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-[70] overflow-hidden rounded-md border border-stone-200 bg-white shadow-2xl">
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {grouped.size > 0 ? (
              [...grouped.entries()].map(([group, groupResults]) => (
                <section key={group} className="py-1">
                  <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{group}</p>
                  <div className="space-y-1">
                    {groupResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onSelect(result)}
                        className="grid w-full gap-1 rounded-md px-3 py-2 text-left transition hover:bg-[#FFFCF6]"
                      >
                        <span className="truncate text-sm font-semibold text-stone-950">{result.title}</span>
                        <span className="truncate text-xs text-stone-500">{result.detail}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-stone-500">No results found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessName, setAccessName] = useState("");
  const [accessCompany, setAccessCompany] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [mode, setMode] = useState<"signin" | "request">("signin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accessSubmitted, setAccessSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    const result = await signIn("email", { email, redirect: false, callbackUrl: "/" });
    setSubmitting(false);
    if (result?.error) {
      setError(
        result.error === "CredentialsSignin"
          ? "This email is not approved yet. Use Request access to send your details to a manager."
          : "Sign-in is temporarily unavailable. Please try again in a moment.",
      );
      return;
    }
    window.location.href = result?.url || "/";
  }

  async function submitAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await api<{ message: string }>("/api/account-requests", {
        method: "POST",
        body: JSON.stringify({
          email: accessEmail,
          name: accessName,
          company: accessCompany,
          reason: accessReason,
        }),
      });
      setSuccess(response.message);
      setEmail(accessEmail);
      setAccessSubmitted(true);
      setAccessName("");
      setAccessCompany("");
      setAccessReason("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit access request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFFCF6] text-stone-950">
      <section className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.9fr_1fr]">
        <div className="space-y-5">
          <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={116} height={116} className="h-28 w-28 object-contain" priority unoptimized />
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#EB6A1C]">Bacardi Ticket Hub</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-[#3A2A18] sm:text-5xl">
            Your platform for ticket requests.
          </h1>
        </div>

        <div className="border border-[#ECDFC8] bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#EB6A1C]">Private access</p>
            <h2 className="mt-2 text-3xl font-semibold">{mode === "signin" ? "Sign in with email" : "Request an account"}</h2>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-1 p-1">
            <ActionButton
              type="button"
              variant={mode === "signin" ? "primary" : "ghost"}
              className="min-h-10 w-full text-xs uppercase tracking-[0.16em]"
              onClick={() => {
                setMode("signin");
                setError("");
                setAccessSubmitted(false);
              }}
            >
              Sign in
            </ActionButton>
            <ActionButton
              type="button"
              variant={mode === "request" ? "primary" : "ghost"}
              className="min-h-10 w-full text-xs uppercase tracking-[0.16em]"
              onClick={() => {
                setMode("request");
                setError("");
                setSuccess("");
                setAccessSubmitted(false);
              }}
            >
              Request access
            </ActionButton>
          </div>
          {mode === "signin" ? (
            <form className="grid gap-4" onSubmit={submitEmail}>
              <Field label="Email address" hint="Your email must already be approved by a manager. Anyone can request access from this screen.">
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </Field>
              {success && <Notice message={success} tone="good" />}
              {error && <Notice message={error} tone="bad" />}
              {error.includes("not approved") && (
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAccessEmail(email);
                    setError("");
                    setSuccess("");
                    setAccessSubmitted(false);
                    setMode("request");
                  }}
                >
                  Request access
                </ActionButton>
              )}
              <ActionButton disabled={submitting}>{submitting ? "Checking access..." : "Enter hub"}</ActionButton>
            </form>
          ) : (
            accessSubmitted ? (
              <div className="grid gap-4">
                <Notice message={success || "Access request sent. A manager will review it and you will be notified by email."} tone="good" />
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAccessSubmitted(false);
                    setSuccess("");
                    setError("");
                    setAccessEmail("");
                  }}
                >
                  Send another request
                </ActionButton>
              </div>
            ) : (
              <form className="grid gap-4" onSubmit={submitAccessRequest}>
                <Field label="Full name">
                  <input className={inputClass} value={accessName} onChange={(event) => setAccessName(event.target.value)} required />
                </Field>
                <Field label="Work email">
                  <input className={inputClass} type="email" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} autoComplete="email" required />
                </Field>
                <Field label="Company or team">
                  <input className={inputClass} value={accessCompany} onChange={(event) => setAccessCompany(event.target.value)} placeholder="Bacardi, agency, market team..." />
                </Field>
                <Field label="Reason for access">
                  <textarea className={inputClass} value={accessReason} onChange={(event) => setAccessReason(event.target.value)} rows={3} placeholder="Example: I manage outlets for upcoming events." />
                </Field>
                {error && <Notice message={error} tone="bad" />}
                <ActionButton disabled={submitting}>{submitting ? "Submitting..." : "Submit access request"}</ActionButton>
              </form>
            )
          )}
        </div>
      </section>
    </main>
  );
}

export function Dashboard() {
  const { data: session, status } = useSession();
  const role = session?.user?.role as Role | undefined;
  const [tab, setTab] = useState("today");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [users, setUsers] = useState<{
    allowedUsers: { email: string; role: Role; createdBy?: string; createdAt?: string }[];
    profiles: { email: string; name?: string; role: Role; status?: "active" | "blocked"; lastLoginAt?: string; managerEmail?: string }[];
    accountRequests: AccountRequest[];
  }>({ allowedUsers: [], profiles: [], accountRequests: [] });
  const [mailStatus, setMailStatus] = useState<{ mail: MailHealthStatus; lastError?: string; lastErrorAt?: string } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | AppNotification["category"]>("all");
  const [notice, setNotice] = useState<{ message: string; tone: Tone } | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestQuickFilter, setRequestQuickFilter] = useState<RequestQuickFilter>("all");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    const params = new URLSearchParams();
    if (notificationFilter === "unread") params.set("filter", "unread");
    if (notificationFilter !== "all" && notificationFilter !== "unread") params.set("category", notificationFilter);
    const data = await api<{ notifications: AppNotification[]; unreadCount: number }>(`/api/notifications?${params.toString()}`);
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }, [notificationFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, outletData, requestData] = await Promise.all([
        api<{ events: EventItem[] }>("/api/events"),
        api<{ outlets: Outlet[] }>("/api/outlets"),
        api<{ requests: TicketRequest[] }>("/api/requests"),
      ]);
      setEvents(eventData.events);
      setOutlets(outletData.outlets);
      setRequests(requestData.requests);
      if (isSuperAdmin(role)) {
        const [userData, mailData] = await Promise.all([
          api<typeof users>("/api/admin/users"),
          api<{ mail: MailHealthStatus; lastError?: string; lastErrorAt?: string }>("/api/mail/status"),
        ]);
        setUsers(userData);
        setMailStatus(mailData);
      }
      await loadNotifications();
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "Unable to load dashboard data.", tone: "bad" });
    } finally {
      setLoading(false);
    }
  }, [loadNotifications, role]);

  useEffect(() => {
    if (!session?.user || !role) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, role, session?.user]);

  useEffect(() => {
    if (!session?.user || !role) return;
    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications, role, session?.user]);

  // Poll for new notifications so the bell badge doesn't require a manual
  // refresh. Skips ticks while the tab is hidden to avoid wasted requests.
  useEffect(() => {
    if (!session?.user || !role) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [loadNotifications, role, session?.user]);

  const showNotice = useCallback((message: string, tone: Tone = "good") => {
    setNotice({ message, tone });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const kpis = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter((item) => item.status === "pending").length,
      approved: requests.filter((item) => item.status === "approved" || item.status === "partially_approved").length,
      rejected: requests.filter((item) => item.status === "rejected").length,
      sent: requests.reduce((sum, item) => sum + item.dispatches.length, 0),
    }),
    [requests],
  );

  const tabs = useMemo(
    () =>
      !role
        ? []
        : isSuperAdmin(role)
        ? [
            ["today", "Today", BarChart3],
            ["requests", "Requests", Ticket],
            ["events", "Events & festivals", CalendarDays],
            ["users", "Users", Users],
            ["reports", "Reports", BarChart3],
            ["audit", "Audit", Clock],
            ["settings", "Settings", Settings],
          ]
        : isWorkspaceManager(role)
        ? [
            ["today", "Today", BarChart3],
            ["requests", "Requests", Ticket],
            ["events", "Events & festivals", CalendarDays],
            ["reports", "Reports", BarChart3],
            ["settings", "Settings", Settings],
          ]
        : [
            ["new-request", "New request", Plus],
            ["mine", "My requests", Ticket],
            ["settings", "Settings", Settings],
          ],
    [role],
  );

  const currentTab = (tabs.some(([id]) => id === tab) ? tab : tabs[0]?.[0] ?? "requests") as string;
  const activeTab = tabs.find(([id]) => id === currentTab);
  const activeLabel = (activeTab?.[1] as string | undefined) ?? "Dashboard";
  const showWorkspaceKpis = currentTab === "requests" || currentTab === "reports";
  const globalSearchResults = useMemo(() => {
    const query = globalSearchQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    const matches = (...values: (string | number | undefined | null)[]) =>
      values
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value).toLowerCase())
        .some((value) => value.includes(query));

    const managerRows = new Map<string, { name: string; email: string; requests: number; tickets: number }>();
    for (const request of requests) {
      const email = request.requestedBy || "Unknown";
      const row = managerRows.get(email) ?? { name: request.accountManagerName || email, email, requests: 0, tickets: 0 };
      row.requests += 1;
      row.tickets += requestTicketTotal(request);
      managerRows.set(email, row);
    }

    const results: GlobalSearchResult[] = [];

    for (const request of requests) {
      if (matches(request.event?.name, request.outlet?.name, request.accountManagerName, request.requestedBy, renderRequestStatus(request.status), request._id)) {
        results.push({
          id: `request-${request._id}`,
          group: "Requests",
          title: `${request.event?.name || "Request"} · ${request.outlet?.name || "Outlet"}`,
          detail: `${renderRequestStatus(request.status)} · ${request.accountManagerName || request.requestedBy} · ${requestTicketTotal(request)} ticket(s)`,
          tab: isWorkspaceManager(role) ? "requests" : "mine",
          quickFilter: request.status === "pending" ? "pending" : requestHasFailedDispatch(request) ? "email_failed" : requestApprovedWithoutDispatch(request) ? "approved_not_sent" : "all",
        });
      }
    }

    for (const event of events) {
      if (matches(event.name, event.eventKind, event.status, event.city, event.venue, event.ticketTypes.map((item) => item.name).join(" "))) {
        results.push({
          id: `event-${event._id}`,
          group: "Events",
          title: event.name,
          detail: `${event.eventKind === "festival" ? "Festival" : "Event"} · ${renderEventStatus(event.status)}${event.city ? ` · ${event.city}` : ""}`,
          tab: isWorkspaceManager(role) ? "events" : "new-request",
        });
      }
    }

    for (const outlet of outlets) {
      if (matches(outlet.name, outlet.type, outlet.city, outlet.status)) {
        results.push({
          id: `outlet-${outlet._id}`,
          group: "Outlets",
          title: outlet.name,
          detail: `${outlet.type}${outlet.city ? ` · ${outlet.city}` : ""} · ${outlet.status}`,
          tab: isWorkspaceManager(role) ? "events" : "new-request",
        });
      }
    }

    for (const manager of managerRows.values()) {
      if (matches(manager.name, manager.email)) {
        results.push({
          id: `manager-${manager.email}`,
          group: "Account managers",
          title: manager.name,
          detail: `${manager.email} · ${manager.requests} request(s) · ${manager.tickets} ticket(s)`,
          tab: "reports",
        });
      }
    }

    for (const user of users.profiles) {
      if (matches(user.name, user.email, user.role, user.status, user.managerEmail)) {
        results.push({
          id: `user-${user.email}-${user.role}`,
          group: "Users",
          title: user.name || user.email,
          detail: `${user.email} · ${roleLabel(user.role)}`,
          tab: "users",
        });
      }
    }

    for (const user of users.allowedUsers) {
      if (matches(user.email, user.role, user.createdBy)) {
        results.push({
          id: `allowed-${user.email}-${user.role}`,
          group: "Users",
          title: user.email,
          detail: `${roleLabel(user.role)} · approved access`,
          tab: "users",
        });
      }
    }

    for (const notification of notifications) {
      if (matches(notification.title, notification.message, notification.actor, notification.category, notification.emailStatus)) {
        results.push({
          id: `notification-${notification._id}`,
          group: "Notifications",
          title: notification.title,
          detail: `${notification.category} · ${notification.emailStatus} · ${formatShortDate(notification.createdAt)}`,
          tab: notification.category === "accounts" || notification.category === "users" ? (isSuperAdmin(role) ? "users" : isWorkspaceManager(role) ? "requests" : "mine") : notification.category === "events" || notification.category === "outlets" ? "events" : notification.category === "reports" ? "reports" : isWorkspaceManager(role) ? "requests" : "mine",
        });
      }
    }

    return results.slice(0, 24);
  }, [events, globalSearchQuery, notifications, outlets, requests, role, users.allowedUsers, users.profiles]);

  function openTab(id: string) {
    setTab(id);
    setMobileNavOpen(false);
  }

  function openGlobalSearchResult(result: GlobalSearchResult) {
    if (result.quickFilter) setRequestQuickFilter(result.quickFilter);
    openTab(result.tab);
    setGlobalSearchOpen(false);
    setGlobalSearchQuery("");
  }

  if (status === "loading" || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FFFCF6] px-6 text-stone-950">
        <div className="grid justify-items-center gap-4 text-center">
          <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={76} height={76} className="h-20 w-20 object-contain" priority unoptimized />
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#EB6A1C]">Bacardi Ticket Hub</p>
          <p className="text-sm text-stone-600">Loading your workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFFCF6] text-stone-950">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#FFFCF6]/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <ActionButton
              type="button"
              variant="secondary"
              className="h-9 w-9 min-h-0 px-0 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
            >
              <Menu size={22} />
            </ActionButton>
            <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" priority unoptimized />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-[#EB6A1C]">Bacardi Ticket Hub</p>
              <h1 className="truncate text-lg font-semibold sm:text-xl">{activeLabel}</h1>
            </div>
          </div>
          <GlobalSearch
            query={globalSearchQuery}
            results={globalSearchResults}
            open={globalSearchOpen}
            onQueryChange={(value) => {
              setGlobalSearchQuery(value);
              setGlobalSearchOpen(true);
            }}
            onFocus={() => setGlobalSearchOpen(true)}
            onClose={() => setGlobalSearchOpen(false)}
            onSelect={openGlobalSearchResult}
          />
          <div className="flex shrink-0 items-center gap-2">
            <ActionButton
              type="button"
              variant="secondary"
              className="hidden h-9 w-9 min-h-0 px-0 lg:inline-flex"
              onClick={() => setSidebarCollapsed((current) => !current)}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
            </ActionButton>
            <div className="glass-pill hidden items-center gap-2 rounded-full border border-stone-200/70 bg-white/70 px-3 py-2 sm:flex">
              <Badge tone={isWorkspaceManager(role) ? "good" : "neutral"}>{roleLabel(role)}</Badge>
              <span className="max-w-[220px] truncate text-sm text-stone-600">{session?.user?.email}</span>
            </div>
            <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={() => void refresh()} title="Refresh">
              <RefreshCcw size={22} className={loading ? "animate-spin" : ""} />
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              className="relative h-9 w-9 min-h-0 px-0"
              onClick={() => setNotificationsOpen(true)}
              title="Notifications"
            >
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#EB6A1C] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </ActionButton>
            <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={() => signOut()} title="Sign out">
              <LogOut size={22} />
            </ActionButton>
          </div>
        </div>
      </header>

      {mobileNavOpen && <button className="fixed inset-0 z-40 bg-stone-950/35 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}
      {notificationsOpen && (
        <NotificationDrawer
          notifications={notifications}
          unreadCount={unreadCount}
          filter={notificationFilter}
          onFilter={setNotificationFilter}
          onClose={() => setNotificationsOpen(false)}
          onOpenEntity={(category) => {
            const target = category === "accounts" || category === "users" ? (isSuperAdmin(role) ? "users" : isWorkspaceManager(role) ? "requests" : "mine") : category === "events" || category === "outlets" ? "events" : category === "reports" ? "reports" : isWorkspaceManager(role) ? "requests" : "mine";
            openTab(target);
            setNotificationsOpen(false);
          }}
          onRead={async (id, read) => {
            await api(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read }) });
            await loadNotifications();
          }}
          onReadMany={async (ids, read) => {
            await api("/api/notifications", { method: "PATCH", body: JSON.stringify({ ids, read }) });
            await loadNotifications();
          }}
          onReadAll={async () => {
            await api("/api/notifications/read-all", { method: "POST" });
            await loadNotifications();
          }}
          onDelete={async (id) => {
            await api(`/api/notifications/${id}`, { method: "DELETE" });
            await loadNotifications();
          }}
          onDeleteMany={async (ids) => {
            await api("/api/notifications", { method: "DELETE", body: JSON.stringify({ ids }) });
            await loadNotifications();
          }}
        />
      )}

      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-50 shrink-0 transform transition-all duration-200 lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100vh-4rem)] lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          } ${sidebarCollapsed ? "lg:w-[88px]" : "lg:w-[260px]"} w-[286px]`}
        >
          <div className="flex h-full flex-col border-r border-stone-200 bg-white shadow-xl lg:shadow-none">
            <div className={`flex h-20 items-center gap-3 border-b border-stone-200 px-4 justify-between ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">
                <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={52} height={52} className="h-12 w-12 shrink-0 object-contain" unoptimized />
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-[#EB6A1C]">Bacardi</p>
                  <p className="truncate text-sm font-semibold">Ticket Hub</p>
                </div>
              </div>
              <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X size={18} />
              </ActionButton>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3 lg:pt-4" aria-label="Dashboard sections">
              {tabs.map(([id, label, Icon]) => (
                <ActionButton
                  key={id as string}
                  type="button"
                  variant={currentTab === id ? "primary" : "ghost"}
                  onClick={() => openTab(id as string)}
                  title={label as string}
                  aria-current={currentTab === id ? "page" : undefined}
                  className={`w-full justify-start gap-3 px-3 ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className={`truncate ${sidebarCollapsed ? "lg:hidden" : ""}`}>{label as string}</span>
                </ActionButton>
              ))}
            </nav>

            <div className={`border-t border-stone-200 p-3 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <div className="glass-pill rounded-md bg-stone-50/70 p-3">
                <Badge tone={isWorkspaceManager(role) ? "good" : "neutral"}>{roleLabel(role)}</Badge>
                <p className="mt-2 truncate text-xs text-stone-500">{session?.user?.email}</p>
              </div>
            </div>
          </div>
        </aside>

        {notice && (
          <div className="fixed inset-x-4 top-4 z-[80] sm:inset-x-auto sm:right-6 sm:w-full sm:max-w-md">
            <Notice message={notice.message} tone={notice.tone} />
          </div>
        )}
        <section className="mx-auto min-w-0 w-full max-w-[1600px] flex-1 space-y-5 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Workspace</p>
              <h2 className="mt-1 text-2xl font-semibold">{activeLabel}</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              {isWorkspaceManager(role)
                ? "Run the workspace cockpit: requests, events, users, reporting, email status, and audit visibility."
                : "Create ticket requests and track approvals from one place."}
            </p>
          </div>
          {showWorkspaceKpis && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
              <Kpi label="Total Requests" value={kpis.total} icon={Ticket} tone="gold" />
              <Kpi label="Pending" value={kpis.pending} icon={Clock} tone="warn" />
              <Kpi label="Approved" value={kpis.approved} icon={CheckCircle2} tone="good" />
              <Kpi label="Rejected" value={kpis.rejected} icon={XCircle} tone="bad" />
              <Kpi label="Ticket Emails Sent" value={kpis.sent} icon={Send} tone="neutral" />
            </div>
          )}

          {currentTab === "today" && isWorkspaceManager(role) && (
            <ManagerTodayPanel
              requests={requests}
              users={users}
              mailStatus={mailStatus}
              onOpenRequests={(filter) => {
                setRequestQuickFilter(filter);
                openTab("requests");
              }}
              onOpenUsers={() => openTab("users")}
              onOpenReports={() => openTab("reports")}
            />
          )}
          {currentTab === "requests" && (
            <AdminRequests
              requests={requests}
              events={events}
              outlets={outlets}
              quickFilter={requestQuickFilter}
              onClearQuickFilter={() => setRequestQuickFilter("all")}
              onDone={refresh}
              notify={showNotice}
            />
          )}
          {currentTab === "events" && <EventsPanel events={events} onDone={refresh} notify={showNotice} />}
          {currentTab === "users" && <UsersPanel users={users} mailStatus={mailStatus} onDone={refresh} notify={showNotice} />}
          {currentTab === "reports" && <ReportsPanel />}
          {currentTab === "audit" && <AuditPanel />}
          {currentTab === "new-request" && <NewRequestPanel events={events} outlets={outlets} onDone={refresh} notify={showNotice} />}
          {currentTab === "mine" && <MinePanel requests={requests} onDone={refresh} notify={showNotice} />}
          {currentTab === "settings" && <SettingsPanel notify={showNotice} onDone={refresh} />}
        </section>
      </div>
    </main>
  );
}

function NotificationDrawer({
  notifications,
  unreadCount,
  filter,
  onFilter,
  onClose,
  onOpenEntity,
  onRead,
  onReadMany,
  onReadAll,
  onDelete,
  onDeleteMany,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  filter: "all" | "unread" | AppNotification["category"];
  onFilter: (filter: "all" | "unread" | AppNotification["category"]) => void;
  onClose: () => void;
  onOpenEntity: (category: AppNotification["category"]) => void;
  onRead: (id: string, read: boolean) => Promise<void>;
  onReadMany: (ids: string[], read: boolean) => Promise<void>;
  onReadAll: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteMany: (ids: string[]) => Promise<void>;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filters: { id: "all" | "unread" | AppNotification["category"]; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "requests", label: "Requests" },
    { id: "accounts", label: "Accounts" },
    { id: "tickets", label: "Tickets" },
  ];
  const visibleIds = notifications.map((notification) => notification._id);
  const selectedSet = new Set(selectedIds);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const unreadVisible = notifications.filter((notification) => !notification.read).length;
  const failedEmails = notifications.filter((notification) => ["failed", "bounced", "complained"].includes(notification.emailStatus)).length;

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const currentSet = new Set(current);
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      for (const id of visibleIds) currentSet.add(id);
      return [...currentSet];
    });
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected notification${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    await onDeleteMany(selectedIds);
    setSelectedIds([]);
    setSelecting(false);
  }

  async function markSelected(read: boolean) {
    if (selectedIds.length === 0) return;
    await onReadMany(selectedIds, read);
    setSelectedIds([]);
    setSelecting(false);
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label="Close notifications" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Notifications</p>
            <h2 className="mt-1 text-xl font-semibold">Inbox</h2>
            <p className="mt-1 text-sm text-stone-600">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</p>
          </div>
          <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </ActionButton>
        </div>
        <div className="space-y-3 border-b border-stone-200 p-3">
          <div className="grid grid-cols-3 gap-2">
            <NotificationCounter label="Visible" value={notifications.length} />
            <NotificationCounter label="Unread" value={unreadVisible} tone={unreadVisible > 0 ? "warn" : "neutral"} />
            <NotificationCounter label="Email failed" value={failedEmails} tone={failedEmails > 0 ? "bad" : "neutral"} />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <ActionButton
                key={item.id}
                type="button"
                variant={filter === item.id ? "primary" : "secondary"}
                className="min-h-9 px-3 text-xs"
                onClick={() => {
                  setSelectedIds([]);
                  setSelecting(false);
                  onFilter(item.id);
                }}
              >
                {item.label}
              </ActionButton>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <ActionButton
                type="button"
                variant={selecting ? "primary" : "secondary"}
                className="min-h-9 px-3 text-xs"
                onClick={() => {
                  setSelecting((current) => !current);
                  setSelectedIds([]);
                }}
              >
                {selecting ? "Cancel selection" : "Select messages"}
              </ActionButton>
              {selecting && (
                <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={toggleAllVisible} disabled={notifications.length === 0}>
                  {allVisibleSelected ? "Clear visible" : "Select all visible"}
                </ActionButton>
              )}
            </div>
            <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => void onReadAll()}>
              Mark all read
            </ActionButton>
          </div>
          {selecting && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-stone-50 p-2">
              <span className="text-xs font-medium text-stone-600">{selectedIds.length} selected</span>
              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" disabled={selectedIds.length === 0} onClick={() => void markSelected(true)}>
                  Mark read
                </ActionButton>
                <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" disabled={selectedIds.length === 0} onClick={() => void markSelected(false)}>
                  Mark unread
                </ActionButton>
                <ActionButton type="button" variant="ghost" className="min-h-9 px-3 text-xs" disabled={selectedIds.length === 0} onClick={() => void deleteSelected()}>
                  Delete
                </ActionButton>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.map((notification) => (
            <article key={notification._id} className={`border-b border-stone-100 p-4 ${notification.read ? "bg-white" : "bg-amber-50/50"}`}>
              <div className="flex items-start gap-3">
                {selecting && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#EB6A1C]"
                    checked={selectedSet.has(notification._id)}
                    onChange={() => toggleSelected(notification._id)}
                    aria-label={`Select notification: ${notification.title}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={notification.read ? "neutral" : "warn"}>{notification.read ? "Read" : "Unread"}</Badge>
                    {notification.priority === "high" && <Badge tone="bad">High priority</Badge>}
                    <Badge tone={dispatchTone(notification.emailStatus)}>{notification.emailStatus === "skipped" ? "In-app only" : `Email ${dispatchLabel(notification.emailStatus)}`}</Badge>
                  </div>
                  <h3 className="mt-2 font-semibold">{notification.title}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-stone-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-stone-500">{formatDate(notification.createdAt)} - {notification.actor}</p>
                  {notification.emailError && <p className="mt-1 text-xs text-red-700">{notification.emailError}</p>}
                </div>
              </div>
              {!selecting && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton variant="secondary" onClick={() => onOpenEntity(notification.category)}>{notificationContextLabel(notification.category)}</ActionButton>
                  <ActionButton variant="ghost" onClick={() => void onRead(notification._id, !notification.read)}>
                    Mark {notification.read ? "unread" : "read"}
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm("Delete this notification? This cannot be undone.")) void onDelete(notification._id);
                    }}
                  >
                    Delete
                  </ActionButton>
                </div>
              )}
            </article>
          ))}
          {notifications.length === 0 && <div className="p-4"><EmptyState text="No notifications match this filter." /></div>}
        </div>
      </aside>
    </div>
  );
}

function NotificationCounter({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50 text-stone-800",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function notificationContextLabel(category: AppNotification["category"]) {
  if (category === "accounts" || category === "users") return "Open users";
  if (category === "tickets" || category === "requests") return "Open requests";
  if (category === "events" || category === "outlets") return "Open events";
  if (category === "reports") return "Open reports";
  return "Open workspace";
}

const kpiTones = {
  neutral: { bar: "bg-stone-300", chip: "bg-stone-100 text-stone-600" },
  good: { bar: "bg-emerald-400", chip: "bg-emerald-50 text-emerald-700" },
  warn: { bar: "bg-amber-400", chip: "bg-amber-50 text-amber-700" },
  bad: { bar: "bg-red-400", chip: "bg-red-50 text-red-700" },
  gold: { bar: "bg-[#EB6A1C]", chip: "bg-[#ECDFC8] text-[#7A4A1C]" },
} as const;

function Kpi({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: number; icon: LucideIcon; tone?: keyof typeof kpiTones }) {
  const palette = kpiTones[tone];
  return (
    <div className="relative overflow-hidden rounded-md border border-stone-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${palette.chip}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function PanelIntro({ eyebrow, title, description, meta }: { eyebrow: string; title: string; description?: string; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>}
      </div>
      {meta}
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700">
      {label} <strong className="text-stone-950">{value}</strong>
    </span>
  );
}

function dateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dateTimeFromForm(form: FormData) {
  const date = String(form.get("startsDate") || "");
  const time = String(form.get("startsTime") || "");
  if (!date) return "";
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

function EventsPanel({ events, onDone, notify }: { events: EventItem[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const [ticketTypes, setTicketTypes] = useState("Regular, VIP");
  const [creating, setCreating] = useState(false);
  const [eventActionId, setEventActionId] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [formError, setFormError] = useState("");
  const filteredEvents = events.filter((event) =>
    [event.name, event.status].join(" ").toLowerCase().includes(eventSearch.toLowerCase()),
  );

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
                <h3 className="font-semibold">{event.name}</h3>
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
  );
}

function UsersPanel({
  users,
  mailStatus,
  onDone,
  notify,
}: {
  users: {
    allowedUsers: { email: string; role: Role; createdBy?: string; createdAt?: string }[];
    profiles: { email: string; name?: string; role: Role; status?: "active" | "blocked"; lastLoginAt?: string; managerEmail?: string }[];
    accountRequests: AccountRequest[];
  };
  mailStatus: { mail: MailHealthStatus; lastError?: string; lastErrorAt?: string } | null;
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [busyEmail, setBusyEmail] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setFormError("");
    try {
      const response = await api<{ delivery?: { status: string } }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), role: form.get("role") }),
      });
      formElement.reset();
      notify(`User access updated. Notification ${response.delivery?.status || "skipped"}.`);
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update user access.";
      setFormError(message);
      notify(message, "bad");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUser(email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean; managerEmail?: string }) {
    setBusyEmail(email);
    try {
      await api(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      notify("User updated.");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update the user.", "bad");
    } finally {
      setBusyEmail("");
    }
  }

  async function deleteUser(email: string) {
    if (!window.confirm(`Delete the account for ${email}? This removes their access and profile permanently.`)) return;
    setBusyEmail(email);
    try {
      await api(`/api/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" });
      notify("Account deleted.");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete the account.", "bad");
    } finally {
      setBusyEmail("");
    }
  }

  const allowedMap = new Map(users.allowedUsers.map((user) => [user.email, user]));
  const profileMap = new Map(users.profiles.map((profile) => [profile.email, profile]));
  const combinedRows: AdminUserRow[] = [...new Set([...users.allowedUsers.map((user) => user.email), ...users.profiles.map((profile) => profile.email)])]
    .map((email) => {
      const allowed = allowedMap.get(email);
      const profile = profileMap.get(email);
      return {
        email,
        name: profile?.name || "",
        role: (profile?.role || allowed?.role || "account_manager") as Role,
        status: profile?.status || "active",
        lastLoginAt: profile?.lastLoginAt,
        accessEnabled: Boolean(allowed),
        source: allowed ? `Approved${allowed.createdBy ? ` by ${allowed.createdBy}` : ""}` : "Profile only",
        managerEmail: profile?.managerEmail || "",
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
  const userStats = {
    total: combinedRows.length,
    superAdmins: combinedRows.filter((row) => row.role === "super_admin").length,
    managers: combinedRows.filter((row) => row.role === "workspace_manager").length,
    accountManagers: combinedRows.filter((row) => row.role === "account_manager").length,
    blocked: combinedRows.filter((row) => row.status === "blocked").length,
    missingAccess: combinedRows.filter((row) => !row.accessEnabled).length,
    unassigned: combinedRows.filter((row) => row.role === "account_manager" && !row.managerEmail).length,
  };
  const visibleRows = combinedRows.filter((row) =>
    [row.name, row.email, row.role, row.status, row.source, row.managerEmail].join(" ").toLowerCase().includes(userSearch.toLowerCase()),
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_1fr]">
      <form onSubmit={submit} className="space-y-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:h-fit">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Access control</p>
          <h2 className="text-lg font-semibold">Create account access</h2>
          <p className="mt-1 text-sm text-stone-600">Create approved access and assign the right operational role.</p>
        </div>
        <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
        <Field label="Role">
          <select name="role" className={inputClass}>
            <option value="account_manager">{roleLabel("account_manager")}</option>
            <option value="workspace_manager">{roleLabel("workspace_manager")}</option>
            <option value="super_admin">{roleLabel("super_admin")}</option>
          </select>
        </Field>
        <RoleModelNotice />
        {formError && <Notice message={formError} tone="bad" />}
        <ActionButton disabled={submitting}>{submitting ? "Saving access..." : "Enable access"}</ActionButton>
      </form>
      <div className="space-y-5">
        <UserAccessOverview stats={userStats} />
        <EmailHealthCard status={mailStatus} />
        <AccessRequestQueue requests={users.accountRequests} onDone={onDone} notify={notify} />
        <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
          <Field label="Search users">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-stone-400" size={16} />
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} className={`${inputClass} w-full pl-9`} placeholder="Search name, email, role, manager, status" />
            </div>
          </Field>
        </div>
        <UserTable
          title="Users and access"
          rows={visibleRows}
          managers={combinedRows.filter((row) => isWorkspaceManager(row.role))}
          busyEmail={busyEmail}
          searchActive={Boolean(userSearch)}
          onUpdate={updateUser}
          onDelete={deleteUser}
        />
      </div>
    </div>
  );
}

function AuditPanel() {
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

function isCriticalAuditAction(action: string) {
  return /^(user\.|mail\.webhook|ticket_request\.dispatch|ticket_request\.updated|event\.deleted|outlet\.merged|report\.export)/i.test(action);
}

function UserAccessOverview({ stats }: { stats: { total: number; superAdmins: number; managers: number; accountManagers: number; blocked: number; missingAccess: number; unassigned: number } }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <CompactMetric label="Users" value={stats.total} />
      <CompactMetric label="Super admins" value={stats.superAdmins} />
      <CompactMetric label="Workspace managers" value={stats.managers} />
      <CompactMetric label="Account managers" value={stats.accountManagers} />
      <CompactMetric label="Unassigned" value={stats.unassigned} tone={stats.unassigned > 0 ? "warn" : "neutral"} />
      <CompactMetric label="Blocked" value={stats.blocked} tone={stats.blocked > 0 ? "bad" : "neutral"} />
      <CompactMetric label="Missing access" value={stats.missingAccess} tone={stats.missingAccess > 0 ? "warn" : "neutral"} />
    </section>
  );
}

function RoleModelNotice() {
  return (
    <div className="rounded-md border border-[#ECDFC8] bg-[#FFFCF6] p-3 text-sm text-stone-700">
      <p className="font-semibold text-stone-950">Role model v2</p>
      <p className="mt-1 leading-6">
        Super admins control governance, users, audit, and email status. Workspace managers run approvals, events, reports, and ticket dispatch.
      </p>
    </div>
  );
}

function CompactMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-250 bg-white",
    good: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
  };
  return (
    <div className={`rounded-md border p-3 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">{value}</p>
    </div>
  );
}

function EmailHealthCard({ status }: { status: { mail: MailHealthStatus; lastError?: string; lastErrorAt?: string } | null }) {
  const mail = status?.mail;
  const tone = mail?.tone || "neutral";
  const statusCopy = mail?.label || "Checking";
  return (
    <section className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Email delivery</p>
          <h2 className="mt-1 text-lg font-semibold">Resend status</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            {mail?.message || "Checking the current mail configuration."}
          </p>
        </div>
        <Badge tone={tone}>{statusCopy}</Badge>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md bg-stone-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">API key</p>
          <p className="mt-1 font-medium">{mail ? (mail.hasApiKey ? "Configured" : "Missing") : "-"}</p>
        </div>
        <div className="rounded-md bg-stone-50 p-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Sender</p>
          <p className="mt-1 break-words font-medium">{mail?.from || "-"}</p>
        </div>
      </div>
      {status?.lastError && (
        <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Last failed delivery</p>
          <p className="mt-1 break-words">{status.lastError}</p>
          {status.lastErrorAt && <p className="mt-1 text-xs text-red-700">{formatDate(status.lastErrorAt)}</p>}
        </div>
      )}
    </section>
  );
}

function AccessRequestQueue({
  requests,
  onDone,
  notify,
}: {
  requests: AccountRequest[];
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyRequestId, setBusyRequestId] = useState("");
  const [reviewError, setReviewError] = useState("");
  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  async function review(id: string, status: "approved" | "rejected") {
    setBusyRequestId(id);
    setReviewError("");
    try {
      const response = await api<{ accountRequest: AccountRequest }>(`/api/account-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNotes: notesById[id] || "" }),
      });
      const lastNotification = response.accountRequest.notifications?.at(-1);
      const notificationText = lastNotification ? ` Notification ${lastNotification.status}.` : "";
      notify(
        status === "approved"
          ? `Account approved.${notificationText}`
          : `Access request rejected.${notificationText}`,
      );
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to review the account request.";
      setReviewError(message);
      notify(message, "bad");
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <div className="rounded-md border border-stone-250 bg-white shadow-sm">
      <div className="border-b p-4">
        <h2 className="font-semibold">Account requests</h2>
        <p className="mt-1 text-sm text-stone-600">Approve access requests submitted from the login screen.</p>
        {reviewError && <div className="mt-3"><Notice message={reviewError} tone="bad" /></div>}
      </div>
      <div className="divide-y">
        {pending.map((request) => (
          <div key={request._id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{request.name}</h3>
                <p className="text-sm text-stone-600">{request.email}</p>
                {request.company && <p className="text-sm text-stone-600">{request.company}</p>}
              </div>
              <Badge tone="warn">Pending</Badge>
            </div>
            {request.reason && <p className="rounded-md bg-stone-100 p-3 text-sm text-stone-700">{request.reason}</p>}
            <NotificationList notifications={request.notifications || []} />
            <Field label="Review note">
              <input
                className={inputClass}
                value={notesById[request._id] || ""}
                onChange={(event) => setNotesById((current) => ({ ...current, [request._id]: event.target.value }))}
                placeholder="Optional note for the requester"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <ActionButton disabled={busyRequestId === request._id} onClick={() => void review(request._id, "approved")}>
                {busyRequestId === request._id ? "Reviewing..." : "Approve account"}
              </ActionButton>
              <ActionButton variant="secondary" disabled={busyRequestId === request._id} onClick={() => void review(request._id, "rejected")}>Reject</ActionButton>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="p-4 text-sm text-stone-500">No pending account requests.</div>}
      </div>
      {reviewed.length > 0 && (
        <div className="border-t p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">Reviewed</h3>
          <div className="space-y-2">
            {reviewed.slice(0, 6).map((request) => (
              <details key={request._id} className="rounded-md border border-stone-200 p-3 text-sm">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <span>{request.name} - {request.email}</span>
                  <Badge tone={request.status === "approved" ? "good" : "bad"}>{request.status === "approved" ? "Approved" : "Rejected"}</Badge>
                </summary>
                <div className="mt-3 grid gap-3">
                  {request.reviewNotes && <p className="rounded-md bg-stone-100 p-3 text-stone-700">{request.reviewNotes}</p>}
                  <NotificationList notifications={request.notifications || []} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationList({ notifications }: { notifications: NotificationRecord[] }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Notifications</h4>
        <CountPill label="Total" value={notifications.length} />
      </div>
      <div className="mt-3 space-y-3">
        {notifications.map((notification, index) => (
          <div key={`${notification.at}-${notification.type}-${index}`} className="grid gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={notificationTone(notification.status)}>{notification.status}</Badge>
              <span className="font-medium">{notification.type.replaceAll("_", " ")}</span>
            </div>
            <p className="text-stone-600">{notification.subject}</p>
            <p className="break-words text-stone-600">
              <Mail className="mr-1 inline" size={14} />
              {notification.recipients.length ? notification.recipients.join(", ") : "No recipients configured"}
            </p>
            {notification.error && <p className="text-red-700">{notification.error}</p>}
            <p className="text-xs text-stone-500">{formatDate(notification.at)}</p>
          </div>
        ))}
        {notifications.length === 0 && <p className="text-sm text-stone-500">No account notifications recorded yet.</p>}
      </div>
    </section>
  );
}

function UserTable({
  title,
  rows,
  busyEmail,
  searchActive,
  onUpdate,
  onDelete,
  managers = [],
}: {
  title: string;
  rows: AdminUserRow[];
  busyEmail: string;
  searchActive: boolean;
  onUpdate: (email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean; managerEmail?: string }) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
  managers?: AdminUserRow[];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-stone-500">Manage roles, team ownership, access status, and account safety.</p>
        </div>
        <CountPill label={searchActive ? "Matches" : "Users"} value={rows.length} />
      </div>
      <div className="hidden grid-cols-[minmax(230px,1.2fr)_150px_180px_150px_210px] gap-4 border-b border-stone-200 bg-stone-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 xl:grid">
        <span>User</span>
        <span>Role</span>
        <span>Team</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-stone-100">
        {rows.map((user) => {
          const isBusy = busyEmail === user.email;
          const initials = (user.name || user.email).slice(0, 2);
          const manager = managers.find((item) => item.email === user.managerEmail);
          return (
            <div
              key={`${title}-${user.email}`}
              className={`grid gap-3 px-4 py-4 transition-colors hover:bg-stone-50/60 xl:grid-cols-[minmax(230px,1.2fr)_150px_180px_150px_210px] xl:items-center xl:gap-4 ${isBusy ? "opacity-70" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold uppercase text-stone-500">
                  {initials}
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-stone-950">{user.name || user.email}</span>
                  {user.name && <span className="block truncate text-xs text-stone-500">{user.email}</span>}
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-stone-400">
                    <span>{user.lastLoginAt ? `Last login ${formatDate(user.lastLoginAt)}` : "No login yet"}</span>
                    <span className="truncate">{user.source}</span>
                  </div>
                </div>
              </div>
              <LabeledControl label="Role">
                <MiniSelect
                  value={user.role}
                  disabled={isBusy}
                  onChange={(value) => void onUpdate(user.email, { role: value as Role, accessEnabled: true })}
                  options={[
                    { value: "account_manager", label: roleLabel("account_manager") },
                    { value: "workspace_manager", label: roleLabel("workspace_manager") },
                    { value: "super_admin", label: roleLabel("super_admin") },
                  ]}
                />
              </LabeledControl>
              <LabeledControl label="Team">
                {user.role === "account_manager" ? (
                  <MiniSelect
                    value={user.managerEmail || ""}
                    disabled={isBusy || managers.length === 0}
                    onChange={(value) => void onUpdate(user.email, { managerEmail: value })}
                    options={[{ value: "", label: "Unassigned" }, ...managers.map((manager) => ({ value: manager.email, label: manager.name || manager.email }))]}
                  />
                ) : (
                  <p className="text-sm text-stone-500">{user.role === "super_admin" ? "Platform governance" : "Workspace operations"}</p>
                )}
                {user.managerEmail && <p className="mt-1 truncate text-[11px] text-stone-400">{manager?.email || user.managerEmail}</p>}
              </LabeledControl>
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">Status</span>
                <div className="mt-1 flex flex-wrap gap-2 xl:mt-0">
                  <Badge tone={user.status === "blocked" ? "bad" : "good"}>{user.status === "blocked" ? "Blocked" : "Active"}</Badge>
                  <Badge tone={user.accessEnabled ? "good" : "warn"}>{user.accessEnabled ? "Approved access" : "Access missing"}</Badge>
                </div>
              </div>
              <UserActions user={user} isBusy={isBusy} onUpdate={onUpdate} onDelete={onDelete} />
            </div>
          );
        })}
        {rows.length === 0 && <div className="p-6"><EmptyState text={searchActive ? "No users match the current search." : "No users have been created yet."} /></div>}
      </div>
    </div>
  );
}

function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{label}</span>
      <div className="mt-1 xl:mt-0">{children}</div>
    </div>
  );
}

function UserActions({
  user,
  isBusy,
  onUpdate,
  onDelete,
}: {
  user: AdminUserRow;
  isBusy: boolean;
  onUpdate: (email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean; managerEmail?: string }) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
}) {
  const blocking = user.status !== "blocked";
  return (
    <div className="flex flex-wrap items-center justify-start gap-1.5 xl:justify-end">
      <ActionButton
        variant="secondary"
        disabled={isBusy}
        className="min-h-8 px-3 text-[11px]"
        onClick={() => {
          if (!blocking || window.confirm(`Block ${user.email}? They will be signed out and unable to sign in until unblocked.`)) {
            void onUpdate(user.email, { status: blocking ? "blocked" : "active" });
          }
        }}
      >
        {isBusy ? "Working..." : user.status === "blocked" ? "Unblock" : "Block"}
      </ActionButton>
      {user.accessEnabled ? (
        <ActionButton
          variant="ghost"
          disabled={isBusy}
          className="min-h-8 px-3 text-[11px]"
          onClick={() => {
            if (window.confirm(`Disable access for ${user.email}? They will no longer be able to sign in.`)) {
              void onUpdate(user.email, { accessEnabled: false });
            }
          }}
        >
          Disable
        </ActionButton>
      ) : (
        <ActionButton variant="ghost" disabled={isBusy} className="min-h-8 px-3 text-[11px]" onClick={() => void onUpdate(user.email, { accessEnabled: true, role: user.role })}>
          Restore
        </ActionButton>
      )}
      <ActionButton
        variant="ghost"
        disabled={isBusy}
        className="min-h-8 px-3 text-[11px] text-red-600"
        onClick={() => void onDelete(user.email)}
      >
        Delete
      </ActionButton>
    </div>
  );
}

function MiniSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none truncate rounded-full border border-stone-200 bg-stone-50 py-1.5 pl-3 pr-6 text-xs font-medium text-stone-700 transition focus:border-[#EB6A1C] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
    </div>
  );
}

function NewRequestPanel({ events, onDone, notify }: { events: EventItem[]; outlets: Outlet[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
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
      ? "No published events or festivals are available."
      : validOutletRows.length === 0
        ? "Add at least one outlet client name."
        : ticketTypes.length === 0
          ? "The selected event or festival has no active ticket types."
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
      const successMessage =
        validOutletRows.length > 1
          ? `${validOutletRows.length} requests were sent to the manager for review.`
          : "Your request was sent to the manager for review.";
      setSubmittedMessage(successMessage);
      notify(successMessage);
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit the request.";
      setFormError(message);
      notify(message, "bad");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-5xl overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
      <PanelIntro
        eyebrow="New request"
        title="Request sponsorship tickets"
        description="Fill in the details below. A manager will review and respond."
      />
      <div className="space-y-0 px-5 pb-5">
      <Step title="1. Event or festival">
        <div className="grid gap-3">
          <Field label="Select the event or festival">
            <select name="eventId" className={inputClass} value={effectiveEventId} onChange={(event) => setEventId(event.target.value)} required disabled={published.length === 0}>
              {published.map((event) => <option key={event._id} value={event._id}>{event.name}{event.eventKind === "festival" ? " (Festival)" : ""}</option>)}
            </select>
          </Field>
          {selectedEvent && (
            <div className="space-y-1 rounded-md bg-stone-100 p-3 text-sm text-stone-700">
              <p>Up to <strong>{selectedEvent.maxTicketsPerOutlet}</strong> ticket{selectedEvent.maxTicketsPerOutlet === 1 ? "" : "s"} per outlet.</p>
            </div>
          )}
        </div>
      </Step>

      <Step title="2. Outlet clients">
        <div className="grid gap-3" aria-label="Outlet clients">
          {outletRows.map((outlet, index) => (
            <div key={outlet.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
              <Field label={index === 0 ? "Client name" : `Client name ${index + 1}`}>
                <input
                  value={outlet.name}
                  onChange={(event) => updateOutletName(outlet.id, event.target.value)}
                  autoFocus={index === 0}
                  placeholder="e.g. The Rooftop Bar"
                  className={inputClass}
                  required={index === 0}
                />
              </Field>
              <Field label="Quantity">
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
                    aria-label={`Remove outlet client ${index + 1}`}
                    title="Remove outlet"
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
                    aria-label="Add another outlet client"
                    title="Add outlet"
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

      <Step title="3. Tickets">
        <div className="grid gap-3">
          <Field label="Ticket type">
            <select name="ticketType" className={inputClass} disabled={ticketTypes.length === 0}>
              {ticketTypes.map((type) => <option key={type.name} value={type.name}>{type.name}</option>)}
            </select>
          </Field>
        </div>
      </Step>

      <Step title="4. Recipients and notes">
        <div className="grid gap-3">
          <Field label="Recipient emails" hint="Separate multiple addresses with commas. A manager can edit these later.">
            <input name="recipientEmails" type="text" inputMode="email" required placeholder="client@outlet.com, manager@agency.com" className={inputClass} />
          </Field>
          <Field label="Notes"><textarea name="notes" className={inputClass} rows={4} /></Field>
        </div>
      </Step>

      <Step title="5. Review">
        <div className="grid gap-3">
          {blockedReason && <Notice message={blockedReason} tone="bad" />}
          {formError && <Notice message={formError} tone="bad" />}
          {submittedMessage && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                <div className="grid gap-3">
                  <div>
                    <p className="font-semibold">Request sent</p>
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
                    Send another request
                  </ActionButton>
                </div>
              </div>
            </div>
          )}
          {!submittedMessage && <ActionButton disabled={Boolean(blockedReason) || submitting}>{submitting ? "Submitting request..." : "Submit request"}</ActionButton>}
        </div>
      </Step>
      </div>
    </form>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-stone-200 py-4 first:border-t-0 md:grid-cols-[180px_1fr]">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</h3>
      {children}
    </section>
  );
}

function AdminRequests({
  requests,
  events,
  outlets,
  quickFilter = "all",
  onClearQuickFilter,
  onDone,
  notify,
}: {
  requests: TicketRequest[];
  events: EventItem[];
  outlets: Outlet[];
  quickFilter?: RequestQuickFilter;
  onClearQuickFilter?: () => void;
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("");
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
    const matchesQuick =
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

  return (
    <div className="space-y-4">
      <ManagerAnalytics rows={managerStats} />
      <FlowMap />
      {quickFilter !== "all" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#ECDFC8] bg-[#FFFCF6] p-3 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#EB6A1C]">Today filter</p>
            <p className="text-sm font-medium text-stone-900">{requestQuickFilterLabel(quickFilter)}</p>
          </div>
          <ActionButton type="button" variant="secondary" onClick={onClearQuickFilter}>Clear filter</ActionButton>
        </div>
      )}
      <div className="grid gap-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="partially_approved">Partially approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <Field label="Event or festival">
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className={inputClass}>
            <option value="all">All events and festivals</option>
            {events.map((event) => <option key={event._id} value={event._id}>{event.name}{event.eventKind === "festival" ? " (Festival)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Outlet">
          <select value={outletFilter} onChange={(event) => setOutletFilter(event.target.value)} className={inputClass}>
            <option value="all">All outlets</option>
            {outlets.map((outlet) => <option key={outlet._id} value={outlet._id}>{outlet.name}</option>)}
          </select>
        </Field>
        <Field label="Account manager">
          <input value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} className={inputClass} placeholder="Search name or email" />
        </Field>
      </div>

      {filtered.map((request) => <RequestCard key={request._id} request={request} onDone={onDone} notify={notify} />)}
      {filtered.length === 0 && <EmptyState text="No requests match the current filters." />}
    </div>
  );
}

function mapSummary(values: Map<string, number>, fallback: string) {
  const rows = [...values.entries()].sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return fallback;
  return rows.slice(0, 3).map(([name, count]) => `${name} (${count})`).join(", ");
}

function ManagerAnalytics({ rows }: { rows: ManagerStat[] }) {
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

const miniMetricTones = {
  neutral: "border-stone-200 bg-stone-50 text-stone-950",
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-800",
} as const;

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className={`rounded-md border p-2 ${miniMetricTones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/15 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function FlowMap() {
  const steps = [
    ["1", "Request", "Account manager selects event, outlet, ticket type, quantity, and recipients."],
    ["2", "Review", "Manager checks rules, edits details, and confirms the final status."],
    ["3", "Approval", "Request is approved, partially approved, or rejected with notes."],
    ["4", "Send", "Ticket files are attached and sent by email without platform storage."],
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

function DropZoneFiles({ name }: { name: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  function setFiles(fileList: FileList | null) {
    if (inputRef.current) inputRef.current.files = fileList;
    setFileNames(fileList ? Array.from(fileList).map((file) => file.name) : []);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        setFiles(event.dataTransfer.files);
      }}
      className={`cursor-pointer rounded-md border-2 border-dashed p-5 text-center transition ${
        dragOver ? "border-[#EB6A1C] bg-[#ECDFC8]" : "border-stone-300 bg-stone-50 hover:border-stone-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        className="hidden"
        onChange={(event) => setFiles(event.target.files)}
      />
      <Send size={20} className="mx-auto text-stone-400" />
      <p className="mt-2 text-sm font-medium text-stone-700">Drag & drop ticket files here, or click to browse</p>
      <p className="mt-1 text-xs text-stone-500">PDF, PNG, JPG, or ZIP - up to 15 MB total.</p>
      {fileNames.length > 0 && (
        <ul className="mt-3 grid gap-1 text-left text-xs text-stone-700">
          {fileNames.map((fileName) => (
            <li key={fileName} className="truncate rounded bg-white px-2 py-1 border border-stone-200">{fileName}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SendTicketPanel({
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
  const [showSendWindow, setShowSendWindow] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingSend, setPendingSend] = useState<{ formData: FormData; form: HTMLFormElement; recipients: string[]; fileCount: number } | null>(null);
  const [draftRecipients, setDraftRecipients] = useState(request.recipientEmails.join(", "));
  const [draftSubject, setDraftSubject] = useState(`Bacardi tickets for ${request.event?.name}`);
  const [draftMessage, setDraftMessage] = useState(`Attached are the approved ticket files for ${request.event?.name}.`);
  const canSendTickets = request.status === "approved" || request.status === "partially_approved";
  const approvedTotal = request.items.reduce((sum, item) => sum + (item.approvedQuantity || 0), 0);
  const dispatchSummary = request.dispatches.reduce(
    (summary, dispatch) => {
      summary.total += 1;
      if (dispatch.status === "sent") summary.sent += 1;
      if (dispatch.status === "simulated") summary.simulated += 1;
      if (dispatch.status === "failed") summary.failed += 1;
      if (dispatch.status === "skipped") summary.skipped += 1;
      return summary;
    },
    { total: 0, sent: 0, simulated: 0, failed: 0, skipped: 0 },
  );

  useEffect(() => {
    if (!retrySeed) return;
    const timer = window.setTimeout(() => {
      setDraftRecipients(retrySeed.recipients);
      setDraftSubject(`Retry: Bacardi tickets for ${request.event?.name}`);
      setDraftMessage(`Attached are the approved ticket files for ${request.event?.name}. This retries a previous failed dispatch.`);
      setShowSendWindow(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [request.event?.name, retrySeed]);

  async function sendTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSendTickets) return notify("Approve or partially approve the request before sending ticket files.", "bad");
    const form = new FormData(event.currentTarget);
    const recipientList = splitEmails(String(form.get("recipients") || ""));
    const files = form.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    if (recipientList.length === 0) return notify("Add at least one recipient email before sending tickets.", "bad");
    if (files.length === 0) return notify("Attach at least one ticket file before sending.", "bad");
    setPendingSend({ formData: form, form: event.currentTarget, recipients: recipientList, fileCount: files.length });
  }

  async function confirmSendTicket() {
    if (!pendingSend) return;
    setSending(true);
    try {
      await api(`/api/requests/${request._id}/send-ticket`, { method: "POST", body: pendingSend.formData });
      pendingSend.form.reset();
      setDraftRecipients(request.recipientEmails.join(", "));
      setDraftSubject(`Bacardi tickets for ${request.event?.name}`);
      setDraftMessage(`Attached are the approved ticket files for ${request.event?.name}.`);
      setPendingSend(null);
      setShowSendWindow(false);
      notify("Ticket email sent or simulated. Check dispatch history for details.");
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? `Ticket email failed: ${error.message}` : "Ticket email failed. Check email configuration and retry manually.", "bad");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 p-3">
        <div>
          <h4 className="text-sm font-semibold">Ticket files</h4>
          <p className="text-sm text-stone-600">
            {canSendTickets
              ? `${approvedTotal || "Approved"} ticket${approvedTotal === 1 ? "" : "s"} ready to dispatch by email.`
              : "Approve or partially approve this request first, then send ticket files here."}
          </p>
          {dispatchSummary.total > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {dispatchSummary.sent > 0 && <Badge tone="good">{dispatchSummary.sent} sent</Badge>}
              {dispatchSummary.simulated > 0 && <Badge tone="neutral">{dispatchSummary.simulated} simulated</Badge>}
              {dispatchSummary.failed > 0 && <Badge tone="bad">{dispatchSummary.failed} failed</Badge>}
              {dispatchSummary.skipped > 0 && <Badge tone="warn">{dispatchSummary.skipped} skipped</Badge>}
            </div>
          )}
        </div>
        <ActionButton type="button" disabled={!canSendTickets} onClick={() => setShowSendWindow(true)}>
          <Send size={16} /> Send ticket files
        </ActionButton>
      </div>

      {showSendWindow && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Send ticket files</p>
                <h3 className="mt-1 text-xl font-semibold">{request.event?.name}</h3>
              </div>
              <ActionButton type="button" variant="ghost" className="min-h-9 px-2" onClick={() => setShowSendWindow(false)}>
                <X size={18} />
              </ActionButton>
            </div>
            <form onSubmit={sendTicket} className="mt-4 grid gap-3">
              <Field label="Email recipients" hint="Send to anyone - separate multiple addresses with a comma.">
                <input name="recipients" required value={draftRecipients} onChange={(event) => setDraftRecipients(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Subject">
                <input name="subject" required value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Message body">
                <textarea name="message" required value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} className={inputClass} rows={4} />
              </Field>
              <Field label="Ticket attachments" hint="Files are emailed now and are not stored as ticket inventory.">
                <DropZoneFiles name="files" />
              </Field>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <p className="font-semibold">Before sending</p>
                <p className="mt-1">Recipients and attached files are emailed now. Ticket files will not be saved in the platform.</p>
              </div>
              <ActionButton disabled={!canSendTickets}><Send size={16} /> Send ticket email</ActionButton>
            </form>
          </div>
        </div>
      )}

      {pendingSend && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 px-4">
          <div className="w-full max-w-md rounded-md border border-stone-200 bg-white p-5 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Confirm dispatch</p>
            <h3 className="mt-2 text-xl font-semibold">Send ticket files?</h3>
            <div className="mt-3 grid gap-2 rounded-md bg-stone-50 p-3 text-sm text-stone-700">
              <p><strong>Files:</strong> {pendingSend.fileCount} attachment{pendingSend.fileCount === 1 ? "" : "s"}</p>
              <p className="break-words"><strong>Recipients:</strong> {pendingSend.recipients.join(", ")}</p>
              <p className="text-xs text-stone-500">Files are emailed now and are not stored in the platform.</p>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <ActionButton variant="ghost" disabled={sending} onClick={() => setPendingSend(null)}>Cancel</ActionButton>
              <ActionButton disabled={sending} onClick={() => void confirmSendTicket()}>{sending ? "Sending..." : "Confirm send"}</ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RequestCard({ request, onDone, notify }: { request: TicketRequest; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
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
      notify(nextStatus === "approved" ? "Request approved." : "Request rejected.");
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the request.";
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
      return notify("Partial approval must approve at least one ticket but less than requested.", "bad");
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
      notify("Request updated.");
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the request.";
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
    <details className={`overflow-hidden rounded-md border border-l-4 border-stone-250 bg-white p-4 shadow-sm transition hover:shadow-md ${borderTones[statusTone(request.status)]}`}>
      <summary className="grid cursor-pointer list-none gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.9fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{request.event?.name}</h3>
            <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-stone-600">{request.outlet?.name}</p>
          <p className="mt-0.5 truncate text-xs text-stone-500" title={request.requestedBy}>
            {managerName}{request.accountManagerName ? ` · ${request.requestedBy}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
          <RequestMetric label="Requested" value={requestedTotal} />
          <RequestMetric label="Approved" value={approvedTotal} tone={approvedTotal > 0 ? "good" : "neutral"} />
          <RequestMetric label="Recipients" value={request.recipientEmails.length} />
          <RequestMetric label="Dispatches" value={dispatchCount} tone={dispatchCount > 0 ? "good" : "neutral"} />
        </div>
        <div className="flex items-center justify-end gap-2">
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
                <CheckCircle2 size={14} /> {quickAction === "approved" ? "Approving..." : "Approve"}
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
                <XCircle size={14} /> {quickAction === "rejected" ? "Rejecting..." : "Reject"}
              </ActionButton>
            </div>
          )}
          <span className="hidden whitespace-nowrap text-sm text-stone-500 md:inline">{formatShortDate(request.createdAt)}</span>
          <ChevronDown size={18} className="text-stone-400" />
        </div>
      </summary>

      <div className="mt-4 grid gap-4 border-t border-stone-200 pt-4">
        {actionError && <Notice message={actionError} tone="bad" />}
        <div className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 lg:grid-cols-3">
          <RequestInfo label="Ticket types" value={request.items.map((item) => `${item.ticketType} x${item.quantity}`).join(", ")} />
          <RequestInfo label="Recipients" value={request.recipientEmails.join(", ") || "No recipients"} />
          <RequestInfo label="Created" value={formatDate(request.createdAt)} />
        </div>
        {request.notes && (
          <section className="rounded-md border border-stone-200 bg-white p-3">
            <h4 className="text-sm font-semibold">Account manager notes</h4>
            <p className="mt-2 text-sm text-stone-700">{request.notes}</p>
          </section>
        )}

        <section className="rounded-md border border-stone-200 bg-stone-50 p-3">
          <h4 className="text-sm font-semibold">Approval quantities</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {request.items.map((item, index) => (
              <div key={`${item.ticketType}-${index}`} className="grid gap-2 rounded-md border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.ticketType}</span>
                  <Badge>Requested x{item.quantity}</Badge>
                </div>
                <Field label="Approved quantity">
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
          <Field label="Status">
            <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as RequestStatus)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="partially_approved">Partially approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          <Field label="Ticket recipient emails">
            <input className={inputClass} value={recipients} onChange={(event) => setRecipients(event.target.value)} />
          </Field>
          <Field label="Admin notes">
            <input className={inputClass} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} />
          </Field>
          <ActionButton variant="secondary" disabled={updating} onClick={update}>{updating ? "Saving..." : "Save"}</ActionButton>
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

function HistoryList({ history }: { history: TicketRequest["history"] }) {
  return (
    <section className="rounded-md border border-stone-200 p-3">
      <h4 className="text-sm font-semibold">Request history</h4>
      <div className="mt-3 space-y-3">
        {history.map((item, index) => (
          <div key={`${item.at}-${index}`} className="text-sm">
            <p className="font-medium">{renderHistoryAction(item.action)}</p>
            <p className="text-stone-600">{renderHistoryMessage(item.message)} - {item.by}</p>
            <p className="text-xs text-stone-500">{formatDate(item.at)}</p>
          </div>
        ))}
        {history.length === 0 && <p className="text-sm text-stone-500">No history yet.</p>}
      </div>
    </section>
  );
}

function DispatchList({
  dispatches,
  onRetry,
}: {
  dispatches: TicketRequest["dispatches"];
  onRetry?: (dispatch: TicketRequest["dispatches"][number]) => void;
}) {
  return (
    <section className="rounded-md border border-stone-200 p-3">
      <h4 className="text-sm font-semibold">Ticket dispatches</h4>
      <div className="mt-3 space-y-3">
        {dispatches.map((dispatch, index) => (
          <div key={`${dispatch.at}-${index}`} className={`rounded-md border p-3 text-sm ${dispatch.status === "failed" ? "border-red-200 bg-red-50" : "border-stone-100 bg-stone-50"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="break-words font-medium">
                <Mail className="mr-1 inline" size={14} /> {dispatch.recipients.join(", ")}
              </p>
              <Badge tone={dispatchTone(dispatch.status)}>{dispatchLabel(dispatch.status)}</Badge>
            </div>
            <p className="mt-1 text-stone-600">{dispatch.fileNames.join(", ") || "No file names recorded"}</p>
            <p className="mt-1 text-xs text-stone-500">{formatDate(dispatch.at)}</p>
            {dispatch.status === "failed" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-white/70 p-2">
                <p className="text-xs text-red-800">This email did not reach the recipients. Attach the files again and retry manually.</p>
                {onRetry && (
                  <ActionButton type="button" variant="secondary" className="min-h-8 px-2" onClick={() => onRetry(dispatch)}>
                    <RefreshCcw size={14} /> Retry
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        ))}
        {dispatches.length === 0 && <p className="text-sm text-stone-500">No ticket emails have been sent.</p>}
      </div>
    </section>
  );
}

function RequestMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50 text-stone-950",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function RequestInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 truncate font-medium text-stone-800" title={value}>{value}</p>
    </div>
  );
}

function MinePanel({ requests, onDone, notify }: { requests: TicketRequest[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const nextStep = (request: TicketRequest) => {
    if (request.status === "pending") return "Next: a manager reviews the outlet, quantities, recipients, and notes.";
    if (request.status === "approved") return request.dispatches.length > 0 ? "Tickets have been dispatched by email." : "Approved: you or the manager can now send ticket files by email.";
    if (request.status === "partially_approved") return request.dispatches.length > 0 ? "Partially approved tickets have been dispatched by email." : "Partially approved: you or the manager can now send the available tickets.";
    return "Rejected: review the manager note before creating a corrected request.";
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
            <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status)}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{request.items.map((item) => <Badge key={item.ticketType}>{item.ticketType} x{item.quantity}</Badge>)}</div>
          {request.adminNotes && <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm">{request.adminNotes}</p>}
          <p className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">{nextStep(request)}</p>
          <div className="mt-3">
            <SendTicketPanel request={request} onDone={onDone} notify={notify} />
          </div>
        </article>
      ))}
      {requests.length === 0 && <EmptyState text="You have not created any requests yet." />}
    </div>
  );
}

function SettingsPanel({ notify, onDone }: { notify: (message: string, tone?: Tone) => void; onDone: () => Promise<void> }) {
  const { data: session, update } = useSession();
  const role = session?.user?.role as Role | undefined;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedName, setLoadedName] = useState<string | null>(null);

  // Seed the editable fields once the session's name becomes available.
  // Adjusting state during render (React's recommended pattern for syncing
  // from a prop/external value) instead of an effect avoids an extra render.
  const sessionName = session?.user?.name ?? null;
  if (sessionName !== null && sessionName !== loadedName) {
    setLoadedName(sessionName);
    const [first, ...rest] = sessionName.trim().split(/\s+/).filter(Boolean);
    setFirstName(first || "");
    setLastName(rest.join(" "));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim()) return notify("First name is required.", "bad");
    setSaving(true);
    try {
      const result = await api<{ updatedRequests?: number }>("/api/profile", { method: "PATCH", body: JSON.stringify({ firstName, lastName }) });
      await update();
      await onDone();
      notify(`Profile updated everywhere${typeof result.updatedRequests === "number" ? ` across ${result.updatedRequests} request${result.updatedRequests === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update your profile.", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
            <UserCircle size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">My account</p>
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input className={inputClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </Field>
            <Field label="Last name">
              <input className={inputClass} value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
          </div>
          <Field label="Email" hint="Contact a manager to change the email tied to your account.">
            <input className={inputClass} value={session?.user?.email || ""} disabled />
          </Field>
          <Field label="Role" hint="Roles are managed by a manager in the Users section.">
            <div className="grid gap-2">
              <Badge tone={isWorkspaceManager(role) ? "good" : "neutral"}>{roleLabel(role)}</Badge>
              <p className="text-sm leading-6 text-stone-600">{roleDescription(role)}</p>
            </div>
          </Field>
          <div>
            <ActionButton disabled={saving}>{saving ? "Saving..." : "Save changes"}</ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}

type ReportRow = Record<string, string | number>;

type ManagerSummary = {
  key: string;
  manager: string;
  email: string;
  requests: number;
  tickets: number;
  approvedTickets: number;
  pending: number;
  approved: number;
  rejected: number;
  dispatches: number;
  outlets: Map<string, number>;
  events: Map<string, number>;
  latest?: string;
};

type FestivalSummary = {
  key: string;
  event: string;
  eventKind: string;
  requested: number;
  approvedTickets: number;
  pending: number;
  approved: number;
  rejected: number;
  outlets: Set<string>;
  dispatches: number;
  latest?: string;
  rows: ReportRow[];
};

type ReportFocus = {
  kind: "event" | "outlet";
  label: string;
};

const magnitudeRamp = ["#14b8a6", "#f59e0b", "#ef4444", "#6366f1", "#7A4A1C"];

const statusChartColors: Record<string, string> = {
  Pending: "#a8a29e",
  Approved: "#10b981",
  "Partially approved": "#f59e0b",
  Rejected: "#ef4444",
};

function rankedTotals(rows: ReportRow[], key: string, valueKey: "quantity" | "dispatches" = "quantity", limit = 8) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[key] || "Unknown").trim() || "Unknown";
    totals.set(label, (totals.get(label) ?? 0) + Number(row[valueKey] || 0));
  }
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function RankedBarChart({
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

function InsightMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: Tone }) {
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

function DispatchCoverageChart({ rows }: { rows: ReportRow[] }) {
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
      <p className="mt-0.5 text-xs text-stone-500">How many approved workflows already produced ticket emails.</p>
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
            <div className="flex justify-between gap-4 rounded-md bg-stone-50 px-3 py-2"><span>Requests with email dispatch</span><strong>{totals.dispatched}</strong></div>
            <div className="flex justify-between gap-4 rounded-md bg-stone-50 px-3 py-2"><span>Total request rows</span><strong>{totals.requests}</strong></div>
            <div className="flex justify-between gap-4 rounded-md bg-stone-50 px-3 py-2"><span>Ticket emails sent</span><strong>{totals.emails}</strong></div>
          </div>
        </div>
      )}
    </section>
  );
}

function EventPerformanceChart({ rows, onSelectEvent }: { rows: ReportRow[]; onSelectEvent?: (event: string) => void }) {
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

function TicketsOverTimeChart({ rows }: { rows: ReportRow[] }) {
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

function StatusBreakdownChart({ rows }: { rows: ReportRow[] }) {
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

function buildManagerSummaries(rows: ReportRow[]) {
  const map = new Map<string, ManagerSummary>();
    for (const row of rows) {
      const email = String(row.accountManagerEmail || row.accountManager || "Unknown manager").trim() || "Unknown manager";
      const manager = String(row.accountManager || email).trim() || email;
      const current =
        map.get(email) ??
        {
          key: email,
          manager,
          email,
          requests: 0,
          tickets: 0,
          approvedTickets: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          dispatches: 0,
          outlets: new Map<string, number>(),
          events: new Map<string, number>(),
          latest: undefined,
        };
      const status = String(row.status || "");
      current.requests += 1;
      current.tickets += Number(row.quantity || 0);
      current.approvedTickets += Number(row.approved || 0);
      current.dispatches += Number(row.dispatches || 0);
      if (status === "Pending") current.pending += 1;
      if (status === "Approved" || status === "Partially approved") current.approved += 1;
      if (status === "Rejected") current.rejected += 1;
      const outlet = String(row.outlet || "").trim();
      const event = String(row.event || "").trim();
      if (outlet) current.outlets.set(outlet, (current.outlets.get(outlet) ?? 0) + Number(row.quantity || 0));
      if (event) current.events.set(event, (current.events.get(event) ?? 0) + Number(row.quantity || 0));
      const createdAt = String(row.createdAt || "");
      if (createdAt && (!current.latest || new Date(createdAt) > new Date(current.latest))) current.latest = createdAt;
      current.manager = manager;
      map.set(email, current);
    }

  return [...map.values()].sort((a, b) => b.tickets - a.tickets || b.requests - a.requests);
}

function ManagerActivityMatrix({ rows, selectedManager, onSelectManager }: { rows: ReportRow[]; selectedManager: string | null; onSelectManager: (manager: string) => void }) {
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

function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{label}</span>
      <p className="font-semibold tabular-nums text-stone-950">{value}</p>
    </div>
  );
}

function TextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{label}</span>
      <p className="truncate text-sm text-stone-700" title={value}>{value}</p>
    </div>
  );
}

function summarizeReportRows(rows: ReportRow[]) {
  return rows.reduce(
    (summary, row) => {
      const status = String(row.status || "");
      summary.requests += 1;
      summary.tickets += Number(row.quantity || 0);
      summary.approvedTickets += Number(row.approved || 0);
      summary.dispatches += Number(row.dispatches || 0);
      if (status === "Pending") summary.pending += 1;
      if (status === "Approved" || status === "Partially approved") summary.approved += 1;
      if (status === "Rejected") summary.rejected += 1;
      const manager = String(row.accountManager || "").trim();
      const outlet = String(row.outlet || "").trim();
      const event = String(row.event || "").trim();
      if (manager) summary.managers.add(manager);
      if (outlet) summary.outlets.add(outlet);
      if (event) summary.events.add(event);
      const createdAt = String(row.createdAt || "");
      if (createdAt && (!summary.latest || new Date(createdAt) > new Date(summary.latest))) summary.latest = createdAt;
      return summary;
    },
    {
      requests: 0,
      tickets: 0,
      approvedTickets: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      dispatches: 0,
      managers: new Set<string>(),
      outlets: new Set<string>(),
      events: new Set<string>(),
      latest: "",
    },
  );
}

function reportSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "report";
}

function reportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function reportFilename(scope: string, extension: "csv" | "pdf") {
  return `bacardi-ticket-${reportSlug(scope)}-${reportDateStamp()}.${extension}`;
}

function reportCsv(rows: ReportRow[]) {
  const header = ["Event/Festival", "Type", "Market", "Outlet", "Account Manager", "Email", "Status", "Tickets", "Approved", "Dispatches", "Created"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) =>
    [row.event, row.eventKind, row.market, row.outlet, row.accountManager, row.accountManagerEmail, row.status, row.quantity, row.approved, row.dispatches, row.createdAt].map(escape).join(","),
  );
  return [header.map(escape).join(","), ...body].join("\n");
}

function downloadTextFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ManagerDrilldownPanel({
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
                <InsightMetric label="Ticket emails" value={summary.dispatches} detail={`Latest activity ${summary.latest ? formatShortDate(summary.latest) : "-"}.`} />
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

function ReportFocusPanel({
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

function ReportBreakdownList({ data, emptyText }: { data: [string, number][]; emptyText: string }) {
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

function AnalyticsSection({
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
        <InsightMetric label="Ticket emails" value={totalDispatches} detail="Dispatch records created after ticket files were sent." />
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
          subtitle="Outlets with the most ticket emails actually sent."
          data={rankedTotals(rows, "outlet", "dispatches")}
          emptyText="No ticket emails have been sent in the current filters."
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

function ReportsPanel() {
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

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">{text}</div>;
}
