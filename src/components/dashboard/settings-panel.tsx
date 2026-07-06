"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { UserCircle } from "@/components/ui/solar-icons";
import type { Role, Tone } from "./types";
import { api, inputClass, isWorkspaceManager, roleDescription, roleLabel } from "./helpers";
import { ActionButton, Badge, Field } from "./ui-primitives";

export function SettingsPanel({ notify, onDone }: { notify: (message: string, tone?: Tone) => void; onDone: () => Promise<void> }) {
  const { data: session, update } = useSession();
  const role = session?.user?.role as Role | undefined;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [preferredEmailApp, setPreferredEmailApp] = useState<"default" | "outlook_web" | "gmail">("default");
  const [saving, setSaving] = useState(false);
  const [loadedName, setLoadedName] = useState<string | null>(null);

  // Seed the editable fields once the session's name becomes available.
  // Adjusting state during render (React's recommended pattern for syncing
  // from a prop/external value) instead of an effect avoids an extra render.
  const sessionName = session?.user?.name ?? null;
  if (sessionName !== null && sessionName !== loadedName) {
    setLoadedName(sessionName);
    const [first, ...rest] = sessionName.trim().split(/\s+/).filter(Boolean);
    setFirstName(first || "");
    setLastName(rest.join(" "));
    setOfficialEmail(session?.user?.officialEmail || session?.user?.email || "");
    setPreferredEmailApp(session?.user?.preferredEmailApp || "default");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim()) return notify("First name is required.", "bad");
    setSaving(true);
    try {
      const result = await api<{ updatedRequests?: number }>("/api/profile", { method: "PATCH", body: JSON.stringify({ firstName, lastName, officialEmail, preferredEmailApp }) });
      await update();
      await onDone();
      notify(`Profile updated everywhere${typeof result.updatedRequests === "number" ? ` across ${result.updatedRequests} request${result.updatedRequests === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update your profile.", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-md border border-stone-250 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
            <UserCircle size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">My account</p>
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input className={inputClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </Field>
            <Field label="Last name">
              <input className={inputClass} value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
          </div>
          <Field label="Email" hint="Contact a manager to change the email tied to your account.">
            <input className={inputClass} value={session?.user?.email || ""} disabled />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Official sending email" hint="This is shown before opening ticket email drafts.">
              <input className={inputClass} type="email" value={officialEmail} onChange={(event) => setOfficialEmail(event.target.value)} placeholder="name@company.com" />
            </Field>
            <Field label="Preferred email app" hint="Used when opening ticket email drafts.">
              <select className={inputClass} value={preferredEmailApp} onChange={(event) => setPreferredEmailApp(event.target.value as "default" | "outlook_web" | "gmail")}>
                <option value="default">Default mail app</option>
                <option value="outlook_web">Outlook web</option>
                <option value="gmail">Gmail web</option>
              </select>
            </Field>
          </div>
          <Field label="Role" hint="Roles are managed by a manager in the Users section.">
            <div className="grid gap-2">
              <Badge tone={isWorkspaceManager(role) ? "good" : "neutral"}>{roleLabel(role)}</Badge>
              <p className="text-sm leading-6 text-stone-600">{roleDescription(role)}</p>
            </div>
          </Field>
          <div>
            <ActionButton disabled={saving}>{saving ? "Saving..." : "Save changes"}</ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}


