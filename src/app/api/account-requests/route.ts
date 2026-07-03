import { errorResponse, json, tooManyRequests } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { AccountRequest, AllowedUser } from "@/lib/models";
import { accountRequestSchema } from "@/lib/schemas";
import { adminNotifyEmails, emailHtml } from "@/lib/mail";
import { notifyAdmins } from "@/lib/notifications";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    await connectDb();
    const limit = await rateLimit(`access:${requestIp(request)}`, 8, 60 * 60 * 1000);
    if (limit.limited) return tooManyRequests("Too many access requests. Try again later.");
    const input = accountRequestSchema.parse(await request.json());
    const email = normalizeEmail(input.email);
    // Generic response used for every outcome so the endpoint can't be used to
    // enumerate which emails already have access.
    const genericMessage = "Access request received. If this email is eligible, a manager will review it and you'll be notified by email.";
    const allowed = await AllowedUser.findOne({ email }).lean();
    if (allowed) {
      return json({ message: genericMessage });
    }

    const accountRequest = await AccountRequest.findOneAndUpdate(
      { email, status: "pending" },
      {
        $set: {
          email,
          name: input.name.trim(),
          company: input.company.trim(),
          reason: input.reason.trim(),
          requestedRole: "account_manager",
          status: "pending",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const admins = adminNotifyEmails();
    const subject = "New Bacardi Ticket Hub access request";
    const [notificationResult] = await notifyAdmins({
      actor: email,
      category: "accounts",
      entityType: "account_request",
      entityId: String(accountRequest._id),
      title: "New access request",
      message: `${input.name} requested access with ${email}.\nCompany/team: ${input.company || "Not provided"}\nReason: ${input.reason || "Not provided"}`,
      priority: "high",
      email: {
        subject,
        html: emailHtml(
          "New access request",
          `${input.name} requested access with ${email}.\nCompany/team: ${input.company || "Not provided"}\nReason: ${
            input.reason || "Not provided"
          }`,
        ),
      },
    });
    const delivery = notificationResult.delivery;

    if (!Array.isArray(accountRequest.notifications)) accountRequest.notifications = [];
    accountRequest.notifications.push({
      type: "access_request_submitted",
      recipients: admins,
      subject,
      status: delivery.status,
      providerId: delivery.providerId,
      error: delivery.error || "",
    });
    await accountRequest.save();

    return json({ message: genericMessage }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
