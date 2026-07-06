"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Search } from "@/components/ui/solar-icons";
import { formatDate } from "@/lib/utils";
import type { AccountRequest, AdminUserRow, Role, Tone } from "./types";
import { api, inputClass, isWorkspaceManager, roleLabel, roleShortLabel } from "./helpers";
import { ActionButton, Badge, CompactMetric, CountPill, EmptyState, Field, LabeledControl, MiniSelect, Notice } from "./ui-primitives";
import { NotificationList } from "./notifications";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { localeMap } from "@/lib/i18n/translations";

export function UsersPanel({
  users,
  onDone,
  notify,
}: {
  users: {
    allowedUsers: { email: string; role: Role; createdBy?: string; createdAt?: string }[];
    profiles: { email: string; name?: string; role: Role; status?: "active" | "blocked"; lastLoginAt?: string; managerEmail?: string }[];
    accountRequests: AccountRequest[];
  };
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const currentUserEmail = session?.user?.email?.toLowerCase() || "";
  const [submitting, setSubmitting] = useState(false);
  const [busyEmail, setBusyEmail] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const role = String(form.get("role") || "account_manager") as Role;
    const email = String(form.get("email") || "");
    if (role === "super_admin" && !window.confirm(t("users.createSuperAdminConfirm", { email }))) return;
    setSubmitting(true);
    setFormError("");
    try {
      const response = await api<{ delivery?: { status: string } }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      formElement.reset();
      notify(t("users.accessUpdated", { status: response.delivery?.status || t("users.skipped") }));
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("users.unableToUpdateAccess");
      setFormError(message);
      notify(message, "bad");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUser(email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean; managerEmail?: string }) {
    setBusyEmail(email);
    try {
      await api(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      notify(t("users.updated"));
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("users.unableToUpdateUser"), "bad");
    } finally {
      setBusyEmail("");
    }
  }

  async function deleteUser(email: string) {
    if (!window.confirm(t("users.deleteConfirm", { email }))) return;
    setBusyEmail(email);
    try {
      await api(`/api/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" });
      notify(t("users.deleted"));
      await onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : t("users.unableToDelete"), "bad");
    } finally {
      setBusyEmail("");
    }
  }

  const allowedMap = new Map(users.allowedUsers.map((user) => [user.email, user]));
  const profileMap = new Map(users.profiles.map((profile) => [profile.email, profile]));
  const combinedRows: AdminUserRow[] = [...new Set([...users.allowedUsers.map((user) => user.email), ...users.profiles.map((profile) => profile.email)])]
    .map((email) => {
      const allowed = allowedMap.get(email);
      const profile = profileMap.get(email);
      return {
        email,
        name: profile?.name || "",
        role: (profile?.role || allowed?.role || "account_manager") as Role,
        status: profile?.status || "active",
        lastLoginAt: profile?.lastLoginAt,
        accessEnabled: Boolean(allowed),
        source: allowed ? t("users.approvedBy", { by: allowed.createdBy || t("users.approved") }) : t("users.profileOnly"),
        managerEmail: profile?.managerEmail || "",
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
  const userStats = {
    total: combinedRows.length,
    superAdmins: combinedRows.filter((row) => row.role === "super_admin").length,
    managers: combinedRows.filter((row) => row.role === "workspace_manager").length,
    accountManagers: combinedRows.filter((row) => row.role === "account_manager").length,
    blocked: combinedRows.filter((row) => row.status === "blocked").length,
    missingAccess: combinedRows.filter((row) => !row.accessEnabled).length,
    unassigned: combinedRows.filter((row) => row.role === "account_manager" && !row.managerEmail).length,
  };
  const visibleRows = combinedRows.filter((row) =>
    [row.name, row.email, row.role, row.status, row.source, row.managerEmail].join(" ").toLowerCase().includes(userSearch.toLowerCase()),
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_1fr]">
      <form onSubmit={submit} className="space-y-3 rounded-md border border-stone-250 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:h-fit">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{t("users.accessControl")}</p>
          <h2 className="text-lg font-semibold">{t("users.createAccess")}</h2>
          <p className="mt-1 text-sm text-stone-600">{t("users.createAccessDescription")}</p>
        </div>
        <Field label={t("users.email")}><input name="email" type="email" required className={inputClass} /></Field>
        <Field label={t("users.role")}>
          <select name="role" className={inputClass}>
            <option value="account_manager">{roleLabel("account_manager", t)}</option>
            <option value="workspace_manager">{roleLabel("workspace_manager", t)}</option>
            <option value="super_admin">{roleLabel("super_admin", t)}</option>
          </select>
        </Field>
        <RoleModelNotice />
        {formError && <Notice message={formError} tone="bad" />}
        <ActionButton disabled={submitting}>{submitting ? t("users.savingAccess") : t("users.enableAccess")}</ActionButton>
      </form>
      <div className="space-y-5">
        <UserAccessOverview stats={userStats} />
        <AccessRequestQueue requests={users.accountRequests} onDone={onDone} notify={notify} />
        <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
          <Field label={t("users.searchUsers")}>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-stone-400" size={16} />
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} className={`${inputClass} w-full pl-9`} placeholder={t("users.searchPlaceholder")} />
            </div>
          </Field>
        </div>
        <UserTable
          title={t("users.usersAndAccess")}
          rows={visibleRows}
          managers={combinedRows.filter((row) => isWorkspaceManager(row.role))}
          currentUserEmail={currentUserEmail}
          busyEmail={busyEmail}
          searchActive={Boolean(userSearch)}
          onUpdate={updateUser}
          onDelete={deleteUser}
        />
      </div>
    </div>
  );
}


export function UserAccessOverview({ stats }: { stats: { total: number; superAdmins: number; managers: number; accountManagers: number; blocked: number; missingAccess: number; unassigned: number } }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <CompactMetric label={t("users.users")} value={stats.total} />
      <CompactMetric label={t("users.superAdmins")} value={stats.superAdmins} />
      <CompactMetric label={t("users.workspaceManagers")} value={stats.managers} />
      <CompactMetric label={t("users.accountManagers")} value={stats.accountManagers} />
      <CompactMetric label={t("users.unassigned")} value={stats.unassigned} tone={stats.unassigned > 0 ? "warn" : "neutral"} />
      <CompactMetric label={t("users.blocked")} value={stats.blocked} tone={stats.blocked > 0 ? "bad" : "neutral"} />
      <CompactMetric label={t("users.missingAccess")} value={stats.missingAccess} tone={stats.missingAccess > 0 ? "warn" : "neutral"} />
    </section>
  );
}

export function RoleModelNotice() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-[#ECDFC8] bg-[#FFFCF6] p-3 text-sm text-stone-700">
      <p className="font-semibold text-stone-950">{t("users.roleModelTitle")}</p>
      <p className="mt-1 leading-6">{t("users.roleModelDescription")}</p>
    </div>
  );
}


export function UserTable({
  title,
  rows,
  busyEmail,
  searchActive,
  onUpdate,
  onDelete,
  managers = [],
  currentUserEmail,
}: {
  title: string;
  rows: AdminUserRow[];
  busyEmail: string;
  searchActive: boolean;
  onUpdate: (email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean; managerEmail?: string }) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
  managers?: AdminUserRow[];
  currentUserEmail: string;
}) {
  const { t, language } = useTranslation();
  return (
    <div className="overflow-hidden rounded-md border border-stone-250 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-stone-500">{t("users.manageDescription")}</p>
        </div>
        <CountPill label={searchActive ? t("users.matches") : t("users.users")} value={rows.length} />
      </div>
      <div className="hidden grid-cols-[minmax(250px,1.15fr)_190px_220px_170px_220px] gap-4 border-b border-stone-200 bg-stone-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 xl:grid">
        <span>{t("users.user")}</span>
        <span>{t("users.role")}</span>
        <span>{t("users.team")}</span>
        <span>{t("users.status")}</span>
        <span className="text-right">{t("users.actions")}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {rows.map((user) => {
          const isBusy = busyEmail === user.email;
          const isSelf = user.email.toLowerCase() === currentUserEmail;
          const initials = (user.name || user.email).slice(0, 2);
          const manager = managers.find((item) => item.email === user.managerEmail);
          return (
            <div
              key={`${title}-${user.email}`}
              className={`grid gap-3 px-4 py-4 transition-colors hover:bg-stone-50/60 xl:grid-cols-[minmax(250px,1.15fr)_190px_220px_170px_220px] xl:items-center xl:gap-4 ${isBusy ? "opacity-70" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold uppercase text-stone-500">
                  {initials}
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-stone-950">{user.name || user.email}</span>
                  {user.name && <span className="block truncate text-xs text-stone-500">{user.email}</span>}
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-stone-400">
                    <span>{user.lastLoginAt ? t("users.lastLogin", { date: formatDate(user.lastLoginAt, localeMap[language]) }) : t("users.noLoginYet")}</span>
                    <span className="truncate">{user.source}</span>
                  </div>
                </div>
              </div>
              <LabeledControl label={t("users.role")}>
                <MiniSelect
                  value={user.role}
                  disabled={isBusy || isSelf}
                  onChange={(value) => {
                    const nextRole = value as Role;
                    if (nextRole === user.role) return;
                    if (nextRole === "super_admin" && !window.confirm(t("users.promoteConfirm", { email: user.email }))) return;
                    if (user.role === "super_admin" && !window.confirm(t("users.demoteConfirm", { email: user.email, role: roleLabel(nextRole, t) }))) return;
                    void onUpdate(user.email, { role: nextRole, accessEnabled: true });
                  }}
                  options={[
                    { value: "account_manager", label: roleShortLabel("account_manager", t) },
                    { value: "workspace_manager", label: roleShortLabel("workspace_manager", t) },
                    { value: "super_admin", label: roleShortLabel("super_admin", t) },
                  ]}
                />
                {isSelf && <p className="mt-1 text-[11px] text-stone-400">{t("users.currentSession")}</p>}
              </LabeledControl>
              <LabeledControl label={t("users.team")}>
                {user.role === "account_manager" ? (
                  <MiniSelect
                    value={user.managerEmail || ""}
                    disabled={isBusy || managers.length === 0}
                    onChange={(value) => void onUpdate(user.email, { managerEmail: value })}
                    options={[{ value: "", label: t("users.unassigned") }, ...managers.map((manager) => ({ value: manager.email, label: manager.name || manager.email }))]}
                  />
                ) : (
                  <p className="text-sm text-stone-500">{user.role === "super_admin" ? t("users.platformGovernance") : t("users.workspaceOperations")}</p>
                )}
                {user.managerEmail && <p className="mt-1 truncate text-[11px] text-stone-400">{manager?.email || user.managerEmail}</p>}
              </LabeledControl>
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{t("users.status")}</span>
                <div className="mt-1 flex flex-wrap gap-2 xl:mt-0">
                  <Badge tone={user.status === "blocked" ? "bad" : "good"}>{user.status === "blocked" ? t("users.blocked") : t("users.active")}</Badge>
                  <Badge tone={user.accessEnabled ? "good" : "warn"}>{user.accessEnabled ? t("users.approvedAccess") : t("users.accessMissing")}</Badge>
                </div>
              </div>
              <UserActions user={user} isBusy={isBusy} isSelf={isSelf} onUpdate={onUpdate} onDelete={onDelete} />
            </div>
          );
        })}
        {rows.length === 0 && <div className="p-6"><EmptyState text={searchActive ? t("users.noUsersMatch") : t("users.noUsersYet")} /></div>}
      </div>
    </div>
  );
}


