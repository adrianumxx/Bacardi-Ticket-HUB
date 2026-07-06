import { Resend, type WebhookEventPayload } from "resend";

type Attachment = {
  filename: string;
  content: string;
};

type SendMailInput = {
  to: string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
  replyTo?: string;
};

export type MailDelivery = {
  status: "sent" | "simulated" | "failed" | "skipped";
  providerId: string;
  error?: string;
  issue?: MailIssue;
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type MailIssue = "missing_api_key" | "invalid_sender" | "sender_not_verified" | "send_failed";

export type MailHealth = {
  status: "ready" | "missing_api_key" | "invalid_sender" | "sender_not_verified" | "send_failed";
  tone: "good" | "warn" | "bad";
  label: string;
  message: string;
  from: string;
  hasApiKey: boolean;
};

function configuredFrom() {
  return process.env.MAIL_FROM || "Bacardi Ticket Hub <tickets@example.com>";
}

function classifyMailError(message: string): MailIssue {
  const normalized = message.toLowerCase();
  if (normalized.includes("mail_from") || normalized.includes("tickets@example.com") || normalized.includes("from")) return "invalid_sender";
  if (normalized.includes("verify") || normalized.includes("verified") || normalized.includes("domain") || normalized.includes("sender")) return "sender_not_verified";
  return "send_failed";
}

function issueMessage(issue: MailIssue) {
  if (issue === "missing_api_key") return "Resend API key is missing. Emails will be simulated until RESEND_API_KEY is configured.";
  if (issue === "invalid_sender") return "MAIL_FROM is not a valid production sender. Use a sender verified in Resend.";
  if (issue === "sender_not_verified") return "Resend rejected the sender or domain. Verify the sender/domain in Resend, then retry.";
  return "The last email attempt failed. Check the delivery error and Resend configuration.";
}

export function mailHealth(lastError?: string): MailHealth {
  const from = configuredFrom();
  const hasApiKey = Boolean(process.env.RESEND_API_KEY);
  if (!hasApiKey) {
    return {
      status: "missing_api_key",
      tone: "warn",
      label: "Missing API key",
      message: issueMessage("missing_api_key"),
      from,
      hasApiKey,
    };
  }
  if (process.env.NODE_ENV === "production" && from.includes("tickets@example.com")) {
    return {
      status: "invalid_sender",
      tone: "bad",
      label: "Invalid sender",
      message: issueMessage("invalid_sender"),
      from,
      hasApiKey,
    };
  }
  if (lastError) {
    const issue = classifyMailError(lastError);
    return {
      status: issue,
      tone: issue === "send_failed" ? "warn" : "bad",
      label: issue === "sender_not_verified" ? "Sender not verified" : issue === "invalid_sender" ? "Invalid sender" : "Send failed",
      message: issueMessage(issue),
      from,
      hasApiKey,
    };
  }
  return {
    status: "ready",
    tone: "good",
    label: "Ready",
    message: "Resend is configured. New email deliveries will be attempted from the configured sender.",
    from,
    hasApiKey,
  };
}

export async function sendMail(input: SendMailInput) {
  if (!resend) {
    console.info("[mail:simulated]", {
      to: input.to,
      subject: input.subject,
      attachments: input.attachments?.map((item) => item.filename) ?? [],
    });
    return { status: "simulated" as const, providerId: "" };
  }

  const from = configuredFrom();
  if (process.env.NODE_ENV === "production" && from.includes("tickets@example.com")) {
    throw new Error("MAIL_FROM must be a verified sender when RESEND_API_KEY is configured in production.");
  }

  const result = await resend.emails.send({
    from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { status: "sent" as const, providerId: result.data?.id ?? "" };
}

export async function deliverMail(input: SendMailInput): Promise<MailDelivery> {
  const recipients = input.to.map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (recipients.length === 0) {
    return { status: "skipped", providerId: "", error: "No recipients configured." };
  }

  try {
    return await sendMail({ ...input, to: recipients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    console.error("[mail:failed]", { to: recipients, subject: input.subject, error: message });
    return { status: "failed", providerId: "", error: message, issue: classifyMailError(message) };
  }
}

export function verifyResendWebhook(payload: string, headers: Headers): WebhookEventPayload {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_WEBHOOK_SECRET is not configured.");
    }
    return JSON.parse(payload) as WebhookEventPayload;
  }

  const verifier = resend ?? new Resend(process.env.RESEND_API_KEY || "re_webhook_verifier");
  return verifier.webhooks.verify({
    payload,
    headers: {
      id: headers.get("svix-id") || "",
      timestamp: headers.get("svix-timestamp") || "",
      signature: headers.get("svix-signature") || "",
    },
    webhookSecret,
  });
}

export function adminNotifyEmails() {
  return (process.env.ADMIN_NOTIFY_EMAILS || process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function emailHtml(title: string, body: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#181412">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
      <p style="white-space:pre-line;margin:0">${escapeHtml(body)}</p>
      <p style="font-size:12px;color:#78716c;margin-top:20px">Bacardi Ticket Hub</p>
    </div>
  `;
}
