import type { ManagerSummary, NotificationRecord, ReportRow, RequestQuickFilter, Role, TicketRequest, Tone } from "./types";
import type { RequestStatus } from "@/lib/labels";
import { getStoredLanguage, translate } from "@/lib/i18n/translate";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const identityT: TranslateFn = (key) => defaultLabels[key] ?? key;

const defaultLabels: Record<string, string> = {
  "role.superAdmin": "Super admin",
  "role.workspaceManager": "Workspace manager",
  "role.accountManager": "Account manager",
  "role.unknown": "Unknown role",
  "role.workspaceManagerShort": "Workspace mgr",
  "role.accountManagerShort": "Account mgr",
  "role.unknownShort": "Unknown",
  "role.superAdminDescription": "Can control users, audit, platform governance, and all operational workflows.",
  "role.workspaceManagerDescription": "Can manage daily operations: requests, events, outlets, reports, approvals, and ticket dispatch.",
  "role.accountManagerDescription": "Can create ticket requests and follow their approval and dispatch status.",
  "role.unknownDescription": "Role permissions are not available.",
  "dispatch.sent": "Sent",
  "dispatch.manual": "Manual",
  "dispatch.simulated": "Simulated",
  "dispatch.failed": "Failed",
  "dispatch.skipped": "Skipped",
  "dispatch.delivered": "Delivered",
  "dispatch.bounced": "Bounced",
  "dispatch.opened": "Opened",
  "dispatch.clicked": "Clicked",
  "dispatch.complained": "Complaint",
  "dispatch.delivery_delayed": "Delayed",
  "filter.attention": "Needs attention",
  "filter.all": "All requests",
  "filter.pending": "Pending requests",
  "filter.approved_not_sent": "Approved without tickets sent",
  "filter.email_failed": "Email failed",
};

export function isSuperAdmin(role?: Role) {
  return role === "super_admin";
}

export function isWorkspaceManager(role?: Role) {
  return role === "super_admin" || role === "workspace_manager";
}

export function roleLabel(role?: Role, t: TranslateFn = identityT) {
  if (role === "super_admin") return t("role.superAdmin");
  if (role === "workspace_manager") return t("role.workspaceManager");
  if (role === "account_manager") return t("role.accountManager");
  return t("role.unknown");
}

export function roleShortLabel(role?: Role, t: TranslateFn = identityT) {
  if (role === "super_admin") return t("role.superAdmin");
  if (role === "workspace_manager") return t("role.workspaceManagerShort");
  if (role === "account_manager") return t("role.accountManagerShort");
  return t("role.unknownShort");
}

export function roleDescription(role?: Role, t: TranslateFn = identityT) {
  if (role === "super_admin") return t("role.superAdminDescription");
  if (role === "workspace_manager") return t("role.workspaceManagerDescription");
  if (role === "account_manager") return t("role.accountManagerDescription");
  return t("role.unknownDescription");
}

export const inputClass =
  "min-h-11 rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 shadow-sm transition focus:border-[#EB6A1C] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500";

export function statusTone(status: RequestStatus): Tone {
  if (status === "approved") return "good";
  if (status === "rejected") return "bad";
  if (status === "partially_approved") return "warn";
  return "neutral";
}

export function notificationTone(status: NotificationRecord["status"]): Tone {
  if (status === "sent") return "good";
  if (status === "failed") return "bad";
  if (status === "skipped") return "warn";
  return "neutral";
}

export function requestTicketTotal(request: TicketRequest) {
  return request.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function approvedTicketTotal(request: TicketRequest) {
  return request.items.reduce((sum, item) => sum + (item.approvedQuantity ?? 0), 0);
}

export function requestHasFailedDispatch(request: TicketRequest) {
  return request.dispatches.some((dispatch) => ["failed", "bounced", "complained"].includes(dispatch.status));
}

export function requestApprovedWithoutDispatch(request: TicketRequest) {
  return (request.status === "approved" || request.status === "partially_approved") && request.dispatches.length === 0;
}

export function dispatchTone(status: string): Tone {
  if (status === "sent" || status === "manual" || status === "delivered" || status === "opened" || status === "clicked") return "good";
  if (status === "failed" || status === "bounced" || status === "complained") return "bad";
  if (status === "skipped" || status === "delivery_delayed") return "warn";
  return "neutral";
}

export function dispatchLabel(status: string, t: TranslateFn = identityT) {
  const key = `dispatch.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function requestQuickFilterLabel(filter: RequestQuickFilter, t: TranslateFn = identityT) {
  return t(`filter.${filter}`);
}

export function buildEmailDraftUrl(app: "default" | "outlook_web" | "gmail", recipients: string[], subject: string, body: string) {
  const to = recipients.join(",");
  if (app === "outlook_web") {
    const params = new URLSearchParams({ to, subject, body });
    return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
  }
  if (app === "gmail") {
    const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function isToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

export function isWithinLastDays(value: string | undefined, days: number) {
  if (!value) return false;
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return false;
  const now = Date.now();
  return date <= now && now - date <= days * 24 * 60 * 60 * 1000;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (!payload) {
      const language = getStoredLanguage();
      const fallbackKey = response.status === 401 || response.status === 403 ? "api.FORBIDDEN" : response.status === 404 ? "api.NOT_FOUND" : "api.SERVER_ERROR";
      throw new Error(translate(language, fallbackKey));
    }
    const language = getStoredLanguage();
    const translated = payload.code ? translate(language, `api.${payload.code}`, payload.params) : undefined;
    // Only trust the translation if that code actually resolved to something
    // other than the raw key, otherwise fall back to the server's English text.
    const message = translated && translated !== `api.${payload.code}` ? translated : payload.error || "Request failed";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function dateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function timeInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function dateTimeFromForm(form: FormData) {
  const date = String(form.get("startsDate") || "");
  const time = String(form.get("startsTime") || "");
  if (!date) return "";
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}


export function isCriticalAuditAction(action: string) {
  return /^(user\.|mail\.webhook|ticket_request\.dispatch|ticket_request\.updated|event\.deleted|outlet\.merged|report\.export)/i.test(action);
}


export function mapSummary(values: Map<string, number>, fallback: string) {
  const rows = [...values.entries()].sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return fallback;
  return rows.slice(0, 3).map(([name, count]) => `${name} (${count})`).join(", ");
}


export function buildManagerSummaries(rows: ReportRow[]) {
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


export function summarizeReportRows(rows: ReportRow[]) {
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

export function reportSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "report";
}

export function reportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function reportFilename(scope: string, extension: "csv" | "pdf") {
  return `bacardi-ticket-${reportSlug(scope)}-${reportDateStamp()}.${extension}`;
}

export function reportCsv(rows: ReportRow[]) {
  const header = ["Event/Festival", "Type", "Market", "Outlet", "Account Manager", "Email", "Status", "Tickets", "Approved", "Dispatches", "Created"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) =>
    [row.event, row.eventKind, row.market, row.outlet, row.accountManager, row.accountManagerEmail, row.status, row.quantity, row.approved, row.dispatches, row.createdAt].map(escape).join(","),
  );
  return [header.map(escape).join(","), ...body].join("\n");
}

export function downloadTextFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}



export function rankedTotals(rows: ReportRow[], key: string, valueKey: "quantity" | "dispatches" = "quantity", limit = 8) {
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
