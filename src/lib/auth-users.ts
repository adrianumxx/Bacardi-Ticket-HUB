import { connectDb } from "@/lib/db";
import { AllowedUser, Profile } from "@/lib/models";
import { normalizeEmail } from "@/lib/utils";

export function superAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export async function ensureAllowedProfile(emailValue: string, name?: string | null) {
  await connectDb();
  const email = normalizeEmail(emailValue);
  const envAdmins = superAdminEmails();
  const allowed = await AllowedUser.findOne({ email }).lean();
  const existingProfile = await Profile.findOne({ email }).lean();
  const role = envAdmins.includes(email) ? "super_admin" : allowed?.role;

  if (!role) return null;

  return Profile.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        name: existingProfile?.name || name || email,
        role,
        status: "active",
        lastLoginAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
}
