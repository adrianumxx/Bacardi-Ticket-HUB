"use client";

import { Search, X } from "@/components/ui/solar-icons";
import type { GlobalSearchResult } from "./types";

export function GlobalSearch({
  query,
  results,
  open,
  onQueryChange,
  onFocus,
  onClose,
  onSelect,
}: {
  query: string;
  results: GlobalSearchResult[];
  open: boolean;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onClose: () => void;
  onSelect: (result: GlobalSearchResult) => void;
}) {
  const grouped = results.reduce((groups, result) => {
    const group = groups.get(result.group) ?? [];
    group.push(result);
    groups.set(result.group, group);
    return groups;
  }, new Map<GlobalSearchResult["group"], GlobalSearchResult[]>());

  return (
    <div className="relative hidden min-w-[260px] flex-1 md:block xl:max-w-2xl">
      <label className="relative block">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          className="h-10 w-full rounded-full border border-stone-200 bg-white/80 pl-10 pr-10 text-sm text-stone-950 shadow-sm outline-none transition focus:border-[#EB6A1C]"
          placeholder="Search requests, events, outlets, users..."
        />
        {query && (
          <button type="button" onClick={() => onQueryChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700" aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </label>
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-[70] overflow-hidden rounded-md border border-stone-200 bg-white shadow-2xl">
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {grouped.size > 0 ? (
              [...grouped.entries()].map(([group, groupResults]) => (
                <section key={group} className="py-1">
                  <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#EB6A1C]">{group}</p>
                  <div className="space-y-1">
                    {groupResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onSelect(result)}
                        className="grid w-full gap-1 rounded-md px-3 py-2 text-left transition hover:bg-[#FFFCF6]"
                      >
                        <span className="truncate text-sm font-semibold text-stone-950">{result.title}</span>
                        <span className="truncate text-xs text-stone-500">{result.detail}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-stone-500">No results found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


