import React, { useState, useEffect } from "react";
import {
  getSession,
  signInWithMagicLink,
  signOut,
  onAuthStateChange,
} from "../lib/supabase-auth";
import type { Session } from "@supabase/supabase-js";

interface Props {
  /** What to render when authenticated */
  children?: React.ReactNode;
  /** Text shown above the email input */
  prompt?: string;
}

export default function BuilderAuth({
  children,
  prompt = "Enter your email to get started",
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession()
      .then((s) => {
        setSession(s);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[tvg] session check failed:", err);
        setLoading(false);
      });

    const { unsubscribe } = onAuthStateChange((s) => {
      setSession(s);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setSending(true);
    setError(null);

    const { error: err } = await signInWithMagicLink(email.trim());
    setSending(false);

    if (err) {
      setError(err);
    } else {
      setSent(true);
    }
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
    setSent(false);
    setEmail("");
  }

  if (loading) {
    return (
      <div className="py-8 text-center font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
        Loading...
      </div>
    );
  }

  // Authenticated — render children or a basic logged-in state
  if (session) {
    return (
      <div>
        <div
          className="flex items-center justify-between mb-6 pb-4 border-b font-sans-ui text-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>
            Signed in as <strong style={{ color: "var(--color-text)" }}>{session.user.email}</strong>
          </span>
          <button
            onClick={handleSignOut}
            className="text-sm underline"
            style={{ color: "var(--color-text-muted)" }}
          >
            Sign out
          </button>
        </div>
        {children}
      </div>
    );
  }

  // Magic link sent
  if (sent) {
    return (
      <div
        className="p-6 border text-center"
        style={{
          borderColor: "var(--color-border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
        }}
      >
        <h3 className="text-xl mb-3">Check your email</h3>
        <p className="font-sans-ui text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
          We sent a login link to <strong>{email}</strong>. Click it to continue.
        </p>
        <button
          onClick={() => { setSent(false); setEmail(""); }}
          className="font-sans-ui text-sm underline"
          style={{ color: "var(--color-text-muted)" }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  // Login form
  return (
    <div
      className="p-6 border"
      style={{
        borderColor: "var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-surface)",
      }}
    >
      <p className="font-sans-ui text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
        {prompt}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourbusiness.com"
          required
          className="flex-1 px-4 py-3 font-sans-ui text-base border bg-white"
          style={{
            borderColor: "var(--color-border-strong)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text)",
          }}
        />
        <button type="submit" className="btn btn-accent" disabled={sending}>
          {sending ? "Sending..." : "Send login link"}
        </button>
      </form>
      {error && (
        <p className="mt-3 font-sans-ui text-sm" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </div>
  );
}
