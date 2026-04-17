import React, { useState, useEffect, useCallback } from "react";
import { getAuthClient } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";
import BuilderPhotoUpload from "./BuilderPhotoUpload";
import RichTextEditor from "./RichTextEditor";
import { PLATFORM_GROUPS, SERVICE_GROUPS } from "../lib/taxonomy";

const FREE_PHOTO_LIMIT = 3;

const stateCodeToSlug: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire",
  NJ: "new-jersey", NM: "new-mexico", NY: "new-york", NC: "north-carolina",
  ND: "north-dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania",
  RI: "rhode-island", SC: "south-carolina", SD: "south-dakota", TN: "tennessee",
  TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
};

interface BuilderData {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  description: string | null;
  tagline: string | null;
  phone: string | null;
  website: string | null;
  street: string | null;
  postal_code: string | null;
  emails: string[];
  logo_url: string | null;
  gallery_urls: string[];
  hero_image_url: string | null;
  service_hero_image_url: string | null;
  platforms: string[];
  services: string[];
  categories: string[] | null;
  service_description: string | null;
  service_tagline: string | null;
  service_phone: string | null;
  service_emails: string[] | null;
  photo_limit: number | null;
}

interface PendingClaim {
  id: string;
  builder_id: string;
  status: string;
  business_name: string | null;
  created_at: string;
}

interface PendingEdit {
  id: string;
  status: string;
  changes: Record<string, any>;
  created_at: string;
}

export default function BuilderDashboard() {
  return (
    <BuilderAuth prompt="Sign in with the email you used to claim your listing.">
      <DashboardInner />
    </BuilderAuth>
  );
}

