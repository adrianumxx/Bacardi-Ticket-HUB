import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectDb } from "@/lib/db";
import { Profile } from "@/lib/models";
import { normalizeEmail } from "@/lib/utils";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  await connectDb();

  const email = normalizeEmail(session.user.email);
  const profile = await Profile.findOne({ email }).lean();
  if (!profile || profile.status !== "active") return null;

  return {
    id: String(profile._id),
    email,
    name: profile.name || session.user.name || email,
    role: profile.role,
    officialEmail: profile.officialEmail || "",
    preferredEmailApp: profile.preferredEmailApp || "default",
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export async function requireWorkspaceManager() {
  const user = await requireUser();
  if (user.role !== "super_admin" && user.role !== "workspace_manager") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export function canManageWorkspace(role?: string) {
  return role === "super_admin" || role === "workspace_manager";
}

export async function visibleAccountManagerEmails(user: { email: string; role?: string }) {
  if (user.role === "super_admin") return null;
  if (user.role === "workspace_manager") {
    const team = await Profile.find({ managerEmail: user.email, role: "account_manager" }).select("email").lean();
    return [user.email, ...team.map((member) => normalizeEmail(member.email))];
  }
  return [user.email];
}

export async function canAccessAccountManagerData(user: { email: string; role?: string }, accountManagerEmail: string) {
  if (user.role === "super_admin") return true;
  const visibleEmails = await visibleAccountManagerEmails(user);
  return Boolean(visibleEmails?.includes(normalizeEmail(accountManagerEmail)));
}
