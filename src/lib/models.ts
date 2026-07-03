import mongoose, { Schema } from "mongoose";

const roles = ["super_admin", "account_manager"] as const;
const requestStatuses = ["pending", "approved", "partially_approved", "rejected"] as const;
const accountRequestStatuses = ["pending", "approved", "rejected"] as const;
const notificationCategories = ["accounts", "requests", "tickets", "users", "outlets", "events", "reports", "system"] as const;

const ProfileSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    role: { type: String, enum: roles, required: true, default: "account_manager" },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

const AllowedUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: roles, required: true, default: "account_manager" },
    createdBy: { type: String, default: "system" },
  },
  { timestamps: true },
);

const NotificationSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, required: true },
    recipients: { type: [String], default: [] },
    subject: { type: String, default: "" },
    status: { type: String, enum: ["sent", "simulated", "failed", "skipped"], default: "skipped" },
    providerId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: false },
);

const AccountRequestSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, default: "", trim: true },
    reason: { type: String, default: "" },
    requestedRole: { type: String, enum: ["account_manager"], default: "account_manager" },
    status: { type: String, enum: accountRequestStatuses, default: "pending" },
    reviewedBy: { type: String, default: "" },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, default: "" },
    notifications: { type: [NotificationSchema], default: [] },
  },
  { timestamps: true },
);
AccountRequestSchema.index({ status: 1, createdAt: -1 });

const TicketTypeSchema = new Schema(
  {
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const EventSchema = new Schema(
  {
    name: { type: String, required: true },
    eventKind: { type: String, enum: ["event", "festival"], default: "event" },
    sponsorshipName: { type: String, default: "" },
    sponsorshipTier: { type: String, default: "" },
    market: { type: String, default: "" },
    venue: { type: String, default: "" },
    city: { type: String, default: "" },
    startsAt: { type: Date },
    status: { type: String, enum: ["draft", "published", "closed"], default: "draft" },
    description: { type: String, default: "" },
    maxTicketsPerOutlet: { type: Number, min: 1, default: 2 },
    ticketTypes: { type: [TicketTypeSchema], default: [{ name: "Regular", active: true }] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

const OutletSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, default: "bar" },
    city: { type: String, default: "" },
    status: { type: String, enum: ["approved", "pending", "archived"], default: "approved" },
    proposedBy: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

const RequestItemSchema = new Schema(
  {
    ticketType: { type: String, required: true },
    quantity: { type: Number, min: 1, required: true },
    approvedQuantity: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const HistorySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: String, required: true },
    action: { type: String, required: true },
    message: { type: String, default: "" },
  },
  { _id: false },
);

const DispatchSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: String, required: true },
    recipients: { type: [String], required: true },
    subject: { type: String, required: true },
    fileNames: { type: [String], default: [] },
    status: { type: String, enum: ["sent", "simulated", "failed"], default: "simulated" },
    providerId: { type: String, default: "" },
  },
  { _id: false },
);

const TicketRequestSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    outlet: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    requestedBy: { type: String, required: true },
    accountManagerName: { type: String, default: "" },
    status: { type: String, enum: requestStatuses, default: "pending" },
    recipientEmails: { type: [String], default: [] },
    items: { type: [RequestItemSchema], default: [] },
    notes: { type: String, default: "" },
    adminNotes: { type: String, default: "" },
    history: { type: [HistorySchema], default: [] },
    dispatches: { type: [DispatchSchema], default: [] },
  },
  { timestamps: true },
);
// Speeds up the per-outlet limit aggregation and the account-manager list view.
TicketRequestSchema.index({ event: 1, outlet: 1, status: 1 });
TicketRequestSchema.index({ requestedBy: 1, updatedAt: -1 });
TicketRequestSchema.index({ updatedAt: -1 });

const AuditLogSchema = new Schema(
  {
    actor: { type: String, required: true },
    action: { type: String, required: true },
    target: { type: String, default: "" },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

const RateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
// Mongo automatically removes expired buckets, keeping the collection small.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AppNotificationSchema = new Schema(
  {
    recipient: { type: String, required: true, lowercase: true, trim: true, index: true },
    actor: { type: String, default: "system", lowercase: true, trim: true },
    category: { type: String, enum: notificationCategories, default: "system", index: true },
    entityType: { type: String, default: "" },
    entityId: { type: String, default: "" },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    read: { type: Boolean, default: false, index: true },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    metadata: { type: Schema.Types.Mixed },
    emailStatus: { type: String, enum: ["sent", "simulated", "failed", "skipped"], default: "skipped" },
    emailProviderId: { type: String, default: "" },
    emailError: { type: String, default: "" },
  },
  { timestamps: true },
);
// Backs the inbox query (recipient + read filter, newest first).
AppNotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

function model(name: string, schema: Schema) {
  if (process.env.NODE_ENV !== "production" && mongoose.models[name]) {
    delete mongoose.models[name];
  }
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const Profile = model("Profile", ProfileSchema);
export const AllowedUser = model("AllowedUser", AllowedUserSchema);
export const AccountRequest = model("AccountRequest", AccountRequestSchema);
export const Event = model("Event", EventSchema);
export const Outlet = model("Outlet", OutletSchema);
export const TicketRequest = model("TicketRequest", TicketRequestSchema);
export const AuditLog = model("AuditLog", AuditLogSchema);
export const AppNotification = model("AppNotification", AppNotificationSchema);
export const RateLimit = model("RateLimit", RateLimitSchema);
