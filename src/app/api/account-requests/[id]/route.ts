import { errorResponse, json, notFound } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AccountRequest, AllowedUser, Profile } from "@/lib/models";
import { reviewAccountRequestSchema } from "@/lib/schemas";
import { emailHtml } from "@/lib/mail";
import { notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;
    const input = reviewAccountRequestSchema.parse(await request.json());
    const accountRequest = await AccountRequest.findById(id);
    if (!accountRequest) return notFound("Access request not found.", "ACCOUNT_REQUEST_NOT_FOUND");

    accountRequest.status = input.status;
    accountRequest.reviewedBy = user.email;
    accountRequest.reviewedAt = new Date();
    accountRequest.reviewNotes = input.reviewNotes;
    if (input.status === "approved") {
      await AllowedUser.findOneAndUpdate(
        { email: accountRequest.email },
        { $set: { email: accountRequest.email, role: "account_manager", createdBy: user.email } },
        { upsert: true, new: true },
      );
      await Profile.findOneAndUpdate(
        { email: accountRequest.email },
        { $set: { email: accountRequest.email, name: accountRequest.name, role: "account_manager", status: "active" } },
        { upsert: true, new: true },
      );
    }

    const subject =
      input.status === "approved"
        ? "Your Bacardi Ticket Hub access was approved"
        : "Your Bacardi Ticket Hub access request was reviewed";
    const notification = await notifyUser({
      recipient: accountRequest.email,
      actor: user.email,
      category: "accounts",
      entityType: "account_request",
      entityId: String(accountRequest._id),
      title: input.status === "approved" ? "Access approved" : "Access request reviewed",
      message:
        input.status === "approved"
          ? `Your account has been approved. You can now sign in with ${accountRequest.email}.`
          : `Your access request was not approved at this time.\n${input.reviewNotes || ""}`,
      priority: "high",
      email: {
        subject,
        replyTo: user.email,
        html: emailHtml(
          input.status === "approved" ? "Access approved" : "Access request reviewed",
          input.status === "approved"
            ? `Your account has been approved. You can now sign in with ${accountRequest.email}.`
            : `Your access request was not approved at this time.\n${input.reviewNotes || ""}`,
        ),
      },
    });
    const delivery = notification.delivery;

    if (!Array.isArray(accountRequest.notifications)) accountRequest.notifications = [];
    accountRequest.notifications.push({
      type: input.status === "approved" ? "access_approved" : "access_rejected",
      recipients: [accountRequest.email],
      subject,
      status: delivery.status,
      providerId: delivery.providerId,
      error: delivery.error || "",
    });
    await accountRequest.save();
    await auditLog({ actor: user.email, action: `account_request.${input.status}`, target: String(accountRequest._id), payload: { email: accountRequest.email } });

    return json({ accountRequest });
  } catch (error) {
    return errorResponse(error);
  }
}
