import React, { useState, useEffect, useCallback } from "react";
import { getAuthClient } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";
import BuilderPhotoUpload from "./BuilderPhotoUpload";

const FREE_PHOTO_LIMIT = 3;

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
  const profileHref = `/builders/${builder.state.toLowerCase().replace(/\s+/g, "-")}/${builder.slug}/`;

  // Builder linked — show edit form
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${builder.name} logo`}
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-lg shrink-0 p-1.5"
              style={{ background: "var(--color-logo-bg)" }}
            />
          ) : (
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-lg shrink-0"
              style={{ background: "var(--color-logo-bg)" }}
            >
              <img src="/images/van-icon.svg" alt="" className="w-10 h-10 opacity-50 invert" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl truncate">{builder.name}</h2>
            <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
              {builder.city ? `${builder.city}, ` : ""}{builder.state}
            </p>
          </div>
        </div>
        <a
          href={profileHref}
          className="btn btn-ghost text-sm shrink-0"
          target="_blank"
          rel="noopener noreferrer"
        >
          View listing
        </a>
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

        {/* Logo upload */}
        <div>
          <label className="block font-sans-ui text-sm font-medium mb-1.5">Logo</label>
          {logoUrl && (
            <div className="mb-3">
              <img
                src={logoUrl}
                alt="Current logo"
                className="w-20 h-20 object-contain rounded-lg p-2"
                style={{ background: "var(--color-logo-bg)" }}
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
          {saved && (
            <span className="font-sans-ui text-sm" style={{ color: "var(--color-primary)" }}>
              Changes saved. Your profile has been updated.
            </span>
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
