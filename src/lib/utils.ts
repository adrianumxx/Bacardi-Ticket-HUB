import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pluralize(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
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

export function formatDate(value?: string | Date | null, locale: string = "en-GB") {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// Interprets a "YYYY-MM-DD" filter value as the inclusive end of that day so
// range filters (dateTo) also match records created during the selected day.
export function endOfDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function formatShortDate(value?: string | Date | null, locale: string = "en-GB") {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(value));
}
