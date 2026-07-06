import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { encode } from "next-auth/jwt";

function readEnvFile() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index > 0 && !process.env[trimmed.slice(0, index)]) {
      process.env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
  }
}

readEnvFile();

const qaIds: { eventId?: string; outletId?: string; requestId?: string; suffix?: string } = {};

test.describe.configure({ mode: "serial" });

async function seedTestUser(email: string, role: "super_admin" | "workspace_manager" | "account_manager", managerEmail = "") {
  expect(process.env.MONGODB_URI, "MONGODB_URI is required for E2E auth seeding").toBeTruthy();
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: "bacardi-ticket-hub" });
  const normalized = email.trim().toLowerCase();
  await mongoose.connection.db.collection("allowedusers").updateOne(
    { email: normalized },
    { $set: { email: normalized, role, createdBy: "e2e", updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  await mongoose.connection.db.collection("profiles").updateOne(
    { email: normalized },
    { $set: { email: normalized, role, status: "active", name: role === "super_admin" ? "QA Super Admin" : role === "workspace_manager" ? "QA Workspace Manager" : "QA Account Manager", managerEmail: managerEmail.trim().toLowerCase(), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  await mongoose.disconnect();
}

async function signInByEmail(page: Page, email: string) {
  await page.context().clearCookies();
  const normalized = email.trim().toLowerCase();
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET || "test-secret",
    token: {
      email: normalized,
      name: normalized.split("@")[0],
      sub: normalized,
    },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: process.env.NEXTAUTH_URL || "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/");
  await expect(page.locator("nav button").first()).toBeAttached({ timeout: 20_000 });
}

async function clickNav(page: Page, label: string) {
  const item = page.getByRole("button", { name: label }).first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByLabel("Open navigation").click();
  }
  if ((await item.count()) > 0) {
    await item.evaluate((element: HTMLElement) => element.click());
    return;
  }
  await page.getByTitle(label).first().evaluate((element: HTMLElement) => element.click());
}

test.afterAll(async () => {
  if (!process.env.MONGODB_URI) return;
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "bacardi-ticket-hub" });
  const db = mongoose.connection.db;
  const qaRequests = await db.collection("ticketrequests").find({ notes: /^QA E2E/ }, { projection: { _id: 1, event: 1, outlet: 1 } }).toArray();
  const qaEvents = await db.collection("events").find({ name: /^QA E2E/ }, { projection: { _id: 1 } }).toArray();
  const qaOutlets = await db.collection("outlets").find({ name: /^QA E2E/ }, { projection: { _id: 1 } }).toArray();
  const requestIds = qaRequests.map((item) => String(item._id));
  const eventIds = [...qaEvents.map((item) => String(item._id)), ...qaRequests.map((item) => String(item.event))];
  const outletIds = [...qaOutlets.map((item) => String(item._id)), ...qaRequests.map((item) => String(item.outlet))];
  await db.collection("auditlogs").deleteMany({
    $or: [
      { target: { $in: [...requestIds, ...eventIds, ...outletIds].filter(Boolean) } },
      { "payload.eventId": { $in: eventIds.filter(Boolean) } },
      { "payload.outletId": { $in: outletIds.filter(Boolean) } },
      { "payload.name": /^QA E2E/ },
      { "payload.qaSuffix": qaIds.suffix },
      { "payload.recipients": /^qa\.e2e\./ },
    ],
  });
  await db.collection("ticketrequests").deleteMany({ notes: /^QA E2E/ });
  await db.collection("events").deleteMany({ name: /^QA E2E/ });
  await db.collection("outlets").deleteMany({ name: /^QA E2E/ });
  await db.collection("appnotifications").deleteMany({
    $or: [
      { "metadata.qaSuffix": qaIds.suffix },
      { message: /QA E2E|qa\.e2e/i },
      { recipient: /^qa\.e2e\./ },
    ],
  });
  await mongoose.disconnect();
});

test("workspace manager only sees and manages assigned team requests", async ({ page }) => {
  const suffix = `team-${Date.now()}`;
  const managerEmail = `qa.e2e.manager.${suffix}@example.com`;
  const ownedEmail = `qa.e2e.owned.${suffix}@example.com`;
  const outsideEmail = `qa.e2e.outside.${suffix}@example.com`;

  await seedTestUser(managerEmail, "workspace_manager");
  await seedTestUser(ownedEmail, "account_manager", managerEmail);
  await seedTestUser(outsideEmail, "account_manager");

  await mongoose.connect(process.env.MONGODB_URI!, { dbName: "bacardi-ticket-hub" });
  const db = mongoose.connection.db;
  const eventId = new mongoose.Types.ObjectId();
  const outletId = new mongoose.Types.ObjectId();
  const ownedRequestId = new mongoose.Types.ObjectId();
  const outsideRequestId = new mongoose.Types.ObjectId();
  await db.collection("events").insertOne({
    _id: eventId,
    name: `QA E2E Team Festival ${suffix}`,
    eventKind: "festival",
    status: "published",
    maxTicketsPerOutlet: 4,
    ticketTypes: [{ name: "Regular", active: true }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.collection("outlets").insertOne({
    _id: outletId,
    name: `QA E2E Team Outlet ${suffix}`,
    type: "bar",
    status: "approved",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const baseRequest = {
    event: eventId,
    outlet: outletId,
    status: "pending",
    recipientEmails: [`qa.e2e.recipient.${suffix}@example.com`],
    items: [{ ticketType: "Regular", quantity: 1, approvedQuantity: 0 }],
    notes: `QA E2E team visibility ${suffix}`,
    dispatches: [],
    history: [{ by: "e2e", action: "created", message: "QA E2E team visibility." }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection("ticketrequests").insertMany([
    { ...baseRequest, _id: ownedRequestId, requestedBy: ownedEmail, accountManagerName: "QA Owned Manager" },
    { ...baseRequest, _id: outsideRequestId, requestedBy: outsideEmail, accountManagerName: "QA Outside Manager" },
  ]);
  await mongoose.disconnect();

  await signInByEmail(page, managerEmail);
  const requestsResponse = await page.request.get("/api/requests");
  expect(requestsResponse.ok()).toBeTruthy();
  const requestPayload = await requestsResponse.json();
  const visibleRequestIds = requestPayload.requests.map((item: { _id: string }) => String(item._id));
  expect(visibleRequestIds).toContain(String(ownedRequestId));
  expect(visibleRequestIds).not.toContain(String(outsideRequestId));

  const reportResponse = await page.request.get(`/api/reports?accountManager=qa.e2e&dateFrom=2026-01-01`);
  expect(reportResponse.ok()).toBeTruthy();
  const reportPayload = await reportResponse.json();
  expect(reportPayload.rows.map((row: { accountManagerEmail: string }) => row.accountManagerEmail)).toContain(ownedEmail);
  expect(reportPayload.rows.map((row: { accountManagerEmail: string }) => row.accountManagerEmail)).not.toContain(outsideEmail);

  const forbiddenUpdate = await page.request.patch(`/api/requests/${outsideRequestId}`, {
    data: {
      status: "approved",
      recipientEmails: [`qa.e2e.recipient.${suffix}@example.com`],
      items: [{ ticketType: "Regular", quantity: 1, approvedQuantity: 1 }],
      adminNotes: "Should be forbidden.",
    },
  });
  expect(forbiddenUpdate.status()).toBe(403);
});

test("super admin can complete request workflow and see internal notifications", async ({ page }) => {
  const adminEmail = (process.env.SUPER_ADMIN_EMAILS || "admin@example.com").split(",")[0].trim();
  qaIds.suffix = String(Date.now());
  const qaEmail = `qa.e2e.${qaIds.suffix}@example.com`;

  await seedTestUser(adminEmail, "super_admin");
  await signInByEmail(page, adminEmail);

  const eventResponse = await page.request.post("/api/events", {
    data: {
      name: `QA E2E Festival ${qaIds.suffix}`,
      eventKind: "festival",
      status: "published",
      maxTicketsPerOutlet: 2,
      ticketTypes: [{ name: "Regular", active: true }],
    },
  });
  expect(eventResponse.ok()).toBeTruthy();
  qaIds.eventId = (await eventResponse.json()).event._id;

  const outletResponse = await page.request.post("/api/outlets", {
    data: { name: `QA E2E Outlet ${qaIds.suffix}`, type: "bar", city: "Milan", status: "approved" },
  });
  expect(outletResponse.ok()).toBeTruthy();
  qaIds.outletId = (await outletResponse.json()).outlet._id;

  const requestResponse = await page.request.post("/api/requests", {
    data: {
      eventId: qaIds.eventId,
      outletId: qaIds.outletId,
      recipientEmails: qaEmail,
      items: [{ ticketType: "Regular", quantity: 1 }],
      notes: `QA E2E request ${qaIds.suffix}`,
    },
  });
  expect(requestResponse.ok()).toBeTruthy();
  qaIds.requestId = (await requestResponse.json()).request._id;

  const approvalResponse = await page.request.patch(`/api/requests/${qaIds.requestId}`, {
    data: {
      status: "approved",
      recipientEmails: [qaEmail],
      items: [{ ticketType: "Regular", quantity: 1, approvedQuantity: 1 }],
      adminNotes: "QA E2E approval.",
    },
  });
  expect(approvalResponse.ok()).toBeTruthy();

  const dispatchResponse = await page.request.post(`/api/requests/${qaIds.requestId}/send-ticket`, {
    multipart: {
      recipients: qaEmail,
      subject: "QA E2E ticket dispatch",
      message: "QA E2E ticket dispatch.",
      files: {
        name: "qa-ticket.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% QA ticket file\n"),
      },
    },
  });
  expect(dispatchResponse.ok()).toBeTruthy();
  expect((await dispatchResponse.json()).delivery.status).toMatch(/sent|simulated|failed/);

  const notificationResponse = await page.request.get("/api/notifications");
  expect(notificationResponse.ok()).toBeTruthy();
  expect((await notificationResponse.json()).unreadCount).toBeGreaterThan(0);

  const auditResponse = await page.request.get("/api/audit-logs?action=ticket_request.dispatch");
  expect(auditResponse.ok()).toBeTruthy();
  const auditPayload = await auditResponse.json();
  expect(auditPayload.logs.some((log: { target: string }) => log.target === qaIds.requestId)).toBeTruthy();

  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/notifications") && response.status() === 200),
    page.reload(),
  ]);
  await page.getByTitle("Notifications").click();
  await expect(page.getByText("Inbox")).toBeVisible();
  await expect(page.getByText(/New sponsorship ticket request|Ticket email dispatched/).first()).toBeVisible();

  await page.getByRole("button", { name: "Select messages" }).click();
  await page.getByRole("button", { name: "Select all visible" }).click();
  await expect(page.getByText(/selected/)).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  if ((page.viewportSize()?.width ?? 0) >= 900) {
    await clickNav(page, "Reports");
    await expect(page.getByText("Account manager activity matrix")).toBeVisible();
    await page.getByLabel(/View report for/).first().evaluate((element: HTMLElement) => element.click());
    await expect(page.getByText("Account manager report")).toBeVisible();
    await expect(page.getByText("Request details")).toBeVisible();
  }
});

test("personas can create events, outlets, and requests from dashboard forms", async ({ page }) => {
  const adminEmail = (process.env.SUPER_ADMIN_EMAILS || "amelillo@bacardi.com").split(",")[0].trim();
  const managerEmail = "adrianomelilloxx@gmail.com";
  qaIds.suffix = `ui-${Date.now()}`;
  const eventName = `QA E2E UI Festival ${qaIds.suffix}`;
  const outletName = `QA E2E UI Outlet ${qaIds.suffix}`;
  const outletNameTwo = `QA E2E UI Outlet 2 ${qaIds.suffix}`;
  const recipientEmail = `qa.e2e.ui.${qaIds.suffix}@example.com`;

  async function signInAs(email: string) {
    await signInByEmail(page, email);
  }

  await seedTestUser(adminEmail, "super_admin");
  await seedTestUser(managerEmail, "account_manager");
  await signInAs(adminEmail);
  await expect(page.getByText("Run the workspace cockpit: requests, events, users, reporting, notifications, and audit visibility.")).toBeVisible();
  await clickNav(page, "Events & festivals");
  const eventForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "New event or festival" }) });
  await eventForm.locator('[name="name"]').fill(eventName);
  await eventForm.locator('[name="startsDate"]').fill("2026-08-15");
  await eventForm.locator('[name="startsTime"]').fill("18:30");
  await eventForm.locator('[name="maxTicketsPerOutlet"]').fill("2");
  await eventForm.locator('input').last().fill("Regular, VIP");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/events") && response.request().method() === "POST"),
    eventForm.getByRole("button", { name: "Create event" }).click(),
  ]);
  await expect(page.getByText("Sponsored event or festival created.")).toBeVisible();
  await page.getByLabel("Search events and festivals").fill(eventName);
  await expect(page.getByRole("heading", { name: eventName }).first()).toBeVisible();

  await signInAs(managerEmail);
  await expect(page.getByRole("button", { name: "Users" })).toHaveCount(0);
  await clickNav(page, "New request");
  const requestForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Request sponsorship tickets" }) });
  await requestForm.locator('[name="eventId"]').selectOption({ label: eventName });
  await requestForm.getByLabel("Client name", { exact: true }).fill(outletName);
  await requestForm.getByLabel("Add another outlet client").click();
  await requestForm.getByLabel("Client name 2").fill(outletNameTwo);
  await requestForm.locator('[name="ticketType"]').selectOption("Regular");
  await requestForm.getByLabel("Quantity").nth(0).fill("1");
  await requestForm.getByLabel("Quantity").nth(1).fill("1");
  await requestForm.locator('[name="recipientEmails"]').fill(recipientEmail);
  await requestForm.locator('[name="notes"]').fill(`QA E2E UI request ${qaIds.suffix}`);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/requests") && response.request().method() === "POST"),
    requestForm.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await expect(page.getByText("2 requests were sent to the manager for review.").first()).toBeVisible();
  await clickNav(page, "My requests");
  await expect(page.getByRole("heading", { name: eventName }).first()).toBeVisible();
  await expect(page.getByText("Next: a manager reviews the outlet, quantities, recipients, and notes.").first()).toBeVisible();
});
