"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

const DEFAULT_EMAIL_SIGNATURE = `<style>.thokan-logo-dark{display:none !important;}@media (prefers-color-scheme: dark){.thokan-logo-light{display:none !important;}.thokan-logo-dark{display:block !important;}}</style><div style="margin-top:16px;border-top:1px solid #d1d5db;padding-top:12px;font-family:Arial,sans-serif;font-size:13px;color:#111827;line-height:1.5;text-align:center;"><img class="thokan-logo-light" src="/Logo_tekst_CV.png" alt="ThoKan" style="display:block;margin:0 auto 10px auto;max-height:44px;width:auto;"><img class="thokan-logo-dark" src="/Logo_tekst_CV_white.png" alt="ThoKan" style="display:none;margin:0 auto 10px auto;max-height:44px;width:auto;"><div style="font-size:16px;font-weight:700;letter-spacing:0.3px;">ThoKan</div><div style="color:#374151;">BTW-nummer: 1034.077.111</div><div style="color:#374151;">Tel: 0475 50 67 03</div></div>`;

type MailConfig = {
  email: string;
  username: string;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  has_password: boolean;
  email_signature: string;
};

type MailMessage = {
  id: string;
  from: string;
  to?: string;
  subject: string;
  date: string;
  snippet: string;
};

type MailDetail = {
  id: string;
  from: string;
  reply_to: string;
  to: string;
  subject: string;
  date: string;
  message_id: string;
  in_reply_to: string;
  references: string;
  text_body: string;
  html_body: string;
};

type ActiveFolder = "inbox" | "sent";
type SortOrder = "newest" | "oldest" | "subject" | "sender";

