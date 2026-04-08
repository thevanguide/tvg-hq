import React, { useState, useEffect } from "react";
import { getAuthClient, getSession } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";

interface Claim {
  id: string;
  builder_id: string;
  user_id: string;
  status: string;
  business_name: string;
  contact_name: string;
  evidence: string;
  created_at: string;
  reviewed_at: string | null;
  builder_name: string;
  builder_state: string;
  builder_slug: string;
  builder_website: string;
  claimant_email: string;
}

interface Edit {
  id: string;
  builder_id: string;
  user_id: string;
  status: string;
  changes: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
  builder_name: string;
  builder_state: string;
  builder_slug: string;
  editor_email: string;
}

interface Submission {
  id: string;
  user_id: string;
  status: string;
  business_name: string;
  city: string;
  state: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  platforms: string[];
  contact_name: string;
  role: string | null;
  created_at: string;
  reviewed_at: string | null;
  submitter_email: string;
  potential_duplicates: { id: string; name: string; slug: string; state: string; city: string | null; website: string | null }[];
}

interface Stats {
  pending_claims: number;
  pending_edits: number;
  pending_submissions: number;
  total_builders: number;
  claimed_builders: number;
  total_users: number;
}

function AdminPanel() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<"submissions" | "claims" | "edits">("submissions");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const client = getAuthClient();
    if (!client) {
      setError("Auth client not available");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [claimsRes, editsRes, submissionsRes, statsRes] = await Promise.all([
        client.rpc("get_pending_claims"),
        client.rpc("get_pending_edits"),
        client.rpc("get_pending_submissions"),
        client.rpc("get_admin_stats"),
      ]);

      if (claimsRes.error) throw new Error(claimsRes.error.message);
      if (editsRes.error) throw new Error(editsRes.error.message);
      if (submissionsRes.error) throw new Error(submissionsRes.error.message);
      if (statsRes.error) throw new Error(statsRes.error.message);

      const claimsData = Array.isArray(claimsRes.data) ? claimsRes.data : [];
      const editsData = Array.isArray(editsRes.data) ? editsRes.data : [];
      const submissionsData = Array.isArray(submissionsRes.data) ? submissionsRes.data : [];
      setClaims(claimsData);
      setEdits(editsData);
      setSubmissions(submissionsData);
      setStats(statsRes.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveClaim(claimId: string) {
    const client = getAuthClient();
    if (!client) return;

    setActionLoading(claimId);
    const { error: err } = await client.rpc("approve_claim", { p_claim_id: claimId });
    setActionLoading(null);

    if (err) {
      alert("Error approving claim: " + err.message);
    } else {
      loadData();
    }
  }

  async function handleRejectClaim(claimId: string) {
    const client = getAuthClient();
    if (!client) return;

    if (!window.confirm("Reject this claim?")) return;

    setActionLoading(claimId);
    const { error: err } = await client.rpc("reject_claim", { p_claim_id: claimId });
    setActionLoading(null);

    if (err) {
      alert("Error rejecting claim: " + err.message);
    } else {
      loadData();
    }
  }

  async function handleApproveSubmission(submissionId: string) {
    const client = getAuthClient();
    if (!client) return;
    setActionLoading(submissionId);
    const { error: err } = await client.rpc("approve_submission", { p_submission_id: submissionId });
    setActionLoading(null);
    if (err) {
      alert("Error approving submission: " + err.message);
    } else {
      loadData();
    }
  }

  async function handleRejectSubmission(submissionId: string) {
    const client = getAuthClient();
    if (!client) return;
    if (!window.confirm("Reject this submission?")) return;
    setActionLoading(submissionId);
    const { error: err } = await client.rpc("reject_submission", { p_submission_id: submissionId });
    setActionLoading(null);
    if (err) {
      alert("Error rejecting submission: " + err.message);
    } else {
      loadData();
    }
  }

  async function handleApproveEdit(editId: string) {
    const client = getAuthClient();
    if (!client) return;

    setActionLoading(editId);
    const { error: err } = await client.rpc("approve_edit", { p_edit_id: editId });
    setActionLoading(null);

    if (err) {
      alert("Error approving edit: " + err.message);
    } else {
      loadData();
    }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <div className="py-8 text-center font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
        Loading admin data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border text-center" style={{ borderColor: "#b91c1c", borderRadius: "var(--radius-lg)", background: "#fef2f2" }}>
        <p className="font-sans-ui text-sm" style={{ color: "#b91c1c" }}>{error}</p>
        <p className="font-sans-ui text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
          If you're not the admin, you won't have access to this page.
        </p>
      </div>
    );
  }

  const pendingSubmissions = submissions.filter((s) => s.status === "pending");
  const resolvedSubmissions = submissions.filter((s) => s.status !== "pending");
  const pendingClaims = claims.filter((c) => c.status === "pending");
  const resolvedClaims = claims.filter((c) => c.status !== "pending");
  const pendingEdits = edits.filter((e) => e.status === "pending");

  return (
    <div>
      {/* Stats bar */}
      {stats && (
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8 p-4 border"
          style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
        >
          <StatBox label="New Submissions" value={stats.pending_submissions} highlight={stats.pending_submissions > 0} />
          <StatBox label="Pending Claims" value={stats.pending_claims} highlight={stats.pending_claims > 0} />
          <StatBox label="Pending Edits" value={stats.pending_edits} highlight={stats.pending_edits > 0} />
          <StatBox label="Total Builders" value={stats.total_builders} />
          <StatBox label="Claimed" value={stats.claimed_builders} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "var(--color-border)" }}>
        <TabButton active={tab === "submissions"} onClick={() => setTab("submissions")} count={pendingSubmissions.length}>
          New Submissions
        </TabButton>
        <TabButton active={tab === "claims"} onClick={() => setTab("claims")} count={pendingClaims.length}>
          Claims
        </TabButton>
        <TabButton active={tab === "edits"} onClick={() => setTab("edits")} count={pendingEdits.length}>
          Edits
        </TabButton>
      </div>

      {/* Submissions tab */}
      {tab === "submissions" && (
        <div>
          {pendingSubmissions.length === 0 && (
            <p className="font-sans-ui text-sm py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
              No pending submissions.
            </p>
          )}

          {pendingSubmissions.map((sub) => (
            <div
              key={sub.id}
              className="p-5 border mb-4"
              style={{ borderColor: "var(--color-primary)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-lg font-semibold">{sub.business_name}</h3>
                  <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {sub.city}, {sub.state} &middot; {timeAgo(sub.created_at)}
                  </p>
                </div>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
                  pending
                </span>
              </div>

              <div className="space-y-1.5 mb-4 font-sans-ui text-sm">
                <p><strong>Contact:</strong> {sub.contact_name}{sub.role ? ` (${sub.role})` : ""} — {sub.submitter_email}</p>
                {sub.website && (
                  <p><strong>Website:</strong>{" "}
                    <a href={sub.website} target="_blank" rel="noopener" style={{ color: "var(--color-primary)" }}>{sub.website}</a>
                  </p>
                )}
                {sub.phone && <p><strong>Phone:</strong> {sub.phone}</p>}
                {sub.email && <p><strong>Business email:</strong> {sub.email}</p>}
                {sub.platforms && sub.platforms.length > 0 && (
                  <p><strong>Platforms:</strong> {sub.platforms.join(", ")}</p>
                )}
                {sub.description && (
                  <div>
                    <strong>Description:</strong>
                    <p className="mt-1 p-3 text-xs border" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "white" }}>
                      {sub.description}
                    </p>
                  </div>
                )}
              </div>

              {sub.potential_duplicates.length > 0 && (
                <div className="mb-4 p-3 border" style={{ borderColor: "#f59e0b", borderRadius: "var(--radius-md)", background: "#fffbeb" }}>
                  <p className="font-sans-ui text-xs font-semibold mb-2" style={{ color: "#92400e" }}>
                    Possible duplicates in {sub.state}:
                  </p>
                  {sub.potential_duplicates.map((dup) => (
                    <div key={dup.id} className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-sans-ui text-xs">
                        <strong>{dup.name}</strong>
                        {dup.city && <span style={{ color: "#92400e" }}> — {dup.city}</span>}
                      </span>
                      <a
                        href={`/builders/${dup.state.toLowerCase()}/${dup.slug}/`}
                        target="_blank"
                        rel="noopener"
                        className="font-sans-ui text-xs underline"
                        style={{ color: "#92400e" }}
                      >
                        View listing
                      </a>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleApproveSubmission(sub.id)}
                  disabled={actionLoading === sub.id}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-md"
                  style={{ background: "#16a34a" }}
                >
                  {actionLoading === sub.id ? "..." : "Approve & publish"}
                </button>
                <button
                  onClick={() => handleRejectSubmission(sub.id)}
                  disabled={actionLoading === sub.id}
                  className="px-4 py-2 text-sm font-semibold rounded-md border"
                  style={{ color: "#b91c1c", borderColor: "#b91c1c" }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}

          {resolvedSubmissions.length > 0 && (
            <details className="mt-8">
              <summary className="font-sans-ui text-sm cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
                {resolvedSubmissions.length} resolved submission{resolvedSubmissions.length !== 1 ? "s" : ""}
              </summary>
              <div className="mt-3 space-y-2">
                {resolvedSubmissions.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3 border flex items-center justify-between font-sans-ui text-sm"
                    style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
                  >
                    <span>
                      <strong>{sub.business_name}</strong>{" "}
                      <span style={{ color: "var(--color-text-muted)" }}>&mdash; {sub.city}, {sub.state}</span>
                    </span>
                    <span
                      className="px-2 py-0.5 text-xs font-semibold rounded-full"
                      style={{
                        background: sub.status === "approved" ? "#dcfce7" : "#fef2f2",
                        color: sub.status === "approved" ? "#166534" : "#991b1b",
                      }}
                    >
                      {sub.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Claims tab */}
      {tab === "claims" && (
        <div>
          {pendingClaims.length === 0 && (
            <p className="font-sans-ui text-sm py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
              No pending claims.
            </p>
          )}

          {pendingClaims.map((claim) => (
            <div
              key={claim.id}
              className="p-5 border mb-4"
              style={{ borderColor: "var(--color-primary)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-lg font-semibold">{claim.builder_name || claim.business_name}</h3>
                  <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {claim.builder_state}/{claim.builder_slug} &middot; {timeAgo(claim.created_at)}
                  </p>
                </div>
                <span
                  className="px-2 py-0.5 text-xs font-semibold rounded-full"
                  style={{ background: "#fef3c7", color: "#92400e" }}
                >
                  pending
                </span>
              </div>

              <div className="space-y-2 mb-4 font-sans-ui text-sm">
                <p><strong>Claimant:</strong> {claim.contact_name} ({claim.claimant_email})</p>
                {claim.builder_website && (
                  <p>
                    <strong>Website:</strong>{" "}
                    <a href={claim.builder_website} target="_blank" rel="noopener" style={{ color: "var(--color-primary)" }}>
                      {claim.builder_website}
                    </a>
                  </p>
                )}
                <div>
                  <strong>Evidence:</strong>
                  <pre
                    className="mt-1 p-3 text-xs whitespace-pre-wrap border"
                    style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "white" }}
                  >
                    {claim.evidence}
                  </pre>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleApproveClaim(claim.id)}
                  disabled={actionLoading === claim.id}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-md"
                  style={{ background: "#16a34a" }}
                >
                  {actionLoading === claim.id ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => handleRejectClaim(claim.id)}
                  disabled={actionLoading === claim.id}
                  className="px-4 py-2 text-sm font-semibold rounded-md border"
                  style={{ color: "#b91c1c", borderColor: "#b91c1c" }}
                >
                  Reject
                </button>
                <a
                  href={`/builders/${claim.builder_state}/${claim.builder_slug}/`}
                  target="_blank"
                  rel="noopener"
                  className="px-4 py-2 text-sm rounded-md border font-sans-ui"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  View listing
                </a>
              </div>
            </div>
          ))}

          {/* Resolved claims (collapsed) */}
          {resolvedClaims.length > 0 && (
            <details className="mt-8">
              <summary className="font-sans-ui text-sm cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
                {resolvedClaims.length} resolved claim{resolvedClaims.length !== 1 ? "s" : ""}
              </summary>
              <div className="mt-3 space-y-2">
                {resolvedClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-3 border flex items-center justify-between font-sans-ui text-sm"
                    style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
                  >
                    <span>
                      <strong>{claim.builder_name || claim.business_name}</strong>{" "}
                      <span style={{ color: "var(--color-text-muted)" }}>
                        &mdash; {claim.claimant_email}
                      </span>
                    </span>
                    <span
                      className="px-2 py-0.5 text-xs font-semibold rounded-full"
                      style={{
                        background: claim.status === "approved" ? "#dcfce7" : "#fef2f2",
                        color: claim.status === "approved" ? "#166534" : "#991b1b",
                      }}
                    >
                      {claim.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Edits tab */}
      {tab === "edits" && (
        <div>
          {pendingEdits.length === 0 && (
            <p className="font-sans-ui text-sm py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
              No pending edits. (Note: edits currently auto-apply. This tab shows the history.)
            </p>
          )}

          {edits.map((edit) => (
            <div
              key={edit.id}
              className="p-5 border mb-4"
              style={{
                borderColor: edit.status === "pending" ? "var(--color-primary)" : "var(--color-border)",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-surface)",
              }}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-base font-semibold">{edit.builder_name}</h3>
                  <p className="font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
                    by {edit.editor_email} &middot; {timeAgo(edit.created_at)}
                  </p>
                </div>
                <span
                  className="px-2 py-0.5 text-xs font-semibold rounded-full"
                  style={{
                    background: edit.status === "pending" ? "#fef3c7" : edit.status === "approved" ? "#dcfce7" : "#fef2f2",
                    color: edit.status === "pending" ? "#92400e" : edit.status === "approved" ? "#166534" : "#991b1b",
                  }}
                >
                  {edit.status}
                </span>
              </div>

              <div className="mb-3">
                <strong className="font-sans-ui text-sm">Changes:</strong>
                <pre
                  className="mt-1 p-3 text-xs whitespace-pre-wrap border"
                  style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "white" }}
                >
                  {JSON.stringify(edit.changes, null, 2)}
                </pre>
              </div>

              {edit.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveEdit(edit.id)}
                    disabled={actionLoading === edit.id}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-md"
                    style={{ background: "#16a34a" }}
                  >
                    {actionLoading === edit.id ? "..." : "Apply changes"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Refresh */}
      <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={loadData}
          className="font-sans-ui text-sm underline"
          style={{ color: "var(--color-text-muted)" }}
        >
          Refresh data
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div
        className="text-2xl font-bold"
        style={{ color: highlight ? "var(--color-primary)" : "var(--color-text)" }}
      >
        {value}
      </div>
      <div className="font-sans-ui text-xs" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 font-sans-ui text-sm font-semibold -mb-px border-b-2"
      style={{
        borderColor: active ? "var(--color-primary)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-text-muted)",
      }}
    >
      {children}
      {count > 0 && (
        <span
          className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full"
          style={{ background: "#fef3c7", color: "#92400e" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function BuilderAdmin() {
  return (
    <BuilderAuth prompt="Sign in with your admin account to continue">
      <AdminPanel />
    </BuilderAuth>
  );
}