export function UserActions({
  user,
  isBusy,
  isSelf,
  onUpdate,
  onDelete,
}: {
  user: AdminUserRow;
  isBusy: boolean;
  isSelf: boolean;
  onUpdate: (email: string, payload: { role?: Role; status?: "active" | "blocked"; accessEnabled?: boolean; managerEmail?: string }) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const blocking = user.status !== "blocked";
  return (
    <div className="flex flex-wrap items-center justify-start gap-1.5 xl:justify-end">
      <ActionButton
        variant="secondary"
        disabled={isBusy || isSelf}
        className="min-h-8 px-3 text-[11px]"
        onClick={() => {
          if (!blocking || window.confirm(t("users.blockConfirm", { email: user.email }))) {
            void onUpdate(user.email, { status: blocking ? "blocked" : "active" });
          }
        }}
      >
        {isBusy ? t("users.working") : user.status === "blocked" ? t("users.unblock") : t("users.block")}
      </ActionButton>
      {user.accessEnabled ? (
        <ActionButton
          variant="ghost"
          disabled={isBusy || isSelf}
          className="min-h-8 px-3 text-[11px]"
          onClick={() => {
            if (window.confirm(t("users.disableConfirm", { email: user.email }))) {
              void onUpdate(user.email, { accessEnabled: false });
            }
          }}
        >
          {t("users.disable")}
        </ActionButton>
      ) : (
        <ActionButton variant="ghost" disabled={isBusy} className="min-h-8 px-3 text-[11px]" onClick={() => void onUpdate(user.email, { accessEnabled: true, role: user.role })}>
          {t("users.restore")}
        </ActionButton>
      )}
      <ActionButton
        variant="ghost"
        disabled={isBusy || isSelf}
        className="min-h-8 px-3 text-[11px] text-red-600"
        onClick={() => void onDelete(user.email)}
      >
        {t("users.delete")}
      </ActionButton>
    </div>
  );
}


export function AccessRequestQueue({
  requests,
  onDone,
  notify,
}: {
  requests: AccountRequest[];
  onDone: () => Promise<void>;
  notify: (message: string, tone?: Tone) => void;
}) {
  const { t } = useTranslation();
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyRequestId, setBusyRequestId] = useState("");
  const [reviewError, setReviewError] = useState("");
  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  async function review(id: string, status: "approved" | "rejected") {
    setBusyRequestId(id);
    setReviewError("");
    try {
      const response = await api<{ accountRequest: AccountRequest }>(`/api/account-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNotes: notesById[id] || "" }),
      });
      const lastNotification = response.accountRequest.notifications?.at(-1);
      const notificationText = lastNotification ? t("users.notificationText", { status: lastNotification.status }) : "";
      notify(
        status === "approved"
          ? t("users.accountApproved", { notification: notificationText })
          : t("users.accessRejected", { notification: notificationText }),
      );
      await onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("users.unableToReview");
      setReviewError(message);
      notify(message, "bad");
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <div className="rounded-md border border-stone-250 bg-white shadow-sm">
      <div className="border-b p-4">
        <h2 className="font-semibold">{t("users.accountRequests")}</h2>
        <p className="mt-1 text-sm text-stone-600">{t("users.accountRequestsDescription")}</p>
        {reviewError && <div className="mt-3"><Notice message={reviewError} tone="bad" /></div>}
      </div>
      <div className="divide-y">
        {pending.map((request) => (
          <div key={request._id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{request.name}</h3>
                <p className="text-sm text-stone-600">{request.email}</p>
                {request.company && <p className="text-sm text-stone-600">{request.company}</p>}
              </div>
              <Badge tone="warn">{t("users.pending")}</Badge>
            </div>
            {request.reason && <p className="rounded-md bg-stone-100 p-3 text-sm text-stone-700">{request.reason}</p>}
            <NotificationList notifications={request.notifications || []} />
            <Field label={t("users.reviewNote")}>
              <input
                className={inputClass}
                value={notesById[request._id] || ""}
                onChange={(event) => setNotesById((current) => ({ ...current, [request._id]: event.target.value }))}
                placeholder={t("users.reviewNotePlaceholder")}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <ActionButton disabled={busyRequestId === request._id} onClick={() => void review(request._id, "approved")}>
                {busyRequestId === request._id ? t("users.reviewing") : t("users.approveAccount")}
              </ActionButton>
              <ActionButton variant="secondary" disabled={busyRequestId === request._id} onClick={() => void review(request._id, "rejected")}>{t("users.reject")}</ActionButton>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="p-4 text-sm text-stone-500">{t("users.noPendingRequests")}</div>}
      </div>
      {reviewed.length > 0 && (
        <div className="border-t p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{t("users.reviewed")}</h3>
          <div className="space-y-2">
            {reviewed.slice(0, 6).map((request) => (
              <details key={request._id} className="rounded-md border border-stone-200 p-3 text-sm">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <span>{request.name} - {request.email}</span>
                  <Badge tone={request.status === "approved" ? "good" : "bad"}>{request.status === "approved" ? t("users.approved") : t("users.rejected")}</Badge>
                </summary>
                <div className="mt-3 grid gap-3">
                  {request.reviewNotes && <p className="rounded-md bg-stone-100 p-3 text-stone-700">{request.reviewNotes}</p>}
                  <NotificationList notifications={request.notifications || []} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
