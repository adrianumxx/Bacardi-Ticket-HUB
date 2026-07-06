"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { api, inputClass } from "./helpers";
import { ActionButton, Field, Notice } from "./ui-primitives";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessName, setAccessName] = useState("");
  const [accessCompany, setAccessCompany] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [mode, setMode] = useState<"signin" | "request">("signin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accessSubmitted, setAccessSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    const result = await signIn("email", { email, redirect: false, callbackUrl: "/" });
    setSubmitting(false);
    if (result?.error) {
      setError(
        result.error === "CredentialsSignin"
          ? "This email is not approved yet. Use Request access to send your details to a manager."
          : "Sign-in is temporarily unavailable. Please try again in a moment.",
      );
      return;
    }
    window.location.href = result?.url || "/";
  }

  async function submitAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await api<{ message: string }>("/api/account-requests", {
        method: "POST",
        body: JSON.stringify({
          email: accessEmail,
          name: accessName,
          company: accessCompany,
          reason: accessReason,
        }),
      });
      setSuccess(response.message);
      setEmail(accessEmail);
      setAccessSubmitted(true);
      setAccessName("");
      setAccessCompany("");
      setAccessReason("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit access request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFFCF6] text-stone-950">
      <section className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.9fr_1fr]">
        <div className="space-y-5">
          <Image src="/brand-logo.png?v=2" alt="Bacardi logo" width={116} height={116} className="h-28 w-28 object-contain" priority unoptimized />
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#EB6A1C]">Bacardi Ticket Hub</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-[#3A2A18] sm:text-5xl">
            Your platform for ticket requests.
          </h1>
        </div>

        <div className="border border-[#ECDFC8] bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#EB6A1C]">Private access</p>
            <h2 className="mt-2 text-3xl font-semibold">{mode === "signin" ? "Sign in with email" : "Request an account"}</h2>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-1 p-1">
            <ActionButton
              type="button"
              variant={mode === "signin" ? "primary" : "ghost"}
              className="min-h-10 w-full text-xs uppercase tracking-[0.16em]"
              onClick={() => {
                setMode("signin");
                setError("");
                setAccessSubmitted(false);
              }}
            >
              Sign in
            </ActionButton>
            <ActionButton
              type="button"
              variant={mode === "request" ? "primary" : "ghost"}
              className="min-h-10 w-full text-xs uppercase tracking-[0.16em]"
              onClick={() => {
                setMode("request");
                setError("");
                setSuccess("");
                setAccessSubmitted(false);
              }}
            >
              Request access
            </ActionButton>
          </div>
          {mode === "signin" ? (
            <form className="grid gap-4" onSubmit={submitEmail}>
              <Field label="Email address" hint="Your email must already be approved by a manager. Anyone can request access from this screen.">
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </Field>
              {success && <Notice message={success} tone="good" />}
              {error && <Notice message={error} tone="bad" />}
              {error.includes("not approved") && (
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAccessEmail(email);
                    setError("");
                    setSuccess("");
                    setAccessSubmitted(false);
                    setMode("request");
                  }}
                >
                  Request access
                </ActionButton>
              )}
              <ActionButton disabled={submitting}>{submitting ? "Checking access..." : "Enter hub"}</ActionButton>
            </form>
          ) : (
            accessSubmitted ? (
              <div className="grid gap-4">
                <Notice message={success || "Access request sent. A manager will review it and you will be notified by email."} tone="good" />
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAccessSubmitted(false);
                    setSuccess("");
                    setError("");
                    setAccessEmail("");
                  }}
                >
                  Send another request
                </ActionButton>
              </div>
            ) : (
              <form className="grid gap-4" onSubmit={submitAccessRequest}>
                <Field label="Full name">
                  <input className={inputClass} value={accessName} onChange={(event) => setAccessName(event.target.value)} required />
                </Field>
                <Field label="Work email">
                  <input className={inputClass} type="email" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} autoComplete="email" required />
                </Field>
                <Field label="Company or team">
                  <input className={inputClass} value={accessCompany} onChange={(event) => setAccessCompany(event.target.value)} placeholder="Bacardi, agency, market team..." />
                </Field>
                <Field label="Reason for access">
                  <textarea className={inputClass} value={accessReason} onChange={(event) => setAccessReason(event.target.value)} rows={3} placeholder="Example: I manage outlets for upcoming events." />
                </Field>
                {error && <Notice message={error} tone="bad" />}
                <ActionButton disabled={submitting}>{submitting ? "Submitting..." : "Submit access request"}</ActionButton>
              </form>
            )
          )}
        </div>
      </section>
    </main>
  );
}


