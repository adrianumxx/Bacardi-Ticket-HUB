import { z } from "zod";

const envSchema = z.object({
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters."),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  SUPER_ADMIN_EMAILS: z.string().min(1, "SUPER_ADMIN_EMAILS is required."),
  ADMIN_NOTIFY_EMAILS: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default("Bacardi Ticket Hub <tickets@example.com>"),
});

export function env() {
  return envSchema.parse(process.env);
}

export function validateProductionEnv() {
  const parsed = env();
  if (process.env.NODE_ENV === "production" && parsed.RESEND_API_KEY && parsed.MAIL_FROM.includes("tickets@example.com")) {
    throw new Error("MAIL_FROM must be a verified sender when RESEND_API_KEY is configured in production.");
  }
  return parsed;
}