export default function MailPage() {
  // Config
  const [config, setConfig] = useState<MailConfig | null>(null);
  const [password, setPassword] = useState("");
  const [emailSignature, setEmailSignature] = useState("");

  // Folder navigation
  const [activeFolder, setActiveFolder] = useState<ActiveFolder>("inbox");

  // Inbox state
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxSort, setInboxSort] = useState<SortOrder>("newest");
  const [snippetOnly, setSnippetOnly] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxPage, setInboxPage] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);

  // Sent state
  const [sentMessages, setSentMessages] = useState<MailMessage[]>([]);
  const [sentSearch, setSentSearch] = useState("");
  const [sentSort, setSentSort] = useState<SortOrder>("newest");
  const [loadingSent, setLoadingSent] = useState(false);
  const [sentPage, setSentPage] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [sentFolderName, setSentFolderName] = useState("Sent");

  // Message detail
  const [selectedMessage, setSelectedMessage] = useState<MailDetail | null>(null);
  const [emailHtmlUrl, setEmailHtmlUrl] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [openedFromFolder, setOpenedFromFolder] = useState<string>("INBOX");

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Reply
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // Status
  const [statusMsg, setStatusMsg] = useState("");

  // ─── Initialise ───────────────────────────────────────────────────────────
  useEffect(() => {
    api<MailConfig>("/mail/config")
      .then(setConfig)
      .catch((err) => setStatusMsg(err.message || "Failed to load mail config"));
  }, []);

  useEffect(() => {
    if (config) setEmailSignature(config.email_signature || DEFAULT_EMAIL_SIGNATURE);
  }, [config]);

  useEffect(() => {
    if (config?.has_password) loadInbox();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.has_password, inboxPage]);

  useEffect(() => {
    if (config?.has_password && activeFolder === "sent") loadSent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder, sentPage]);

  useEffect(() => {
    return () => {
      if (emailHtmlUrl) URL.revokeObjectURL(emailHtmlUrl);
    };
  }, [emailHtmlUrl]);

  // ─── Config ───────────────────────────────────────────────────────────────
  async function saveConfig() {
    if (!config) return;
    setStatusMsg("");
    try {
      await api<{ message: string }>("/mail/config", {
        method: "PUT",
        body: JSON.stringify({ ...config, password, email_signature: emailSignature }),
      });
      setPassword("");
      setStatusMsg("Mailbox config saved");
      const fresh = await api<MailConfig>("/mail/config");
      setConfig(fresh);
      setEmailSignature(fresh.email_signature || DEFAULT_EMAIL_SIGNATURE);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function testConnection() {
    setStatusMsg("");
    try {
      const res = await api<{ message: string }>("/mail/test", { method: "POST" });
      setStatusMsg(res.message);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Test failed");
    }
  }

  // ─── Folder loads ─────────────────────────────────────────────────────────
  async function loadInbox() {
    setLoadingInbox(true);
    setStatusMsg("");
    try {
      const res = await api<{ messages: MailMessage[]; total: number }>(`/mail/inbox?limit=50&skip=${inboxPage * 50}`);
      setMessages(res.messages || []);
      setTotalMessages(res.total || 0);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Inbox load failed");
    }
    setLoadingInbox(false);
  }

  async function loadSent() {
    setLoadingSent(true);
    setStatusMsg("");
    try {
      const res = await api<{ messages: MailMessage[]; total: number; folder: string }>(`/mail/sent?limit=50&skip=${sentPage * 50}`);
      setSentMessages(res.messages || []);
      setTotalSent(res.total || 0);
      if (res.folder) setSentFolderName(res.folder);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Sent load failed");
    }
    setLoadingSent(false);
  }

  function refreshCurrentFolder() {
    if (activeFolder === "inbox") loadInbox();
    else loadSent();
  }

  // ─── Filtering ────────────────────────────────────────────────────────────
  const visibleInbox = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase();
    const filtered = messages.filter((m) => {
      if (snippetOnly && !m.snippet?.trim()) return false;
      if (!q) return true;
      return [m.subject, m.from, m.snippet].some((p) => p?.toLowerCase().includes(q));
    });
    return [...filtered].sort((a, b) => {
      if (inboxSort === "subject") return (a.subject || "").localeCompare(b.subject || "");
      if (inboxSort === "sender") return (a.from || "").localeCompare(b.from || "");
      const ta = new Date(a.date || 0).getTime();
      const tb = new Date(b.date || 0).getTime();
      return inboxSort === "oldest" ? ta - tb : tb - ta;
    });
  }, [messages, inboxSearch, inboxSort, snippetOnly]);

  const visibleSent = useMemo(() => {
    const q = sentSearch.trim().toLowerCase();
    const filtered = sentMessages.filter((m) => {
      if (!q) return true;
      return [m.subject, m.to, m.snippet].some((p) => p?.toLowerCase().includes(q));
    });
    return [...filtered].sort((a, b) => {
      if (sentSort === "subject") return (a.subject || "").localeCompare(b.subject || "");
      if (sentSort === "sender") return (a.to || "").localeCompare(b.to || "");
      const ta = new Date(a.date || 0).getTime();
      const tb = new Date(b.date || 0).getTime();
      return sentSort === "oldest" ? ta - tb : tb - ta;
    });
  }, [sentMessages, sentSearch, sentSort]);

  // ─── Message detail ───────────────────────────────────────────────────────
  function decodeHtmlEntities(htmlStr: string): string {
    const ta = document.createElement("textarea");
    ta.innerHTML = htmlStr;
    return ta.value;
  }

  async function openMessage(messageId: string, folder: string) {
    setLoadingDetail(true);
    setOpenedFromFolder(folder);
    try {
      const detail = await api<MailDetail>(`/mail/message/${messageId}?folder=${encodeURIComponent(folder)}`);

      let htmlContent = detail.html_body;
      if (!htmlContent && detail.text_body) {
        const t = detail.text_body.trim();
        if (t.startsWith("<") || t.toLowerCase().startsWith("<!doctype")) htmlContent = detail.text_body;
      }
      if (htmlContent && htmlContent.includes("&lt;")) htmlContent = decodeHtmlEntities(htmlContent);

      if (htmlContent) {
        if (emailHtmlUrl) URL.revokeObjectURL(emailHtmlUrl);
        const blob = new Blob([htmlContent], { type: "text/html; charset=utf-8" });
        setEmailHtmlUrl(URL.createObjectURL(blob));
      } else {
        setEmailHtmlUrl(null);
      }

      setSelectedMessage(detail);
      setShowReply(false);
      setReplyBody("");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Failed to load message");
    }
    setLoadingDetail(false);
  }

  function closeMessage() {
    if (emailHtmlUrl) { URL.revokeObjectURL(emailHtmlUrl); setEmailHtmlUrl(null); }
    setSelectedMessage(null);
    setShowReply(false);
    setReplyBody("");
  }

  // ─── Send / Reply ─────────────────────────────────────────────────────────
  async function sendMail() {
    setStatusMsg("");
    try {
      const res = await api<{ message: string }>("/mail/send", {
        method: "POST",
        body: JSON.stringify({ to, subject, body }),
      });
      setStatusMsg(res.message);
      setTo(""); setSubject(""); setBody("");
      setShowCompose(false);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Send failed");
    }
  }

  async function replyMail() {
    if (!selectedMessage) return;
    setStatusMsg("");
    try {
      const res = await api<{ message: string }>("/mail/reply", {
        method: "POST",
        body: JSON.stringify({
          reply_to: selectedMessage.reply_to || selectedMessage.from,
          from: selectedMessage.from,
          subject: selectedMessage.subject,
          message_id: selectedMessage.message_id,
          in_reply_to: selectedMessage.in_reply_to,
          references: selectedMessage.references,
          body: replyBody,
        }),
      });
      setStatusMsg(res.message);
      setReplyBody("");
      setShowReply(false);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Reply failed");
    }
  }

  async function deleteMessage(messageId: string, folder: string) {
    if (!confirm("Delete this email permanently?")) return;
    setStatusMsg("");
    try {
      await api<{ message: string }>(`/mail/message/${messageId}?folder=${encodeURIComponent(folder)}`, { method: "DELETE" });
      if (folder === "INBOX" || folder.toLowerCase() === "inbox") {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        setSentMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      if (selectedMessage?.id === messageId) closeMessage();
      setStatusMsg("Email deleted");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // ─── Shared sort selector ─────────────────────────────────────────────────
  const SortSelect = ({ value, onChange, isSent }: { value: SortOrder; onChange: (v: SortOrder) => void; isSent?: boolean }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOrder)}
      className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
    >
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="subject">Subject A–Z</option>
      <option value="sender">{isSent ? "Recipient A–Z" : "Sender A–Z"}</option>
    </select>
  );

  const folderLabel = activeFolder === "inbox" ? "Inbox" : "Sent";
  const currentLoad = activeFolder === "inbox" ? loadingInbox : loadingSent;
  const visibleList = activeFolder === "inbox" ? visibleInbox : visibleSent;

  return (
    <LayoutShell>
      <div className="flex h-full flex-col gap-4">
        {/* ── Sticky header ─────────────────────────────────────────── */}
        <div className="glass sticky top-3 z-20 flex items-center justify-between rounded-2xl p-4 backdrop-blur">
          <h2 className="text-xl font-semibold">Mailbox</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setTo(""); setSubject(""); setBody(""); setShowCompose(true); }}
              className="flex items-center gap-2 rounded-xl bg-accent/80 px-4 py-2 text-white transition hover:bg-accent"
            >
              <span>✉️</span>
              <span className="hidden sm:inline">New Email</span>
            </button>
            <button
              onClick={refreshCurrentFolder}
              className="rounded-xl border border-border px-4 py-2 transition hover:bg-card/70"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-xl border border-border px-4 py-2 transition hover:bg-card/70"
              title="Mailbox settings"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* ── Status ────────────────────────────────────────────────── */}
        {statusMsg && (
          <div className="glass rounded-xl px-4 py-3 text-sm">
            <span>{statusMsg}</span>
            <button className="ml-3 opacity-50 hover:opacity-100" onClick={() => setStatusMsg("")}>✕</button>
          </div>
        )}

        {/* ── Layout: sidebar + main ────────────────────────────────── */}
        <div className="flex flex-1 gap-4">
          {/* Sidebar */}
          <aside className="glass flex w-44 shrink-0 flex-col gap-1 rounded-2xl p-3">
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide opacity-50">Folders</p>
            <button
              onClick={() => { setActiveFolder("inbox"); if (config?.has_password) loadInbox(); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                activeFolder === "inbox" ? "bg-accent/20 font-medium" : "hover:bg-card/60"
              }`}
            >
              <span>📥 Inbox</span>
              {totalMessages > 0 && (
                <span className="rounded-full bg-accent/30 px-2 py-0.5 text-xs">{totalMessages}</span>
              )}
            </button>
            <button
              onClick={() => { setActiveFolder("sent"); if (config?.has_password && sentMessages.length === 0) loadSent(); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                activeFolder === "sent" ? "bg-accent/20 font-medium" : "hover:bg-card/60"
              }`}
            >
              <span>📤 Sent</span>
              {totalSent > 0 && (
                <span className="rounded-full bg-accent/30 px-2 py-0.5 text-xs">{totalSent}</span>
              )}
            </button>
          </aside>

          {/* Main panel */}
          <main className="glass flex flex-1 flex-col gap-4 rounded-2xl p-5">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-border bg-card/30 p-3">
                <p className="text-xs opacity-60">On this page</p>
                <p className="mt-1 text-xl font-semibold">{visibleList.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-card/30 p-3">
                <p className="text-xs opacity-60">Total in {folderLabel}</p>
                <p className="mt-1 text-xl font-semibold">
                  {activeFolder === "inbox" ? totalMessages : totalSent}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/30 p-3">
                <p className="text-xs opacity-60">After filters</p>
                <p className="mt-1 text-xl font-semibold">{visibleList.length}</p>
              </div>
            </div>

            {/* Search / sort */}
            {activeFolder === "inbox" ? (
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <input
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Search sender, subject, snippet…"
                  className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
                />
                <SortSelect value={inboxSort} onChange={setInboxSort} />
                <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <input type="checkbox" checked={snippetOnly} onChange={(e) => setSnippetOnly(e.target.checked)} />
                  Has snippet
                </label>
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={sentSearch}
                  onChange={(e) => setSentSearch(e.target.value)}
                  placeholder="Search recipient, subject…"
                  className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
                />
                <SortSelect value={sentSort} onChange={setSentSort} isSent />
              </div>
            )}

            {/* Pagination header */}
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{folderLabel}</h3>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => activeFolder === "inbox" ? setInboxPage((p) => Math.max(0, p - 1)) : setSentPage((p) => Math.max(0, p - 1))}
                  disabled={(activeFolder === "inbox" ? inboxPage : sentPage) === 0}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-50"
                >
                  ← Prev
                </button>
                <span className="px-2 py-1">Page {(activeFolder === "inbox" ? inboxPage : sentPage) + 1}</span>
                <button
                  onClick={() => activeFolder === "inbox" ? setInboxPage((p) => p + 1) : setSentPage((p) => p + 1)}
                  disabled={(activeFolder === "inbox" ? messages : sentMessages).length < 50}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Message list */}
            <ul className="max-h-[600px] space-y-2 overflow-y-auto">
              {visibleList.map((msg) => {
                const folderParam = activeFolder === "inbox" ? "INBOX" : sentFolderName;
                return (
                  <li
                    key={msg.id}
                    className="cursor-pointer rounded-xl border border-border p-3 transition hover:bg-accent/10"
                    onClick={() => openMessage(msg.id, folderParam)}
                  >
                    <p className="truncate text-sm font-medium">{msg.subject || "(No subject)"}</p>
                    <p className="mt-1 text-xs opacity-60">
                      {activeFolder === "inbox" ? `From: ${msg.from}` : `To: ${msg.to}`}
                    </p>
                    <p className="mt-0.5 text-xs opacity-40">{msg.date}</p>
                    {msg.snippet && <p className="mt-1 truncate text-xs opacity-50">{msg.snippet}</p>}
                    <div className="mt-2 flex justify-end">
                      <button
                        className="rounded-lg border border-border px-3 py-1 text-xs transition hover:bg-red-500/20"
                        onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id, folderParam); }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
              {currentLoad && (
                <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  Loading {folderLabel.toLowerCase()}…
                </li>
              )}
              {!currentLoad && visibleList.length === 0 && (
                <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  {config?.has_password ? `No messages in ${folderLabel}.` : "Configure your mailbox to load messages."}
                </li>
              )}
            </ul>
          </main>
        </div>

        {/* ── Compose modal ─────────────────────────────────────────── */}
        {showCompose && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowCompose(false)}
          >
            <div
              className="glass w-full max-w-2xl rounded-2xl p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">New Email</h3>
                <button onClick={() => setShowCompose(false)} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card/70">✕</button>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full rounded-xl border border-border bg-transparent px-3 py-2"
                  placeholder="To"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-border bg-transparent px-3 py-2"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <textarea
                  className="h-48 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                  placeholder="Message"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="rounded-xl bg-accent/80 px-6 py-2 text-white hover:bg-accent" onClick={sendMail}>
                    Send
                  </button>
                  <button className="rounded-xl border border-border px-4 py-2 hover:bg-card/70" onClick={() => { setTo(""); setSubject(""); setBody(""); }}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings modal ────────────────────────────────────────── */}
        {showSettings && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <div
              className="glass w-full max-w-2xl rounded-2xl p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Mailbox Settings</h3>
                <button onClick={() => setShowSettings(false)} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card/70">✕</button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="Email" value={config?.email || ""} onChange={(e) => setConfig((p) => p ? { ...p, email: e.target.value } : p)} />
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="Username" value={config?.username || ""} onChange={(e) => setConfig((p) => p ? { ...p, username: e.target.value } : p)} />
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="IMAP host" value={config?.imap_host || ""} onChange={(e) => setConfig((p) => p ? { ...p, imap_host: e.target.value } : p)} />
                <input type="number" className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="IMAP port" value={config?.imap_port || 993} onChange={(e) => setConfig((p) => p ? { ...p, imap_port: Number(e.target.value) || 993 } : p)} />
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="SMTP host" value={config?.smtp_host || ""} onChange={(e) => setConfig((p) => p ? { ...p, smtp_host: e.target.value } : p)} />
                <input type="number" className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="SMTP port" value={config?.smtp_port || 587} onChange={(e) => setConfig((p) => p ? { ...p, smtp_port: Number(e.target.value) || 587 } : p)} />
              </div>

              <input
                type="password"
                className="mt-3 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder={config?.has_password ? "Leave blank to keep current password" : "Mailbox password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={config?.imap_use_ssl ?? true} onChange={(e) => setConfig((p) => p ? { ...p, imap_use_ssl: e.target.checked } : p)} />IMAP SSL</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={config?.smtp_use_tls ?? true} onChange={(e) => setConfig((p) => p ? { ...p, smtp_use_tls: e.target.checked } : p)} />SMTP TLS</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={config?.smtp_use_ssl ?? false} onChange={(e) => setConfig((p) => p ? { ...p, smtp_use_ssl: e.target.checked } : p)} />SMTP SSL</label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-xl bg-accent/80 px-4 py-2 text-white hover:bg-accent" onClick={saveConfig}>Save Settings</button>
                <button className="rounded-xl border border-border px-4 py-2 hover:bg-card/70" onClick={testConnection}>Test Connection</button>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <h4 className="mb-2 text-sm font-semibold">Email Signature</h4>
                <textarea
                  className="h-36 w-full rounded-xl border border-border bg-transparent px-3 py-2 font-mono text-xs"
                  placeholder="HTML or plain text"
                  value={emailSignature}
                  onChange={(e) => setEmailSignature(e.target.value)}
                />
                <p className="mt-1 text-xs opacity-50">Auto-appended to every sent message.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Message detail modal ──────────────────────────────────── */}
        {selectedMessage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={closeMessage}
          >
            <div
              className="glass max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-2xl font-bold">{selectedMessage.subject || "(No subject)"}</h2>
                  <p className="mt-2 text-sm opacity-70">From: <span className="font-medium">{selectedMessage.from}</span></p>
                  <p className="text-sm opacity-70">To: <span className="font-medium">{selectedMessage.to}</span></p>
                  <p className="mt-1 text-xs opacity-50">{selectedMessage.date}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {activeFolder === "inbox" && (
                    <button className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent/20" onClick={() => setShowReply(!showReply)}>
                      Reply
                    </button>
                  )}
                  <button className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-red-500/20" onClick={() => deleteMessage(selectedMessage.id, openedFromFolder)}>
                    Delete
                  </button>
                  <button className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent/10" onClick={closeMessage}>
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white dark:bg-gray-900">
                {emailHtmlUrl ? (
                  <iframe
                    src={emailHtmlUrl}
                    className="h-[600px] w-full border-0"
                    sandbox="allow-same-origin allow-popups"
                    title="Email content"
                  />
                ) : selectedMessage.text_body ? (
                  <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm">{selectedMessage.text_body}</pre>
                ) : (
                  <p className="p-4 text-sm opacity-60">No content</p>
                )}
              </div>

              {showReply && (
                <div className="mt-6 border-t border-border pt-5">
                  <h4 className="mb-3 font-medium">Reply to {selectedMessage.from}</h4>
                  <textarea
                    className="h-40 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                    placeholder="Type your reply…"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                  />
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-xl bg-accent/80 px-6 py-2 text-white hover:bg-accent" onClick={replyMail}>Send Reply</button>
                    <button className="rounded-xl border border-border px-4 py-2 hover:bg-card/70" onClick={() => { setShowReply(false); setReplyBody(""); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Loading spinner ───────────────────────────────────────── */}
        {loadingDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="glass rounded-2xl p-6">
              <p className="text-sm">Loading message…</p>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}

