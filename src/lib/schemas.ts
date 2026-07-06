import { z } from "zod";
import { splitEmails } from "@/lib/utils";

export const roleSchema = z.enum(["super_admin", "workspace_manager", "account_manager"]);

export const allowedUserSchema = z.object({
  email: z.email(),
  role: roleSchema.default("account_manager"),
});

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().max(60).optional().default(""),
});

export const adminUserUpdateSchema = z.object({
  role: roleSchema.optional(),
  status: z.enum(["active", "blocked"]).optional(),
  accessEnabled: z.boolean().optional(),
  whitelisted: z.boolean().optional(),
  managerEmail: z.union([z.email(), z.literal("")]).optional(),
});

export const accountRequestSchema = z.object({
  email: z.email(),
  name: z.string().min(2),
  company: z.string().optional().default(""),
  reason: z.string().optional().default(""),
});

export const reviewAccountRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().optional().default(""),
});

export const eventSchema = z.object({
  name: z.string().min(2),
  eventKind: z.enum(["event", "festival"]).default("event"),
  sponsorshipName: z.string().optional().default(""),
  sponsorshipTier: z.string().optional().default(""),
  market: z.string().optional().default(""),
  venue: z.string().optional().default(""),
  city: z.string().optional().default(""),
  startsAt: z.string().optional().default(""),
  status: z.enum(["draft", "published", "closed"]).default("draft"),
  description: z.string().optional().default(""),
  maxTicketsPerOutlet: z.coerce.number().int().min(1).default(2),
  ticketTypes: z
    .array(
      z.object({
        name: z.string().min(1),
        active: z.boolean().default(true),
      }),
    )
    .min(1)
    .default([{ name: "Regular", active: true }]),
});

export const outletSchema = z.object({
  name: z.string().min(2),
  type: z.string().optional().default(""),
  city: z.string().optional().default(""),
  status: z.enum(["approved", "pending", "archived"]).default("approved"),
  notes: z.string().optional().default(""),
});

export const outletMergeSchema = z.object({
  targetOutletId: z.string().min(1),
});

export const requestItemBaseSchema = z.object({
  ticketType: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  approvedQuantity: z.coerce.number().int().min(0).optional().default(0),
});

export const requestItemSchema = requestItemBaseSchema.refine((item) => item.approvedQuantity <= item.quantity, {
  message: "Approved quantity cannot be higher than requested quantity.",
  path: ["approvedQuantity"],
});

export const createRequestSchema = z.object({
  eventId: z.string().min(1),
  outletId: z.string().optional(),
  newOutlet: outletSchema.optional(),
  outlets: z
    .array(
      z.object({
        name: z.string().trim().min(2),
        quantity: z.coerce.number().int().min(1).optional(),
      }),
    )
    .optional(),
  recipientEmails: z
    .string()
    .optional()
    .default("")
    .transform((value) => splitEmails(value))
    .pipe(z.array(z.email()).min(1, "Add at least one recipient email.")),
  items: z.array(requestItemBaseSchema.omit({ approvedQuantity: true })).min(1),
  notes: z.string().optional().default(""),
});

export const updateRequestSchema = z.object({
  status: z.enum(["pending", "approved", "partially_approved", "rejected"]).optional(),
  recipientEmails: z.array(z.email()).optional(),
  items: z.array(requestItemSchema).optional(),
  adminNotes: z.string().optional(),
});

export const sendTicketSchema = z.object({
  recipients: z.array(z.email()).min(1),
  subject: z.string().min(2),
  message: z.string().min(2),
});
