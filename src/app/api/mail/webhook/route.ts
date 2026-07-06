import { errorResponse, json } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { connectDb } from "@/lib/db";
import { verifyResendWebhook } from "@/lib/mail";
import { AppNotification, AuditLog, TicketRequest } from "@/lib/models";

type ResendWebhookData = {
  id?: string;
  email_id?: string;
  to?: string | string[];
  recipient?: string;
  subject?: string;
  created_at?: string;
  error?: string;
  bounce?: { message?: string; type?: string };
};

type ResendWebhookEvent = {
  type?: string;
  data?: ResendWebhookData;
};

const eventStatusMap: Record<string, "sent" | "failed" | "delivered" | "bounced" | "opened" | "clicked" | "complained" | "delivery_delayed"> = {
  "email.sent": "sent",
  "email.failed": "failed",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.complained": "complained",
  "email.delivery_delayed": "delivery_delayed",
};

function providerIdFrom(event: ResendWebhookEvent) {
  return event.data?.email_id || event.data?.id || "";
}

function eventMessage(event: ResendWebhookEvent, status: string) {
  const recipient = Array.isArray(event.data?.to) ? event.data?.to.join(", ") : event.data?.to || event.data?.recipient || "unknown recipient";
  const subject = event.data?.subject ? ` "${event.data.subject}"` : "";
  const reason = event.data?.error || event.data?.bounce?.message || event.data?.bounce?.type || "";
  return `Resend webhook marked email${subject} as ${status} for ${recipient}.${reason ? ` ${reason}` : ""}`;
}

function dispatchSummaryStatus(status: string) {
  if (status === "bounced" || status === "complained" || status === "failed") return "failed";
  return "sent";
}

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const svixId = request.headers.get("svix-id") || "";
    let event: ResendWebhookEvent;
    try {
      event = verifyResendWebhook(payload, request.headers) as ResendWebhookEvent;
    } catch (verificationError) {
      const message = verificationError instanceof Error ? verificationError.message : "Invalid Resend webhook.";
      return json(
        { error: message.includes("RESEND_WEBHOOK_SECRET") ? "Webhook secret is not configured." : "Invalid Resend webhook signature." },
        { status: message.includes("RESEND_WEBHOOK_SECRET") ? 503 : 400 },
      );
    }
    const status = event.type ? eventStatusMap[event.type] : undefined;
    const providerId = providerIdFrom(event);

    if (!status || !providerId) {
      return json({ ok: true, ignored: true, reason: "Unsupported Resend event or missing email id." });
    }

    await connectDb();
    if (svixId) {
      const duplicate = await AuditLog.exists({ action: "mail.webhook_received", target: svixId });
      if (duplicate) return json({ ok: true, duplicate: true });
    }

    const message = eventMessage(event, status);
    const [notificationResult, requestDocs] = await Promise.all([
      AppNotification.updateMany(
        { emailProviderId: providerId },
        { $set: { emailStatus: status, emailError: event.data?.error || event.data?.bounce?.message || "" } },
      ),
      TicketRequest.find({ "dispatches.deliveries.providerId": providerId }),
    ]);

    let touchedRequests = 0;
    for (const ticketRequest of requestDocs) {
      let changed = false;
      for (const dispatch of ticketRequest.dispatches) {
        const delivery = dispatch.deliveries.find((item: { providerId?: string }) => item.providerId === providerId);
        if (!delivery) continue;
        delivery.status = status;
        delivery.error = event.data?.error || event.data?.bounce?.message || "";
        dispatch.status = dispatchSummaryStatus(status);
        changed = true;
      }
      if (changed) {
        ticketRequest.history.push({
          by: "resend",
          action: `email_${status}`,
          message,
        });
        await ticketRequest.save();
        touchedRequests += 1;
      }
    }

    await auditLog({
      actor: "resend",
      action: "mail.webhook_received",
      target: svixId || providerId,
      payload: {
        type: event.type,
        providerId,
        status,
        notifications: notificationResult.modifiedCount,
        requests: touchedRequests,
      },
    });

    return json({ ok: true, status, providerId, notifications: notificationResult.modifiedCount, requests: touchedRequests });
  } catch (error) {
    return errorResponse(error);
  }
}
