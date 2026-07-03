"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
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
  Store,
  Ticket,
  Users,
  X,
} from "lucide-react";
import {
  renderEventStatus,
  renderHistoryAction,
  renderHistoryMessage,
  renderOutletStatus,
  renderRequestStatus,
  type EventStatus,
  type OutletStatus,
  type RequestStatus,
} from "@/lib/labels";
import { formatDate, formatShortDate, splitEmails } from "@/lib/utils";

type Role = "super_admin" | "account_manager";
type Tone = "neutral" | "good" | "warn" | "bad";

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
  status: "sent" | "simulated" | "failed" | "skipped";
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
  emailStatus: "sent" | "simulated" | "failed" | "skipped";
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
  role: Role;
  status?: "active" | "blocked";
  lastLoginAt?: string;
  accessEnabled?: boolean;
  source?: string;
};

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

const inputClass =
  "min-h-11 rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 shadow-sm transition focus:border-[#b8860b] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500";

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
    neutral: "border-stone-300 bg-white text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-red-200 bg-red-50 text-red-800",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
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
    <div className={`flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
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
    primary: "border border-[#1a1a18] bg-[#1a1a18] text-white hover:border-[#b8860b] hover:bg-[#b8860b] hover:text-[#1a1a18]",
    secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
    ghost: "text-stone-700 hover:bg-stone-100",
  };
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${classes[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState("amelillo@bacardi.com");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessName, setAccessName] = useState("");
  const [accessCompany, setAccessCompany] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [mode, setMode] = useState<"signin" | "request">("signin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    const result = await signIn("email", { email, redirect: false, callbackUrl: "/" });
    setSubmitting(false);
    if (result?.error) {
      setError("This email is not approved yet. Use Request access to send your details to a manager.");
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
      setAccessName("");
      setAccessCompany("");
      setAccessReason("");
      setMode("signin");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit access request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-stone-950">
      <section className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.9fr_1fr]">
        <div className="space-y-5">
          <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={116} height={116} className="h-28 w-28 object-contain" priority unoptimized />
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#b8860b]">Bacardi Ticket Hub</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-[#1a1a18] sm:text-5xl">
            Your platform for ticket requests.
          </h1>
        </div>

        <div className="border border-[#e8e8e6] bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b8860b]">Private access</p>
            <h2 className="mt-2 text-3xl font-semibold">{mode === "signin" ? "Sign in with email" : "Request an account"}</h2>
          </div>
          <div className="mb-5 grid grid-cols-2 border border-[#e8e8e6] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className={`min-h-10 text-xs font-semibold uppercase tracking-[0.16em] ${mode === "signin" ? "bg-[#1a1a18] text-white" : "text-stone-600"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("request");
                setError("");
              }}
              className={`min-h-10 text-xs font-semibold uppercase tracking-[0.16em] ${mode === "request" ? "bg-[#1a1a18] text-white" : "text-stone-600"}`}
            >
              Request access
            </button>
          </div>
          {mode === "signin" ? (
            <form className="grid gap-4" onSubmit={submitEmail}>
              <Field label="Email address" hint="Your email must already be approved by a manager. Anyone can request access from this screen.">
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </Field>
              {success && <Notice message={success} tone="good" />}
              {error && <Notice message={error} tone="bad" />}
              <ActionButton disabled={submitting}>{submitting ? "Checking access..." : "Enter hub"}</ActionButton>
            </form>
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
          )}
        </div>
      </section>
    </main>
  );
}

