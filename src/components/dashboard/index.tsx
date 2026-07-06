"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  Ticket,
  Users,
  X,
  XCircle,
} from "@/components/ui/solar-icons";
import { renderEventStatus, renderRequestStatus } from "@/lib/labels";
import { formatShortDate } from "@/lib/utils";
import type { AccountRequest, AppNotification, EventItem, GlobalSearchResult, Outlet, RequestQuickFilter, Role, TicketRequest, Tone } from "./types";
import { api, isSuperAdmin, isWorkspaceManager, requestApprovedWithoutDispatch, requestHasFailedDispatch, requestTicketTotal, roleLabel } from "./helpers";
import { ActionButton, Badge, Kpi, Notice } from "./ui-primitives";
import { NotificationDrawer } from "./notifications";
import { GlobalSearch } from "./global-search";
import { ManagerTodayPanel } from "./manager-today-panel";
import { EventsPanel } from "./events-panel";
import { UsersPanel } from "./users-panel";
import { AuditPanel } from "./audit-panel";
import { AdminRequests, MinePanel, NewRequestPanel } from "./requests-panel";
import { ReportsPanel } from "./reports-panel";
import { SettingsPanel } from "./settings-panel";
export { LoginScreen } from "./login-screen";

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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | AppNotification["category"]>("all");
  const [notice, setNotice] = useState<{ message: string; tone: Tone } | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestQuickFilter, setRequestQuickFilter] = useState<RequestQuickFilter>("attention");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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
          detail: `${event.eventKind === "festival" ? "Festival" : "Event"} - ${renderEventStatus(event.status)}${event.city ? ` - ${event.city}` : ""}`,
          tab: isWorkspaceManager(role) ? "events" : "new-request",
          eventId: event._id,
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
    if (result.eventId) setSelectedEventId(result.eventId);
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
                ? isSuperAdmin(role)
                  ? "Run the workspace cockpit: requests, events, users, reporting, notifications, and audit visibility."
                  : "Run the workspace cockpit: requests, events, reporting, notifications, and ticket dispatch."
                : "Create ticket requests and track approvals from one place."}
            </p>
          </div>
          {showWorkspaceKpis && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
              <Kpi label="Total Requests" value={kpis.total} icon={Ticket} tone="gold" />
              <Kpi label="Pending" value={kpis.pending} icon={Clock} tone="warn" />
              <Kpi label="Approved" value={kpis.approved} icon={CheckCircle2} tone="good" />
              <Kpi label="Rejected" value={kpis.rejected} icon={XCircle} tone="bad" />
              <Kpi label="Ticket Dispatches" value={kpis.sent} icon={Send} tone="neutral" />
            </div>
          )}

          {currentTab === "today" && isWorkspaceManager(role) && (
            <ManagerTodayPanel
              requests={requests}
              users={users}
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
              onQuickFilterChange={setRequestQuickFilter}
              onClearQuickFilter={() => setRequestQuickFilter("attention")}
              onDone={refresh}
              notify={showNotice}
            />
          )}
          {currentTab === "events" && (
            <EventsPanel
              events={events}
              requests={requests}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              onDone={refresh}
              notify={showNotice}
            />
          )}
          {currentTab === "users" && <UsersPanel users={users} onDone={refresh} notify={showNotice} />}
          {currentTab === "reports" && <ReportsPanel />}
          {currentTab === "audit" && isSuperAdmin(role) && <AuditPanel />}
          {currentTab === "new-request" && <NewRequestPanel events={events} outlets={outlets} onDone={refresh} notify={showNotice} />}
          {currentTab === "mine" && <MinePanel requests={requests} onDone={refresh} notify={showNotice} />}
          {currentTab === "settings" && <SettingsPanel notify={showNotice} onDone={refresh} />}
        </section>
      </div>
    </main>
  );
}


