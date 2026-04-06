import { useEffect, useRef, useState } from "react";

export interface BuilderPin {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  review_rating: number | null;
  review_count: number | null;
}

interface BuilderMapProps {
  builders: BuilderPin[];
  center?: [number, number];
  zoom?: number;
  singlePin?: boolean;
}

// State slug helper (matches supabase.ts logic)
function stateToSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, "-");
}

// Deep Pine pin SVG as data URI
const PIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">` +
    `<path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#14331E"/>` +
    `<circle cx="12.5" cy="12.5" r="5" fill="#FBFAF7"/>` +
    `</svg>`,
);
const PIN_ICON_URL = `data:image/svg+xml,${PIN_SVG}`;

export default function BuilderMap({
  builders,
  center,
  zoom,
  singlePin = false,
}: BuilderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Filter to only builders with valid coordinates
  const pins = builders.filter(
    (b): b is BuilderPin & { latitude: number; longitude: number } =>
      b.latitude != null && b.longitude != null,
  );

  useEffect(() => {
    if (!mapRef.current || pins.length === 0) return;

    let map: any;
    let cleanup = false;

    async function init() {
      // Dynamic imports to avoid SSR issues
      const L = (await import("leaflet")).default;

      // Load Leaflet CSS dynamically
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Load markercluster CSS
      if (!document.querySelector('link[href*="MarkerCluster"]')) {
        const link1 = document.createElement("link");
        link1.rel = "stylesheet";
        link1.href =
          "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
        document.head.appendChild(link1);

        const link2 = document.createElement("link");
        link2.rel = "stylesheet";
        link2.href =
          "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
        document.head.appendChild(link2);
      }

      // Wait a tick for CSS to load
      await new Promise((r) => setTimeout(r, 50));

      if (cleanup || !mapRef.current) return;

      const customIcon = L.icon({
        iconUrl: PIN_ICON_URL,
        iconSize: [25, 41],
        iconAnchor: [12.5, 41],
        popupAnchor: [0, -35],
      });

      const defaultCenter: [number, number] = center ?? [39.8, -98.5];
      const defaultZoom = zoom ?? 4;

      map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      if (singlePin) {
        // Single pin mode — no clustering
        for (const b of pins) {
          const popup = buildPopup(b);
          L.marker([b.latitude, b.longitude], { icon: customIcon })
            .addTo(map)
            .bindPopup(popup);
        }
      } else {
        // Clustering mode — side-effect import augments L with markerClusterGroup
        await import("leaflet.markercluster");
        // @ts-ignore — leaflet.markercluster augments L globally
        const cluster = L.markerClusterGroup({
          iconCreateFunction: createClusterIcon,
          maxClusterRadius: 50,
        });

        for (const b of pins) {
          const popup = buildPopup(b);
          const marker = L.marker([b.latitude, b.longitude], {
            icon: customIcon,
          }).bindPopup(popup);
          cluster.addLayer(marker);
        }

        map.addLayer(cluster);
      }

      // Auto-fit bounds if no explicit center/zoom provided
      if (!center && !zoom && pins.length > 1) {
        const bounds = L.latLngBounds(
          pins.map((b) => [b.latitude, b.longitude] as [number, number]),
        );
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      setLoaded(true);
    }

    function buildPopup(b: BuilderPin & { latitude: number; longitude: number }): string {
      const stateSlug = stateToSlug(b.state);
      const location = b.city ? `${b.city}, ${b.state}` : b.state;
      const stars =
        b.review_rating != null
          ? `<div style="color:#A87E3B;font-size:13px;margin:4px 0;">${"★".repeat(Math.floor(b.review_rating))}${b.review_rating % 1 >= 0.25 ? "½" : ""}${"☆".repeat(5 - Math.ceil(b.review_rating))} ${b.review_rating.toFixed(1)}${b.review_count ? ` (${b.review_count})` : ""}</div>`
          : "";
      return (
        `<div style="font-family:Inter,-apple-system,sans-serif;min-width:160px;">` +
        `<div style="font-weight:600;font-size:14px;color:#0F0F0F;margin-bottom:2px;">${b.name}</div>` +
        `<div style="font-size:12px;color:#555550;">${location}</div>` +
        stars +
        `<a href="/builders/${stateSlug}/${b.slug}/" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:500;color:#14331E;text-decoration:none;">View Profile →</a>` +
        `</div>`
      );
    }

    function createClusterIcon(cluster: any) {
      const L = (window as any).L;
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div style="background:#A87E3B;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;font-size:13px;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.2);">${count}</div>`,
        className: "tvg-cluster-icon",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
    }

    init();

    return () => {
      cleanup = true;
      if (map) {
        map.remove();
      }
    };
  }, [pins.length]);

  if (pins.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{
          background: "var(--color-bg-alt)",
          border: "1px dashed var(--color-border-strong)",
          height: singlePin ? 200 : 300,
        }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--color-text-subtle)", fontFamily: "var(--font-sans)" }}
        >
          Map data not yet available
        </p>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="rounded-lg overflow-hidden"
      style={{
        width: "100%",
        height: singlePin ? 200 : undefined,
        minHeight: singlePin ? undefined : 300,
        maxHeight: singlePin ? undefined : 500,
        aspectRatio: singlePin ? undefined : "16 / 7",
        border: "1px solid var(--color-border)",
        opacity: loaded ? 1 : 0.5,
        transition: "opacity 0.3s",
      }}
    />
  );
}