export function Dashboard() {
  const { data: session, status } = useSession();
  const role = session?.user?.role as Role | undefined;
  const [tab, setTab] = useState("requests");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [users, setUsers] = useState<{
    allowedUsers: { email: string; role: Role; createdBy?: string; createdAt?: string }[];
    profiles: { email: string; role: Role; status?: "active" | "blocked"; lastLoginAt?: string }[];
    accountRequests: AccountRequest[];
  }>({ allowedUsers: [], profiles: [], accountRequests: [] });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | AppNotification["category"]>("all");
  const [notice, setNotice] = useState<{ message: string; tone: Tone } | null>(null);
  const [loading, setLoading] = useState(false);

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
      if (role === "super_admin") {
        const userData = await api<typeof users>("/api/admin/users");
        setUsers(userData);
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
        : role === "super_admin"
        ? [
            ["requests", "Requests", Ticket],
            ["events", "Events & festivals", CalendarDays],
            ["outlets", "Outlets", Store],
            ["users", "Users", Users],
            ["reports", "Reports", BarChart3],
          ]
        : [
            ["new-request", "New request", Plus],
            ["mine", "My requests", Ticket],
          ],
    [role],
  );

  const currentTab = (tabs.some(([id]) => id === tab) ? tab : tabs[0]?.[0] ?? "requests") as string;
  const activeTab = tabs.find(([id]) => id === currentTab);
  const activeLabel = (activeTab?.[1] as string | undefined) ?? "Dashboard";

  function openTab(id: string) {
    setTab(id);
    setMobileNavOpen(false);
  }

  if (status === "loading" || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] px-6 text-stone-950">
        <div className="grid justify-items-center gap-4 text-center">
          <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={76} height={76} className="h-20 w-20 object-contain" priority unoptimized />
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b8860b]">Bacardi Ticket Hub</p>
          <p className="text-sm text-stone-600">Loading your workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-stone-950">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#fafaf8]/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" priority unoptimized />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b8860b]">Bacardi Ticket Hub</p>
              <h1 className="truncate text-lg font-semibold sm:text-xl">{activeLabel}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="hidden h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white lg:inline-flex"
              onClick={() => setSidebarCollapsed((current) => !current)}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="hidden items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 sm:flex">
              <Badge tone={role === "super_admin" ? "good" : "neutral"}>{role === "super_admin" ? "Manager" : "Account manager"}</Badge>
              <span className="max-w-[220px] truncate text-sm text-stone-600">{session?.user?.email}</span>
            </div>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white" onClick={() => void refresh()} title="Refresh">
              <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white"
              onClick={() => setNotificationsOpen(true)}
              title="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#b8860b] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white" onClick={() => signOut()} title="Sign out">
              <LogOut size={18} />
            </button>
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
            const target = category === "accounts" || category === "users" ? "users" : category === "outlets" ? "outlets" : category === "events" ? "events" : category === "reports" ? "reports" : role === "super_admin" ? "requests" : "mine";
            openTab(target);
            setNotificationsOpen(false);
          }}
          onRead={async (id, read) => {
            await api(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read }) });
            await loadNotifications();
          }}
          onReadAll={async () => {
            await api("/api/notifications/read-all", { method: "POST" });
            await loadNotifications();
          }}
        />
      )}

      <div className="mx-auto flex max-w-[1600px]">
        <aside
          className={`fixed inset-y-0 left-0 z-50 shrink-0 transform transition-all duration-200 lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100vh-4rem)] lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          } ${sidebarCollapsed ? "lg:w-[88px]" : "lg:w-[260px]"} w-[286px]`}
        >
          <div className="flex h-full flex-col border-r border-stone-200 bg-white shadow-xl lg:shadow-none">
            <div className={`flex h-20 items-center gap-3 border-b border-stone-200 px-4 ${sidebarCollapsed ? "lg:justify-center" : "justify-between"}`}>
              <div className={`flex min-w-0 items-center gap-3 ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
                <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={52} height={52} className="h-12 w-12 shrink-0 object-contain" unoptimized />
                <div className={`min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b8860b]">Bacardi</p>
                  <p className="truncate text-sm font-semibold">Ticket Hub</p>
                </div>
              </div>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {tabs.map(([id, label, Icon]) => (
                <button
                  key={id as string}
                  onClick={() => openTab(id as string)}
                  title={label as string}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                    currentTab === id ? "bg-[#1a1a18] text-white shadow-sm" : "text-stone-700 hover:bg-stone-100"
                  } ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className={`truncate ${sidebarCollapsed ? "lg:hidden" : ""}`}>{label as string}</span>
                </button>
              ))}
            </nav>

            <div className="border-t border-stone-200 p-3">
              <div className={`rounded-md bg-stone-50 p-3 ${sidebarCollapsed ? "lg:px-2" : ""}`}>
                <Badge tone={role === "super_admin" ? "good" : "neutral"}>{role === "super_admin" ? "Manager" : "Account manager"}</Badge>
                <p className={`mt-2 truncate text-xs text-stone-500 ${sidebarCollapsed ? "lg:hidden" : ""}`}>{session?.user?.email}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-5 px-4 py-4 sm:px-6 lg:px-8">
          {notice && <Notice message={notice.message} tone={notice.tone} />}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">Workspace</p>
              <h2 className="mt-1 text-2xl font-semibold">{activeLabel}</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              {role === "super_admin"
                ? "Manage requests, outlets, events, users, and reporting from one operational view."
                : "Create ticket requests and track approvals from one place."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <Kpi label="Total Requests" value={kpis.total} />
            <Kpi label="Pending" value={kpis.pending} />
            <Kpi label="Approved" value={kpis.approved} />
            <Kpi label="Rejected" value={kpis.rejected} />
            <Kpi label="Ticket Emails Sent" value={kpis.sent} />
          </div>

          {currentTab === "requests" && <AdminRequests requests={requests} events={events} outlets={outlets} onDone={refresh} notify={showNotice} />}
          {currentTab === "events" && <EventsPanel events={events} onDone={refresh} notify={showNotice} />}
          {currentTab === "outlets" && <OutletsPanel outlets={outlets} onDone={refresh} notify={showNotice} />}
          {currentTab === "users" && <UsersPanel users={users} onDone={refresh} notify={showNotice} />}
          {currentTab === "reports" && <ReportsPanel />}
          {currentTab === "new-request" && <NewRequestPanel events={events} outlets={outlets} onDone={refresh} notify={showNotice} />}
          {currentTab === "mine" && <MinePanel requests={requests} />}
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
  onReadAll,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  filter: "all" | "unread" | AppNotification["category"];
  onFilter: (filter: "all" | "unread" | AppNotification["category"]) => void;
  onClose: () => void;
  onOpenEntity: (category: AppNotification["category"]) => void;
  onRead: (id: string, read: boolean) => Promise<void>;
  onReadAll: () => Promise<void>;
}) {
  const filters: { id: "all" | "unread" | AppNotification["category"]; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "requests", label: "Requests" },
    { id: "accounts", label: "Accounts" },
    { id: "tickets", label: "Tickets" },
  ];

  return (
    <div className="fixed inset-0 z-[70]">
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label="Close notifications" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">Notifications</p>
            <h2 className="mt-1 text-xl font-semibold">Inbox</h2>
            <p className="mt-1 text-sm text-stone-600">{unreadCount} unread notification(s)</p>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-stone-200 p-3">
          {filters.map((item) => (
            <button
              key={item.id}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === item.id ? "border-[#1a1a18] bg-[#1a1a18] text-white" : "border-stone-200 bg-white text-stone-700"}`}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button className="ml-auto rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700" onClick={() => void onReadAll()}>
            Mark all read
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.map((notification) => (
            <article key={notification._id} className={`border-b border-stone-100 p-4 ${notification.read ? "bg-white" : "bg-amber-50/50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={notification.read ? "neutral" : "warn"}>{notification.read ? "Read" : "Unread"}</Badge>
                    <Badge tone={notification.emailStatus === "failed" ? "bad" : notification.emailStatus === "sent" ? "good" : "neutral"}>Email {notification.emailStatus}</Badge>
                  </div>
                  <h3 className="mt-2 font-semibold">{notification.title}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-stone-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-stone-500">{formatDate(notification.createdAt)} - {notification.actor}</p>
                  {notification.emailError && <p className="mt-1 text-xs text-red-700">{notification.emailError}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton variant="secondary" onClick={() => onOpenEntity(notification.category)}>Open context</ActionButton>
                <ActionButton variant="ghost" onClick={() => void onRead(notification._id, !notification.read)}>
                  Mark {notification.read ? "unread" : "read"}
                </ActionButton>
              </div>
            </article>
          ))}
          {notifications.length === 0 && <div className="p-4"><EmptyState text="No notifications match this filter." /></div>}
        </div>
      </aside>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-3 shadow-sm">
      <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function PanelIntro({ eyebrow, title, description, meta }: { eyebrow: string; title: string; description?: string; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">{eyebrow}</p>
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
  return date.toISOString().slice(0, 10);
}

function timeInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

function dateTimeFromForm(form: FormData) {
  const date = String(form.get("startsDate") || "");
  const time = String(form.get("startsTime") || "");
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

function EventsPanel({ events, onDone, notify }: { events: EventItem[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const [ticketTypes, setTicketTypes] = useState("Regular, VIP");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

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
          eventKind: form.get("eventKind"),
          sponsorshipName: form.get("sponsorshipName"),
          sponsorshipTier: form.get("sponsorshipTier"),
          market: form.get("market"),
          venue: form.get("venue"),
          city: form.get("city"),
          startsAt: dateTimeFromForm(form),
          status: form.get("status"),
          maxTicketsPerOutlet: form.get("maxTicketsPerOutlet"),
          description: form.get("description"),
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
    await api(`/api/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: data.get("name"),
        eventKind: data.get("eventKind"),
        sponsorshipName: data.get("sponsorshipName"),
        sponsorshipTier: data.get("sponsorshipTier"),
        market: data.get("market"),
        venue: data.get("venue"),
        city: data.get("city"),
        startsAt: dateTimeFromForm(data),
        status: data.get("status"),
        maxTicketsPerOutlet: data.get("maxTicketsPerOutlet"),
        description: data.get("description"),
        ticketTypes: String(data.get("ticketTypes") || "")
          .split(",")
          .map((name) => ({ name: name.trim(), active: true }))
          .filter((type) => type.name),
      }),
    });
    notify("Sponsored event or festival updated.");
    await onDone();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <form onSubmit={submit} className="space-y-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:h-fit">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">Setup</p>
          <h2 className="mt-1 text-lg font-semibold">Create sponsored item</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">Publish the event or festival before account managers can request tickets.</p>
        </div>
        <Field label="Event or festival name"><input name="name" required className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select name="eventKind" className={inputClass} defaultValue="event">
              <option value="event">Event</option>
              <option value="festival">Festival</option>
            </select>
          </Field>
          <Field label="Market"><input name="market" placeholder="Italy, Spain, Benelux..." className={inputClass} /></Field>
        </div>
        <Field label="Sponsorship name" hint="Example: Bacardi at Tomorrowland, Bacardi backstage experience.">
          <input name="sponsorshipName" className={inputClass} />
        </Field>
        <Field label="Sponsorship role"><input name="sponsorshipTier" placeholder="Main sponsor, pouring partner, VIP partner..." className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venue"><input name="venue" className={inputClass} /></Field>
          <Field label="City"><input name="city" className={inputClass} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input name="startsDate" type="date" className={inputClass} />
          </Field>
          <Field label="Time">
            <input name="startsTime" type="time" className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <select name="status" className={inputClass} defaultValue="published">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <Field label="Max tickets per outlet">
            <input name="maxTicketsPerOutlet" type="number" min={1} defaultValue={2} className={inputClass} />
          </Field>
        </div>
        <Field label="Ticket types" hint="Comma-separated, for example Regular, VIP, Backstage.">
          <input value={ticketTypes} onChange={(event) => setTicketTypes(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Description"><textarea name="description" className={inputClass} rows={3} /></Field>
        {formError && <Notice message={formError} tone="bad" />}
        <ActionButton disabled={creating}>{creating ? "Creating sponsored item..." : "Create sponsored item"}</ActionButton>
      </form>

      <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
        <PanelIntro
          eyebrow="Registry"
          title="Events and festivals"
          description="Open an item to adjust its status, ticket types, outlet rule, and sponsorship details."
          meta={<CountPill label="Items" value={events.length} />}
        />
        <div className="divide-y">
        {events.map((event) => (
          <details key={event._id} className="p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{event.name}</h3>
                <p className="text-sm text-stone-600">
                  {event.venue} {event.city ? `- ${event.city}` : ""} - {formatDate(event.startsAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge>{event.eventKind === "festival" ? "Festival" : "Event"}</Badge>
                  {event.market && <Badge>{event.market}</Badge>}
                  {event.sponsorshipTier && <Badge>{event.sponsorshipTier}</Badge>}
                </div>
                {event.sponsorshipName && <p className="mt-2 text-sm font-medium text-stone-700">{event.sponsorshipName}</p>}
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
                <Field label="Type">
                  <select name="eventKind" defaultValue={event.eventKind || "event"} className={inputClass}>
                    <option value="event">Event</option>
                    <option value="festival">Festival</option>
                  </select>
                </Field>
                <Field label="Market"><input name="market" defaultValue={event.market} className={inputClass} /></Field>
                <Field label="Sponsorship name"><input name="sponsorshipName" defaultValue={event.sponsorshipName} className={inputClass} /></Field>
                <Field label="Sponsorship role"><input name="sponsorshipTier" defaultValue={event.sponsorshipTier} className={inputClass} /></Field>
                <Field label="Venue"><input name="venue" defaultValue={event.venue} className={inputClass} /></Field>
                <Field label="City"><input name="city" defaultValue={event.city} className={inputClass} /></Field>
                <Field label="Date">
                  <input name="startsDate" type="date" defaultValue={dateInputValue(event.startsAt)} className={inputClass} />
                </Field>
                <Field label="Time">
                  <input name="startsTime" type="time" defaultValue={timeInputValue(event.startsAt)} className={inputClass} />
                </Field>
                <Field label="Max tickets per outlet"><input name="maxTicketsPerOutlet" type="number" min={1} defaultValue={event.maxTicketsPerOutlet} className={inputClass} /></Field>
              </div>
              <Field label="Ticket types"><input name="ticketTypes" defaultValue={event.ticketTypes.map((type) => type.name).join(", ")} className={inputClass} /></Field>
              <Field label="Description"><textarea name="description" defaultValue={event.description} className={inputClass} rows={3} /></Field>
              <ActionButton variant="secondary">Save sponsored item</ActionButton>
            </form>
          </details>
        ))}
        {events.length === 0 && <div className="p-4"><EmptyState text="No sponsored events or festivals have been created yet." /></div>}
        </div>
      </div>
    </div>
  );
}

function OutletsPanel({ outlets, onDone, notify }: { outlets: Outlet[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const pending = outlets.filter((outlet) => outlet.status === "pending");
  const approved = outlets.filter((outlet) => outlet.status === "approved");
  const archived = outlets.filter((outlet) => outlet.status === "archived");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/outlets", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), type: form.get("type"), city: form.get("city"), status: "approved" }),
    });
    event.currentTarget.reset();
    notify("Outlet added.");
    await onDone();
  }

  async function setStatus(id: string, status: OutletStatus) {
    await api(`/api/outlets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    notify(status === "approved" ? "Outlet approved." : "Outlet archived.");
    await onDone();
  }

  async function updateOutlet(id: string, payload: Partial<Outlet>) {
    await api(`/api/outlets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    notify("Outlet updated.");
    await onDone();
  }

  async function mergeOutlet(id: string, targetOutletId: string) {
    await api(`/api/outlets/${id}`, { method: "POST", body: JSON.stringify({ targetOutletId }) });
    notify("Outlet merged and request history preserved.");
    await onDone();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_1fr]">
      <form onSubmit={submit} className="space-y-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:h-fit">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">Outlet registry</p>
          <h2 className="mt-1 text-lg font-semibold">Add outlet</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">Create approved bars, clubs, restaurants, or venues for ticket requests.</p>
        </div>
        <Field label="Name"><input name="name" required className={inputClass} /></Field>
        <Field label="Type"><input name="type" placeholder="Bar, restaurant, club" className={inputClass} /></Field>
        <Field label="City"><input name="city" className={inputClass} /></Field>
        <ActionButton>Add outlet</ActionButton>
      </form>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <CountPill label="Pending" value={pending.length} />
          <CountPill label="Approved" value={approved.length} />
          <CountPill label="Archived" value={archived.length} />
        </div>
        <OutletGroup title="Pending proposed outlets" outlets={pending} allOutlets={outlets} onStatus={setStatus} onUpdate={updateOutlet} onMerge={mergeOutlet} description="Review outlets proposed by account managers before they become selectable." />
        <OutletGroup title="Approved outlets" outlets={approved} allOutlets={outlets} onStatus={setStatus} onUpdate={updateOutlet} onMerge={mergeOutlet} description="Approved outlets are available in the account manager request flow." />
        {archived.length > 0 && <OutletGroup title="Archived outlets" outlets={archived} allOutlets={outlets} onStatus={setStatus} onUpdate={updateOutlet} onMerge={mergeOutlet} description="Archived outlets stay in history but are removed from normal selection." />}
      </div>
    </div>
  );
}

function OutletGroup({
  title,
  outlets,
  allOutlets,
  onStatus,
  onUpdate,
  onMerge,
  description,
}: {
  title: string;
  outlets: Outlet[];
  allOutlets: Outlet[];
  onStatus: (id: string, status: OutletStatus) => Promise<void>;
  onUpdate: (id: string, payload: Partial<Outlet>) => Promise<void>;
  onMerge: (id: string, targetOutletId: string) => Promise<void>;
  description?: string;
}) {
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  return (
    <section className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
      <PanelIntro eyebrow="Outlets" title={title} description={description} meta={<CountPill label="Total" value={outlets.length} />} />
      <div className="divide-y">
        {outlets.map((outlet) => (
          <details key={outlet._id} className="p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{outlet.name}</h3>
                <p className="text-sm text-stone-600">
                  {outlet.type} {outlet.city ? `- ${outlet.city}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={outlet.status === "approved" ? "good" : outlet.status === "pending" ? "warn" : "bad"}>{renderOutletStatus(outlet.status)}</Badge>
                <ChevronDown size={18} />
              </div>
            </summary>
            <form
              className="mt-4 grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void onUpdate(outlet._id, {
                  name: String(data.get("name") || ""),
                  type: String(data.get("type") || ""),
                  city: String(data.get("city") || ""),
                  status: data.get("status") as OutletStatus,
                });
              }}
            >
              <Field label="Name"><input name="name" defaultValue={outlet.name} className={inputClass} required /></Field>
              <Field label="Type"><input name="type" defaultValue={outlet.type} className={inputClass} /></Field>
              <Field label="City"><input name="city" defaultValue={outlet.city} className={inputClass} /></Field>
              <Field label="Status">
                <select name="status" defaultValue={outlet.status} className={inputClass}>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending review</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <ActionButton variant="secondary">Save outlet</ActionButton>
                {outlet.status !== "approved" && <ActionButton type="button" variant="ghost" onClick={() => void onStatus(outlet._id, "approved")}>Approve</ActionButton>}
                {outlet.status !== "archived" && <ActionButton type="button" variant="ghost" onClick={() => void onStatus(outlet._id, "archived")}>Archive</ActionButton>}
              </div>
              <div className="grid gap-2 md:col-span-3 md:grid-cols-[1fr_auto]">
                <select
                  className={inputClass}
                  value={mergeTargets[outlet._id] || ""}
                  onChange={(event) => setMergeTargets((current) => ({ ...current, [outlet._id]: event.target.value }))}
                >
                  <option value="">Merge into another outlet...</option>
                  {allOutlets.filter((item) => item._id !== outlet._id && item.status === "approved").map((item) => (
                    <option key={item._id} value={item._id}>{item.name} - {item.city || "No city"}</option>
                  ))}
                </select>
                <ActionButton type="button" variant="secondary" disabled={!mergeTargets[outlet._id]} onClick={() => void onMerge(outlet._id, mergeTargets[outlet._id])}>
                  Merge
                </ActionButton>
              </div>
            </form>
          </details>
        ))}
        {outlets.length === 0 && <div className="p-4"><EmptyState text="No outlets in this group." /></div>}
      </div>
    </section>
  );
}

