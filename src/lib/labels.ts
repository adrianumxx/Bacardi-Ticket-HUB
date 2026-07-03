export type RequestStatus = "pending" | "approved" | "partially_approved" | "rejected";
export type EventStatus = "draft" | "published" | "closed";
export type OutletStatus = "approved" | "pending" | "archived";

export const requestStatusLabels: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  partially_approved: "Partially approved",
  rejected: "Rejected",
};

export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

export const outletStatusLabels: Record<OutletStatus, string> = {
  approved: "Approved",
  pending: "Pending review",
  archived: "Archived",
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

export function renderRequestStatus(status: string) {
  return requestStatusLabels[status as RequestStatus] ?? status.replaceAll("_", " ");
}

export function renderEventStatus(status: string) {
  return eventStatusLabels[status as EventStatus] ?? status;
}

export function renderOutletStatus(status: string) {
  return outletStatusLabels[status as OutletStatus] ?? status;
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
