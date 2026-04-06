import React, { useEffect, useRef, useState } from "react";

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
  highlightedId?: string | null;
  onPinHover?: (id: string | null) => void;
  userLocation?: [number, number] | null;
}

function stateToSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, "-");
}

// Normal Deep Pine pin
const PIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">` +
    `<path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#14331E"/>` +
    `<circle cx="12.5" cy="12.5" r="5" fill="#FBFAF7"/>` +
    `</svg>`,
);
const PIN_ICON_URL = `data:image/svg+xml,${PIN_SVG}`;

// Highlighted Brass pin (larger)
const PIN_HIGHLIGHT_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="31" height="51" viewBox="0 0 31 51">` +
    `<path d="M15.5 0C6.9 0 0 6.9 0 15.5C0 27.2 15.5 51 15.5 51S31 27.2 31 15.5C31 6.9 24.1 0 15.5 0Z" fill="#A87E3B"/>` +
    `<circle cx="15.5" cy="15.5" r="6" fill="#FBFAF7"/>` +
    `</svg>`,
);
const PIN_HIGHLIGHT_URL = `data:image/svg+xml,${PIN_HIGHLIGHT_SVG}`;

// User location dot
const USER_DOT_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
    `<circle cx="10" cy="10" r="10" fill="#3D7EA6" opacity="0.3"/>` +
    `<circle cx="10" cy="10" r="5" fill="#3D7EA6"/>` +
    `</svg>`,
);
const USER_DOT_URL = `data:image/svg+xml,${USER_DOT_SVG}`;

export default function BuilderMap({
  builders,
  center,
  zoom,
  singlePin = false,
  highlightedId = null,
  onPinHover,
  userLocation,
}: BuilderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Store Leaflet instances so we can update markers without re-init
  const leafletRef = useRef<{
    L: any;
    map: any;
    markers: Map<string, any>;
    cluster: any;
    normalIcon: any;
    highlightIcon: any;
    userMarker: any;
  } | null>(null);

  const pins = builders.filter(
    (b): b is BuilderPin & { latitude: number; longitude: number } =>
      b.latitude != null && b.longitude != null,
  );

  // Serialize pin IDs for stable dependency
  const pinKey = pins.map((p) => p.id).join(",");

  // Init map once
  useEffect(() => {
    if (!mapRef.current) return;

    let cleanup = false;

    async function init() {
      const L = (await import("leaflet")).default;

      async function loadCSS(href: string): Promise<void> {
        if (document.querySelector(`link[href="${href}"]`)) return;
        return new Promise((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.onload = () => resolve();
          link.onerror = () => resolve();
          document.head.appendChild(link);
        });
      }

      await loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      await Promise.all([
        loadCSS("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"),
        loadCSS("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"),
      ]);

      if (cleanup || !mapRef.current) return;

      const normalIcon = L.icon({
        iconUrl: PIN_ICON_URL,
        iconSize: [25, 41],
        iconAnchor: [12.5, 41],
        popupAnchor: [0, -35],
      });

      const highlightIcon = L.icon({
        iconUrl: PIN_HIGHLIGHT_URL,
        iconSize: [31, 51],
        iconAnchor: [15.5, 51],
        popupAnchor: [0, -45],
      });

      const defaultCenter: [number, number] = center ?? [39.8, -98.5];
      const defaultZoom = zoom ?? 4;

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const markers = new Map<string, any>();

      if (singlePin) {
        for (const b of pins) {
          const popup = buildPopup(b);
          const marker = L.marker([b.latitude, b.longitude], { icon: normalIcon })
            .addTo(map)
            .bindPopup(popup);
          markers.set(b.id, marker);
        }
      } else {
        await import("leaflet.markercluster");
        // @ts-ignore
        const cluster = L.markerClusterGroup({
          iconCreateFunction: createClusterIcon,
          maxClusterRadius: 50,
        });

        for (const b of pins) {
          const popup = buildPopup(b);
          const marker = L.marker([b.latitude, b.longitude], { icon: normalIcon })
            .bindPopup(popup);

          // Pin hover events → callback to parent
          marker.on("mouseover", () => onPinHover?.(b.id));
          marker.on("mouseout", () => onPinHover?.(null));

          cluster.addLayer(marker);
          markers.set(b.id, marker);
        }

        map.addLayer(cluster);

        leafletRef.current = { L, map, markers, cluster, normalIcon, highlightIcon, userMarker: null };
      }

      if (!leafletRef.current) {
        leafletRef.current = { L, map, markers, cluster: null, normalIcon, highlightIcon, userMarker: null };
      }

      // Auto-fit bounds
      if (!center && !zoom && pins.length > 1) {
        const bounds = L.latLngBounds(
          pins.map((b) => [b.latitude, b.longitude] as [number, number]),
        );
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      setTimeout(() => {
        if (!cleanup && map) map.invalidateSize();
      }, 200);

      setLoaded(true);
    }

    function buildPopup(b: BuilderPin & { latitude: number; longitude: number }): string {
      const slug = stateToSlug(b.state);
      const loc = b.city ? `${b.city}, ${b.state}` : b.state;
      const stars =
        b.review_rating != null
          ? `<div style="color:#A87E3B;font-size:13px;margin:4px 0;">${"★".repeat(Math.floor(b.review_rating))}${b.review_rating % 1 >= 0.25 ? "½" : ""}${"☆".repeat(5 - Math.ceil(b.review_rating))} ${b.review_rating.toFixed(1)}${b.review_count ? ` (${b.review_count})` : ""}</div>`
          : "";
      return (
        `<div style="font-family:Inter,-apple-system,sans-serif;min-width:160px;">` +
        `<div style="font-weight:600;font-size:14px;color:#0F0F0F;margin-bottom:2px;">${b.name}</div>` +
        `<div style="font-size:12px;color:#555550;">${loc}</div>` +
        stars +
        `<a href="/builders/${slug}/${b.slug}/" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:500;color:#14331E;text-decoration:none;">View Profile →</a>` +
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
      if (leafletRef.current?.map) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
  }, [pinKey]);

  // Update highlighted marker when highlightedId changes
  useEffect(() => {
    const ref = leafletRef.current;
    if (!ref || singlePin) return;

    // Reset all markers to normal
    ref.markers.forEach((marker) => {
      marker.setIcon(ref.normalIcon);
      marker.setZIndexOffset(0);
    });

    // Highlight the active one
    if (highlightedId) {
      const marker = ref.markers.get(highlightedId);
      if (marker) {
        marker.setIcon(ref.highlightIcon);
        marker.setZIndexOffset(1000);
      }
    }
  }, [highlightedId, singlePin]);

  // Show/hide user location marker
  useEffect(() => {
    const ref = leafletRef.current;
    if (!ref) return;

    if (ref.userMarker) {
      ref.map.removeLayer(ref.userMarker);
      ref.userMarker = null;
    }

    if (userLocation) {
      const icon = ref.L.icon({
        iconUrl: USER_DOT_URL,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      ref.userMarker = ref.L.marker(userLocation, { icon, interactive: false })
        .addTo(ref.map);
    }
  }, [userLocation]);

  if (pins.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{
          background: "var(--color-bg-alt)",
          border: "1px dashed var(--color-border-strong)",
          height: singlePin ? 200 : "100%",
          minHeight: singlePin ? undefined : 250,
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
        height: singlePin ? 200 : "100%",
        minHeight: singlePin ? undefined : 250,
        border: singlePin ? "1px solid var(--color-border)" : undefined,
        opacity: loaded ? 1 : 0.5,
        transition: "opacity 0.3s",
      }}
    />
  );
}
