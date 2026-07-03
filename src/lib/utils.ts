import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function splitEmails(value: string) {
  return value
    .split(/[,\n;]/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortDate(value?: string | Date | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}
