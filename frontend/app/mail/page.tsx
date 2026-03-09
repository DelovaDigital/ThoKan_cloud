"use client";

import { useEffect, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

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
};

type MailMessage = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

type MailDetail = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text_body: string;
  html_body: string;
};

export default function MailPage() {
  const [config, setConfig] = useState<MailConfig | null>(null);
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MailDetail | null>(null);
  const [emailHtmlUrl, setEmailHtmlUrl] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    api<MailConfig>("/mail/config")
      .then(setConfig)
      .catch((err) => setStatus(err.message || "Failed to load mail config"));
  }, []);

  // Auto-load inbox when config is ready
  useEffect(() => {
    if (config && config.has_password && messages.length === 0) {
      loadInbox();
    }
  }, [config]);

  // Cleanup blob URL on unmount or when closing modal
  useEffect(() => {
    return () => {
      if (emailHtmlUrl) {
        URL.revokeObjectURL(emailHtmlUrl);
      }
    };
  }, [emailHtmlUrl]);

  async function saveConfig() {
    if (!config) return;
    setStatus("");
    try {
      await api<{ message: string }>("/mail/config", {
        method: "PUT",
        body: JSON.stringify({
          ...config,
          password,
        }),
      });
      setPassword("");
      setStatus("Mailbox config saved");
      const fresh = await api<MailConfig>("/mail/config");
      setConfig(fresh);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function testConnection() {
    setStatus("");
    try {
      const response = await api<{ message: string }>("/mail/test", { method: "POST" });
      setStatus(response.message);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Test failed");
    }
  }

  async function loadInbox() {
    setStatus("");
    try {
      const response = await api<{ messages: MailMessage[] }>("/mail/inbox?limit=20");
      setMessages(response.messages || []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Inbox load failed");
    }
  }

  function decodeHtmlEntities(html: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
  }

  async function openMessage(messageId: string) {
    setLoadingDetail(true);
    try {
      const detail = await api<MailDetail>(`/mail/message/${messageId}`);
      
      // Determine HTML content - check html_body first, then text_body if it contains HTML
      let htmlContent = detail.html_body;
      
      // If no html_body but text_body looks like HTML, use that
      if (!htmlContent && detail.text_body) {
        const trimmed = detail.text_body.trim();
        if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
          htmlContent = detail.text_body;
        }
      }
      
      // Decode HTML entities if they're escaped
      if (htmlContent && htmlContent.includes('&lt;')) {
        htmlContent = decodeHtmlEntities(htmlContent);
      }
      
      // Create blob URL for iframe
      if (htmlContent) {
        // Cleanup old blob URL
        if (emailHtmlUrl) {
          URL.revokeObjectURL(emailHtmlUrl);
        }
        
        const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        setEmailHtmlUrl(url);
      } else {
        setEmailHtmlUrl(null);
      }
      
      setSelectedMessage(detail);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load message");
    }
    setLoadingDetail(false);
  }

  function closeMessage() {
    if (emailHtmlUrl) {
      URL.revokeObjectURL(emailHtmlUrl);
      setEmailHtmlUrl(null);
    }
    setSelectedMessage(null);
  }

  async function sendMail() {
    setStatus("");
    try {
      const response = await api<{ message: string }>("/mail/send", {
        method: "POST",
        body: JSON.stringify({ to, subject, body }),
      });
      setStatus(response.message);
      setTo("");
      setSubject("");
      setBody("");
      await loadInbox();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Send failed");
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Delete this email permanently?")) return;
    setStatus("");
    try {
      await api<{ message: string }>(`/mail/message/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      if (selectedMessage?.id === messageId) {
        closeMessage();
      }
      setStatus("Email deleted");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <LayoutShell>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="glass flex items-center justify-between rounded-2xl p-4">
          <h2 className="text-xl font-semibold">Mailbox</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCompose(!showCompose)}
              className="flex items-center gap-2 rounded-xl bg-accent/80 px-4 py-2 text-white transition hover:bg-accent"
            >
              <span>✉️</span>
              <span>New Email</span>
            </button>
            <button
              onClick={loadInbox}
              className="rounded-xl border border-border px-4 py-2 transition hover:bg-card/70"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-xl border border-border px-4 py-2 transition hover:bg-card/70"
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>

        {status && (
          <div className="glass rounded-xl p-4 text-sm">
            <p>{status}</p>
          </div>
        )}

        {/* Settings Panel (collapsible) */}
        {showSettings && (
          <section className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Mailbox Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg border border-border px-3 py-1 text-sm transition hover:bg-card/70"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="Email"
                value={config?.email || ""}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
              />
              <input
                className="rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="Username"
                value={config?.username || ""}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, username: e.target.value } : prev))}
              />
              <input
                className="rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="IMAP host"
                value={config?.imap_host || ""}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, imap_host: e.target.value } : prev))}
              />
              <input
                type="number"
                className="rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="IMAP port"
                value={config?.imap_port || 993}
                onChange={(e) =>
                  setConfig((prev) => (prev ? { ...prev, imap_port: Number(e.target.value) || 993 } : prev))
                }
              />
              <input
                className="rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="SMTP host"
                value={config?.smtp_host || ""}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, smtp_host: e.target.value } : prev))}
              />
              <input
                type="number"
                className="rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="SMTP port"
                value={config?.smtp_port || 587}
                onChange={(e) =>
                  setConfig((prev) => (prev ? { ...prev, smtp_port: Number(e.target.value) || 587 } : prev))
                }
              />
            </div>

            <input
              type="password"
              className="mt-3 w-full rounded-xl border border-border bg-transparent px-3 py-2"
              placeholder={config?.has_password ? "Leave blank to keep current password" : "Mailbox password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config?.imap_use_ssl ?? true}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, imap_use_ssl: e.target.checked } : prev))}
                />
                IMAP SSL
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config?.smtp_use_tls ?? true}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, smtp_use_tls: e.target.checked } : prev))}
                />
                SMTP TLS
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config?.smtp_use_ssl ?? false}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, smtp_use_ssl: e.target.checked } : prev))}
                />
                SMTP SSL
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-xl bg-accent/80 px-4 py-2 text-white" onClick={saveConfig}>
                Save Settings
              </button>
              <button className="rounded-xl border border-border px-4 py-2" onClick={testConnection}>
                Test Connection
              </button>
            </div>
          </section>
        )}

        {/* Compose Panel (collapsible) */}
        {showCompose && (
          <section className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Compose Email</h3>
              <button
                onClick={() => setShowCompose(false)}
                className="rounded-lg border border-border px-3 py-1 text-sm transition hover:bg-card/70"
              >
                Close
              </button>
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
                className="h-64 w-full rounded-xl border border-border bg-transparent px-3 py-2"
                placeholder="Message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex gap-2">
                <button className="rounded-xl bg-accent/80 px-6 py-2 text-white transition hover:bg-accent" onClick={sendMail}>
                  Send Email
                </button>
                <button
                  className="rounded-xl border border-border px-4 py-2 transition hover:bg-card/70"
                  onClick={() => {
                    setTo("");
                    setSubject("");
                    setBody("");
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Inbox */}
        <section className="glass rounded-2xl p-5">
          <h3 className="mb-4 font-medium">Inbox ({messages.length})</h3>
          <ul className="max-h-[600px] space-y-2 overflow-y-auto">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className="cursor-pointer rounded-xl border border-border p-3 transition hover:bg-accent/10"
                onClick={() => openMessage(msg.id)}
              >
                <p className="truncate text-sm font-medium">{msg.subject || "(No subject)"}</p>
                <p className="mt-1 text-xs opacity-60">{msg.from}</p>
                <p className="mt-1 truncate text-xs opacity-50">{msg.snippet}</p>
                <div className="mt-2 flex justify-end">
                  <button
                    className="rounded-lg border border-border px-3 py-1 text-xs transition hover:bg-red-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMessage(msg.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {messages.length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                No messages. Click "Refresh" to load your inbox.
              </li>
            )}
          </ul>
        </section>

        {/* Mail Detail Modal */}
        {selectedMessage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={closeMessage}
          >
            <div
              className="glass max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">{selectedMessage.subject || "(No subject)"}</h2>
                  <p className="mt-2 text-sm opacity-70">
                    From: <span className="font-medium">{selectedMessage.from}</span>
                  </p>
                  <p className="text-sm opacity-70">
                    To: <span className="font-medium">{selectedMessage.to}</span>
                  </p>
                  <p className="mt-1 text-xs opacity-50">{selectedMessage.date}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm transition hover:bg-red-500/20"
                    onClick={() => deleteMessage(selectedMessage.id)}
                  >
                    Delete
                  </button>
                  <button
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm transition hover:bg-accent/10"
                    onClick={closeMessage}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
                {emailHtmlUrl ? (
                  <iframe
                    src={emailHtmlUrl}
                    className="w-full h-[600px] border-0"
                    sandbox="allow-same-origin allow-popups"
                    title="Email content"
                  />
                ) : selectedMessage.text_body ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm p-4 overflow-auto max-h-[600px]">{selectedMessage.text_body}</pre>
                ) : (
                  <p className="p-4 text-sm opacity-60">No content</p>
                )}
              </div>
            </div>
          </div>
        )}

        {loadingDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="glass rounded-2xl p-6">
              <p className="text-sm">Loading message...</p>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
