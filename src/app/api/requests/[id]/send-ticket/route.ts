import { errorResponse, json } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { TicketRequest } from "@/lib/models";
import { sendTicketSchema } from "@/lib/schemas";
import { emailHtml } from "@/lib/mail";
import { splitEmails } from "@/lib/utils";
import { approvedQuantity } from "@/lib/request-rules";
import { notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "zip"];

function fileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;
    const formData = await request.formData();
    const recipients = splitEmails(String(formData.get("recipients") || ""));
    const subject = String(formData.get("subject") || "Your Bacardi tickets");
    const message = String(formData.get("message") || "Attached are the approved ticket file(s).");
    const parsed = sendTicketSchema.parse({ recipients, subject, message });
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return json({ error: "Attach at least one ticket file before sending." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return json({ error: `Attach at most ${MAX_FILES} ticket files.` }, { status: 400 });
    }
    const invalidFile = files.find((file) => !ALLOWED_EXTENSIONS.includes(fileExtension(file.name)));
    if (invalidFile) {
      return json(
        { error: `File type not allowed: ${invalidFile.name}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.` },
        { status: 400 },
      );
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return json({ error: "Ticket files exceed the 15 MB total size limit." }, { status: 400 });
    }

    const ticketRequest = await TicketRequest.findById(id).populate("event").populate("outlet");
    if (!ticketRequest) return json({ error: "Request not found" }, { status: 404 });
    if (!["approved", "partially_approved"].includes(ticketRequest.status)) {
      return json({ error: "Approve or partially approve the request before sending ticket files." }, { status: 400 });
    }
    if (approvedQuantity(ticketRequest.items) <= 0) {
      return json({ error: "Approve at least one ticket before sending ticket files." }, { status: 400 });
    }

    const attachments = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        content: Buffer.from(await file.arrayBuffer()).toString("base64"),
      })),
    );

    const deliveries = await Promise.all(
      parsed.recipients.map((recipient) =>
        notifyUser({
          recipient,
          actor: user.email,
          category: "tickets",
          entityType: "ticket_request",
          entityId: String(ticketRequest._id),
          title: "Ticket email dispatched",
          message: parsed.message,
          priority: "high",
          metadata: { fileNames: files.map((file) => file.name) },
          email: {
            subject: parsed.subject,
            html: emailHtml("Bacardi tickets", parsed.message),
            attachments,
          },
        }),
      ),
    );
    const result = deliveries.some((item) => item.delivery.status === "sent")
      ? deliveries.find((item) => item.delivery.status === "sent")!.delivery
      : deliveries[0].delivery;

    ticketRequest.dispatches.push({
      by: user.email,
      recipients: parsed.recipients,
      subject: parsed.subject,
      fileNames: files.map((file) => file.name),
      status: result.status,
      providerId: result.providerId,
    });
    ticketRequest.history.push({
      by: user.email,
      action: result.status === "failed" ? "ticket_email_failed" : "ticket_email_sent",
      message: `Ticket email ${result.status} for ${parsed.recipients.join(", ")}.${result.error ? ` ${result.error}` : ""}`,
    });
    await ticketRequest.save();
    await auditLog({
      actor: user.email,
      action: "ticket_request.dispatch",
      target: id,
      payload: { recipients: parsed.recipients, fileNames: files.map((file) => file.name), status: result.status },
    });

    const updated = await TicketRequest.findById(id).populate("event").populate("outlet").lean();
    return json({ request: updated, delivery: result });
  } catch (error) {
    return errorResponse(error);
  }
}
