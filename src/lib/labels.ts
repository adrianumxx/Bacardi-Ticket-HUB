export type RequestStatus = "pending" | "approved" | "partially_approved" | "rejected";
export type EventStatus = "draft" | "published" | "closed";
export type OutletStatus = "approved" | "pending" | "archived";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const identityT: TranslateFn = (key) => defaultLabels[key] ?? key;

const defaultLabels: Record<string, string> = {
  "status.pending": "Pending",
  "status.approved": "Approved",
  "status.partially_approved": "Partially approved",
  "status.rejected": "Rejected",
  "status.draft": "Draft",
  "status.published": "Published",
  "status.closed": "Closed",
  "status.pendingReview": "Pending review",
  "status.archived": "Archived",
};

export const requestActionLabels: Record<string, string> = {
  created: "Request created",
  updated: "Request updated",
  "status:pending": "Marked as pending",
  "status:approved": "Approved",
  "status:partially_approved": "Partially approved",
  "status:rejected": "Rejected",
  notification_sent: "Notification sent",
  notification_failed: "Notification failed",
  notification_skipped: "Notification skipped",
  ticket_email_sent: "Ticket email sent",
  ticket_email_failed: "Ticket email failed",
};

export function renderRequestStatus(status: string, t: TranslateFn = identityT) {
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? status.replaceAll("_", " ") : label;
}

export function renderEventStatus(status: string, t: TranslateFn = identityT) {
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function renderOutletStatus(status: string, t: TranslateFn = identityT) {
  if (status === "pending") return t("status.pendingReview");
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function renderHistoryAction(action: string) {
  return requestActionLabels[action] ?? action.replaceAll("_", " ");
}

export function renderHistoryMessage(message: string) {
  if (!message) return "No message";
  if (message === "Richiesta ticket creata.") return "Ticket request created.";
  if (message.toLowerCase().includes(["super", "admin"].join(" "))) return "Request updated by the manager.";
  if (message.startsWith("Ticket inviati a ")) {
    return message.replace("Ticket inviati a ", "Ticket email sent to ");
  }
  return message;
}
