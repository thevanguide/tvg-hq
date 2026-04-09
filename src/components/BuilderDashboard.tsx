import React, { useState, useEffect, useCallback } from "react";
import { getAuthClient } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";
import BuilderPhotoUpload from "./BuilderPhotoUpload";

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
  const [builder, setBuilder] = useState<BuilderData | null>(null);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Service-side editable fields (only shown when shop is dual-tagged)
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceTagline, setServiceTagline] = useState("");
  const [servicePhone, setServicePhone] = useState("");
  const [serviceEmailsStr, setServiceEmailsStr] = useState("");

  const loadData = useCallback(async () => {
    const client = getAuthClient();
    if (!client) return;

    const { data: builderData } = await client.rpc("get_my_builder");
    if (builderData && builderData.length > 0) {
      const b = builderData[0] as BuilderData;
      setBuilder(b);
      setDescription(b.description || "");
      setTagline(b.tagline || "");
      setPhone(b.phone || "");
      setWebsite(b.website || "");
      setStreet(b.street || "");
      setPostalCode(b.postal_code || "");
      setEmailsStr((b.emails || []).join(", "));
      setLogoUrl(b.logo_url || "");
      setGalleryUrls(b.gallery_urls || []);
      setServiceDescription(b.service_description || "");
      setServiceTagline(b.service_tagline || "");
      setServicePhone(b.service_phone || "");
      setServiceEmailsStr((b.service_emails || []).join(", "));
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

    const newEmails = emailsStr.split(",").map((e) => e.trim()).filter(Boolean);
    const oldEmails = builder.emails || [];
    if (JSON.stringify(newEmails) !== JSON.stringify(oldEmails)) {
      changes.emails = newEmails;
    }

    const oldGallery = builder.gallery_urls || [];
    if (JSON.stringify(galleryUrls) !== JSON.stringify(oldGallery)) {
      changes.gallery_urls = galleryUrls;
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
      loadData();
    }
  }

  function handleLogoUploaded(url: string) {
    setLogoUrl(url);
  }

  function handlePhotoUploaded(url: string) {
    setGalleryUrls((prev) => [...prev, url]);
  }

  function removePhoto(index: number) {
    setGalleryUrls((prev) => prev.filter((_, i) => i !== index));
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
  // Secondary service profile link shown for dual-tagged shops that have
  // filled in service-side content (and therefore have a generated service
  // profile page).
  const serviceProfileHref =
    isDualTagged && (builder.service_description || "").trim().length > 0
      ? `/services/${stateSlug}/${builder.slug}/`
      : null;

  // Builder linked — show edit form
  return (
    <div>
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
          <label htmlFor="d-description" className="block font-sans-ui text-sm font-medium mb-1.5">
            Description
          </label>
          <textarea
            id="d-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white resize-y"
            style={{
              borderColor: "var(--color-border-strong)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text)",
            }}
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
                Your shop shows up in both the builder directory and the repair &amp; service
                directory. Fill these in to give service customers their own profile page with
                copy focused on repairs, upgrades, or mobile installs.{" "}
                {serviceProfileHref
                  ? "Your service profile is live."
                  : "Add a service description below to publish the service profile."}
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
              <label htmlFor="d-service-description" className="block font-sans-ui text-sm font-medium mb-1.5">
                Service description
              </label>
              <textarea
                id="d-service-description"
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 font-sans-ui text-base border bg-white resize-y"
                style={{
                  borderColor: "var(--color-border-strong)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text)",
                }}
                placeholder="Describe the repair and service work you do — diagnostics, electrical upgrades, solar, mobile installs, etc."
              />
              <p className="mt-1 font-sans-ui text-xs" style={{ color: "var(--color-text-muted)" }}>
                Leave blank to use your builder description as fallback. Filling this in publishes
                a dedicated /services/ profile page.
              </p>
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

        {/* Logo upload */}
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
            maxSizeMB={2}
          />
        </div>

        {/* Gallery photos — 3 free */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="block font-sans-ui text-sm font-medium">
              Build photos
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
                    alt={`Build photo ${i + 1}`}
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
        </div>

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
