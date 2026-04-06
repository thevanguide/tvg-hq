import React, { useState, useEffect, useRef, useMemo } from "react";
import { getAuthClient } from "../lib/supabase-auth";
import { getSession } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";

interface Props {
  builderSlug?: string;
  stateSlug?: string;
}

interface BuilderMatch {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  website: string | null;
}

export default function BuilderClaimForm({ builderSlug, stateSlug }: Props) {
  return (
    <BuilderAuth prompt="Enter the email associated with your business to start your claim.">
      <ClaimFormInner builderSlug={builderSlug} stateSlug={stateSlug} />
    </BuilderAuth>
  );
}

/** Extract root domain from a URL or email: "hello@foo.com" → "foo.com", "https://www.foo.com/bar" → "foo.com" */
function extractDomain(input: string): string | null {
  try {
    if (input.includes("@")) {
      return input.split("@")[1]?.toLowerCase().replace(/^www\./, "") || null;
    }
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function ClaimFormInner({ builderSlug }: Props) {
  const [builders, setBuilders] = useState<BuilderMatch[]>([]);
  const [selectedBuilder, setSelectedBuilder] = useState<BuilderMatch | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBuilders, setLoadingBuilders] = useState(true);
  const [existingClaims, setExistingClaims] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [domainMatch, setDomainMatch] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBuilders();
    loadExistingClaims();
    loadUserEmail();

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check domain match when builder or email changes
  useEffect(() => {
    if (!selectedBuilder?.website || !userEmail) {
      setDomainMatch(false);
      return;
    }
    const emailDomain = extractDomain(userEmail);
    const siteDomain = extractDomain(selectedBuilder.website);
    setDomainMatch(!!emailDomain && !!siteDomain && emailDomain === siteDomain);
  }, [selectedBuilder, userEmail]);

  async function loadUserEmail() {
    const session = await getSession();
    if (session?.user?.email) setUserEmail(session.user.email);
  }

  async function loadBuilders() {
    const client = getAuthClient();
    if (!client) return;

    const { data } = await client
      .from("builders")
      .select("id, name, slug, state, city, website")
      .eq("published", true)
      .order("name");

    if (data) {
      setBuilders(data);
      if (builderSlug) {
        const match = data.find((b: BuilderMatch) => b.slug === builderSlug);
        if (match) {
          setSelectedBuilder(match);
          setSearchQuery(match.name);
        }
      }
    }
    setLoadingBuilders(false);
  }

  async function loadExistingClaims() {
    const client = getAuthClient();
    if (!client) return;

    const { data } = await client.rpc("get_my_claims");
    if (data) {
      setExistingClaims(
        data.filter((c: any) => c.status === "pending").map((c: any) => c.builder_id)
      );
    }
  }

  const filteredBuilders = useMemo(() => {
    if (!searchQuery.trim()) return builders.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return builders
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.city && b.city.toLowerCase().includes(q)) ||
          b.state.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [builders, searchQuery]);

  function selectBuilder(b: BuilderMatch) {
    setSelectedBuilder(b);
    setSearchQuery(b.name);
    setShowDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBuilder) return;

    setSubmitting(true);
    setError(null);

    const client = getAuthClient();
    if (!client) {
      setError("Auth not configured");
      setSubmitting(false);
      return;
    }

    // Build evidence string from structured fields
    const evidenceParts: string[] = [];
    if (domainMatch) {
      evidenceParts.push(`Email domain matches website (${userEmail} / ${selectedBuilder.website})`);
    }
    if (role) evidenceParts.push(`Role: ${role}`);
    if (contactName) evidenceParts.push(`Name: ${contactName}`);

    const { error: rpcError } = await client.rpc("submit_builder_claim", {
      p_builder_id: selectedBuilder.id,
      p_business_name: selectedBuilder.name,
      p_contact_name: contactName.trim() || null,
      p_evidence: evidenceParts.join("\n") || null,
    });

    setSubmitting(false);

    if (rpcError) {
      if (rpcError.message.includes("already have a pending claim")) {
        setError("You already have a pending claim for this builder.");
      } else {
        console.error("[tvg] claim error:", rpcError);
        setError("Something went wrong. Please try again.");
      }
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div
        className="p-6 border text-center"
        style={{
          borderColor: "var(--color-border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
        }}
      >
        <h3 className="text-xl mb-3">Claim submitted</h3>
        <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
          {domainMatch
            ? "Your email matches this business's website domain. We'll verify and activate your listing shortly."
            : "We'll review your claim and get back to you within 2 business days."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Searchable builder picker */}
      <div ref={dropdownRef} className="relative">
        <label htmlFor="builder-search" className="block font-sans-ui text-sm font-medium mb-1.5">
          Find your business <span style={{ color: "var(--color-accent)" }}>*</span>
        </label>
        <input
          type="text"
          id="builder-search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedBuilder(null);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Start typing your business name..."
          autoComplete="off"
          className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
          style={{
            borderColor: selectedBuilder
              ? "var(--color-primary)"
              : "var(--color-border-strong)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text)",
          }}
        />
        {selectedBuilder && (
          <div className="mt-1.5 font-sans-ui text-xs" style={{ color: "var(--color-primary)" }}>
            Selected: {selectedBuilder.name} — {selectedBuilder.city ? `${selectedBuilder.city}, ` : ""}{selectedBuilder.state}
          </div>
        )}

        {showDropdown && !selectedBuilder && (
          <div
            className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto border bg-white"
            style={{
              borderColor: "var(--color-border-strong)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))",
            }}
          >
            {loadingBuilders ? (
              <div className="px-4 py-3 font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
                Loading...
              </div>
            ) : filteredBuilders.length === 0 ? (
              <div className="px-4 py-3 font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
                No builders found. Try a different search, or{" "}
                <a href="mailto:hello@thevanguide.com" style={{ color: "var(--color-primary)" }}>
                  contact us
                </a>{" "}
                to add your business.
              </div>
            ) : (
              filteredBuilders.map((b) => {
                const hasPending = existingClaims.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={hasPending}
                    onClick={() => selectBuilder(b)}
                    className="w-full text-left px-4 py-2.5 font-sans-ui text-sm hover:bg-gray-50 disabled:opacity-50 border-b last:border-b-0"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                  >
                    <span className="font-medium">{b.name}</span>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {" "}— {b.city ? `${b.city}, ` : ""}{b.state}
                    </span>
                    {hasPending && (
                      <span className="ml-2 text-xs" style={{ color: "var(--color-accent)" }}>(claim pending)</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Domain match indicator */}
      {selectedBuilder && userEmail && (
        <div
          className="p-4 border font-sans-ui text-sm"
          style={{
            borderColor: domainMatch ? "var(--color-primary)" : "var(--color-border)",
            borderRadius: "var(--radius-md)",
            background: domainMatch ? "var(--color-bg-alt)" : "var(--color-surface)",
            color: "var(--color-text-muted)",
          }}
        >
          {domainMatch ? (
            <span>
              <strong style={{ color: "var(--color-primary)" }}>Email domain matches.</strong>{" "}
              Your email ({userEmail}) matches this builder's website. This speeds up verification.
            </span>
          ) : (
            <span>
              Your email domain doesn't match this builder's website
              {selectedBuilder.website ? ` (${selectedBuilder.website})` : ""}.
              That's fine — we'll verify your ownership manually. Please fill in the fields below.
            </span>
          )}
        </div>
      )}

      {/* Structured verification fields (always shown, but emphasized when no domain match) */}
      {selectedBuilder && (
        <>
          <div>
            <label htmlFor="contact-name" className="block font-sans-ui text-sm font-medium mb-1.5">
              Your name <span style={{ color: "var(--color-accent)" }}>*</span>
            </label>
            <input
              type="text"
              id="contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
              style={{
                borderColor: "var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
              }}
            />
          </div>

          <div>
            <label htmlFor="role" className="block font-sans-ui text-sm font-medium mb-1.5">
              Your role at this business <span style={{ color: "var(--color-accent)" }}>*</span>
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
              style={{
                borderColor: "var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text)",
              }}
            >
              <option value="">Select your role...</option>
              <option value="Owner">Owner</option>
              <option value="Co-owner / Partner">Co-owner / Partner</option>
              <option value="General Manager">General Manager</option>
              <option value="Marketing / Operations">Marketing / Operations</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              className="btn btn-accent"
              disabled={submitting || !selectedBuilder || !contactName.trim() || !role}
            >
              {submitting ? "Submitting..." : "Submit Claim Request"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="font-sans-ui text-sm" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </form>
  );
}
