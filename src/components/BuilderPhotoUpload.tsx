import React, { useState, useRef } from "react";
import { getAuthClient } from "../lib/supabase-auth";

interface Props {
  builderId: string;
  folder?: string;
  onUploaded: (publicUrl: string) => void;
  label?: string;
  /**
   * Max file size in MB for the picker validator. Defaults to 20, tuned to
   * accept raw phone photos — everything gets downscaled client-side before
   * upload, so the server-side blob is much smaller than this limit.
   */
  maxSizeMB?: number;
  /**
   * Longest edge of the downscaled output, in pixels. Defaults to 1600 which
   * matches the hero render width and is plenty for logos / gallery.
   */
  maxDimension?: number;
  /** JPEG quality for the re-encoded output, 0–1. Defaults to 0.82. */
  quality?: number;
}

/**
 * Downscale a user-selected image with an HTML5 canvas before upload.
 * Preserves aspect ratio; only shrinks — small files pass through unchanged.
 * Re-encodes as JPEG (or keeps PNG for logos with transparency) at the given
 * quality. Returns a File so it can flow straight into the Supabase upload.
 */
async function downscaleImage(
  file: File,
  maxDimension: number,
  quality: number,
): Promise<File> {
  // Only downscale raster formats the canvas understands. WebP/PNG/JPEG are all
  // fine; anything else (SVG, HEIC with no browser fallback) passes through.
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // If the original is already within the target size, skip the re-encode to
  // preserve the user's original quality/bytes.
  if (width <= maxDimension && height <= maxDimension) {
    bitmap.close();
    return file;
  }

  const scale = Math.min(maxDimension / width, maxDimension / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  // White background for JPEGs of transparent PNGs, so alpha pixels don't
  // become black.
  if (file.type === "image/png") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, newWidth, newHeight);
  }

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  // Keep PNG for anything that might need transparency (logos), otherwise JPEG.
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const ext = outputType === "image/png" ? "png" : "jpg";

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      outputType,
      outputType === "image/jpeg" ? quality : undefined,
    );
  });

  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${ext}`, { type: outputType });
}

export default function BuilderPhotoUpload({
  builderId,
  folder = "photos",
  onUploaded,
  label = "Upload photo",
  maxSizeMB = 20,
  maxDimension = 1600,
  quality = 0.82,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File must be under ${maxSizeMB} MB.`);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP files are accepted.");
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

    // Downscale before upload so phone photos don't waste bucket space or
    // render-time bandwidth. A 20 MB phone photo typically becomes ~400-800 KB.
    let uploadFile: File;
    try {
      uploadFile = await downscaleImage(file, maxDimension, quality);
    } catch (err) {
      console.warn("[tvg] downscale failed, uploading original:", err);
      uploadFile = file;
    }

    const ext = uploadFile.name.split(".").pop() || "jpg";
    const path = `${builderId}/${folder}/${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from("builder-photos")
      .upload(path, uploadFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: uploadFile.type,
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
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="sr-only"
          disabled={uploading}
        />
        {uploading ? "Uploading..." : label}
      </label>
      <p className="mt-1.5 font-sans-ui text-xs" style={{ color: "var(--color-text-subtle, #999)" }}>
        JPEG, PNG, or WebP. Max {maxSizeMB} MB — we'll automatically resize large
        photos so you can upload straight from your phone.
      </p>
      {error && (
        <p className="mt-1 font-sans-ui text-xs" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </div>
  );
}
