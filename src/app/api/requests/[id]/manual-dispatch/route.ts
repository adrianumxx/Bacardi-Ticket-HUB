import { errorResponse, forbidden, json } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { canAccessAccountManagerData, canManageWorkspace, requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { TicketRequest } from "@/lib/models";
import { approvedQuantity } from "@/lib/request-rules";
import { manualDispatchSchema } from "@/lib/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await connectDb();
    const { id } = await context.params;
    const input = manualDispatchSchema.parse(await request.json());
    const ticketRequest = await TicketRequest.findById(id).populate("event").populate("outlet");
    if (!ticketRequest) return json({ error: "Request not found" }, { status: 404 });

    if (canManageWorkspace(user.role)) {
      if (!(await canAccessAccountManagerData(user, ticketRequest.requestedBy))) {
        return forbidden("You can only record ticket dispatches for requests from your assigned team.");
      }
    } else if (ticketRequest.requestedBy !== user.email) {
      return forbidden("You can only record ticket dispatches for your own requests.");
    }
    if (!["approved", "partially_approved"].includes(ticketRequest.status)) {
      return json({ error: "Approve or partially approve the request before opening an email draft." }, { status: 400 });
    }
    if (approvedQuantity(ticketRequest.items) <= 0) {
      return json({ error: "Approve at least one ticket before recording a manual dispatch." }, { status: 400 });
    }

    ticketRequest.dispatches.push({
      by: user.email,
      recipients: input.recipients,
      subject: input.subject,
      fileNames: ["Attached from official mailbox"],
      status: "manual",
      providerId: "",
      deliveries: input.recipients.map((recipient) => ({ recipient, status: "manual", providerId: "", error: "" })),
    });
    ticketRequest.history.push({
      by: user.email,
      action: "ticket_email_manual",
      message: `Email draft opened from official mailbox ${user.officialEmail || user.email} for ${input.recipients.join(", ")}.`,
    });
    await ticketRequest.save();
    await auditLog({
      actor: user.email,
      action: "ticket_request.dispatch_manual",
      target: id,
      payload: { recipients: input.recipients, subject: input.subject, officialEmail: user.officialEmail || user.email, mailtoUrl: input.mailtoUrl },
    });

    const updated = await TicketRequest.findById(id).populate("event").populate("outlet").lean();
    return json({ request: updated, delivery: { status: "manual" } });
  } catch (error) {
    return errorResponse(error);
  }
}
