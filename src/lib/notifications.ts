import { AppNotification } from "@/lib/models";
import { adminNotifyEmails, deliverMail, emailHtml, type MailDelivery } from "@/lib/mail";
import { normalizeEmail } from "@/lib/utils";

export type NotificationCategory = "accounts" | "requests" | "tickets" | "users" | "outlets" | "events" | "reports" | "system";

type NotifyInput = {
  recipient: string;
  actor?: string;
  category: NotificationCategory;
  entityType?: string;
  entityId?: string;
  title: string;
  message: string;
  priority?: "low" | "normal" | "high";
  metadata?: unknown;
  email?: {
    subject?: string;
    html?: string;
    attachments?: { filename: string; content: string }[];
  };
};

type NotifyResult = {
  notification: unknown;
  delivery: MailDelivery;
};

export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const notification = await AppNotification.create({
    recipient: normalizeEmail(input.recipient),
    actor: normalizeEmail(input.actor || "system"),
    category: input.category,
    entityType: input.entityType || "",
    entityId: input.entityId || "",
    title: input.title,
    message: input.message,
    priority: input.priority || "normal",
    metadata: input.metadata,
    emailStatus: "skipped",
  });

  const delivery = input.email
    ? await deliverOptionalEmail({
        to: [input.recipient],
        subject: input.email.subject || input.title,
        html: input.email.html || emailHtml(input.title, input.message),
        attachments: input.email.attachments,
      })
    : ({ status: "skipped", providerId: "", error: "" } as MailDelivery);

  notification.emailStatus = delivery.status;
  notification.emailProviderId = delivery.providerId;
  notification.emailError = delivery.error || "";
  await notification.save();

  return { notification: notification.toObject(), delivery };
}

export async function notifyAdmins(input: Omit<NotifyInput, "recipient">) {
  const recipients = adminNotifyEmails();
  if (recipients.length === 0) {
    return [
      {
        notification: null,
        delivery: { status: "skipped", providerId: "", error: "No admin recipients configured." } as MailDelivery,
      },
    ];
  }
  return Promise.all(recipients.map((recipient) => notifyUser({ ...input, recipient })));
}

export async function deliverOptionalEmail(input: {
  to: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}) {
  if (!process.env.RESEND_API_KEY) {
    return deliverMail(input);
  }
  return deliverMail(input);
}

export async function markNotificationRead(id: string, recipient: string, read: boolean) {
  return AppNotification.findOneAndUpdate(
    { _id: id, recipient: normalizeEmail(recipient) },
    { $set: { read } },
    { new: true },
  ).lean();
}
