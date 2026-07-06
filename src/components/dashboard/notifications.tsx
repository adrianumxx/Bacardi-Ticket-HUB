"use client";

import { useState } from "react";
import { Mail, X } from "@/components/ui/solar-icons";
import { formatDate } from "@/lib/utils";
import type { AppNotification, NotificationRecord, Tone } from "./types";
import { dispatchLabel, dispatchTone, notificationTone } from "./helpers";
import { ActionButton, Badge, CountPill, EmptyState } from "./ui-primitives";

export function NotificationDrawer({
  notifications,
  unreadCount,
  filter,
  onFilter,
  onClose,
  onOpenEntity,
  onRead,
  onReadMany,
  onReadAll,
  onDelete,
  onDeleteMany,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  filter: "all" | "unread" | AppNotification["category"];
  onFilter: (filter: "all" | "unread" | AppNotification["category"]) => void;
  onClose: () => void;
  onOpenEntity: (category: AppNotification["category"]) => void;
  onRead: (id: string, read: boolean) => Promise<void>;
  onReadMany: (ids: string[], read: boolean) => Promise<void>;
  onReadAll: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteMany: (ids: string[]) => Promise<void>;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filters: { id: "all" | "unread" | AppNotification["category"]; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "requests", label: "Requests" },
    { id: "accounts", label: "Accounts" },
    { id: "tickets", label: "Tickets" },
  ];
  const visibleIds = notifications.map((notification) => notification._id);
  const selectedSet = new Set(selectedIds);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const unreadVisible = notifications.filter((notification) => !notification.read).length;
  const failedEmails = notifications.filter((notification) => ["failed", "bounced", "complained"].includes(notification.emailStatus)).length;

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const currentSet = new Set(current);
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      for (const id of visibleIds) currentSet.add(id);
      return [...currentSet];
    });
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected notification${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    await onDeleteMany(selectedIds);
    setSelectedIds([]);
    setSelecting(false);
  }

  async function markSelected(read: boolean) {
    if (selectedIds.length === 0) return;
    await onReadMany(selectedIds, read);
    setSelectedIds([]);
    setSelecting(false);
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <button className="absolute inset-0 bg-stone-950/35" onClick={onClose} aria-label="Close notifications" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">Notifications</p>
            <h2 className="mt-1 text-xl font-semibold">Inbox</h2>
            <p className="mt-1 text-sm text-stone-600">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</p>
          </div>
          <ActionButton type="button" variant="secondary" className="h-9 w-9 min-h-0 px-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </ActionButton>
        </div>
        <div className="space-y-3 border-b border-stone-200 p-3">
          <div className="grid grid-cols-3 gap-2">
            <NotificationCounter label="Visible" value={notifications.length} />
            <NotificationCounter label="Unread" value={unreadVisible} tone={unreadVisible > 0 ? "warn" : "neutral"} />
            <NotificationCounter label="Email failed" value={failedEmails} tone={failedEmails > 0 ? "bad" : "neutral"} />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <ActionButton
                key={item.id}
                type="button"
                variant={filter === item.id ? "primary" : "secondary"}
                className="min-h-9 px-3 text-xs"
                onClick={() => {
                  setSelectedIds([]);
                  setSelecting(false);
                  onFilter(item.id);
                }}
              >
                {item.label}
              </ActionButton>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <ActionButton
                type="button"
                variant={selecting ? "primary" : "secondary"}
                className="min-h-9 px-3 text-xs"
                onClick={() => {
                  setSelecting((current) => !current);
                  setSelectedIds([]);
                }}
              >
                {selecting ? "Cancel selection" : "Select messages"}
              </ActionButton>
              {selecting && (
                <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={toggleAllVisible} disabled={notifications.length === 0}>
                  {allVisibleSelected ? "Clear visible" : "Select all visible"}
                </ActionButton>
              )}
            </div>
            <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => void onReadAll()}>
              Mark all read
            </ActionButton>
          </div>
          {selecting && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-stone-50 p-2">
              <span className="text-xs font-medium text-stone-600">{selectedIds.length} selected</span>
              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" disabled={selectedIds.length === 0} onClick={() => void markSelected(true)}>
                  Mark read
                </ActionButton>
                <ActionButton type="button" variant="secondary" className="min-h-9 px-3 text-xs" disabled={selectedIds.length === 0} onClick={() => void markSelected(false)}>
                  Mark unread
                </ActionButton>
                <ActionButton type="button" variant="ghost" className="min-h-9 px-3 text-xs" disabled={selectedIds.length === 0} onClick={() => void deleteSelected()}>
                  Delete
                </ActionButton>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.map((notification) => (
            <article key={notification._id} className={`border-b border-stone-100 p-4 ${notification.read ? "bg-white" : "bg-amber-50/50"}`}>
              <div className="flex items-start gap-3">
                {selecting && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#EB6A1C]"
                    checked={selectedSet.has(notification._id)}
                    onChange={() => toggleSelected(notification._id)}
                    aria-label={`Select notification: ${notification.title}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={notification.read ? "neutral" : "warn"}>{notification.read ? "Read" : "Unread"}</Badge>
                    {notification.priority === "high" && <Badge tone="bad">High priority</Badge>}
                    <Badge tone={dispatchTone(notification.emailStatus)}>{notification.emailStatus === "skipped" ? "In-app only" : `Email ${dispatchLabel(notification.emailStatus)}`}</Badge>
                  </div>
                  <h3 className="mt-2 font-semibold">{notification.title}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-stone-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-stone-500">{formatDate(notification.createdAt)} - {notification.actor}</p>
                  {notification.emailError && <p className="mt-1 text-xs text-red-700">{notification.emailError}</p>}
                </div>
              </div>
              {!selecting && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton variant="secondary" onClick={() => onOpenEntity(notification.category)}>{notificationContextLabel(notification.category)}</ActionButton>
                  <ActionButton variant="ghost" onClick={() => void onRead(notification._id, !notification.read)}>
                    Mark {notification.read ? "unread" : "read"}
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm("Delete this notification? This cannot be undone.")) void onDelete(notification._id);
                    }}
                  >
                    Delete
                  </ActionButton>
                </div>
              )}
            </article>
          ))}
          {notifications.length === 0 && <div className="p-4"><EmptyState text="No notifications match this filter." /></div>}
        </div>
      </aside>
    </div>
  );
}


export function NotificationCounter({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50 text-stone-800",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function notificationContextLabel(category: AppNotification["category"]) {
  if (category === "accounts" || category === "users") return "Open users";
  if (category === "tickets" || category === "requests") return "Open requests";
  if (category === "events" || category === "outlets") return "Open events";
  if (category === "reports") return "Open reports";
  return "Open workspace";
}


export function NotificationList({ notifications }: { notifications: NotificationRecord[] }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Notifications</h4>
        <CountPill label="Total" value={notifications.length} />
      </div>
      <div className="mt-3 space-y-3">
        {notifications.map((notification, index) => (
          <div key={`${notification.at}-${notification.type}-${index}`} className="grid gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={notificationTone(notification.status)}>{notification.status}</Badge>
              <span className="font-medium">{notification.type.replaceAll("_", " ")}</span>
            </div>
            <p className="text-stone-600">{notification.subject}</p>
            <p className="break-words text-stone-600">
              <Mail className="mr-1 inline" size={14} />
              {notification.recipients.length ? notification.recipients.join(", ") : "No recipients configured"}
            </p>
            {notification.error && <p className="text-red-700">{notification.error}</p>}
            <p className="text-xs text-stone-500">{formatDate(notification.at)}</p>
          </div>
        ))}
        {notifications.length === 0 && <p className="text-sm text-stone-500">No account notifications recorded yet.</p>}
      </div>
    </section>
  );
}


