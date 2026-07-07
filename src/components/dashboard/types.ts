import type { EventStatus, OutletStatus, RequestStatus } from "@/lib/labels";

export type Role = "super_admin" | "workspace_manager" | "account_manager";
export type Tone = "neutral" | "good" | "warn" | "bad";

export type EventItem = {
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

export type Outlet = {
  _id: string;
  name: string;
  type: string;
  city?: string;
  status: OutletStatus;
};

export type TicketRequest = {
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

export type NotificationRecord = {
  at: string;
  type: string;
  recipients: string[];
  subject: string;
  status: EmailDeliveryStatus;
  providerId?: string;
  error?: string;
};

export type AccountRequest = {
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

export type AppNotification = {
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

export type AuditLogItem = {
  _id: string;
  actor: string;
  action: string;
  target?: string;
  payload?: unknown;
  createdAt: string;
};

export type AdminUserRow = {
  email: string;
  name?: string;
  role: Role;
  status?: "active" | "blocked";
  lastLoginAt?: string;
  accessEnabled?: boolean;
  source?: string;
  managerEmail?: string;
};

export type EmailDeliveryStatus = "sent" | "manual" | "simulated" | "failed" | "skipped" | "delivered" | "bounced" | "opened" | "clicked" | "complained" | "delivery_delayed";

export type ManagerStat = {
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

export type RequestQuickFilter = "attention" | "all" | "pending" | "approved_not_sent" | "email_failed";

export type GlobalSearchResult = {
  id: string;
  group: string;
  title: string;
  detail: string;
  tab: string;
  quickFilter?: RequestQuickFilter;
  eventId?: string;
};

export type DispatchRetrySeed = {
  recipients: string;
  token: number;
};

export type RequestDuplicateSeed = {
  eventId: string;
  outletName: string;
  ticketType: string;
  recipientEmails: string;
  notes: string;
  token: number;
};

export type ReportRow = Record<string, string | number>;

export type ManagerSummary = {
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

export type FestivalSummary = {
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

export type ReportFocus = {
  kind: "event" | "outlet";
  label: string;
};


