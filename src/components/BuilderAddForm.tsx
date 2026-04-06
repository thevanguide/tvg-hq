import React, { useState } from "react";
import { getAuthClient } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const PLATFORM_OPTIONS = [
  "Mercedes Sprinter",
  "Ford Transit",
  "Ram ProMaster",
  "Ford E-Series",
  "Chevy Express",
  "VW Vanagon/Westfalia",
  "Class B RV",
  "Other",
];

export default function BuilderAddForm() {
  return (
    <BuilderAuth prompt="Enter your business email to get started. We'll send a login link.">
      <AddFormInner />
    </BuilderAuth>
  );
}

function AddFormInner() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(p: string) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || !city.trim() || !state || !contactName.trim()) return;

    setSubmitting(true);
    setError(null);

    const client = getAuthClient();
    if (!client) {
      setError("Auth not configured");
      setSubmitting(false);
      return;
    }

    const { error: rpcError } = await client.rpc("submit_new_builder", {
      p_business_name: businessName.trim(),
      p_city: city.trim(),
      p_state: state,
      p_contact_name: contactName.trim(),
      p_website: website.trim() || null,
      p_phone: phone.trim() || null,
      p_email: email.trim() || null,
      p_description: description.trim() || null,
      p_platforms: [...platforms],
      p_role: role || null,
    });

    setSubmitting(false);

    if (rpcError) {
      if (rpcError.message.includes("already have a pending submission")) {
        setError("You already have a pending submission for this business.");
      } else {
        console.error("[tvg] submission error:", rpcError);
        setError(rpcError.message || "Something went wrong. Please try again.");
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
        <h3 className="text-xl mb-3">Submission received</h3>
        <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
          We'll review your submission and add your listing within a few business days.
          You'll be able to manage your profile from the{" "}
          <a href="/builders/dashboard/" style={{ color: "var(--color-primary)" }}>
            builder dashboard
          </a>{" "}
          once it's live.
        </p>
      </div>
    );
  }

  const inputStyle = {
    borderColor: "var(--color-border-strong)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text)",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Business name */}
      <div>
        <label htmlFor="add-name" className="block font-sans-ui text-sm font-medium mb-1.5">
          Business name <span style={{ color: "var(--color-accent)" }}>*</span>
        </label>
        <input
          type="text"
          id="add-name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          placeholder="Your shop name"
          className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
          style={inputStyle}
        />
      </div>

      {/* City + State */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-city" className="block font-sans-ui text-sm font-medium mb-1.5">
            City <span style={{ color: "var(--color-accent)" }}>*</span>
          </label>
          <input
            type="text"
            id="add-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            placeholder="City"
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="add-state" className="block font-sans-ui text-sm font-medium mb-1.5">
            State <span style={{ color: "var(--color-accent)" }}>*</span>
          </label>
          <select
            id="add-state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={inputStyle}
          >
            <option value="">Select state...</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Website + Phone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-website" className="block font-sans-ui text-sm font-medium mb-1.5">
            Website
          </label>
          <input
            type="url"
            id="add-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yoursite.com"
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="add-phone" className="block font-sans-ui text-sm font-medium mb-1.5">
            Phone
          </label>
          <input
            type="tel"
            id="add-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="add-email" className="block font-sans-ui text-sm font-medium mb-1.5">
          Business email (shown on listing)
        </label>
        <input
          type="email"
          id="add-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="info@yourshop.com"
          className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
          style={inputStyle}
        />
      </div>

      {/* Platforms */}
      <div>
        <div className="block font-sans-ui text-sm font-medium mb-2">
          Platforms you build on
        </div>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className="px-3 py-1.5 font-sans-ui text-sm border rounded-full cursor-pointer transition-colors"
              style={{
                borderColor: platforms.has(p) ? "var(--color-primary)" : "var(--color-border-strong)",
                background: platforms.has(p) ? "var(--color-primary)" : "transparent",
                color: platforms.has(p) ? "#fff" : "var(--color-text)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="add-desc" className="block font-sans-ui text-sm font-medium mb-1.5">
          Brief description of your business
        </label>
        <textarea
          id="add-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What kind of builds do you specialize in? What makes your shop different?"
          className="w-full px-4 py-3 font-sans-ui text-base border bg-white resize-y"
          style={inputStyle}
        />
      </div>

      <hr style={{ borderColor: "var(--color-border)", margin: "1.5rem 0" }} />

      {/* Contact info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-contact" className="block font-sans-ui text-sm font-medium mb-1.5">
            Your name <span style={{ color: "var(--color-accent)" }}>*</span>
          </label>
          <input
            type="text"
            id="add-contact"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="add-role" className="block font-sans-ui text-sm font-medium mb-1.5">
            Your role
          </label>
          <select
            id="add-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-4 py-3 font-sans-ui text-base border bg-white"
            style={inputStyle}
          >
            <option value="">Select role...</option>
            <option value="Owner">Owner</option>
            <option value="Co-owner / Partner">Co-owner / Partner</option>
            <option value="General Manager">General Manager</option>
            <option value="Marketing / Operations">Marketing / Operations</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="btn btn-accent"
          disabled={submitting || !businessName.trim() || !city.trim() || !state || !contactName.trim()}
        >
          {submitting ? "Submitting..." : "Submit Your Shop"}
        </button>
      </div>

      {error && (
        <p className="font-sans-ui text-sm" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </form>
  );
}
