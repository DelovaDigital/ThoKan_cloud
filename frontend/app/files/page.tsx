"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Download,
  Eye,
  File,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  HardDrive,
  MoreHorizontal,
  Music4,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { PageTransition } from "@/components/page-transition";
import { UploadDropzone } from "@/components/upload-dropzone";
import { api, apiRaw, getApiBase } from "@/lib/api";

type FileRow = {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  folder_id: string | null;
  created_at: string;
};

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
};

function getFileExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return name.slice(dotIndex).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDateLabel(value: string): string {
  if (!value) return "Onbekende datum";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Onbekende datum";
  return date.toLocaleString();
}

function isTextLikeFile(file: FileRow): boolean {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = getFileExtension(file.name);
  const textExtensions = [
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".log",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".env",
    ".properties",
    ".rtf",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".html",
    ".css",
    ".scss",
    ".less",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".java",
    ".cs",
    ".go",
    ".rs",
    ".swift",
    ".kt",
    ".php",
    ".rb",
    ".vue",
    ".svelte",
    ".dockerfile",
    ".gitignore",
    ".editorconfig",
  ];
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("yaml") ||
    mime.includes("x-sh") ||
    mime.includes("x-python") ||
    mime.includes("x-php") ||
    mime.includes("rtf") ||
    mime.includes("csv") ||
    textExtensions.includes(ext)
  );
}

function isImageFile(file: FileRow): boolean {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = getFileExtension(file.name);
  return mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif", ".tif", ".tiff", ".heic", ".heif"].includes(ext);
}

function isVideoFile(file: FileRow): boolean {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = getFileExtension(file.name);
  return mime.startsWith("video/") || [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".mpeg", ".mpg", ".ogv", ".3gp", ".3g2", ".ts", ".m2ts"].includes(ext);
}

function isAudioFile(file: FileRow): boolean {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = getFileExtension(file.name);
  return mime.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus", ".aif", ".aiff", ".amr"].includes(ext);
}

function isPdfFile(file: FileRow): boolean {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = getFileExtension(file.name);
  return mime.includes("pdf") || ext === ".pdf";
}

function isOfficeWordFile(file: FileRow): boolean {
  const ext = getFileExtension(file.name);
  return [".docx", ".doc", ".docm", ".dotx", ".dotm", ".odt", ".pages"].includes(ext);
}

function isOfficeExcelFile(file: FileRow): boolean {
  const ext = getFileExtension(file.name);
  return [".xlsx", ".xls", ".xlsm", ".xltx", ".xltm", ".ods", ".numbers"].includes(ext);
}

function isOfficePowerPointFile(file: FileRow): boolean {
  const ext = getFileExtension(file.name);
  return [".pptx", ".ppt", ".pptm", ".ppsx", ".ppsm", ".potx", ".potm", ".odp", ".key"].includes(ext);
}

