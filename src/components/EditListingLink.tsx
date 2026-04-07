import React, { useState, useEffect } from "react";
import { getAuthClient, getSession } from "../lib/supabase-auth";

interface Props {
  builderId: string;
}

/**
 * Client-side component that checks if the current user owns this builder listing.
 * If they do, shows an "Edit this listing" link to the dashboard.
 * Renders nothing if not authenticated or not the owner.
 */
export default function EditListingLink({ builderId }: Props) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    checkOwnership();
  }, []);

  async function checkOwnership() {
    const session = await getSession();
    if (!session) return;

    const client = getAuthClient();
    if (!client) return;

    const { data } = await client.rpc("get_my_builder");
    if (data && Array.isArray(data) && data.length > 0 && data[0].id === builderId) {
      setIsOwner(true);
    }
  }

  if (!isOwner) return null;

  return (
    <a
      href="/builders/dashboard/"
      className="inline-flex items-center gap-1.5 font-sans-ui text-sm"
      style={{ color: "var(--color-primary)" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      Edit this listing
    </a>
  );
}
