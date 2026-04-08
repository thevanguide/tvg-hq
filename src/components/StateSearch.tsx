import React, { useState, useMemo } from "react";

interface StateEntry {
  href: string;
  title: string;
  description?: string;
  lastUpdated?: string; // ISO string (Date not serializable through Astro props)
  cluster?: string;
}

interface Props {
  states: StateEntry[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

export default function StateSearch({ states }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return states;
    return states.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
    );
  }, [query, states]);

  return (
    <div>
      {/* Search input */}
      <div className="relative mb-8 max-w-sm">
        <label htmlFor="state-search" className="sr-only">
          Search state guides
        </label>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-3 flex items-center pointer-events-none"
          style={{ color: "var(--color-text-subtle)" }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 3a6 6 0 100 12A6 6 0 009 3zM1 9a8 8 0 1114.32 4.906l3.387 3.387a1 1 0 01-1.414 1.414l-3.387-3.387A8 8 0 011 9z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <input
          id="state-search"
          type="search"
          placeholder="Search by state…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border font-sans-ui text-sm"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text)",
            outline: "none",
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Result count */}
      {query.trim() && (
        <p
          className="mb-6 font-sans-ui text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {filtered.length === 0
            ? "No states match that search."
            : `${filtered.length} state${filtered.length === 1 ? "" : "s"} found`}
        </p>
      )}

      {/* Cards grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((entry) => (
          <a
            key={entry.href}
            href={entry.href}
            className="block p-6 no-underline border transition-all hover:-translate-y-0.5 h-full"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            {entry.cluster && (
              <div className="eyebrow mb-3">{entry.cluster}</div>
            )}
            <h3 className="text-xl leading-snug mb-2">{entry.title}</h3>
            {entry.description && (
              <p
                className="text-sm leading-relaxed line-clamp-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                {entry.description}
              </p>
            )}
            {entry.lastUpdated && (
              <div
                className="mt-4 font-sans-ui text-xs"
                style={{ color: "var(--color-text-subtle)" }}
              >
                <time dateTime={entry.lastUpdated}>
                  Updated {fmtDate(entry.lastUpdated)}
                </time>
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
