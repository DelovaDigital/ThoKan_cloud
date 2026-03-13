"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FileText, FolderPlus, HardDrive, RefreshCw, Search, Sparkles } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
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

export default function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
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
      const [fileRows, folderRows] = await Promise.all([
        api<FileRow[]>("/files"),
        api<FolderRow[]>("/folders"),
      ]);
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
      if (previewFile) {
        closePreview();
      } else if (openActionFileId) {
        setOpenActionFileId(null);
      }
    }

    window.addEventListener("mousedown", handleGlobalClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleGlobalClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openActionFileId, previewFile, previewUrl]);

  const currentFolder = folders.find((f) => f.id === currentFolderId);
  const currentPath = currentFolder?.path || "/";
  const breadcrumbs = currentPath.split("/").filter(Boolean);

  const visibleFolders = folders.filter((f) => f.parent_id === currentFolderId);
  const visibleFiles = files.filter((f) => f.folder_id === currentFolderId);
  const folderStorageBytes = visibleFiles.reduce((sum, file) => sum + file.size_bytes, 0);

  const filteredFiles = visibleFiles
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
  }

  function navigateUp() {
    if (!currentFolder) return;
    setCurrentFolderId(currentFolder.parent_id);
  }

  return (
    <LayoutShell>
      <div className="space-y-5">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Moderne bestandswerkruimte
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Bestandsbeheer</h1>
              <p className="mt-3 max-w-3xl text-sm opacity-70 sm:text-base">
                Beheer mappen, uploads, previews en downloads vanuit één duidelijke professionele bestandenomgeving.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => void loadFiles()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  <RefreshCw className="h-4 w-4" />
                  Bestanden verversen
                </button>
                <div className="rounded-2xl border border-border px-4 py-2.5 text-sm opacity-70">
                  Pad: {currentPath}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Mappen</p>
                <p className="mt-2 text-2xl font-semibold">{visibleFolders.length}</p>
                <p className="mt-1 text-sm opacity-60">Zichtbaar in huidig pad</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Bestanden</p>
                <p className="mt-2 text-2xl font-semibold">{visibleFiles.length}</p>
                <p className="mt-1 text-sm opacity-60">Items in deze map</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Opslag</p>
                <p className="mt-2 text-2xl font-semibold">{formatBytes(folderStorageBytes)}</p>
                <p className="mt-1 text-sm opacity-60">Huidige mapgrootte</p>
              </div>
            </div>
          </div>
        </section>

        <UploadDropzone onUploaded={loadFiles} folderId={currentFolderId} />

        {userNotice && (
          <div className="glass rounded-[1.5rem] p-4 text-sm opacity-90">
            {userNotice}
          </div>
        )}
        {userError && (
          <div className="glass rounded-[1.5rem] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {userError}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <section className="glass rounded-[2rem] p-5">
            <div className="flex items-start gap-4 border-b border-border/60 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Padnavigatie</h2>
                <p className="mt-1 text-sm opacity-65">Blader door mappen en spring direct naar elk breadcrumb-niveau.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setCurrentFolderId(null)}
                className={`rounded-2xl px-3 py-2 text-sm transition ${
                  currentFolderId === null ? "bg-accent/20 font-medium text-accent" : "border border-border hover:bg-card/70"
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
                      className="rounded-2xl border border-border px-3 py-2 text-sm transition hover:bg-card/70"
                    >
                      {crumb}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <form onSubmit={createFolder} className="glass rounded-[2rem] p-5">
            <div className="flex items-start gap-4 border-b border-border/60 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <FolderPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Map aanmaken</h2>
                <p className="mt-1 text-sm opacity-65">Voeg een nieuwe map toe in de huidige locatie.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="Nieuwe mapnaam"
                className="flex-1 rounded-2xl border border-border bg-transparent px-3 py-2.5"
              />
              <button className="rounded-2xl bg-accent/80 px-4 py-2.5 text-white">Aanmaken</button>
            </div>
          </form>
        </div>

        <section className="glass sticky top-[92px] z-10 rounded-[1.75rem] p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Zoeken, filteren en sorteren</p>
              <p className="text-xs opacity-55">Verfijn het huidige mapoverzicht zonder van locatie te wisselen.</p>
            </div>
            <div className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">Live filters</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek op bestandsnaam..."
                className="w-full rounded-xl border border-border bg-transparent py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="all">Alle types</option>
              <option value="image">Afbeeldingen</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="pdf">PDF</option>
              <option value="office">Kantoorbestanden</option>
              <option value="text">Tekst/Code</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="date_desc">Sorteer: Nieuwste eerst</option>
              <option value="name_asc">Sorteer: Naam A-Z</option>
              <option value="size_desc">Sorteer: Grootste eerst</option>
            </select>
          </div>
        </section>

        <section className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-border/60 pb-5">
            <h2 className="text-lg font-semibold">
              {currentFolder ? currentFolder.name : "Mijn bestanden"}
            </h2>
            {currentFolder && (
              <button onClick={navigateUp} className="rounded-2xl border border-border px-3 py-2 text-sm transition hover:bg-card/70">
                ← Terug
              </button>
            )}
          </div>

          <div className="space-y-3">
            {/* Folders */}
            {visibleFolders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between rounded-[1.5rem] border border-border bg-card/30 p-4"
              >
                <div className="flex flex-1 cursor-pointer items-center gap-3" onClick={() => setCurrentFolderId(folder.id)}>
                  <div className="text-2xl">📁</div>
                  <div>
                    <p className="font-medium">{folder.name}</p>
                    <p className="text-xs opacity-60">{folder.path}</p>
                  </div>
                </div>
                <button
                  className="rounded-lg border border-border px-3 py-1 text-sm transition hover:bg-red-500/20"
                  onClick={() => deleteFolder(folder.id)}
                >
                  Verwijderen
                </button>
              </div>
            ))}

            {/* Files */}
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="relative flex items-center justify-between rounded-[1.5rem] border border-border bg-card/20 p-4 text-sm cursor-pointer transition hover:bg-accent/5"
                onDoubleClick={() => void openPreview(file)}
              >
                <div className="flex flex-1 items-center gap-3">
                  <div className="text-2xl">
                    {isImageFile(file) ? "🖼️" : 
                    isVideoFile(file) ? "🎥" :
                    isAudioFile(file) ? "🎵" :
                    isPdfFile(file) ? "📄" : 
                    isOfficeWordFile(file) ? "📝" :
                    isOfficeExcelFile(file) ? "📊" :
                    isOfficePowerPointFile(file) ? "📽️" :
                     isTextLikeFile(file) ? "📝" : "📎"}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs opacity-70">{formatBytes(file.size_bytes)} • {file.mime_type || "onbekend"}</p>
                  </div>
                </div>
                <div className="relative" data-file-actions="true">
                  <button
                    className="rounded-lg border border-border px-3 py-1 text-lg leading-none transition hover:bg-accent/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenActionFileId((prev) => (prev === file.id ? null : file.id));
                    }}
                    aria-label="Bestandsacties"
                    title="Bestandsacties"
                  >
                    ⋯
                  </button>

                  {openActionFileId === file.id && (
                    <div
                      className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-border bg-card p-1 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isPreviewSupported(file) && (
                        <button
                          className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent/10"
                          onClick={() => void openPreview(file)}
                        >
                          Openen
                        </button>
                      )}
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent/10"
                        onClick={() => {
                          void downloadFile(file);
                          setOpenActionFileId(null);
                        }}
                      >
                        Download
                      </button>
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent/10"
                        onClick={() => {
                          void renameFile(file.id);
                          setOpenActionFileId(null);
                        }}
                      >
                        Hernoemen
                      </button>
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/20"
                        onClick={() => {
                          void deleteFile(file.id);
                          setOpenActionFileId(null);
                        }}
                      >
                        Verwijderen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {visibleFolders.length === 0 && visibleFiles.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                Deze map is leeg
              </p>
            )}

            {(visibleFolders.length > 0 || visibleFiles.length > 0) && filteredFiles.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                Geen bestanden gevonden voor deze zoek/filter combinatie.
              </p>
            )}
          </div>
        </section>

        {/* File Preview Modal */}
        {previewFile && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={closePreview}
          >
            <div
              className="glass max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between border-b border-border/60 pb-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{previewFile.name}</h2>
                    <p className="mt-1 text-sm opacity-60">{previewFile.mime_type || "Onbekend bestandstype"}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm transition hover:bg-accent/10"
                    onClick={() => downloadFile(previewFile)}
                  >
                    Download
                  </button>
                  <button
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm transition hover:bg-accent/10"
                    onClick={closePreview}
                  >
                    Sluiten
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-black/20 p-4">
                {previewLoading && <p className="text-sm opacity-70">Preview laden...</p>}
                {!previewLoading && previewError && <p className="text-sm text-red-400">{previewError}</p>}

                {!previewLoading && !previewError && previewUrl && isImageFile(previewFile) && (
                  <img
                    src={previewUrl}
                    alt={previewFile.name}
                    className="mx-auto max-h-[70vh] w-auto rounded-lg"
                  />
                )}
                {!previewLoading && !previewError && previewUrl && isVideoFile(previewFile) && (
                  <video
                    controls
                    className="mx-auto max-h-[70vh] w-auto rounded-lg"
                    src={previewUrl}
                  />
                )}
                {!previewLoading && !previewError && previewUrl && isAudioFile(previewFile) && (
                  <audio
                    controls
                    className="w-full"
                    src={previewUrl}
                  />
                )}
                {!previewLoading && !previewError && previewUrl && isPdfFile(previewFile) && (
                  <iframe
                    src={previewUrl}
                    className="h-[70vh] w-full rounded-lg"
                    title={previewFile.name}
                  />
                )}

                {!previewLoading && !previewError && previewText && isTextLikeFile(previewFile) && (
                  <div className="max-h-[70vh] overflow-auto rounded-lg bg-card">
                    <pre className="whitespace-pre-wrap font-mono text-xs p-4 leading-relaxed">
                      {previewText}
                    </pre>
                    {previewText.length === 200000 && (
                      <p className="text-xs opacity-60 p-2 border-t border-border">
                        Bestand is te groot. Eerste 200KB wordt getoond. <button onClick={() => downloadFile(previewFile)} className="underline hover:opacity-100">Volledig bestand downloaden</button>
                      </p>
                    )}
                  </div>
                )}

                {!previewLoading && !previewError && previewOfficeUrl && isOfficeFile(previewFile) && (
                  <div className="space-y-3">
                    <p className="text-xs opacity-70">
                      Office-preview gebruikt een externe kijker. Als je een fout ziet, controleer of je server publiek bereikbaar is.
                    </p>
                    <button
                      className="rounded-lg border border-border px-3 py-1 text-sm font-medium transition hover:bg-accent/10"
                      onClick={() => void downloadFile(previewFile)}
                    >
                      Open lokaal via download
                    </button>
                    {officePreviewFailed && (
                      <p className="text-sm text-red-300">
                        Office-kijker kon niet laden. Gebruik "Open lokaal via download".
                      </p>
                    )}
                    <iframe
                      src={previewOfficeUrl}
                      className="h-[70vh] w-full rounded-lg"
                      title={previewFile.name}
                      onError={() => {
                        setOfficePreviewFailed(true);
                        setUserError("Office-preview kon niet laden. Download wordt aanbevolen.");
                        setUserNotice("");
                      }}
                    />
                  </div>
                )}

                {!previewLoading && !previewError && !previewText && previewUrl && !isImageFile(previewFile) && !isVideoFile(previewFile) && !isAudioFile(previewFile) && !isPdfFile(previewFile) && (
                  <div className="space-y-2">
                    <p className="text-sm opacity-70">Preview voor dit bestandstype is beperkt.</p>
                    <button
                      className="rounded-lg border border-border px-3 py-1 text-sm transition hover:bg-accent/10"
                      onClick={() => downloadFile(previewFile)}
                    >
                      Bestand downloaden
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
