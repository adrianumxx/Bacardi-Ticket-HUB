import { badRequest, errorResponse, json, notFound } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AllowedUser, Profile } from "@/lib/models";
import { adminUserUpdateSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { normalizeEmail } from "@/lib/utils";

async function isLastSuperAdmin(email: string) {
  const activeAdmins = await Profile.countDocuments({ role: "super_admin", status: "active", email: { $ne: email } });
  return activeAdmins === 0;
}

export async function PATCH(request: Request, context: { params: Promise<{ email: string }> }) {
  try {
    const actor = await requireSuperAdmin();
    await connectDb();
    const { email: rawEmail } = await context.params;
    const email = normalizeEmail(decodeURIComponent(rawEmail));
    const input = adminUserUpdateSchema.parse(await request.json());
    const current = await Profile.findOne({ email });
    if (!current) return notFound("User profile not found.");
    const accessEnabled = input.accessEnabled ?? input.whitelisted;

    const demoting = input.role && current.role === "super_admin" && input.role !== "super_admin";
    const blocking = input.status === "blocked" && current.role === "super_admin";
    const disablingAccess = accessEnabled === false && current.role === "super_admin";
    if ((demoting || blocking || disablingAccess) && (await isLastSuperAdmin(email))) {
      return badRequest("You cannot remove, block, or demote the last active manager.", "LAST_MANAGER");
    }

    if (input.managerEmail) {
      const targetRole = input.role || current.role;
      if (targetRole !== "account_manager") {
        return badRequest("Only account managers can be assigned to a manager's team.");
      }
      const managerEmail = normalizeEmail(input.managerEmail);
      if (managerEmail === email) {
        return badRequest("An account manager cannot be their own manager.");
      }
      const manager = await Profile.findOne({ email: managerEmail, role: "super_admin" });
      if (!manager) return badRequest("Select an existing manager to assign this team member to.");
    }

    if (input.role) current.role = input.role;
    if (input.status) current.status = input.status;
    if (input.role === "super_admin") current.managerEmail = "";
    else if (input.managerEmail !== undefined) current.managerEmail = normalizeEmail(input.managerEmail);
    await current.save();

    if (accessEnabled === false) {
      await AllowedUser.deleteOne({ email });
    } else if (accessEnabled === true || input.role) {
      await AllowedUser.findOneAndUpdate(
        { email },
        { $set: { email, role: input.role || current.role, createdBy: actor.email } },
        { upsert: true, new: true },
      );
    }

    await notifyUser({
      recipient: email,
      actor: actor.email,
      category: "users",
      entityType: "profile",
      entityId: email,
      title: "Account settings updated",
      message: `Your Bacardi Ticket Hub account was updated by a manager.`,
    });
    await auditLog({ actor: actor.email, action: "user.updated", target: email, payload: input });

    const [profile, allowed] = await Promise.all([
      Profile.findOne({ email }).lean(),
      AllowedUser.findOne({ email }).lean(),
    ]);
    return json({ profile, allowed });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ email: string }> }) {
  try {
    const actor = await requireSuperAdmin();
    await connectDb();
    const { email: rawEmail } = await context.params;
    const email = normalizeEmail(decodeURIComponent(rawEmail));

    if (email === actor.email) {
      return badRequest("You cannot delete your own account.");
    }

    const current = await Profile.findOne({ email });
    if (current?.role === "super_admin" && (await isLastSuperAdmin(email))) {
      return badRequest("You cannot remove the last active manager.", "LAST_MANAGER");
    }

    await Promise.all([Profile.deleteOne({ email }), AllowedUser.deleteOne({ email })]);
    await auditLog({ actor: actor.email, action: "user.deleted", target: email });

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
