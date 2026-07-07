"use client";

import type * as React from "react";
import { AlertCircle, CheckCircle2, ChevronDown, type LucideIcon } from "@/components/ui/solar-icons";
import type { Tone } from "./types";

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-300/70 bg-white/70 text-stone-700",
    good: "border-emerald-200/70 bg-emerald-50/70 text-emerald-800",
    warn: "border-amber-200/70 bg-amber-50/70 text-amber-800",
    bad: "border-red-200/70 bg-red-50/70 text-red-800",
  };
  return <span className={`glass-pill inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-stone-500">{hint}</span>}
    </label>
  );
}

export function Notice({ message, tone = "neutral" }: { message: string; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-white text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`flex items-start gap-2 rounded-md border px-4 py-3 text-sm shadow-xl ${tones[tone]}`}>
      {tone === "bad" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{message}</span>
    </div>
  );
}

export function ActionButton({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const classes = {
    primary: "glass-button glass-button--dark text-white",
    secondary: "glass-button glass-button--light text-stone-800",
    ghost: "glass-button glass-button--gold text-stone-800",
  };
  return (
    <button
      {...props}
      className={`glass-button-text inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:cursor-not-allowed ${classes[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export const kpiTones = {
  neutral: { bar: "bg-stone-300", chip: "bg-stone-100 text-stone-600" },
  good: { bar: "bg-emerald-400", chip: "bg-emerald-50 text-emerald-700" },
  warn: { bar: "bg-amber-400", chip: "bg-amber-50 text-amber-700" },
  bad: { bar: "bg-red-400", chip: "bg-red-50 text-red-700" },
  gold: { bar: "bg-[#EB6A1C]", chip: "bg-[#ECDFC8] text-[#7A4A1C]" },
} as const;

export function Kpi({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: number; icon: LucideIcon; tone?: keyof typeof kpiTones }) {
  const palette = kpiTones[tone];
  return (
    <div className="relative overflow-hidden rounded-md border border-stone-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${palette.chip}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

export function PanelIntro({ eyebrow, title, description, meta }: { eyebrow: string; title: string; description?: string; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>}
      </div>
      {meta}
    </div>
  );
}


export function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700">
      {label} <strong className="text-stone-950">{value}</strong>
    </span>
  );
}


export function CompactMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-250 bg-white",
    good: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
  };
  return (
    <div className={`rounded-md border p-3 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">{value}</p>
    </div>
  );
}


export function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{label}</span>
      <div className="mt-1 xl:mt-0">{children}</div>
    </div>
  );
}


export function MiniSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none truncate rounded-full border border-stone-200 bg-stone-50 py-1.5 pl-3 pr-6 text-xs font-medium text-stone-700 transition focus:border-[#EB6A1C] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
    </div>
  );
}


export function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-stone-200 py-4 first:border-t-0 md:grid-cols-[180px_1fr]">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</h3>
      {children}
    </section>
  );
}

export const miniMetricTones = {
  neutral: "border-stone-200 bg-stone-50 text-stone-950",
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-800",
} as const;

export function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className={`rounded-md border p-2 ${miniMetricTones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/15 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}


export function RequestInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 truncate font-medium text-stone-800" title={value}>{value}</p>
    </div>
  );
}

export function CompactRequestMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50 text-stone-900",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`min-h-12 rounded-md border px-2 py-1.5 ${tones[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</p>
      <p className="text-base font-semibold leading-5 tabular-nums">{value}</p>
    </div>
  );
}


export function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{label}</span>
      <p className="font-semibold tabular-nums text-stone-950">{value}</p>
    </div>
  );
}

export function TextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500 xl:hidden">{label}</span>
      <p className="truncate text-sm text-stone-700" title={value}>{value}</p>
    </div>
  );
}


export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">{text}</div>;
}