function DashboardInner() {
  // A single auth user can own multiple builder listings. The dashboard
  // holds the full list and tracks which one is currently being edited.
  const [allBuilders, setAllBuilders] = useState<BuilderData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Currently selected builder — derived from the list + selection. Keeping
  // the variable name `builder` means the existing JSX below needs no edits.
  const builder = allBuilders.find((b) => b.id === selectedId) ?? null;

  // Editable fields
  const [description, setDescription] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [emailsStr, setEmailsStr] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [heroUrl, setHeroUrl] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);

  // Service-side editable fields (only shown when shop is dual-tagged)
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceTagline, setServiceTagline] = useState("");
  const [servicePhone, setServicePhone] = useState("");
  const [serviceEmailsStr, setServiceEmailsStr] = useState("");
  const [serviceHeroUrl, setServiceHeroUrl] = useState("");

  // Self-serve service-directory toggle. Independent of the main form save —
  // calls toggle_service_listing RPC and updates local state on success.
  const [togglingService, setTogglingService] = useState(false);
  const [serviceToggleError, setServiceToggleError] = useState<string | null>(null);
  const [serviceToggleNotice, setServiceToggleNotice] = useState<string | null>(null);

  // Reset every form field from a builder row. Called when loading data
  // and when the owner switches between listings via the tabs.
  function applyBuilderToForm(b: BuilderData) {
    setDescription(b.description || "");
    setTagline(b.tagline || "");
    setPhone(b.phone || "");
    setWebsite(b.website || "");
    setStreet(b.street || "");
    setPostalCode(b.postal_code || "");
    setEmailsStr((b.emails || []).join(", "));
    setLogoUrl(b.logo_url || "");
    setGalleryUrls(b.gallery_urls || []);
    setHeroUrl(b.hero_image_url || "");
    setPlatforms(b.platforms || []);
    setServices(b.services || []);
    setServiceDescription(b.service_description || "");
    setServiceTagline(b.service_tagline || "");
    setServicePhone(b.service_phone || "");
    setServiceEmailsStr((b.service_emails || []).join(", "));
    setServiceHeroUrl(b.service_hero_image_url || "");
  }

  // Does the form hold any unsaved changes against the currently selected
  // builder row? Mirrors the diff logic in handleSaveEdits. Used to warn
  // the owner before they switch tabs away from a dirty form.
  function isFormDirty(): boolean {
    if (!builder) return false;
    if (description !== (builder.description || "")) return true;
    if (tagline !== (builder.tagline || "")) return true;
    if (phone !== (builder.phone || "")) return true;
    if (website !== (builder.website || "")) return true;
    if (street !== (builder.street || "")) return true;
    if (postalCode !== (builder.postal_code || "")) return true;
    if (logoUrl !== (builder.logo_url || "")) return true;
    if (heroUrl !== (builder.hero_image_url || "")) return true;

    const newEmails = emailsStr.split(",").map((e) => e.trim()).filter(Boolean);
    if (JSON.stringify(newEmails) !== JSON.stringify(builder.emails || [])) return true;

    if (JSON.stringify(galleryUrls) !== JSON.stringify(builder.gallery_urls || [])) return true;

    // Platforms and services compared as sets — checkbox order shouldn't dirty the form.
    const sortedPlatforms = [...platforms].sort();
    const sortedBuilderPlatforms = [...(builder.platforms || [])].sort();
    if (JSON.stringify(sortedPlatforms) !== JSON.stringify(sortedBuilderPlatforms)) return true;

    const sortedServices = [...services].sort();
    const sortedBuilderServices = [...(builder.services || [])].sort();
    if (JSON.stringify(sortedServices) !== JSON.stringify(sortedBuilderServices)) return true;

    if (builder.categories?.includes("service")) {
      if (serviceDescription !== (builder.service_description || "")) return true;
      if (serviceTagline !== (builder.service_tagline || "")) return true;
      if (servicePhone !== (builder.service_phone || "")) return true;
      if (serviceHeroUrl !== (builder.service_hero_image_url || "")) return true;
      const newServiceEmails = serviceEmailsStr
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      if (JSON.stringify(newServiceEmails) !== JSON.stringify(builder.service_emails || [])) {
        return true;
      }
    }

    return false;
  }

  // Switch to a different owned listing. Warns the owner first if the form
  // holds unsaved changes so they don't silently lose work.
  function handleSwitchBuilder(targetId: string) {
    if (targetId === selectedId) return;
    if (isFormDirty()) {
      const confirmed = window.confirm(
        "You have unsaved changes. Switch listings anyway? Your changes will be discarded.",
      );
      if (!confirmed) return;
    }
    const target = allBuilders.find((b) => b.id === targetId);
    if (!target) return;
    setSelectedId(targetId);
    applyBuilderToForm(target);
    setSaved(false);
    setError(null);
  }

  const loadData = useCallback(async () => {
    const client = getAuthClient();
    if (!client) return;

    const { data: builderData } = await client.rpc("get_my_builder");
    const list = ((builderData ?? []) as BuilderData[]);
    setAllBuilders(list);
    if (list.length > 0) {
      setSelectedId(list[0].id);
      applyBuilderToForm(list[0]);
    }

    const { data: claimsData } = await client.rpc("get_my_claims");
    if (claimsData) setClaims(claimsData as PendingClaim[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveEdits(e: React.FormEvent) {
    e.preventDefault();
    if (!builder) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    const changes: Record<string, any> = {};

    if (description !== (builder.description || "")) changes.description = description;
    if (tagline !== (builder.tagline || "")) changes.tagline = tagline;
    if (phone !== (builder.phone || "")) changes.phone = phone;
    if (website !== (builder.website || "")) changes.website = website;
    if (street !== (builder.street || "")) changes.street = street;
    if (postalCode !== (builder.postal_code || "")) changes.postal_code = postalCode;
    if (logoUrl !== (builder.logo_url || "")) changes.logo_url = logoUrl;
    if (heroUrl !== (builder.hero_image_url || "")) changes.hero_image_url = heroUrl;

    const newEmails = emailsStr.split(",").map((e) => e.trim()).filter(Boolean);
    const oldEmails = builder.emails || [];
    if (JSON.stringify(newEmails) !== JSON.stringify(oldEmails)) {
      changes.emails = newEmails;
    }

    const oldGallery = builder.gallery_urls || [];
    if (JSON.stringify(galleryUrls) !== JSON.stringify(oldGallery)) {
      changes.gallery_urls = galleryUrls;
    }

    const sortedPlatforms = [...platforms].sort();
    const sortedBuilderPlatforms = [...(builder.platforms || [])].sort();
    if (JSON.stringify(sortedPlatforms) !== JSON.stringify(sortedBuilderPlatforms)) {
      changes.platforms = platforms;
    }

    const sortedServices = [...services].sort();
    const sortedBuilderServices = [...(builder.services || [])].sort();
    if (JSON.stringify(sortedServices) !== JSON.stringify(sortedBuilderServices)) {
      changes.services = services;
    }

    // Service-side fields — only diff them if the shop is dual-tagged.
    // This keeps the form and the payload symmetrical: fields that are hidden
    // in the UI are never sent, so a future untag would not accidentally
    // persist stale content.
    if (builder.categories?.includes("service")) {
      if (serviceDescription !== (builder.service_description || "")) {
        changes.service_description = serviceDescription;
      }
      if (serviceTagline !== (builder.service_tagline || "")) {
        changes.service_tagline = serviceTagline;
      }
      if (servicePhone !== (builder.service_phone || "")) {
        changes.service_phone = servicePhone;
      }
      if (serviceHeroUrl !== (builder.service_hero_image_url || "")) {
        changes.service_hero_image_url = serviceHeroUrl;
      }
      const newServiceEmails = serviceEmailsStr
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      const oldServiceEmails = builder.service_emails || [];
      if (JSON.stringify(newServiceEmails) !== JSON.stringify(oldServiceEmails)) {
        changes.service_emails = newServiceEmails;
      }
    }

    if (Object.keys(changes).length === 0) {
      setError("No changes to submit.");
      setSaving(false);
      return;
    }

    const client = getAuthClient();
    if (!client) {
      setError("Auth not configured");
      setSaving(false);
      return;
    }

    const { error: rpcError } = await client.rpc("submit_builder_edit", {
      p_builder_id: builder.id,
      p_changes: changes,
    });

    setSaving(false);

    if (rpcError) {
      console.error("[tvg] edit error:", rpcError.message || rpcError);
      setError(rpcError.message || "Something went wrong. Please try again.");
    } else {
      setSaved(true);
      // Optimistically merge the saved changes into the in-memory builder row
      // instead of reloading. A full reload would reset selectedId back to the
      // first listing in the array, which would kick a multi-listing owner
      // off the tab they just saved.
      const savedId = builder.id;
      setAllBuilders((prev) =>
        prev.map((b) => (b.id === savedId ? { ...b, ...changes } : b)),
      );
    }
  }

  // Toggle the shop in/out of the Repairs & Services directory. Calls the
  // toggle_service_listing RPC, which auto-applies + triggers a rebuild.
  // Independent of the main form save — other unsaved form fields are
  // untouched. Optimistically updates the local categories array on success
  // so the dependent service-side form section appears/disappears immediately.
  async function handleToggleServiceListing(enabled: boolean) {
    if (!builder) return;
    if (togglingService) return;

    if (!enabled) {
      const confirmed = window.confirm(
        "Remove your shop from the Repairs & Services directory?\n\n" +
          "Your service description, contacts, and any service-side photos will " +
          "be saved in case you re-enable the listing later. The public service " +
          "profile page will be removed within about a minute.",
      );
      if (!confirmed) return;
    }

    setTogglingService(true);
    setServiceToggleError(null);
    setServiceToggleNotice(null);

    const client = getAuthClient();
    if (!client) {
      setServiceToggleError("Auth not configured");
      setTogglingService(false);
      return;
    }

    const { error: rpcError } = await client.rpc("toggle_service_listing", {
      p_builder_id: builder.id,
      p_enabled: enabled,
    });

    setTogglingService(false);

    if (rpcError) {
      console.error("[tvg] service toggle error:", rpcError.message || rpcError);
      setServiceToggleError(
        rpcError.message || "Something went wrong. Please try again.",
      );
      return;
    }

    // Optimistically update local categories so the conditional service-side
    // form section appears/disappears immediately, without a full reload.
    const savedId = builder.id;
    setAllBuilders((prev) =>
      prev.map((b) => {
        if (b.id !== savedId) return b;
        const current = b.categories || [];
        const next = enabled
          ? Array.from(new Set([...current, "service"]))
          : current.filter((c) => c !== "service");
        return { ...b, categories: next };
      }),
    );

    setServiceToggleNotice(
      enabled
        ? "Added to the Repairs & Services directory. Your new profile page goes live within about a minute."
        : "Removed from the Repairs & Services directory. The change goes live within about a minute.",
    );
  }

  function handleLogoUploaded(url: string) {
    setLogoUrl(url);
  }

  function handleHeroUploaded(url: string) {
    setHeroUrl(url);
  }

  function handleServiceHeroUploaded(url: string) {
    setServiceHeroUrl(url);
  }

  function handlePhotoUploaded(url: string) {
    setGalleryUrls((prev) => [...prev, url]);
  }

  function removePhoto(index: number) {
    setGalleryUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function togglePlatform(value: string) {
    setPlatforms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  }

  function toggleService(value: string) {
    setServices((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }

  if (loading) {
    return (
      <div className="py-8 text-center font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
        Loading your dashboard...
      </div>
    );
  }

  // No builder linked
  if (!builder) {
    const pendingClaims = claims.filter((c) => c.status === "pending");
    const rejectedClaims = claims.filter((c) => c.status === "rejected");

    return (
      <div>
        {pendingClaims.length > 0 && (
          <div
            className="p-6 border mb-6"
            style={{
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-surface)",
            }}
          >
            <h3 className="text-xl mb-3">Claim pending</h3>
            <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
              Your claim for <strong>{pendingClaims[0].business_name || "a builder"}</strong> is
              under review. We'll email you once it's verified.
            </p>
          </div>
        )}

        {rejectedClaims.length > 0 && pendingClaims.length === 0 && (
          <div
            className="p-6 border mb-6"
            style={{
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-surface)",
            }}
          >
            <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
              A previous claim was not approved. If you believe this was an error, email{" "}
              <a href="mailto:hello@thevanguide.com" style={{ color: "var(--color-primary)" }}>
                hello@thevanguide.com
              </a>.
            </p>
          </div>
        )}

        {pendingClaims.length === 0 && (
          <div className="text-center py-8">
            <h3 className="text-xl mb-3">No listing linked to this account</h3>
            <p className="font-sans-ui text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
              Claim your builder listing to start managing your profile.
            </p>
            <a href="/builders/claim/" className="btn btn-accent">
              Claim a listing
            </a>
          </div>
        )}
      </div>
    );
  }

  const photoLimit = builder.photo_limit ?? FREE_PHOTO_LIMIT;
  const atPhotoLimit = galleryUrls.length >= photoLimit;
  const stateSlug = stateCodeToSlug[builder.state] || builder.state.toLowerCase().replace(/\s+/g, "-");
  const isDualTagged = !!builder.categories?.includes("service") && !!builder.categories?.includes("builder");
  const isServiceOnly = !!builder.categories?.includes("service") && !builder.categories?.includes("builder");
  const showServiceFields = !!builder.categories?.includes("service");
  // Primary profile link for the "View listing" header button — mirrors how
  // the directory-side getShopProfileUrl routes: service-primary shops go to
  // /services/, everything else to /builders/.
  const profileHref = isServiceOnly
    ? `/services/${stateSlug}/${builder.slug}/`
    : `/builders/${stateSlug}/${builder.slug}/`;
  // Secondary service profile link shown for dual-tagged shops. Every
  // dual-tagged shop generates a /services/ profile page with fallback
  // content, so this link is always live when the shop is dual-tagged.
  const serviceProfileHref = isDualTagged
    ? `/services/${stateSlug}/${builder.slug}/`
    : null;

  // Builder linked — show edit form
  return (
    <div>
      {allBuilders.length > 1 && (
        <div
          className="mb-6 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="flex gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Your listings"
          >
            {allBuilders.map((b) => {
              const isActive = b.id === selectedId;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSwitchBuilder(b.id)}
                  className="px-4 py-2.5 font-sans-ui text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
                  style={{
                    borderColor: isActive ? "var(--color-primary)" : "transparent",
                    color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
                    fontWeight: isActive ? 500 : 400,
                    background: "transparent",
                  }}
                  aria-selected={isActive}
                  role="tab"
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${builder.name} logo`}
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-lg shrink-0 p-1.5 border"
              style={{ background: "#2a2a2a", borderColor: "var(--color-border)" }}
            />
          ) : (
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-lg shrink-0 border"
              style={{ background: "var(--color-bg-alt)", borderColor: "var(--color-border)" }}
            >
              <img src="/images/van-icon.svg" alt="" className="w-10 h-10 opacity-30" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl truncate">{builder.name}</h2>
            <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
              {builder.city ? `${builder.city}, ` : ""}{builder.state}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={profileHref}
            className="btn btn-ghost text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            {isServiceOnly ? "View listing" : "View builder listing"}
          </a>
          {serviceProfileHref && (
            <a
              href={serviceProfileHref}
              className="btn btn-ghost text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              View service listing
            </a>
          )}
        </div>
      </div>


      <form onSubmit={handleSaveEdits} className="space-y-5">
        <div>
          <label htmlFor="d-tagline" className="block font-sans-ui text-sm font-medium mb-1.5">
            Tagline
          </label>
          <input
            type="text"
            id="d-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={{
              borderColor: "var(--color-border-strong)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text)",
            }}
            placeholder="A short description of your shop"
          />
        </div>

        <div>
          <label className="block font-sans-ui text-sm font-medium mb-1.5">
            Description
          </label>
          <p
            className="font-sans-ui text-xs mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Use headings, bullets, and links to tell searchers what makes your
            shop different. Links open in a new tab and help customers find
            your work elsewhere.
          </p>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="What do you build? Who do you build for? What sets you apart?"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="d-phone" className="block font-sans-ui text-sm font-medium mb-1.5">
              Phone
            </label>
            <input
              type="tel"
              id="d-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
              style={{
                borderColor: "var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
              }}
            />
          </div>
          <div>
            <label htmlFor="d-website" className="block font-sans-ui text-sm font-medium mb-1.5">
              Website
            </label>
            <input
              type="url"
              id="d-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
              style={{
                borderColor: "var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
              }}
              placeholder="https://"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="d-street" className="block font-sans-ui text-sm font-medium mb-1.5">
              Street address
            </label>
            <input
              type="text"
              id="d-street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
              style={{
                borderColor: "var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
              }}
            />
          </div>
          <div>
            <label htmlFor="d-postal" className="block font-sans-ui text-sm font-medium mb-1.5">
              Postal code
            </label>
            <input
              type="text"
              id="d-postal"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
              style={{
                borderColor: "var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
              }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="d-emails" className="block font-sans-ui text-sm font-medium mb-1.5">
            Contact emails <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(comma-separated)</span>
          </label>
          <input
            type="text"
            id="d-emails"
            value={emailsStr}
            onChange={(e) => setEmailsStr(e.target.value)}
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={{
              borderColor: "var(--color-border-strong)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text)",
            }}
            placeholder="info@yourshop.com, quotes@yourshop.com"
          />
        </div>

        {/* Logo upload — listing-wide. The same logo and gallery render on
            every profile page generated from this row, so they live with the
            shared listing fields above the service toggle, not inside the
            service-side block. */}
        <div>
          <label className="block font-sans-ui text-sm font-medium mb-1.5">Logo</label>
          {logoUrl && (
            <div className="mb-3">
              <img
                src={logoUrl}
                alt="Current logo"
                className="w-20 h-20 object-contain rounded-lg p-2 border"
                style={{ background: "#2a2a2a", borderColor: "var(--color-border)" }}
              />
            </div>
          )}
          <BuilderPhotoUpload
            builderId={builder.id}
            folder="logos"
            onUploaded={handleLogoUploaded}
            label="Upload new logo"
          />
        </div>

        {/* Hero image — full-bleed banner behind the profile hero. Single image,
            not a gallery. 16:9 is recommended for the masthead aspect; anything
            smaller still uploads but is softly flagged as a warning at render. */}
        <div>
          <label className="block font-sans-ui text-sm font-medium mb-1.5">
            Hero image
          </label>
          <p
            className="font-sans-ui text-xs mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            A wide banner that shows behind your shop name at the top of your
            profile. A sharp photo of a finished build, your shop floor, or a
            signature van works well. 1600×900 (16:9) looks best.
          </p>
          {heroUrl && (
            <div className="mb-3">
              <img
                src={heroUrl}
                alt="Current hero image"
                className="w-full max-w-lg object-cover rounded-lg border"
                style={{
                  aspectRatio: "16/9",
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg-alt)",
                }}
              />
              <button
                type="button"
                onClick={() => setHeroUrl("")}
                className="mt-2 font-sans-ui text-xs underline"
                style={{ color: "var(--color-text-muted)" }}
              >
                Remove hero image
              </button>
            </div>
          )}
          <BuilderPhotoUpload
            builderId={builder.id}
            folder="hero"
            onUploaded={handleHeroUploaded}
            label={heroUrl ? "Replace hero image" : "Upload hero image"}
          />
        </div>

        {/* Gallery photos — 3 free, listing-wide (shared across builder + service profiles) */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="block font-sans-ui text-sm font-medium">
              Shop photos
            </label>
            <span className="font-sans-ui text-xs" style={{ color: "var(--color-text-muted)" }}>
              {galleryUrls.length} / {photoLimit}{builder.photo_limit ? "" : " free"}
            </span>
          </div>

          {galleryUrls.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              {galleryUrls.map((url, i) => (
                <div key={i} className="relative group">
                  <img
                    src={url}
                    alt={`Shop photo ${i + 1}`}
                    className="w-full aspect-[4/3] object-cover rounded-lg"
                    style={{ background: "var(--color-bg-alt)" }}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {atPhotoLimit ? (
            <div
              className="p-4 border font-sans-ui text-sm"
              style={{
                borderColor: "var(--color-border)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-alt)",
                color: "var(--color-text-muted)",
              }}
            >
              You've reached your photo limit ({photoLimit} photos).
              {!builder.photo_limit && " Remove a photo to upload a different one, or upgrade to a premium listing for more photos, featured placement, and profile analytics."}
              {/* TODO: link to premium upgrade page when available */}
            </div>
          ) : (
            <BuilderPhotoUpload
              builderId={builder.id}
              folder="gallery"
              onUploaded={handlePhotoUploaded}
              label={`Upload photo (${photoLimit - galleryUrls.length} remaining)`}
            />
          )}
          {showServiceFields && (
            <p
              className="mt-2 font-sans-ui text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Your logo and shop photos appear on both your builder profile
              and your repair &amp; service profile.
            </p>
          )}
        </div>

        {/* Platforms — which chassis your shop works on. Drives the filter chips
            on /builders/ and the /builders/platform/[platform]/ routes. Grouped
            for readability; stored flat. */}
        <div>
          <label className="block font-sans-ui text-sm font-medium mb-1.5">
            Platforms
          </label>
          <p
            className="font-sans-ui text-xs mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            Which van chassis do you build on? Check every platform you work
            with. These power the platform filters on the directory.
          </p>
          <div className="space-y-4">
            {PLATFORM_GROUPS.map((group) => (
              <div key={group.label}>
                <div
                  className="font-sans-ui text-xs uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-text-subtle, #888)" }}
                >
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.platforms.map((p) => {
                    const checked = platforms.includes(p);
                    return (
                      <label
                        key={p}
                        className="inline-flex items-center gap-2 px-3 py-2 font-sans-ui text-sm border cursor-pointer transition-colors"
                        style={{
                          borderColor: checked
                            ? "var(--color-primary)"
                            : "var(--color-border-strong)",
                          borderRadius: "var(--radius-md)",
                          background: checked
                            ? "var(--color-bg-alt)"
                            : "transparent",
                          color: checked
                            ? "var(--color-text)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlatform(p)}
                          className="w-4 h-4"
                          style={{ accentColor: "var(--color-primary)" }}
                        />
                        {p}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Services — what this shop offers, either as build capabilities
            (for full builders) or standalone services (for repair/upgrade
            shops). One array either way; the context is implied by which
            directory the listing appears in. */}
        <div>
          <label className="block font-sans-ui text-sm font-medium mb-1.5">
            Services
          </label>
          <p
            className="font-sans-ui text-xs mb-4"
            style={{ color: "var(--color-text-muted)" }}
          >
            Check every service or capability that applies. If you do full
            builds, pick the systems you install. If you do repairs or
            upgrades, pick what you offer.
          </p>
          <div className="space-y-5">
            {SERVICE_GROUPS.map((group) => (
              <div key={group.label}>
                <div
                  className="font-sans-ui text-xs uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-text-subtle, #888)" }}
                >
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.services.map((s) => {
                    const checked = services.includes(s);
                    return (
                      <label
                        key={s}
                        className="inline-flex items-center gap-2 px-3 py-2 font-sans-ui text-sm border cursor-pointer transition-colors"
                        style={{
                          borderColor: checked
                            ? "var(--color-primary)"
                            : "var(--color-border-strong)",
                          borderRadius: "var(--radius-md)",
                          background: checked
                            ? "var(--color-bg-alt)"
                            : "transparent",
                          color: checked
                            ? "var(--color-text)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleService(s)}
                          className="w-4 h-4"
                          style={{ accentColor: "var(--color-primary)" }}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p
            className="mt-4 font-sans-ui text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Missing something your shop offers? Reply to your welcome email
            and we'll add it to the list.
          </p>
        </div>

        {/* Self-serve toggle: opt this shop into the Repairs & Services directory.
            Hidden for service-only shops because flipping it off would orphan
            their only listing — the DB function blocks that case too as
            defense-in-depth. */}
        {!isServiceOnly && (
          <div
            className="p-5 border space-y-3"
            style={{
              borderColor: showServiceFields
                ? "var(--color-primary)"
                : "var(--color-border)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-bg-alt)",
            }}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="d-service-toggle"
                checked={showServiceFields}
                disabled={togglingService}
                onChange={(e) => handleToggleServiceListing(e.target.checked)}
                className="mt-1 w-4 h-4 shrink-0 cursor-pointer"
                style={{ accentColor: "var(--color-primary)" }}
              />
              <div className="flex-1">
                <label
                  htmlFor="d-service-toggle"
                  className="font-sans-ui text-sm font-medium block cursor-pointer"
                  style={{ color: "var(--color-text)" }}
                >
                  Do you do repairs, upgrades, or small jobs in addition to full builds?
                </label>
                <p
                  className="font-sans-ui text-xs mt-1.5 leading-relaxed"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Many van owners search separately for shops that handle electrical
                  diagnostics, solar add-ons, plumbing fixes, and one-off install
                  work. If you take on this kind of job, check the box and your shop
                  will also appear in the Repairs &amp; Services directory with its
                  own profile page focused on service work. Your builder listing
                  stays exactly as it is — this is an additional listing, not a
                  replacement.
                </p>
                {showServiceFields && (
                  <p
                    className="font-sans-ui text-xs mt-1.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Your service profile is live below. Use the form to give
                    service customers a dedicated tagline, description, phone,
                    and contact email.
                  </p>
                )}
              </div>
            </div>
            {togglingService && (
              <p
                className="font-sans-ui text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                Updating...
              </p>
            )}
            {serviceToggleNotice && !togglingService && (
              <p
                className="font-sans-ui text-xs"
                style={{ color: "var(--color-primary)" }}
              >
                {serviceToggleNotice}
              </p>
            )}
            {serviceToggleError && (
              <p className="font-sans-ui text-xs" style={{ color: "#b91c1c" }}>
                {serviceToggleError}
              </p>
            )}
          </div>
        )}

        {/* Service-side content — only shown for shops that are tagged both
            as a builder and as a service shop. Filling in a service description
            generates a second, distinct profile page at /services/[state]/[slug]/
            with its own copy, phone, and contact email. */}
        {showServiceFields && (
          <div
            className="p-5 border space-y-5"
            style={{
              borderColor: "var(--color-primary)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
            }}
          >
            <div>
              <h3 className="text-lg mb-1">Repair &amp; service profile</h3>
              <p className="font-sans-ui text-xs" style={{ color: "var(--color-text-muted)" }}>
                Your shop appears in both the builder directory and the repair &amp; service
                directory, each with its own profile page. By default the service page mirrors
                your builder copy. Fill the fields below to give service customers a dedicated
                tagline, description, phone, and contact email focused on repairs, upgrades,
                or mobile installs. Logo and shop photos are shared with your builder
                profile and managed in the section above.
              </p>
            </div>

            <div>
              <label htmlFor="d-service-tagline" className="block font-sans-ui text-sm font-medium mb-1.5">
                Service tagline
              </label>
              <input
                type="text"
                id="d-service-tagline"
                value={serviceTagline}
                onChange={(e) => setServiceTagline(e.target.value)}
                className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
                style={{
                  borderColor: "var(--color-border-strong)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                }}
                placeholder="A short line for your service side (e.g. 'Sprinter electrical &amp; solar specialists')"
              />
            </div>

            <div>
              <label className="block font-sans-ui text-sm font-medium mb-1.5">
                Service description
              </label>
              <RichTextEditor
                value={serviceDescription}
                onChange={setServiceDescription}
                placeholder="Describe the repair and service work you do — diagnostics, electrical upgrades, solar, mobile installs, etc."
              />
              <p className="mt-1 font-sans-ui text-xs" style={{ color: "var(--color-text-muted)" }}>
                Leave blank to fall back to your builder description on the service profile.
              </p>
            </div>

            {/* Service hero image — falls back to the builder-side hero on the
                /services/ profile when blank. Upload a different image here if
                your service work has a distinct visual identity. */}
            <div>
              <label className="block font-sans-ui text-sm font-medium mb-1.5">
                Service hero image{" "}
                <span
                  className="font-normal"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  (optional)
                </span>
              </label>
              <p
                className="font-sans-ui text-xs mb-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                Shown at the top of your /services/ profile. Leave blank to
                reuse your builder hero image.
              </p>
              {serviceHeroUrl && (
                <div className="mb-3">
                  <img
                    src={serviceHeroUrl}
                    alt="Current service hero image"
                    className="w-full max-w-lg object-cover rounded-lg border"
                    style={{
                      aspectRatio: "16/9",
                      borderColor: "var(--color-border)",
                      background: "var(--color-bg-alt)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setServiceHeroUrl("")}
                    className="mt-2 font-sans-ui text-xs underline"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Remove service hero image
                  </button>
                </div>
              )}
              <BuilderPhotoUpload
                builderId={builder.id}
                folder="service-hero"
                onUploaded={handleServiceHeroUploaded}
                label={
                  serviceHeroUrl
                    ? "Replace service hero image"
                    : "Upload service hero image"
                }
              />
            </div>

            <div>
              <label htmlFor="d-service-phone" className="block font-sans-ui text-sm font-medium mb-1.5">
                Service phone <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
              </label>
              <input
                type="tel"
                id="d-service-phone"
                value={servicePhone}
                onChange={(e) => setServicePhone(e.target.value)}
                className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
                style={{
                  borderColor: "var(--color-border-strong)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                }}
                placeholder="Defaults to your builder phone if left blank"
              />
            </div>

            <div>
              <label htmlFor="d-service-emails" className="block font-sans-ui text-sm font-medium mb-1.5">
                Service contact emails{" "}
                <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>
                  (comma-separated, optional)
                </span>
              </label>
              <input
                type="text"
                id="d-service-emails"
                value={serviceEmailsStr}
                onChange={(e) => setServiceEmailsStr(e.target.value)}
                className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
                style={{
                  borderColor: "var(--color-border-strong)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                }}
                placeholder="service@yourshop.com"
              />
              <p className="mt-1 font-sans-ui text-xs" style={{ color: "var(--color-text-muted)" }}>
                Route service inquiries to a separate inbox. Defaults to your primary email if left blank.
              </p>
            </div>
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <button
            type="submit"
            className="btn btn-accent"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          {saved && builder && (
            <div className="font-sans-ui text-sm">
              <span style={{ color: "var(--color-primary)" }}>
                Changes saved.{" "}
                <a
                  href={profileHref}
                  style={{ color: "var(--color-primary)", textDecoration: "underline" }}
                >
                  View updated profile →
                </a>
              </span>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                Your public profile updates within about a minute.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="font-sans-ui text-sm" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
      </form>

      <p className="mt-8 font-sans-ui text-xs" style={{ color: "var(--color-text-subtle)" }}>
        Changes take effect immediately. Your public profile will reflect updates the next time the site rebuilds.
        Questions? Email <a href="mailto:hello@thevanguide.com" style={{ color: "var(--color-primary)" }}>hello@thevanguide.com</a>.
      </p>
    </div>
  );
}
