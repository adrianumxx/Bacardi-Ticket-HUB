import { errorResponse, json } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AccountRequest, AllowedUser, Profile } from "@/lib/models";
import { allowedUserSchema } from "@/lib/schemas";
import { emailHtml } from "@/lib/mail";
import { notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";

export async function GET() {
  try {
    await requireSuperAdmin();
    await connectDb();
    const [allowedUsers, profiles, accountRequests] = await Promise.all([
      AllowedUser.find().sort({ createdAt: -1 }).lean(),
      Profile.find().sort({ lastLoginAt: -1 }).lean(),
      AccountRequest.find().sort({ createdAt: -1 }).lean(),
    ]);
    return json({ allowedUsers, profiles, accountRequests });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const input = allowedUserSchema.parse(await request.json());
    const email = normalizeEmail(input.email);
    const allowed = await AllowedUser.findOneAndUpdate(
      { email },
      { $set: { email, role: input.role, createdBy: user.email } },
      { upsert: true, new: true },
    ).lean();
    await Profile.findOneAndUpdate(
      { email },
      { $set: { email, role: input.role, status: "active" }, $setOnInsert: { name: "" } },
      { upsert: true, new: true },
    );
    const notification = await notifyUser({
      recipient: email,
      actor: user.email,
      category: "users",
      entityType: "profile",
      entityId: email,
      title: "Access enabled",
      message: `A manager enabled your Bacardi Ticket Hub account. You can now sign in with ${email}.`,
      email: {
        subject: "Your Bacardi Ticket Hub access is enabled",
        replyTo: user.email,
        html: emailHtml("Access enabled", `A manager enabled your Bacardi Ticket Hub account. You can now sign in with ${email}.`),
      },
    });
    await auditLog({ actor: user.email, action: "user.access_enabled", target: email, payload: { role: input.role } });
    return json({ allowed, delivery: notification.delivery });
  } catch (error) {
    return errorResponse(error);
  }
}
