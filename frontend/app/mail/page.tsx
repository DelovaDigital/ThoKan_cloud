"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Inbox,
  Mail,
  MailPlus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";
import {
  browserNotificationsSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
} from "@/lib/browser-notifications";

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
  is_global?: boolean;
};

type CurrentUser = {
  id: string;
  roles: string[];
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

const MAIL_NOTIFICATION_STORAGE_KEY = "mail-last-message-id";
const MAIL_POLL_INTERVAL_MS = 60_000;

function ensureLinksOpenExternally(rawHtml: string): string {
  const baseTag = '<base target="_blank" rel="noopener noreferrer">';
  if (/<head[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  if (/<html[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${rawHtml}</body></html>`;
}

function formatDateLabel(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function MailPage() {
  // Config
  const [config, setConfig] = useState<MailConfig | null>(null);
  const [password, setPassword] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [mailIsGlobal, setMailIsGlobal] = useState(false);
  const [applyMailToAll, setApplyMailToAll] = useState(false);
  const [canConfigureGlobal, setCanConfigureGlobal] = useState(false);

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
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  // ─── Initialise ───────────────────────────────────────────────────────────
  useEffect(() => {
    setNotificationPermission(getBrowserNotificationPermission());

    api<MailConfig>("/mail/config")
      .then((data) => {
        setConfig(data);
        setMailIsGlobal(Boolean(data.is_global));
        setApplyMailToAll(Boolean(data.is_global));
      })
      .catch((err) => setStatusMsg(err.message || "Mailconfig laden mislukt"));

    api<CurrentUser>("/auth/me")
      .then((me) => setCanConfigureGlobal(Boolean(me.roles?.includes("admin"))))
      .catch(() => setCanConfigureGlobal(false));
  }, []);

  useEffect(() => {
    if (config) setEmailSignature(config.email_signature || DEFAULT_EMAIL_SIGNATURE);
  }, [config]);

  useEffect(() => {
    if (config?.has_password) loadInbox();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.has_password, inboxPage]);

  useEffect(() => {
    if (!config?.has_password) return;

    const pollInboxForNotifications = async () => {
      try {
        const res = await api<{ messages: MailMessage[]; total: number }>("/mail/inbox?limit=50&skip=0");
        const nextMessages = res.messages || [];
        const latestMessageId = nextMessages[0]?.id;

        if (activeFolder === "inbox" && inboxPage === 0) {
          setMessages(nextMessages);
          setTotalMessages(res.total || 0);
        }

        if (!latestMessageId) return;

        const previousMessageId = localStorage.getItem(MAIL_NOTIFICATION_STORAGE_KEY);
        if (!previousMessageId) {
          localStorage.setItem(MAIL_NOTIFICATION_STORAGE_KEY, latestMessageId);
          return;
        }

        if (previousMessageId === latestMessageId) {
          return;
        }

        const unseenMessages = nextMessages.filter((message) => message.id !== previousMessageId);
        const notifications = unseenMessages.slice(0, 3).reverse();

        for (const message of notifications) {
          sendBrowserNotification(`Nieuwe e-mail van ${message.from}`, {
            body: message.subject || message.snippet || "Nieuw bericht ontvangen",
            tag: `mail-${message.id}`,
          });
        }

        localStorage.setItem(MAIL_NOTIFICATION_STORAGE_KEY, latestMessageId);
      } catch {
        // Keep the existing page state stable if background notification polling fails.
      }
    };

    void pollInboxForNotifications();
    const interval = window.setInterval(() => {
      void pollInboxForNotifications();
    }, MAIL_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [activeFolder, config?.has_password, inboxPage]);

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
        body: JSON.stringify({ ...config, password, email_signature: emailSignature, apply_to_all: canConfigureGlobal ? applyMailToAll : false }),
      });
      setPassword("");
      setStatusMsg("Mailboxconfig opgeslagen");
      const fresh = await api<MailConfig>("/mail/config");
      setConfig(fresh);
      setMailIsGlobal(Boolean(fresh.is_global));
      setApplyMailToAll(Boolean(fresh.is_global));
      setEmailSignature(fresh.email_signature || DEFAULT_EMAIL_SIGNATURE);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Opslaan mislukt");
    }
  }

  async function testConnection() {
    setStatusMsg("");
    try {
      const res = await api<{ message: string }>("/mail/test", { method: "POST" });
      setStatusMsg(res.message);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Test mislukt");
    }
  }

  async function enableNotifications() {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
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
      setStatusMsg(err instanceof Error ? err.message : "Inbox laden mislukt");
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
      setStatusMsg(err instanceof Error ? err.message : "Verzonden map laden mislukt");
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
        const htmlWithTarget = ensureLinksOpenExternally(htmlContent);
        if (emailHtmlUrl) URL.revokeObjectURL(emailHtmlUrl);
        const blob = new Blob([htmlWithTarget], { type: "text/html; charset=utf-8" });
        setEmailHtmlUrl(URL.createObjectURL(blob));
      } else {
        setEmailHtmlUrl(null);
      }

      setSelectedMessage(detail);
      setShowReply(false);
      setReplyBody("");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Bericht laden mislukt");
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
      setStatusMsg(err instanceof Error ? err.message : "Verzenden mislukt");
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
      setStatusMsg(err instanceof Error ? err.message : "Antwoord verzenden mislukt");
    }
  }

  async function deleteMessage(messageId: string, folder: string) {
    if (!confirm("Dit e-mailbericht permanent verwijderen?")) return;
    setStatusMsg("");
    try {
      await api<{ message: string }>(`/mail/message/${messageId}?folder=${encodeURIComponent(folder)}`, { method: "DELETE" });
      if (folder === "INBOX" || folder.toLowerCase() === "inbox") {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        setSentMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      if (selectedMessage?.id === messageId) closeMessage();
      setStatusMsg("E-mail verwijderd");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  // ─── Shared sort selector ─────────────────────────────────────────────────
  const SortSelect = ({ value, onChange, isSent }: { value: SortOrder; onChange: (v: SortOrder) => void; isSent?: boolean }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOrder)}
      className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
    >
      <option value="newest">Nieuwste eerst</option>
      <option value="oldest">Oudste eerst</option>
      <option value="subject">Subject A–Z</option>
      <option value="sender">{isSent ? "Ontvanger A–Z" : "Afzender A–Z"}</option>
    </select>
  );

  const folderLabel = activeFolder === "inbox" ? "Inbox" : "Verzonden";
  const currentLoad = activeFolder === "inbox" ? loadingInbox : loadingSent;
  const visibleList = activeFolder === "inbox" ? visibleInbox : visibleSent;
  const totalVisibleInFolder = activeFolder === "inbox" ? totalMessages : totalSent;

  return (
    <LayoutShell>
      <div className="space-y-5">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Mail workspace
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Mailbox en opvolging</h1>
              <p className="mt-3 max-w-3xl text-sm opacity-70 sm:text-base">
                Eén vaste werkruimte voor inbox, verzonden berichten, mailboxconfiguratie en inline berichtdetail, zodat e-mail niet meer als een losse modalstroom aanvoelt.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {browserNotificationsSupported() && notificationPermission !== "granted" && (
                  <button
                    onClick={() => void enableNotifications()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm transition hover:bg-card/70"
                    title="Browsermeldingen inschakelen"
                  >
                    <Bell className="h-4 w-4" />
                    Meldingen activeren
                  </button>
                )}
                <button
                  onClick={() => {
                    setTo("");
                    setSubject("");
                    setBody("");
                    setShowCompose(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  <MailPlus className="h-4 w-4" />
                  Nieuwe e-mail
                </button>
                <button
                  onClick={refreshCurrentFolder}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm transition hover:bg-card/70"
                >
                  <RefreshCw className="h-4 w-4" />
                  Verversen
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm transition hover:bg-card/70"
                >
                  <Settings2 className="h-4 w-4" />
                  Instellingen
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Actieve map</p>
                <p className="mt-2 text-2xl font-semibold">{folderLabel}</p>
                <p className="mt-1 text-sm opacity-60">Huidige mailboxfocus</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Totaal in map</p>
                <p className="mt-2 text-2xl font-semibold">{totalVisibleInFolder}</p>
                <p className="mt-1 text-sm opacity-60">Inbox of verzonden volume</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Na filters</p>
                <p className="mt-2 text-2xl font-semibold">{visibleList.length}</p>
                <p className="mt-1 text-sm opacity-60">Zichtbare berichten in lijst</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Configuratie</p>
                <p className="mt-2 text-2xl font-semibold">{config?.has_password ? "Actief" : "Setup"}</p>
                <p className="mt-1 text-sm opacity-60">Mailboxverbinding en syncstatus</p>
              </div>
            </div>
          </div>
        </section>

        {statusMsg && (
          <div className="glass flex items-center justify-between gap-3 rounded-[1.5rem] px-4 py-3 text-sm">
            <span>{statusMsg}</span>
            <button className="rounded-lg border border-border p-1 opacity-60 transition hover:opacity-100" onClick={() => setStatusMsg("") }>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {browserNotificationsSupported() && notificationPermission === "granted" && (
          <div className="glass rounded-[1.5rem] px-4 py-3 text-sm opacity-75">
            Browsermeldingen zijn actief voor nieuwe e-mail.
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_380px]">
          <aside className="glass flex h-fit flex-col gap-2 rounded-[2rem] p-4 xl:sticky xl:top-[96px]">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Mappen</p>
            <button
              onClick={() => {
                setActiveFolder("inbox");
                if (config?.has_password) loadInbox();
              }}
              className={`flex items-center justify-between rounded-[1.25rem] px-3 py-3 text-sm transition ${
                activeFolder === "inbox" ? "bg-accent/15 font-medium" : "hover:bg-card/60"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Inbox
              </span>
              {totalMessages > 0 && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs">{totalMessages}</span>}
            </button>
            <button
              onClick={() => {
                setActiveFolder("sent");
                if (config?.has_password && sentMessages.length === 0) loadSent();
              }}
              className={`flex items-center justify-between rounded-[1.25rem] px-3 py-3 text-sm transition ${
                activeFolder === "sent" ? "bg-accent/15 font-medium" : "hover:bg-card/60"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Send className="h-4 w-4" />
                Verzonden
              </span>
              {totalSent > 0 && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs">{totalSent}</span>}
            </button>

            <div className="mt-3 rounded-[1.5rem] border border-border/70 bg-card/30 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Syncstatus</p>
              <p className="mt-2 font-medium">{mailIsGlobal ? "Globale mailboxbasis" : "Accountgebonden mailbox"}</p>
              <p className="mt-2 text-xs opacity-65">De mailmodule gebruikt dezelfde workspace-logica als settings en dashboard.</p>
            </div>
          </aside>

          <main className="glass min-h-0 rounded-[2rem] p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{folderLabel}</h2>
                <p className="mt-1 text-sm opacity-65">Zoeken, sorteren en berichtselectie blijven vast in dezelfde mailboxlaag.</p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => activeFolder === "inbox" ? setInboxPage((p) => Math.max(0, p - 1)) : setSentPage((p) => Math.max(0, p - 1))}
                  disabled={(activeFolder === "inbox" ? inboxPage : sentPage) === 0}
                  className="rounded-xl border border-border px-3 py-2 transition disabled:opacity-50"
                >
                  ← Vorige
                </button>
                <span className="rounded-xl border border-border px-3 py-2 opacity-70">Pagina {(activeFolder === "inbox" ? inboxPage : sentPage) + 1}</span>
                <button
                  onClick={() => activeFolder === "inbox" ? setInboxPage((p) => p + 1) : setSentPage((p) => p + 1)}
                  disabled={(activeFolder === "inbox" ? messages : sentMessages).length < 50}
                  className="rounded-xl border border-border px-3 py-2 transition disabled:opacity-50"
                >
                  Volgende →
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Op deze pagina</p>
                <p className="mt-2 text-2xl font-semibold">{visibleList.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Mapvolume</p>
                <p className="mt-2 text-2xl font-semibold">{totalVisibleInFolder}</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Previewstaat</p>
                <p className="mt-2 text-2xl font-semibold">{selectedMessage ? "Open" : "Stand-by"}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {activeFolder === "inbox" ? (
                <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
                    <input
                      value={inboxSearch}
                      onChange={(e) => setInboxSearch(e.target.value)}
                      placeholder="Zoek afzender, onderwerp, snippet…"
                      className="w-full rounded-xl border border-border bg-transparent py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <SortSelect value={inboxSort} onChange={setInboxSort} />
                  <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                    <input type="checkbox" checked={snippetOnly} onChange={(e) => setSnippetOnly(e.target.checked)} />
                    Met snippet
                  </label>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
                    <input
                      value={sentSearch}
                      onChange={(e) => setSentSearch(e.target.value)}
                      placeholder="Zoek ontvanger, onderwerp…"
                      className="w-full rounded-xl border border-border bg-transparent py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <SortSelect value={sentSort} onChange={setSentSort} isSent />
                </div>
              )}
            </div>

            <ul className="mt-5 min-h-0 space-y-3" style={{ WebkitOverflowScrolling: "touch" }}>
              {visibleList.map((msg) => {
                const folderParam = activeFolder === "inbox" ? "INBOX" : sentFolderName;
                const isActive = selectedMessage?.id === msg.id;
                return (
                  <li
                    key={msg.id}
                    className={`cursor-pointer rounded-[1.5rem] border p-4 transition ${
                      isActive ? "border-accent/35 bg-accent/5" : "border-border bg-card/20 hover:bg-card/35"
                    }`}
                    onClick={() => openMessage(msg.id, folderParam)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{msg.subject || "(Geen onderwerp)"}</p>
                        <p className="mt-1 text-xs opacity-60">{activeFolder === "inbox" ? `Van: ${msg.from}` : `Aan: ${msg.to}`}</p>
                        <p className="mt-1 text-[11px] opacity-45">{formatDateLabel(msg.date)}</p>
                        {msg.snippet && <p className="mt-2 truncate text-xs opacity-55">{msg.snippet}</p>}
                      </div>
                      <button
                        className="rounded-xl border border-border p-2 text-xs transition hover:bg-red-500/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMessage(msg.id, folderParam);
                        }}
                        aria-label="Bericht verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
              {currentLoad && (
                <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  {folderLabel.toLowerCase()} laden…
                </li>
              )}
              {!currentLoad && visibleList.length === 0 && (
                <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  {config?.has_password ? `Geen berichten in ${folderLabel}.` : "Configureer je mailbox om berichten te laden."}
                </li>
              )}
            </ul>
          </main>

          <aside className="glass rounded-[2rem] p-5 sm:p-6 xl:sticky xl:top-[96px] xl:h-fit">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-45">Detailkaart</p>
                <h2 className="mt-2 text-lg font-semibold">Berichtdetail</h2>
                <p className="mt-1 text-sm opacity-60">Afzender, inhoud en antwoord blijven vast zichtbaar naast de lijst.</p>
              </div>
              {selectedMessage && (
                <button className="rounded-xl border border-border p-2 transition hover:bg-card/60" onClick={closeMessage} aria-label="Bericht sluiten">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {loadingDetail && <p className="mt-5 text-sm opacity-70">Bericht laden…</p>}

            {!loadingDetail && !selectedMessage && (
              <div className="mt-5 rounded-[1.5rem] border border-dashed border-border bg-card/25 p-6 text-center">
                <p className="text-sm font-medium">Selecteer een bericht</p>
                <p className="mt-2 text-sm opacity-65">De detailkaart toont hier onderwerp, afzender, inhoud en antwoordactie zonder een aparte modal te openen.</p>
              </div>
            )}

            {selectedMessage && !loadingDetail && (
              <div className="mt-5 space-y-4">
                <div className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                  <p className="text-base font-semibold">{selectedMessage.subject || "(Geen onderwerp)"}</p>
                  <p className="mt-2 text-xs opacity-65">Van: {selectedMessage.from}</p>
                  <p className="mt-1 text-xs opacity-65">Aan: {selectedMessage.to}</p>
                  <p className="mt-1 text-[11px] opacity-45">{formatDateLabel(selectedMessage.date)}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeFolder === "inbox" && (
                      <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-card/60" onClick={() => setShowReply(!showReply)}>
                        <Reply className="h-4 w-4" />
                        Antwoorden
                      </button>
                    )}
                    <button className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/15" onClick={() => deleteMessage(selectedMessage.id, openedFromFolder)}>
                      <Trash2 className="h-4 w-4" />
                      Verwijderen
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.5rem] border border-border bg-white dark:bg-gray-900">
                  {emailHtmlUrl ? (
                    <iframe
                      src={emailHtmlUrl}
                      className="h-[420px] w-full border-0"
                      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                      scrolling="yes"
                      title="E-mailinhoud"
                    />
                  ) : selectedMessage.text_body ? (
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm" style={{ WebkitOverflowScrolling: "touch" }}>{selectedMessage.text_body}</pre>
                  ) : (
                    <p className="p-4 text-sm opacity-60">Geen inhoud</p>
                  )}
                </div>

                {showReply && (
                  <div className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                    <h4 className="mb-3 font-medium">Antwoorden aan {selectedMessage.from}</h4>
                    <textarea
                      className="h-40 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                      placeholder="Typ je antwoord…"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                    <div className="mt-3 flex gap-2">
                      <button className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90" onClick={replyMail}>
                        <Reply className="h-4 w-4" />
                        Antwoord verzenden
                      </button>
                      <button className="rounded-xl border border-border px-4 py-2 text-sm transition hover:bg-card/70" onClick={() => { setShowReply(false); setReplyBody(""); }}>
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
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
                <h3 className="text-lg font-semibold">Nieuwe e-mail</h3>
                <button onClick={() => setShowCompose(false)} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card/70">✕</button>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full rounded-xl border border-border bg-transparent px-3 py-2"
                  placeholder="Aan"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-border bg-transparent px-3 py-2"
                  placeholder="Onderwerp"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <textarea
                  className="h-48 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                  placeholder="Bericht"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="rounded-xl bg-accent/80 px-6 py-2 text-white hover:bg-accent" onClick={sendMail}>
                    Verzenden
                  </button>
                  <button className="rounded-xl border border-border px-4 py-2 hover:bg-card/70" onClick={() => { setTo(""); setSubject(""); setBody(""); }}>
                    Leegmaken
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
                <h3 className="text-lg font-semibold">Mailboxinstellingen</h3>
                <button onClick={() => setShowSettings(false)} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card/70">✕</button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="Email" value={config?.email || ""} onChange={(e) => setConfig((p) => p ? { ...p, email: e.target.value } : p)} />
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="Gebruikersnaam" value={config?.username || ""} onChange={(e) => setConfig((p) => p ? { ...p, username: e.target.value } : p)} />
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="IMAP host" value={config?.imap_host || ""} onChange={(e) => setConfig((p) => p ? { ...p, imap_host: e.target.value } : p)} />
                <input type="number" className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="IMAP port" value={config?.imap_port || 993} onChange={(e) => setConfig((p) => p ? { ...p, imap_port: Number(e.target.value) || 993 } : p)} />
                <input className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="SMTP host" value={config?.smtp_host || ""} onChange={(e) => setConfig((p) => p ? { ...p, smtp_host: e.target.value } : p)} />
                <input type="number" className="rounded-xl border border-border bg-transparent px-3 py-2" placeholder="SMTP port" value={config?.smtp_port || 587} onChange={(e) => setConfig((p) => p ? { ...p, smtp_port: Number(e.target.value) || 587 } : p)} />
              </div>

              <input
                type="password"
                className="mt-3 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder={config?.has_password ? "Leeg laten om huidig wachtwoord te behouden" : "Mailboxwachtwoord"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={config?.imap_use_ssl ?? true} onChange={(e) => setConfig((p) => p ? { ...p, imap_use_ssl: e.target.checked } : p)} />IMAP SSL</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={config?.smtp_use_tls ?? true} onChange={(e) => setConfig((p) => p ? { ...p, smtp_use_tls: e.target.checked } : p)} />SMTP TLS</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={config?.smtp_use_ssl ?? false} onChange={(e) => setConfig((p) => p ? { ...p, smtp_use_ssl: e.target.checked } : p)} />SMTP SSL</label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-xl bg-accent/80 px-4 py-2 text-white hover:bg-accent" onClick={saveConfig}>Instellingen opslaan</button>
                <button className="rounded-xl border border-border px-4 py-2 hover:bg-card/70" onClick={testConnection}>Verbinding testen</button>
              </div>

              {canConfigureGlobal && (
                <label className="mt-4 flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <input type="checkbox" checked={applyMailToAll} onChange={(e) => setApplyMailToAll(e.target.checked)} />
                  Deze mailboxconfiguratie voor alle accounts gebruiken
                </label>
              )}
              {mailIsGlobal && (
                <p className="mt-2 text-xs opacity-60">Deze mailboxconfiguratie wordt momenteel globaal gebruikt voor alle accounts zonder eigen instelling.</p>
              )}

              <div className="mt-6 border-t border-border pt-5">
                <h4 className="mb-2 text-sm font-semibold">E-mailsignatuur</h4>
                <textarea
                  className="h-36 w-full rounded-xl border border-border bg-transparent px-3 py-2 font-mono text-xs"
                  placeholder="HTML of platte tekst"
                  value={emailSignature}
                  onChange={(e) => setEmailSignature(e.target.value)}
                />
                <p className="mt-1 text-xs opacity-50">Wordt automatisch toegevoegd aan elk verzonden bericht.</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </LayoutShell>
  );
}

