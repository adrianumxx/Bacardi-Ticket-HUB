import { connectDb } from "@/lib/db";
import { AllowedUser, Profile } from "@/lib/models";
import { normalizeEmail } from "@/lib/utils";

export function superAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export async function ensureAllowedProfile(
  emailValue: string,
  name?: string | null,
  options: { touchLogin?: boolean } = {},
) {
  await connectDb();
  const email = normalizeEmail(emailValue);
  const envAdmins = superAdminEmails();
  const [allowed, existingProfile] = await Promise.all([
    AllowedUser.findOne({ email }).lean(),
    Profile.findOne({ email }).lean(),
  ]);
  const isEnvAdmin = envAdmins.includes(email);
  const role = isEnvAdmin ? "super_admin" : allowed?.role;

  if (!role) {
    console.warn("[auth:access-denied]", {
      email,
      isEnvAdmin,
      envAdminCount: envAdmins.length,
      hasAllowedAccess: Boolean(allowed),
      hasProfile: Boolean(existingProfile),
    });
    return null;
  }

  // A blocked profile must never be silently re-activated. Environment super
  // admins are always allowed so the platform can't lock itself out.
  if (!isEnvAdmin && existingProfile?.status === "blocked") {
    console.warn("[auth:blocked]", { email });
    return null;
  }

  const set: Record<string, unknown> = {
    email,
    name: existingProfile?.name || name || email,
    role,
  };
  if (options.touchLogin) set.lastLoginAt = new Date();

  return Profile.findOneAndUpdate(
    { email },
    {
      // status is only assigned on creation so admin blocks are preserved.
      $set: set,
      $setOnInsert: { status: "active" },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
}
