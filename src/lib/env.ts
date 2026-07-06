import { z } from "zod";

const envSchema = z.object({
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters."),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  SUPER_ADMIN_EMAILS: z.string().min(1, "SUPER_ADMIN_EMAILS is required."),
  ADMIN_NOTIFY_EMAILS: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_WEBHOOK_SECRET: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default("Bacardi Ticket Hub <tickets@example.com>"),
});

export function env() {
  return envSchema.parse(process.env);
}

export function validateProductionEnv() {
  return env();
}