function isArchiveFile(file: FileRow): boolean {
  const ext = getFileExtension(file.name);
  return [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2"].includes(ext);
}

function isCodeFile(file: FileRow): boolean {
  const ext = getFileExtension(file.name);
  return [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".swift", ".java", ".php", ".rb", ".html", ".css", ".scss", ".sql", ".json", ".yaml", ".yml"].includes(ext);
}

function isOfficeFile(file: FileRow): boolean {
  return isOfficeWordFile(file) || isOfficeExcelFile(file) || isOfficePowerPointFile(file);
}

function isPreviewSupported(file: FileRow): boolean {
  return Boolean(file.id);
}

function getFileKind(file: FileRow): "image" | "video" | "audio" | "pdf" | "office" | "text" | "other" {
  if (isImageFile(file)) return "image";
  if (isVideoFile(file)) return "video";
  if (isAudioFile(file)) return "audio";
  if (isPdfFile(file)) return "pdf";
  if (isOfficeFile(file)) return "office";
  if (isTextLikeFile(file)) return "text";
  return "other";
}

function getFileIcon(file: FileRow) {
  if (isImageFile(file)) return FileImage;
  if (isVideoFile(file)) return FileVideo;
  if (isAudioFile(file)) return Music4;
  if (isCodeFile(file)) return FileCode2;
  if (isArchiveFile(file)) return Archive;
  if (isPdfFile(file) || isOfficeFile(file) || isTextLikeFile(file)) return FileText;
  return File;
}

function getFileSurface(file: FileRow): string {
  if (isImageFile(file)) return "bg-emerald-500/12 text-emerald-500";
  if (isVideoFile(file)) return "bg-rose-500/12 text-rose-500";
  if (isAudioFile(file)) return "bg-amber-500/12 text-amber-500";
  if (isCodeFile(file)) return "bg-sky-500/12 text-sky-500";
  if (isArchiveFile(file)) return "bg-slate-500/12 text-slate-500";
  if (isPdfFile(file) || isOfficeFile(file)) return "bg-indigo-500/12 text-indigo-500";
  return "bg-accent/12 text-accent";
}

function PreviewPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-card/25 p-6 text-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
      </div>
    </div>
  );
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewOfficeUrl, setPreviewOfficeUrl] = useState<string | null>(null);
  const [officePreviewFailed, setOfficePreviewFailed] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [openActionFileId, setOpenActionFileId] = useState<string | null>(null);
  const [userNotice, setUserNotice] = useState("");
  const [userError, setUserError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video" | "audio" | "pdf" | "office" | "text">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "name_asc" | "size_desc">("date_desc");

  async function loadFiles() {
    try {
      setUserError("");
      setUserNotice("Bestanden worden geladen...");
      const [fileRows, folderRows] = await Promise.all([api<FileRow[]>("/files"), api<FolderRow[]>("/folders")]);
      setFiles(fileRows);
      setFolders(folderRows);
      setUserNotice("Bestandslijst bijgewerkt.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Laden mislukt";
      setUserError(`Bestanden laden mislukt: ${message}`);
      setUserNotice("");
      throw err;
    }
  }

  useEffect(() => {
    loadFiles().catch(() => {
      setFiles([]);
      setFolders([]);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    function handleGlobalClick(event: MouseEvent) {
      if (!openActionFileId) return;
      const target = event.target as Element | null;
      if (target?.closest("[data-file-actions='true']")) return;
      setOpenActionFileId(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openActionFileId) {
        setOpenActionFileId(null);
      } else if (previewFile) {
        closePreview();
      }
    }

    window.addEventListener("mousedown", handleGlobalClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleGlobalClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openActionFileId, previewFile, previewUrl]);

  const currentFolder = useMemo(() => folders.find((f) => f.id === currentFolderId), [folders, currentFolderId]);
  const currentPath = currentFolder?.path || "/";
  const breadcrumbs = useMemo(() => currentPath.split("/").filter(Boolean), [currentPath]);

  const visibleFolders = useMemo(() => folders.filter((f) => f.parent_id === currentFolderId), [folders, currentFolderId]);
  const visibleFiles = useMemo(() => files.filter((f) => f.folder_id === currentFolderId), [files, currentFolderId]);
  const folderStorageBytes = useMemo(() => visibleFiles.reduce((sum, file) => sum + file.size_bytes, 0), [visibleFiles]);

  const filteredFiles = useMemo(() => {
    return visibleFiles
      .filter((file) => {
        const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" ? true : getFileKind(file) === typeFilter;
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        if (sortBy === "name_asc") return a.name.localeCompare(b.name);
        if (sortBy === "size_desc") return b.size_bytes - a.size_bytes;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [visibleFiles, searchQuery, typeFilter, sortBy]);

  const selectedPreviewKind = previewFile ? getFileKind(previewFile) : null;
  const SelectedPreviewIcon = previewFile ? getFileIcon(previewFile) : File;
  const selectedPreviewSurface = previewFile ? getFileSurface(previewFile) : "bg-accent/12 text-accent";

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolder.trim()) return;
    try {
      setUserError("");
      setUserNotice("Map wordt aangemaakt...");
      await api("/folders", {
        method: "POST",
        body: JSON.stringify({ name: newFolder, parent_id: currentFolderId }),
      });
      setNewFolder("");
      await loadFiles();
      setUserNotice("Map aangemaakt.");
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Map aanmaken mislukt");
    }
  }

  async function renameFile(id: string) {
    const name = prompt("Nieuwe bestandsnaam");
    if (!name) return;
    try {
      setUserError("");
      setUserNotice("Bestand wordt hernoemd...");
      await api(`/files/${id}/rename`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await loadFiles();
      setUserNotice("Bestand hernoemd.");
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Hernoemen mislukt");
    }
  }

  async function deleteFile(id: string) {
    if (!confirm("Dit bestand verwijderen?")) return;
    try {
      setUserError("");
      setUserNotice("Bestand wordt verwijderd...");
      await api(`/files/${id}`, { method: "DELETE" });
      if (previewFile?.id === id) {
        closePreview();
      }
      await loadFiles();
      setUserNotice("Bestand verwijderd.");
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function deleteFolder(id: string) {
    if (!confirm("Deze map verwijderen?")) return;
    try {
      setUserError("");
      setUserNotice("Map wordt verwijderd...");
      await api(`/folders/${id}`, { method: "DELETE" });
      if (currentFolderId === id) setCurrentFolderId(null);
      await loadFiles();
      setUserNotice("Map verwijderd.");
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Map verwijderen mislukt");
    }
  }

  async function downloadFile(file: FileRow) {
    const url = `${getApiBase()}/files/${file.id}/download`;
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    try {
      setUserError("");
      setUserNotice(`Download voorbereiden: ${file.name}...`);
      const response = await apiRaw(`/files/${file.id}/download`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      link.href = blobUrl;
      link.click();
      URL.revokeObjectURL(blobUrl);
      setUserNotice(`Download gestart: ${file.name}`);
    } catch {
      setUserError(`Download mislukt voor ${file.name}.`);
      setUserNotice("Alternatieve download wordt geprobeerd...");
      link.click();
    }
  }

  async function openPreview(file: FileRow) {
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewText("");
    setPreviewOfficeUrl(null);
    setOfficePreviewFailed(false);
    setOpenActionFileId(null);
    setShowPreviewModal(true);
    setUserError("");
    setUserNotice(`Preview wordt geopend voor ${file.name}...`);

    try {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      if (isOfficeFile(file)) {
        setUserNotice("Office-document gedetecteerd. We openen een online kijker...");
        const token = localStorage.getItem("access_token");
        if (!token) {
          throw new Error("Sessie verlopen. Log opnieuw in.");
        }
        const officeSource = `${getApiBase()}/files/${file.id}/download?token=${encodeURIComponent(token)}`;
        const officeViewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(officeSource)}`;
        setPreviewOfficeUrl(officeViewer);
        setPreviewUrl(null);
        setUserNotice("Office-kijker geopend. Als dit niet werkt is je server waarschijnlijk niet publiek bereikbaar.");
        return;
      }

      setUserNotice("Bestand ophalen voor preview...");
      const response = await apiRaw(`/files/${file.id}/download`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);

      if (isTextLikeFile(file)) {
        setUserNotice("Tekstbestand gedetecteerd. Inhoud wordt getoond...");
        const content = await blob.text();
        setPreviewText(content.slice(0, 200000));
      }
      setUserNotice(`Preview klaar: ${file.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Laden mislukt";
      setPreviewError(message);
      setUserError(`Preview mislukt voor ${file.name}: ${message}`);
      setPreviewUrl(null);
      setPreviewOfficeUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewText("");
    setPreviewOfficeUrl(null);
    setOfficePreviewFailed(false);
    setPreviewError("");
    setPreviewFile(null);
    setShowPreviewModal(false);
  }

  function navigateUp() {
    if (!currentFolder) return;
    setCurrentFolderId(currentFolder.parent_id);
  }

  return (
    <LayoutShell>
      <PageTransition>
      <div className="space-y-5">
        <section className="section-block">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-accent">
                <Sparkles className="h-3.5 w-3.5" />
                Cloud drive
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold sm:text-3xl">Bestanden</h1>
              <p className="mt-1 text-sm opacity-70 font-mono">{currentPath}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void loadFiles()} className="btn-primary">
                <RefreshCw className="h-4 w-4" />
                Synchroniseren
              </button>
              <button onClick={navigateUp} disabled={!currentFolder} className="btn-secondary disabled:opacity-50">
                Niveau omhoog
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500"><Folder className="h-4 w-4" /></div>
              <div><p className="text-xs opacity-60">Mappen</p><p className="text-xl font-bold">{visibleFolders.length}</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent"><File className="h-4 w-4" /></div>
              <div><p className="text-xs opacity-60">Bestanden</p><p className="text-xl font-bold">{visibleFiles.length}</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500"><HardDrive className="h-4 w-4" /></div>
              <div><p className="text-xs opacity-60">Opslag</p><p className="text-xl font-bold">{formatBytes(folderStorageBytes)}</p></div>
            </div>
          </div>
        </section>

        <section className="section-block">
          <UploadDropzone onUploaded={loadFiles} folderId={currentFolderId} />
        </section>

        {userNotice && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <div className="h-2 w-2 shrink-0 rounded-full bg-accent" />
            <span className="opacity-80">{userNotice}</span>
          </div>
        )}
        {userError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-400">
            <X className="h-4 w-4 shrink-0" />
            <span>{userError}</span>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          <section className="section-block">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] opacity-65">Navigatie</h2>
            <div className="mt-3 space-y-2">
              <button
                onClick={() => setCurrentFolderId(null)}
                className={`flex w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  currentFolderId === null ? "bg-accent text-white" : "hover:bg-card/70"
                }`}
              >
                <HardDrive className="h-4 w-4 shrink-0 opacity-80" />
                Mijn bestanden
              </button>
              <button onClick={navigateUp} disabled={!currentFolder} className="btn-secondary w-full disabled:opacity-50">
                Niveau omhoog
              </button>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <form onSubmit={createFolder} className="space-y-2">
                <p className="text-xs uppercase tracking-[0.14em] opacity-60">Nieuwe map</p>
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="Mapnaam"
                  className="field-input"
                />
                <button className="btn-primary w-full">Aanmaken</button>
              </form>
            </div>
          </section>

          <section className="section-block">
            <div className="flex items-start gap-4 border-b border-border/60 pb-4">
              <h2 className="text-base font-semibold">Locatie</h2>
              <span className="ml-2 rounded-md bg-card px-2 py-0.5 font-mono text-xs opacity-60">{currentPath}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setCurrentFolderId(null)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  currentFolderId === null ? "bg-accent text-white" : "border border-border hover:bg-card/70"
                }`}
              >
                Start
              </button>
              {breadcrumbs.map((crumb, i) => {
                const folderForCrumb = folders.find((f) => f.path === "/" + breadcrumbs.slice(0, i + 1).join("/"));
                return (
                  <div key={i} className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 opacity-35" />
                    <button
                      onClick={() => setCurrentFolderId(folderForCrumb?.id || null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-card/70"
                    >
                      {crumb}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="section-block sticky top-[92px] z-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek op bestandsnaam..."
                className="field-input pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "image", "video", "audio", "pdf", "office", "text"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    typeFilter === t ? "bg-accent text-white" : "border border-border hover:bg-card/70"
                  }`}
                >
                  {({ all: "Alle", image: "Afbeeldingen", video: "Video", audio: "Audio", pdf: "PDF", office: "Kantoor", text: "Tekst" } as Record<string, string>)[t]}
                </button>
              ))}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-full border border-border bg-transparent px-3 py-1.5 text-xs"
              >
                <option value="date_desc">Nieuwste eerst</option>
                <option value="name_asc">Naam A-Z</option>
                <option value="size_desc">Grootste eerst</option>
              </select>
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-1">
          <section className="section-block">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-border/60 pb-5">
              <div>
                <h2 className="text-lg font-semibold">{currentFolder ? currentFolder.name : "Mijn bestanden"}</h2>
                <p className="mt-1 text-sm opacity-60">{filteredFiles.length} bestanden · {visibleFolders.length} mappen</p>
              </div>
              {currentFolder && (
                <button onClick={navigateUp} className="rounded-2xl border border-border px-3 py-2 text-sm transition hover:bg-card/70">
                  ← Terug
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_180px] gap-2 rounded-lg bg-card/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] opacity-50 md:grid">
                <span>Naam</span>
                <span>Type</span>
                <span>Grootte / Datum</span>
              </div>
              {visibleFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="group grid grid-cols-1 gap-2 rounded-lg border border-border/60 px-4 py-3 transition hover:border-amber-400/40 hover:bg-amber-500/5 md:grid-cols-[minmax(0,1fr)_120px_180px]"
                >
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setCurrentFolderId(folder.id)}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                      <Folder className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{folder.name}</p>
                      <p className="truncate text-xs opacity-60">{folder.path || "/"}</p>
                    </div>
                  </button>
                  <span className="inline-flex w-fit items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">Map</span>
                  <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:border-red-400/40 hover:bg-red-500/8 hover:text-red-400"
                    onClick={() => deleteFolder(folder.id)}
                  >
                    Verwijderen
                  </button>
                  </div>
                </div>
              ))}

              {filteredFiles.map((file) => {
                const Icon = getFileIcon(file);
                const isActive = previewFile?.id === file.id;
                return (
                  <div
                    key={file.id}
                    className={`relative grid grid-cols-1 gap-2 rounded-lg border px-4 py-3 text-sm transition md:grid-cols-[minmax(0,1fr)_120px_180px] ${
                      isActive ? "border-accent/40 bg-accent/8" : "border-border/60 hover:border-border hover:bg-card/60"
                    }`}
                  >
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => void openPreview(file)}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${getFileSurface(file)}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{file.name}</p>
                          {isPreviewSupported(file) && (
                            <span className="rounded-full border border-border/80 px-2 py-0.5 text-[11px] opacity-70">Preview</span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] opacity-60">{file.mime_type || "onbekend"}</p>
                      </div>
                    </button>
                    <span className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      getFileKind(file) === "image" ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" :
                      getFileKind(file) === "video" ? "bg-rose-500/12 text-rose-600 dark:text-rose-400" :
                      getFileKind(file) === "audio" ? "bg-amber-500/12 text-amber-600 dark:text-amber-400" :
                      getFileKind(file) === "pdf" ? "bg-red-500/12 text-red-600 dark:text-red-400" :
                      getFileKind(file) === "office" ? "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" :
                      getFileKind(file) === "text" ? "bg-sky-500/12 text-sky-600 dark:text-sky-400" :
                      "bg-card/60 text-fg"
                    }`}>{getFileKind(file)}</span>
                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <div className="text-right">
                        <p className="text-xs font-medium">{formatBytes(file.size_bytes)}</p>
                        <p className="text-[11px] opacity-50">{formatDateLabel(file.created_at)}</p>
                      </div>

                    <div className="relative ml-3" data-file-actions="true">
                      <button
                        className="rounded-lg border border-border p-1.5 transition hover:bg-accent/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionFileId((prev) => (prev === file.id ? null : file.id));
                        }}
                        aria-label="Bestandsacties"
                        title="Bestandsacties"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {openActionFileId === file.id && (
                        <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-border bg-card p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent/10"
                            onClick={() => {
                              void downloadFile(file);
                              setOpenActionFileId(null);
                            }}
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </button>
                          <button
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent/10"
                            onClick={() => {
                              void renameFile(file.id);
                              setOpenActionFileId(null);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            Hernoemen
                          </button>
                          <button
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/20"
                            onClick={() => {
                              void deleteFile(file.id);
                              setOpenActionFileId(null);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Verwijderen
                          </button>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                );
              })}

              {visibleFolders.length === 0 && visibleFiles.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">Deze map is leeg</p>
              )}

              {(visibleFolders.length > 0 || visibleFiles.length > 0) && filteredFiles.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  Geen bestanden gevonden voor deze zoek/filter combinatie.
                </p>
              )}
            </div>
          </section>

          <aside className="hidden section-block xl:sticky xl:top-[96px] xl:h-fit">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-45">Detailkaart</p>
                <h2 className="mt-2 text-lg font-semibold">Open bestand</h2>
              </div>
              {previewFile && (
                <button onClick={closePreview} className="rounded-xl border border-border p-2 transition hover:bg-card/60" aria-label="Preview sluiten">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {!previewFile && (
              <div className="mt-5 space-y-4">
                <PreviewPlaceholder
                  title="Selecteer een bestand"
                />
                <div className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                  <p className="text-sm font-medium">Ondersteunde web-preview</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-75">
                    <span className="rounded-full border border-border px-2.5 py-1">Afbeeldingen</span>
                    <span className="rounded-full border border-border px-2.5 py-1">Video</span>
                    <span className="rounded-full border border-border px-2.5 py-1">Audio</span>
                    <span className="rounded-full border border-border px-2.5 py-1">PDF</span>
                    <span className="rounded-full border border-border px-2.5 py-1">Tekst & code</span>
                    <span className="rounded-full border border-border px-2.5 py-1">Office viewer</span>
                  </div>
                </div>
              </div>
            )}

            {previewFile && (
              <div className="mt-5 space-y-4">
                <div className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${selectedPreviewSurface}`}>
                      <SelectedPreviewIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">{previewFile.name}</p>
                      <p className="mt-1 text-xs opacity-60">{previewFile.mime_type || "Onbekend bestandstype"}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-xl border border-border/70 bg-card/35 p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] opacity-45">Grootte</p>
                      <p className="mt-1 text-sm font-medium">{formatBytes(previewFile.size_bytes)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/35 p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] opacity-45">Toegevoegd</p>
                      <p className="mt-1 text-sm font-medium">{formatDateLabel(previewFile.created_at)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                      onClick={() => void downloadFile(previewFile)}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-card/60"
                      onClick={() => void openPreview(previewFile)}
                    >
                      <Eye className="h-4 w-4" />
                      Refresh preview
                    </button>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-border bg-card/20 p-4">
                  {previewLoading && <p className="text-sm opacity-70">Preview laden...</p>}
                  {!previewLoading && previewError && <p className="text-sm text-red-400">{previewError}</p>}

                  {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "image" && (
                    <img src={previewUrl} alt={previewFile.name} className="mx-auto max-h-[360px] w-auto rounded-xl" />
                  )}

                  {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "video" && (
                    <video controls className="mx-auto max-h-[360px] w-full rounded-xl" src={previewUrl} />
                  )}

                  {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "audio" && (
                    <audio controls className="w-full" src={previewUrl} />
                  )}

                  {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "pdf" && (
                    <iframe src={previewUrl} className="h-[420px] w-full rounded-xl" title={previewFile.name} />
                  )}

                  {!previewLoading && !previewError && previewText && isTextLikeFile(previewFile) && (
                    <div className="max-h-[420px] overflow-auto rounded-xl bg-card/45">
                      <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">{previewText}</pre>
                      {previewText.length === 200000 && (
                        <p className="border-t border-border p-3 text-xs opacity-60">Bestand is te groot. Eerste 200KB wordt getoond.</p>
                      )}
                    </div>
                  )}

                  {!previewLoading && !previewError && previewOfficeUrl && isOfficeFile(previewFile) && (
                    <div className="space-y-3">
                      {officePreviewFailed && (
                        <p className="text-sm text-red-300">Office-kijker kon niet laden.</p>
                      )}
                      <iframe
                        src={previewOfficeUrl}
                        className="h-[420px] w-full rounded-xl"
                        title={previewFile.name}
                        onError={() => {
                          setOfficePreviewFailed(true);
                          setUserError("Office-preview kon niet laden. Download wordt aanbevolen.");
                          setUserNotice("");
                        }}
                      />
                    </div>
                  )}

                  {!previewLoading && !previewError && !previewText && previewUrl && selectedPreviewKind === "other" && (
                    <PreviewPlaceholder
                      title="Beperkte web-preview"
                    />
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>

        {showPreviewModal && previewFile && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            onClick={closePreview}
          >
            <div
              className="section-block max-h-[92vh] w-full max-w-6xl overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${selectedPreviewSurface}`}>
                    <SelectedPreviewIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{previewFile.name}</h2>
                    <p className="mt-1 text-xs text-muted">{previewFile.mime_type || "Onbekend bestandstype"}</p>
                    <p className="mt-1 text-xs text-muted">{formatBytes(previewFile.size_bytes)} • {formatDateLabel(previewFile.created_at)}</p>
                  </div>
                </div>
                <button className="btn-secondary px-3 py-2" onClick={closePreview}>
                  <X className="h-4 w-4" />
                  Sluiten
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-primary px-3 py-2"
                  onClick={() => void downloadFile(previewFile)}
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button
                  className="btn-secondary px-3 py-2"
                  onClick={() => void openPreview(previewFile)}
                >
                  <Eye className="h-4 w-4" />
                  Refresh preview
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-card/20 p-4">
                {previewLoading && <p className="text-sm opacity-70">Preview laden...</p>}
                {!previewLoading && previewError && <p className="text-sm text-red-400">{previewError}</p>}

                {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "image" && (
                  <img src={previewUrl} alt={previewFile.name} className="mx-auto max-h-[70vh] w-auto rounded-xl" />
                )}

                {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "video" && (
                  <video controls className="mx-auto max-h-[70vh] w-full rounded-xl" src={previewUrl} />
                )}

                {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "audio" && (
                  <audio controls className="w-full" src={previewUrl} />
                )}

                {!previewLoading && !previewError && previewUrl && selectedPreviewKind === "pdf" && (
                  <iframe src={previewUrl} className="h-[70vh] w-full rounded-xl" title={previewFile.name} />
                )}

                {!previewLoading && !previewError && previewText && isTextLikeFile(previewFile) && (
                  <div className="max-h-[70vh] overflow-auto rounded-xl bg-card/45">
                    <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">{previewText}</pre>
                    {previewText.length === 200000 && (
                      <p className="border-t border-border p-3 text-xs opacity-60">Bestand is te groot. Eerste 200KB wordt getoond.</p>
                    )}
                  </div>
                )}

                {!previewLoading && !previewError && previewOfficeUrl && isOfficeFile(previewFile) && (
                  <div className="space-y-3">
                    {officePreviewFailed && (
                      <p className="text-sm text-red-300">Office-kijker kon niet laden.</p>
                    )}
                    <iframe
                      src={previewOfficeUrl}
                      className="h-[70vh] w-full rounded-xl"
                      title={previewFile.name}
                      onError={() => {
                        setOfficePreviewFailed(true);
                        setUserError("Office-preview kon niet laden. Download wordt aanbevolen.");
                        setUserNotice("");
                      }}
                    />
                  </div>
                )}

                {!previewLoading && !previewError && !previewText && previewUrl && selectedPreviewKind === "other" && (
                  <PreviewPlaceholder
                    title="Beperkte web-preview"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      </PageTransition>
    </LayoutShell>
  );
}
