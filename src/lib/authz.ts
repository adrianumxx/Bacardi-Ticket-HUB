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
