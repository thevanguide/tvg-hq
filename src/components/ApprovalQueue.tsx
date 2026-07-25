import React, { useState, useEffect } from "react";
import { getAuthClient } from "../lib/supabase-auth";
import BuilderAuth from "./BuilderAuth";

interface QueueItem {
  id: string;
  type: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  decided_at: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  outreach_batch: "Outreach batch",
  reply_draft: "Reply draft",
  claim_review: "Claim review",
  data_change: "Data change",
  publish_request: "Publish request",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PayloadView({ item }: { item: QueueItem }) {
  const p = item.payload ?? {};

  // Reply drafts get a readable email preview instead of raw JSON.
  if (item.type === "reply_draft" && typeof p.body === "string") {
    return (
      <div
        className="mt-2 p-3 border font-sans-ui text-sm"
        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "white" }}
      >
        {typeof p.to === "string" && <p className="mb-1"><strong>To:</strong> {p.to}</p>}
        {typeof p.subject === "string" && <p className="mb-2"><strong>Subject:</strong> {p.subject}</p>}
        <p className="whitespace-pre-wrap text-xs leading-relaxed">{p.body}</p>
      </div>
    );
  }

  if (Object.keys(p).length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="font-sans-ui text-xs cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
        Details
      </summary>
      <pre
        className="mt-1 p-3 text-xs whitespace-pre-wrap border overflow-x-auto"
        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "white" }}
      >
        {JSON.stringify(p, null, 2)}
      </pre>
    </details>
  );
}

function QueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    const { data, error: err } = await client.rpc("get_approval_items");
    if (err) {
      setError(err.message);
    } else {
      setItems(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }

  async function decide(itemId: string, decision: "approved" | "rejected" | "held") {
    const client = getAuthClient();
    if (!client) return;
    if (decision === "rejected" && !window.confirm("Reject this item?")) return;

    setActionLoading(itemId);
    const { error: err } = await client.rpc("decide_approval_item", {
      p_item_id: itemId,
      p_decision: decision,
    });
    setActionLoading(null);

    if (err) {
      alert("Error: " + err.message);
    } else {
      loadData();
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center font-sans-ui text-sm" style={{ color: "var(--color-text-muted)" }}>
        Loading queue...
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

  const pending = items.filter((i) => i.status === "pending" || i.status === "held");
  const resolved = items.filter((i) => i.status !== "pending" && i.status !== "held");

  return (
    <div>
      {pending.length === 0 && (
        <p className="font-sans-ui text-sm py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
          Queue is clear. Nothing waiting on you.
        </p>
      )}

      {pending.map((item) => (
        <div
          key={item.id}
          className="p-4 sm:p-5 border mb-4"
          style={{ borderColor: "var(--color-primary)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <span
                className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full mb-1.5"
                style={{ background: "#e0e7ff", color: "#3730a3" }}
              >
                {TYPE_LABELS[item.type] ?? item.type}
              </span>
              <h3 className="text-base sm:text-lg font-semibold leading-snug">{item.title}</h3>
              <p className="font-sans-ui text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {item.created_by} &middot; {timeAgo(item.created_at)}
                {item.status === "held" && <span style={{ color: "#92400e" }}> &middot; held</span>}
              </p>
            </div>
          </div>

          <p className="font-sans-ui text-sm leading-relaxed">{item.summary}</p>
          <PayloadView item={item} />

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => decide(item.id, "approved")}
              disabled={actionLoading === item.id}
              className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-semibold text-white rounded-md"
              style={{ background: "#16a34a" }}
            >
              {actionLoading === item.id ? "..." : "Approve"}
            </button>
            <button
              onClick={() => decide(item.id, "rejected")}
              disabled={actionLoading === item.id}
              className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-semibold rounded-md border"
              style={{ color: "#b91c1c", borderColor: "#b91c1c" }}
            >
              Reject
            </button>
            {item.status !== "held" && (
              <button
                onClick={() => decide(item.id, "held")}
                disabled={actionLoading === item.id}
                className="px-4 py-2.5 text-sm font-sans-ui rounded-md border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Hold
              </button>
            )}
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <details className="mt-8">
          <summary className="font-sans-ui text-sm cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
            {resolved.length} resolved (last 30 days)
          </summary>
          <div className="mt-3 space-y-2">
            {resolved.map((item) => (
              <div
                key={item.id}
                className="p-3 border flex items-center justify-between gap-2 font-sans-ui text-sm"
                style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
              >
                <span className="min-w-0 truncate">
                  <strong>{TYPE_LABELS[item.type] ?? item.type}:</strong> {item.title}
                </span>
                <span
                  className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full"
                  style={{
                    background: item.status === "approved" || item.status === "acted" ? "#dcfce7" : "#fef2f2",
                    color: item.status === "approved" || item.status === "acted" ? "#166534" : "#991b1b",
                  }}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={loadData}
          className="font-sans-ui text-sm underline"
          style={{ color: "var(--color-text-muted)" }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

export default function ApprovalQueue() {
  return (
    <BuilderAuth prompt="Sign in with your admin account to continue">
      <QueuePanel />
    </BuilderAuth>
  );
}
