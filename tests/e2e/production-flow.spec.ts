import { expect, test, type Page } from "@playwright/test";
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

test.describe.configure({ mode: "serial" });

async function signInByEmail(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/");
  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();
  const { csrfToken } = await csrfResponse.json();
  const signInResponse = await page.request.post("/api/auth/callback/email", {
    form: { csrfToken, email, json: "true" },
  });
  expect([200, 302]).toContain(signInResponse.status());
  await page.goto("/");
  await expect(page.getByText("Workspace")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("nav button").first()).toBeAttached({ timeout: 20_000 });
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

test("super admin can complete request workflow and see internal notifications", async ({ page }) => {
  const adminEmail = (process.env.SUPER_ADMIN_EMAILS || "admin@example.com").split(",")[0].trim();
  qaIds.suffix = String(Date.now());
  const qaEmail = `qa.e2e.${qaIds.suffix}@example.com`;

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

test("personas can create events, outlets, and requests from dashboard forms", async ({ page }) => {
  const adminEmail = (process.env.SUPER_ADMIN_EMAILS || "amelillo@bacardi.com").split(",")[0].trim();
  const managerEmail = "adrianomelilloxx@gmail.com";
  qaIds.suffix = `ui-${Date.now()}`;
  const eventName = `QA E2E UI Festival ${qaIds.suffix}`;
  const outletName = `QA E2E UI Outlet ${qaIds.suffix}`;
  const recipientEmail = `qa.e2e.ui.${qaIds.suffix}@example.com`;

  async function signInAs(email: string) {
    await signInByEmail(page, email);
  }

  async function clickNav(label: string) {
    const titledItem = page.getByTitle(label).first();
    if ((await titledItem.count()) > 0) {
      await titledItem.evaluate((element: HTMLElement) => element.click());
      return;
    }
    const navIndex: Record<string, number> = {
      Requests: 0,
      "Events & festivals": 1,
      Outlets: 2,
      Users: 3,
      Reports: 4,
      "New request": 0,
      "My requests": 1,
    };
    if (label in navIndex && (await page.locator("nav button").count()) > navIndex[label]) {
      await page.locator("nav button").nth(navIndex[label]).evaluate((element: HTMLElement) => element.click());
      return;
    }
    const item = page.getByRole("button", { name: label }).first();
    if (!(await item.isVisible().catch(() => false))) {
      await page.getByLabel("Open navigation").click();
    }
    await item.click();
  }

  await signInAs(adminEmail);
  await expect(page.getByText("Manage requests, outlets, events, users, and reporting from one operational view.")).toBeVisible();
  await clickNav("Events & festivals");
  const eventForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create sponsored item" }) });
  await eventForm.locator('[name="name"]').fill(eventName);
  await eventForm.locator('[name="eventKind"]').selectOption("festival");
  await eventForm.locator('[name="market"]').fill("QA Market");
  await eventForm.locator('[name="venue"]').fill("QA Arena");
  await eventForm.locator('[name="city"]').fill("Milan");
  await eventForm.locator('[name="startsDate"]').fill("2026-08-15");
  await eventForm.locator('[name="startsTime"]').fill("18:30");
  await eventForm.locator('[name="maxTicketsPerOutlet"]').fill("2");
  await eventForm.locator('input').last().fill("Regular, VIP");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/events") && response.request().method() === "POST"),
    eventForm.getByRole("button", { name: "Create sponsored item" }).click(),
  ]);
  await expect(page.getByText("Sponsored event or festival created.")).toBeVisible();
  await page.getByLabel("Search events and festivals").fill(eventName);
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();

  await clickNav("Outlets");
  const outletForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add outlet" }) });
  await outletForm.locator('[name="name"]').fill(outletName);
  await outletForm.locator('[name="type"]').fill("bar");
  await outletForm.locator('[name="city"]').fill("Milan");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/outlets") && response.request().method() === "POST"),
    outletForm.getByRole("button", { name: "Add outlet" }).click(),
  ]);
  await expect(page.getByText("Outlet added.")).toBeVisible();
  await page.getByLabel("Search outlets").fill(outletName);
  await expect(page.getByRole("heading", { name: outletName })).toBeVisible();

  await signInAs(managerEmail);
  await expect(page.getByRole("button", { name: "Users" })).toHaveCount(0);
  await clickNav("New request");
  const requestForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "New sponsorship ticket request" }) });
  await requestForm.locator('[name="eventId"]').selectOption({ label: `${eventName} (Festival)` });
  await requestForm.getByLabel("Search outlet").fill(outletName);
  await requestForm.locator('[name="outletId"]').selectOption({ label: `${outletName} - Milan` });
  await requestForm.locator('[name="ticketType"]').selectOption("Regular");
  await requestForm.locator('[name="quantity"]').fill("1");
  await requestForm.locator('[name="recipientEmails"]').fill(recipientEmail);
  await requestForm.locator('[name="notes"]').fill(`QA E2E UI request ${qaIds.suffix}`);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/requests") && response.request().method() === "POST"),
    requestForm.getByRole("button", { name: "Submit request" }).click(),
  ]);
  await expect(page.getByText("Request submitted for manager review.")).toBeVisible();
  await clickNav("My requests");
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByText("Next: a manager reviews the outlet, quantities, recipients, and notes.")).toBeVisible();
});
