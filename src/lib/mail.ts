import { Resend } from "resend";

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
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendMail(input: SendMailInput) {
  if (!resend) {
    console.info("[mail:simulated]", {
      to: input.to,
      subject: input.subject,
      attachments: input.attachments?.map((item) => item.filename) ?? [],
    });
    return { status: "simulated" as const, providerId: "" };
  }

  const result = await resend.emails.send({
    from: process.env.MAIL_FROM || "Bacardi Ticket Hub <tickets@example.com>",
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
    return { status: "failed", providerId: "", error: message };
  }
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
