import { useState } from "react";
import BuilderMap, { type BuilderPin } from "./BuilderMap";

interface BuilderMapToggleProps {
  builders: BuilderPin[];
  center?: [number, number];
  zoom?: number;
}

export default function BuilderMapToggle({
  builders,
  center,
  zoom,
}: BuilderMapToggleProps) {
  const [view, setView] = useState<"list" | "map">("list");

  function switchView(next: "list" | "map") {
    setView(next);
    // Dispatch custom event so the Astro-rendered card grid can show/hide
    document.dispatchEvent(
      new CustomEvent("tvg-view", { detail: next }),
    );
  }

  return (
    <div className="mb-6">
      {/* Toggle buttons */}
      <div
        className="inline-flex rounded-md overflow-hidden border"
        style={{ borderColor: "var(--color-border-strong)" }}
      >
        <button
          onClick={() => switchView("list")}
          className="px-4 py-2 text-sm cursor-pointer border-0"
          style={{
            background: view === "list" ? "var(--color-primary)" : "var(--color-bg)",
            color: view === "list" ? "#fff" : "var(--color-text)",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
          }}
        >
          List
        </button>
        <button
          onClick={() => switchView("map")}
          className="px-4 py-2 text-sm cursor-pointer border-0"
          style={{
            background: view === "map" ? "var(--color-primary)" : "var(--color-bg)",
            color: view === "map" ? "#fff" : "var(--color-text)",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            borderLeft: "1px solid var(--color-border-strong)",
          }}
        >
          Map
        </button>
      </div>

      {/* Map — only rendered when map view is active */}
      {view === "map" && (
        <div className="mt-4">
          <BuilderMap
            builders={builders}
            center={center}
            zoom={zoom}
          />
        </div>
      )}
    </div>
  );
}