function UsersPanel({
  users,
  onDone,
  notify,
}: {
  users: {
    allowedUsers: { email: string; role: Role; createdBy?: string; createdAt?: string }[];
    profiles: { email: string; role: Role; status?: "active" | "blocked"; lastLoginAt?: string }[];
    accountRequests: AccountRequest[];
  };
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await api<{ delivery?: { status: string } }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), role: form.get("role") }),
    });
    event.currentTarget.reset();
    notify(`User access updated. Notification ${response.delivery?.status || "skipped"}.`);
    await onDone();
  }

  async function updateUser(email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean }) {
    await api(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    notify("User updated.");
    await onDone();
  }

  const allowedMap = new Map(users.allowedUsers.map((user) => [user.email, user]));
  const profileMap = new Map(users.profiles.map((profile) => [profile.email, profile]));
  const combinedRows: AdminUserRow[] = [...new Set([...users.allowedUsers.map((user) => user.email), ...users.profiles.map((profile) => profile.email)])]
    .map((email) => {
      const allowed = allowedMap.get(email);
      const profile = profileMap.get(email);
      return {
        email,
        role: (profile?.role || allowed?.role || "account_manager") as Role,
        status: profile?.status || "active",
        lastLoginAt: profile?.lastLoginAt,
        accessEnabled: Boolean(allowed),
        source: allowed ? `Approved${allowed.createdBy ? ` by ${allowed.createdBy}` : ""}` : "Profile only",
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_1fr]">
      <form onSubmit={submit} className="space-y-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:h-fit">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">Access control</p>
          <h2 className="text-lg font-semibold">Create account access</h2>
          <p className="mt-1 text-sm text-stone-600">Create an approved account directly, or review requests from the queue.</p>
        </div>
        <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
        <Field label="Role">
          <select name="role" className={inputClass}>
            <option value="account_manager">Account manager</option>
            <option value="super_admin">Manager</option>
          </select>
        </Field>
        <ActionButton>Enable access</ActionButton>
      </form>
      <div className="space-y-5">
        <AccessRequestQueue requests={users.accountRequests} onDone={onDone} notify={notify} />
        <UserTable title="Users and access" rows={combinedRows} onUpdate={updateUser} />
      </div>
    </div>
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
  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  async function review(id: string, status: "approved" | "rejected") {
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
  }

  return (
    <div className="rounded-md border border-stone-250 bg-white shadow-sm">
      <div className="border-b p-4">
        <h2 className="font-semibold">Account requests</h2>
        <p className="mt-1 text-sm text-stone-600">Approve access requests submitted from the login screen.</p>
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
              <ActionButton onClick={() => void review(request._id, "approved")}>Approve account</ActionButton>
              <ActionButton variant="secondary" onClick={() => void review(request._id, "rejected")}>Reject</ActionButton>
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

function UserTable({ title, rows, onUpdate }: { title: string; rows: AdminUserRow[]; onUpdate: (email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean }) => Promise<void> }) {
  return (
    <div className="rounded-md border border-stone-250 bg-white shadow-sm">
      <div className="border-b p-4"><h2 className="font-semibold">{title}</h2></div>
      <div className="divide-y">
        {rows.map((user) => (
          <div key={`${title}-${user.email}`} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_220px_220px_auto] lg:items-center">
            <div>
              <span className="text-sm font-medium">{user.email}</span>
              {user.lastLoginAt && <p className="text-xs text-stone-500">Last login {formatDate(user.lastLoginAt)}</p>}
              <p className="text-xs text-stone-500">{user.source}</p>
            </div>
            <Field label="Role">
              <select
                className={inputClass}
                value={user.role}
                onChange={(event) => void onUpdate(user.email, { role: event.target.value as Role, accessEnabled: true })}
              >
                <option value="account_manager">Account manager</option>
                <option value="super_admin">Manager</option>
              </select>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={user.status === "blocked" ? "bad" : "good"}>{user.status === "blocked" ? "Blocked" : "Active"}</Badge>
              <Badge tone={user.accessEnabled ? "good" : "warn"}>{user.accessEnabled ? "Approved access" : "Approval missing"}</Badge>
            </div>
            <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
              <ActionButton variant="secondary" onClick={() => void onUpdate(user.email, { status: user.status === "blocked" ? "active" : "blocked" })}>
                {user.status === "blocked" ? "Unblock" : "Block"}
              </ActionButton>
              {user.accessEnabled ? (
                <ActionButton variant="ghost" onClick={() => void onUpdate(user.email, { accessEnabled: false })}>Disable access</ActionButton>
              ) : (
                <ActionButton variant="ghost" onClick={() => void onUpdate(user.email, { accessEnabled: true, role: user.role })}>Approve access</ActionButton>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="p-4 text-sm text-stone-500">No users found.</div>}
      </div>
    </div>
  );
}

function NewRequestPanel({ events, outlets, onDone, notify }: { events: EventItem[]; outlets: Outlet[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const published = events.filter((event) => event.status === "published");
  const approvedOutlets = outlets.filter((outlet) => outlet.status === "approved");
  const [eventId, setEventId] = useState("");
  const [useNewOutlet, setUseNewOutlet] = useState(false);
  const [outletSearch, setOutletSearch] = useState("");
  const effectiveEventId = eventId || published[0]?._id || "";
  const selectedEvent = published.find((event) => event._id === effectiveEventId);
  const ticketTypes = selectedEvent?.ticketTypes.filter((type) => type.active) ?? [];
  const filteredOutlets = approvedOutlets.filter((outlet) =>
    `${outlet.name} ${outlet.city} ${outlet.type}`.toLowerCase().includes(outletSearch.toLowerCase()),
  );
  const blockedReason =
    published.length === 0
      ? "No published events or festivals are available."
      : !useNewOutlet && filteredOutlets.length === 0
        ? "No approved outlets match the current search."
        : ticketTypes.length === 0
          ? "The selected event or festival has no active ticket types."
          : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockedReason) return notify(blockedReason, "bad");
    const form = new FormData(event.currentTarget);
    await api("/api/requests", {
      method: "POST",
      body: JSON.stringify({
        eventId: form.get("eventId"),
        outletId: useNewOutlet ? undefined : form.get("outletId"),
        newOutlet: useNewOutlet
          ? { name: form.get("newOutletName"), type: form.get("newOutletType"), city: form.get("newOutletCity") }
          : undefined,
        recipientEmails: form.get("recipientEmails"),
        items: [{ ticketType: form.get("ticketType"), quantity: form.get("quantity") }],
        notes: form.get("notes"),
      }),
    });
    event.currentTarget.reset();
    setOutletSearch("");
    setUseNewOutlet(false);
    notify("Request submitted for manager review.");
    await onDone();
  }

  return (
    <form onSubmit={submit} className="max-w-5xl overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
      <PanelIntro
        eyebrow="Request flow"
        title="New sponsorship ticket request"
        description="Complete the steps in order. The manager can still edit recipients, notes, and final status before sending ticket files."
      />
      <div className="space-y-0 px-5 pb-5">
      <Step title="1. Event or festival">
        <div className="grid gap-3">
          <Field label="Sponsored event or festival">
            <select name="eventId" className={inputClass} value={effectiveEventId} onChange={(event) => setEventId(event.target.value)} required disabled={published.length === 0}>
              {published.map((event) => <option key={event._id} value={event._id}>{event.name}{event.eventKind === "festival" ? " (Festival)" : ""}</option>)}
            </select>
          </Field>
          {selectedEvent && (
            <div className="space-y-1 rounded-md bg-stone-100 p-3 text-sm text-stone-700">
              <p>{selectedEvent.name} allows up to <strong>{selectedEvent.maxTicketsPerOutlet}</strong> ticket(s) per outlet.</p>
              <p>{selectedEvent.sponsorshipName || "Bacardi sponsored activation"}{selectedEvent.market ? ` - ${selectedEvent.market}` : ""}</p>
            </div>
          )}
        </div>
      </Step>

      <Step title="2. Outlet">
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={useNewOutlet} onChange={(event) => setUseNewOutlet(event.target.checked)} />
            Propose a new outlet
          </label>
          {useNewOutlet ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Outlet name"><input name="newOutletName" className={inputClass} required={useNewOutlet} /></Field>
              <Field label="Type"><input name="newOutletType" placeholder="Bar, restaurant, club" className={inputClass} /></Field>
              <Field label="City"><input name="newOutletCity" className={inputClass} /></Field>
            </div>
          ) : (
            <div className="grid gap-3">
              <Field label="Search outlet">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-stone-400" size={16} />
                  <input value={outletSearch} onChange={(event) => setOutletSearch(event.target.value)} className={`${inputClass} w-full pl-9`} placeholder="Search by name, city, or type" />
                </div>
              </Field>
              <Field label="Outlet">
                <select name="outletId" className={inputClass} required={!useNewOutlet} disabled={filteredOutlets.length === 0}>
                  {filteredOutlets.map((outlet) => <option key={outlet._id} value={outlet._id}>{outlet.name} - {outlet.city || "No city"}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      </Step>

      <Step title="3. Tickets">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ticket type">
            <select name="ticketType" className={inputClass} disabled={ticketTypes.length === 0}>
              {ticketTypes.map((type) => <option key={type.name} value={type.name}>{type.name}</option>)}
            </select>
          </Field>
          <Field label="Quantity">
            <input name="quantity" type="number" min={1} max={selectedEvent?.maxTicketsPerOutlet ?? undefined} defaultValue={1} className={inputClass} />
          </Field>
        </div>
      </Step>

      <Step title="4. Recipients and notes">
        <div className="grid gap-3">
          <Field label="Suggested recipient emails" hint="The manager can edit these before sending ticket files.">
            <input name="recipientEmails" type="email" multiple required placeholder="client@outlet.com, manager@agency.com" className={inputClass} />
          </Field>
          <Field label="Request notes"><textarea name="notes" className={inputClass} rows={4} /></Field>
        </div>
      </Step>

      <Step title="5. Review">
        <div className="grid gap-3">
          <p className="text-sm text-stone-600">
            The manager will review this request, update the final status, and send ticket files by email attachment.
          </p>
          {blockedReason && <Notice message={blockedReason} tone="bad" />}
          <ActionButton disabled={Boolean(blockedReason)}>Submit request</ActionButton>
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

function AdminRequests({ requests, events, outlets, onDone, notify }: { requests: TicketRequest[]; events: EventItem[]; outlets: Outlet[]; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
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
    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    const matchesEvent = eventFilter === "all" || request.event?._id === eventFilter;
    const matchesOutlet = outletFilter === "all" || request.outlet?._id === outletFilter;
    const matchesManager = !managerFilter || request.requestedBy.toLowerCase().includes(managerFilter.toLowerCase());
    return matchesStatus && matchesEvent && matchesOutlet && matchesManager;
  });

  return (
    <div className="space-y-4">
      <ManagerAnalytics rows={managerStats} />
      <FlowMap />
      <div className="grid gap-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm lg:grid-cols-4">
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
          <input value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} className={inputClass} placeholder="Search email" />
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
      <div className="rounded-md border border-[#1a1a18] bg-[#1a1a18] p-5 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d5a51b]">Manager performance</p>
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
                <span className="text-[#d5a51b]">{row.requests} requests</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#d5a51b]" style={{ width: `${Math.max(8, (row.requests / maxRequests) * 100)}%` }} />
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b bg-stone-50 text-xs uppercase tracking-[0.12em] text-stone-500">
              <tr>
                <th className="px-4 py-3">Account manager</th>
                <th>Requests</th>
                <th>Tickets</th>
                <th>Approved</th>
                <th>Pending</th>
                <th>Rejected</th>
                <th>Outlets</th>
                <th>Events/Festivals</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.email}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-stone-500">{row.email}</p>
                  </td>
                  <td>{row.requests}</td>
                  <td>{row.tickets}</td>
                  <td>{row.approved}</td>
                  <td>{row.pending}</td>
                  <td>{row.rejected}</td>
                  <td className="max-w-[220px] text-stone-600">{mapSummary(row.outlets, "No outlets")}</td>
                  <td className="max-w-[220px] text-stone-600">{mapSummary(row.events, "No events")}</td>
                  <td>{row.latestRequest ? formatShortDate(row.latestRequest) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState text="No account manager statistics are available yet." />}
      </div>
    </section>
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
          <div key={number} className="border-l-2 border-[#d5a51b] pl-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b8860b]">Step {number}</span>
            <h3 className="mt-1 font-semibold">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-stone-600">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RequestCard({ request, onDone, notify }: { request: TicketRequest; onDone: () => Promise<void>; notify: (message: string, tone?: Tone) => void }) {
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [adminNotes, setAdminNotes] = useState(request.adminNotes || "");
  const [recipients, setRecipients] = useState(request.recipientEmails.join(", "));
  const [approvedByIndex, setApprovedByIndex] = useState<Record<number, number>>(() =>
    Object.fromEntries(request.items.map((item, index) => [index, item.approvedQuantity ?? (request.status === "approved" ? item.quantity : 0)])),
  );
  const [pendingSend, setPendingSend] = useState<{ formData: FormData; form: HTMLFormElement; recipients: string[]; fileCount: number } | null>(null);
  const defaultMessage = `Attached are the approved ticket file(s) for ${request.event?.name}, part of the Bacardi sponsorship ticket program.`;

  async function update() {
    const nextItems = request.items.map((item, index) => {
      const partialApproved = Math.min(Math.max(Number(approvedByIndex[index] ?? 0), 0), item.quantity);
      return {
        ...item,
        approvedQuantity: status === "approved" ? item.quantity : status === "rejected" || status === "pending" ? 0 : partialApproved,
      };
    });
    const requestedTotal = request.items.reduce((sum, item) => sum + item.quantity, 0);
    const approvedTotal = nextItems.reduce((sum, item) => sum + (item.approvedQuantity || 0), 0);
    if (status === "partially_approved" && (approvedTotal <= 0 || approvedTotal >= requestedTotal)) {
      return notify("Partial approval must approve at least one ticket but less than requested.", "bad");
    }
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
  }

  async function sendTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const recipientList = splitEmails(String(form.get("recipients") || ""));
    const files = form.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    if (recipientList.length === 0) return notify("Add at least one recipient email before sending tickets.", "bad");
    if (files.length === 0) return notify("Attach at least one ticket file before sending.", "bad");
    setPendingSend({ formData: form, form: event.currentTarget, recipients: recipientList, fileCount: files.length });
  }

  async function confirmSendTicket() {
    if (!pendingSend) return;
    await api<{ delivery: { status: string } }>(`/api/requests/${request._id}/send-ticket`, { method: "POST", body: pendingSend.formData });
    pendingSend.form.reset();
    setPendingSend(null);
    notify("Ticket email sent or simulated. Check dispatch history for details.");
    await onDone();
  }

  return (
    <details className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
      <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[1.5fr_1fr_auto] md:items-center">
        <div>
          <h3 className="text-lg font-semibold">{request.event?.name}</h3>
          <p className="text-sm text-stone-600">
            {request.outlet?.name} - {request.requestedBy}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.items.map((item) => <Badge key={item.ticketType}>{item.ticketType} x{item.quantity}</Badge>)}
          <Badge tone={statusTone(request.status)}>{renderRequestStatus(request.status)}</Badge>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-stone-500 md:justify-end">
          {formatShortDate(request.createdAt)}
          <ChevronDown size={18} />
        </div>
      </summary>

      <div className="mt-4 grid gap-4 border-t border-stone-200 pt-4">
        {request.notes && <p className="rounded-md bg-stone-100 p-3 text-sm text-stone-700">{request.notes}</p>}

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

        <div className="grid gap-3 lg:grid-cols-[180px_1fr_1fr_auto]">
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
          <ActionButton className="mt-6" variant="secondary" onClick={update}>Save</ActionButton>
        </div>

        <form onSubmit={sendTicket} className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 lg:grid-cols-2">
          <Field label="Email recipients">
            <input name="recipients" required defaultValue={request.recipientEmails.join(", ")} className={inputClass} />
          </Field>
          <Field label="Subject">
            <input name="subject" required defaultValue={`Bacardi tickets for ${request.event?.name}`} className={inputClass} />
          </Field>
          <Field label="Message body">
            <textarea name="message" required defaultValue={defaultMessage} className={inputClass} rows={4} />
          </Field>
          <Field label="Ticket attachments" hint="Files are emailed now and are not stored as ticket inventory.">
            <input name="files" type="file" multiple required className={inputClass} />
          </Field>
          <div className="lg:col-span-2">
            <ActionButton><Send size={16} /> Send ticket email</ActionButton>
          </div>
        </form>

        {pendingSend && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 px-4">
            <div className="w-full max-w-md rounded-md border border-stone-200 bg-white p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8860b]">Confirm dispatch</p>
              <h3 className="mt-2 text-xl font-semibold">Send ticket files?</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Send {pendingSend.fileCount} attachment(s) to {pendingSend.recipients.join(", ")}. Files are emailed now and are not stored in the platform.
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <ActionButton variant="ghost" onClick={() => setPendingSend(null)}>Cancel</ActionButton>
                <ActionButton onClick={() => void confirmSendTicket()}>Confirm send</ActionButton>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <HistoryList history={request.history} />
          <DispatchList dispatches={request.dispatches} />
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

function DispatchList({ dispatches }: { dispatches: TicketRequest["dispatches"] }) {
  return (
    <section className="rounded-md border border-stone-200 p-3">
      <h4 className="text-sm font-semibold">Ticket dispatches</h4>
      <div className="mt-3 space-y-3">
        {dispatches.map((dispatch, index) => (
          <div key={`${dispatch.at}-${index}`} className="text-sm">
            <p className="font-medium">
              <Mail className="mr-1 inline" size={14} /> {dispatch.recipients.join(", ")}
            </p>
            <p className="text-stone-600">{dispatch.fileNames.join(", ") || "No file names recorded"}</p>
            <Badge tone={dispatch.status === "sent" ? "good" : dispatch.status === "failed" ? "bad" : "warn"}>{dispatch.status}</Badge>
          </div>
        ))}
        {dispatches.length === 0 && <p className="text-sm text-stone-500">No ticket emails have been sent.</p>}
      </div>
    </section>
  );
}

function MinePanel({ requests }: { requests: TicketRequest[] }) {
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
          <p className="mt-3 text-sm text-stone-600">Ticket files are sent by email from the manager to the agreed recipients.</p>
        </article>
      ))}
      {requests.length === 0 && <EmptyState text="You have not created any requests yet." />}
    </div>
  );
}

function ReportsPanel() {
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [reportSearch, setReportSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [exportNotice, setExportNotice] = useState<{ message: string; tone: Tone } | null>(null);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesStatus = statusFilter === "all" || String(row.status) === renderRequestStatus(statusFilter);
        const haystack = [row.event, row.eventKind, row.market, row.outlet, row.accountManager, row.status].join(" ").toLowerCase();
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

  const load = useCallback(async () => {
    const params = reportParams();
    const data = await api<{ rows: Record<string, string | number>[] }>(`/api/reports?${params.toString()}`);
    setRows(data.rows);
  }, [reportParams]);

  const loadAuditLogs = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "120");
    if (auditActor) params.set("actor", auditActor);
    if (auditAction) params.set("action", auditAction);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const data = await api<{ logs: AuditLogItem[] }>(`/api/audit-logs?${params.toString()}`);
    setAuditLogs(data.logs);
  }, [auditAction, auditActor, dateFrom, dateTo]);

  async function exportPdf() {
    setExportNotice(null);
    try {
      await api(`/api/reports?${reportParams({ export: "pdf" }).toString()}`);
    } catch (error) {
      setExportNotice({ message: error instanceof Error ? error.message : "Unable to audit the PDF export.", tone: "bad" });
      return;
    }
    const [{ default: jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.text("Bacardi Ticket Hub Report", 14, 14);
    autoTable.default(doc, {
      head: [["Event/Festival", "Type", "Market", "Outlet", "Account Manager", "Status", "Tickets", "Dispatches"]],
      body: filteredRows.map((row) => [row.event, row.eventKind, row.market, row.outlet, row.accountManager, row.status, row.quantity, row.dispatches]),
      startY: 22,
    });
    doc.save("bacardi-ticket-report.pdf");
    setExportNotice({ message: "PDF exported and audit log updated.", tone: "good" });
    await loadAuditLogs();
  }

  async function exportCsv() {
    setExportNotice(null);
    const response = await fetch(`/api/reports?${reportParams({ format: "csv" }).toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Unable to export CSV." }));
      setExportNotice({ message: payload.error || "Unable to export CSV.", tone: "bad" });
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "bacardi-ticket-report.csv";
    link.click();
    URL.revokeObjectURL(url);
    setExportNotice({ message: "CSV exported and audit log updated.", tone: "good" });
    await loadAuditLogs();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAuditLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAuditLogs]);

  const formatAuditPayload = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return "";
    const text = JSON.stringify(payload);
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Request report</h2>
          <div className="flex gap-2">
            <ActionButton variant="secondary" onClick={() => void exportCsv()}>
              <Download size={16} /> CSV
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => void exportPdf()}>
              <Download size={16} /> PDF
            </ActionButton>
          </div>
        </div>
        {exportNotice && <div className="mt-4"><Notice message={exportNotice.message} tone={exportNotice.tone} /></div>}
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_180px_180px]">
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
            <input className={inputClass} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <input className={inputClass} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
        </div>
        <div className="mt-4 overflow-x-auto">
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
                  <td>{row.accountManager}</td>
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

      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Audit log</h2>
            <p className="mt-1 text-sm text-stone-600">Tracked manager actions, request changes, dispatches, user updates, and report exports.</p>
          </div>
          <ActionButton variant="secondary" onClick={() => void loadAuditLogs()}>
            <RefreshCcw size={16} /> Refresh
          </ActionButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Actor">
            <input className={inputClass} value={auditActor} onChange={(event) => setAuditActor(event.target.value)} placeholder="Filter by manager email" />
          </Field>
          <Field label="Action">
            <input className={inputClass} value={auditAction} onChange={(event) => setAuditAction(event.target.value)} placeholder="Example: request, dispatch, report" />
          </Field>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b text-stone-600">
              <tr><th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
            </thead>
            <tbody className="divide-y">
              {auditLogs.map((log) => (
                <tr key={log._id}>
                  <td className="py-3 whitespace-nowrap">{formatShortDate(log.createdAt)}</td>
                  <td>{log.actor}</td>
                  <td>{log.action}</td>
                  <td>{log.target || "-"}</td>
                  <td className="max-w-[420px] truncate text-stone-600">{formatAuditPayload(log.payload) || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {auditLogs.length === 0 && <EmptyState text="No audit records match the current filters." />}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">{text}</div>;
}
