import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

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

test("super admin can complete request workflow and see internal notifications", async ({ page }) => {
  const adminEmail = (process.env.SUPER_ADMIN_EMAILS || "admin@example.com").split(",")[0].trim();
  qaIds.suffix = String(Date.now());
  const qaEmail = `qa.e2e.${qaIds.suffix}@example.com`;

  await page.goto("/");
  if (await page.getByRole("button", { name: "Enter hub" }).isVisible().catch(() => false)) {
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByRole("button", { name: "Enter hub" }).click();
  }
  await expect(page.getByText("Workspace")).toBeVisible();

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
        name: "qa-ticket.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("QA ticket file"),
      },
    },
  });
  expect(dispatchResponse.ok()).toBeTruthy();
  expect((await dispatchResponse.json()).delivery.status).toMatch(/sent|simulated/);

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
});
