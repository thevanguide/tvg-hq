import React, { useState, useRef } from "react";
import { getAuthClient } from "../lib/supabase-auth";

interface Props {
  builderId: string;
  folder?: string;
  onUploaded: (publicUrl: string) => void;
  label?: string;
}

export default function BuilderPhotoUpload({
  builderId,
  folder = "photos",
  onUploaded,
  label = "Upload photo",
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate client-side
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError("File must be under 5MB.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only JPEG, PNG, WebP, and SVG files are accepted.");
      return;
    }

    setUploading(true);
    setError(null);

    const client = getAuthClient();
    if (!client) {
      setError("Auth not configured");
      setUploading(false);
      return;
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${builderId}/${folder}/${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from("builder-photos")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[tvg] upload error:", uploadError);
      setError("Upload failed. Please try again.");
      setUploading(false);
      return;
    }

    const { data: urlData } = client.storage
      .from("builder-photos")
      .getPublicUrl(path);

    setUploading(false);
    onUploaded(urlData.publicUrl);

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <label
        className="inline-flex items-center gap-2 px-4 py-2 font-sans-ui text-sm border cursor-pointer transition-colors hover:border-current"
        style={{
          borderColor: "var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          color: "var(--color-text-muted)",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          onChange={handleUpload}
          className="sr-only"
          disabled={uploading}
        />
        {uploading ? "Uploading..." : label}
      </label>
      {error && (
        <p className="mt-2 font-sans-ui text-xs" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </div>
  );
}
