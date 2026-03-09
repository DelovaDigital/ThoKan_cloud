"use client";

import { useRef, useState } from "react";
import { uploadFile } from "@/lib/api";

export function UploadDropzone({ onUploaded, folderId }: { onUploaded: () => void; folderId?: string | null }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await Promise.all(Array.from(files).map((file) => uploadFile(file, folderId || undefined)));
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="glass rounded-2xl border-2 border-dashed p-6 text-center transition hover:border-accent"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
    >
      <p className="text-sm">Drag and drop files here</p>
      <button
        className="mt-3 rounded-xl bg-accent/80 px-4 py-2 text-white"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading..." : "Select files"}
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
