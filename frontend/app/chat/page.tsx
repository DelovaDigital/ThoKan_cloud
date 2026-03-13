"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Search, Send, Users } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

type ChatUser = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};

type ChatConversation = {
  participant: ChatUser;
  messages: ChatMessage[];
};

export default function ChatPage() {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [lastIncomingMessageId, setLastIncomingMessageId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : "";

  function scrollToBottom() {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }

  async function loadCurrentUser() {
    try {
      const me = await api<{ id: string }>("/auth/me");
      setCurrentUserId(me.id || "");
    } catch {
      setCurrentUserId("");
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    setError("");
    try {
      const response = await api<ChatUser[]>("/chat/users");
      setUsers(response);
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : "Gebruikers laden mislukt");
    }
    setLoadingUsers(false);
  }

  async function openConversation(user: ChatUser) {
    setSelectedUser(user);
    setLoadingConversation(true);
    setError("");
    try {
      const response = await api<ChatConversation>(`/chat/conversations/${user.id}`);
      setMessages(response.messages || []);
      const latestIncoming = (response.messages || []).slice().reverse().find((message) => message.sender_id !== currentUserId);
      setLastIncomingMessageId(latestIncoming?.id || null);
    } catch (err) {
      setMessages([]);
      setError(err instanceof Error ? err.message : "Chat laden mislukt");
    }
    setLoadingConversation(false);
  }

  async function sendMessage() {
    if (!selectedUser) return;
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError("");
    try {
      await api<{ message: string }>(`/chat/conversations/${selectedUser.id}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      const response = await api<ChatConversation>(`/chat/conversations/${selectedUser.id}`);
      setMessages(response.messages || []);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bericht verzenden mislukt");
    }
    setSending(false);
  }

  useEffect(() => {
    void loadCurrentUser();
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    const interval = setInterval(async () => {
      try {
        const response = await api<ChatConversation>(`/chat/conversations/${selectedUser.id}`);
        const latestMessages = response.messages || [];
        setMessages(latestMessages);

        const latestIncoming = latestMessages.slice().reverse().find((message) => message.sender_id !== currentUserId);
        if (!latestIncoming) return;
        if (!lastIncomingMessageId) {
          setLastIncomingMessageId(latestIncoming.id);
          return;
        }
        if (latestIncoming.id !== lastIncomingMessageId) {
          setLastIncomingMessageId(latestIncoming.id);
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") {
              Notification.requestPermission().catch(() => undefined);
            } else if (Notification.permission === "granted" && document.hidden) {
              new Notification(`Nieuw bericht van ${selectedUser.full_name}`, {
                body: latestIncoming.body,
              });
            }
          }
        }
      } catch {
        // polling is best-effort
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedUser, currentUserId, lastIncomingMessageId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollToBottom();
    }, 40);
    return () => clearTimeout(timeout);
  }, [lastMessageId, selectedUser?.id]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => [user.full_name, user.email].some((value) => value.toLowerCase().includes(q)));
  }, [search, users]);

  return (
    <LayoutShell>
      <div className="space-y-4">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <MessageSquare className="h-3.5 w-3.5 text-accent" />
                Team chat
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Chat</h1>
              <p className="mt-2 text-sm opacity-70">Chat direct met gebruikers binnen ThoKan Cloud.</p>
            </div>
            <button
              onClick={() => void loadUsers()}
              disabled={loadingUsers}
              className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              {loadingUsers ? "Verversen..." : "Gebruikers verversen"}
            </button>
          </div>
        </section>

        {error && <div className="rounded-[1.5rem] border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.3fr]">
          <section className="glass rounded-[2rem] p-5 sm:p-6 h-[68vh] flex flex-col overflow-hidden">
            <div className="flex items-start gap-4 border-b border-border/60 pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Users className="h-5 w-5" />
              </div>
              <div className="w-full">
                <h2 className="text-xl font-semibold">Gebruikers</h2>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Zoek op naam of e-mail"
                    className="w-full rounded-2xl border border-border bg-transparent py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>
            </div>

            <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
              {filteredUsers.map((user) => (
                <li key={user.id}>
                  <button
                    onClick={() => void openConversation(user)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedUser?.id === user.id ? "border-accent bg-accent/10" : "border-border bg-card/20 hover:bg-card/35"
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{user.full_name}</p>
                    <p className="mt-1 truncate text-xs opacity-65">{user.email}</p>
                  </button>
                </li>
              ))}
              {filteredUsers.length === 0 && <li className="rounded-2xl border border-dashed border-border p-4 text-sm opacity-60">Geen gebruikers gevonden.</li>}
            </ul>
          </section>

          <section className="glass rounded-[2rem] p-5 sm:p-6 h-[68vh] flex flex-col overflow-hidden">
            {selectedUser ? (
              <>
                <div className="border-b border-border/60 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Conversatie</p>
                  <h3 className="mt-1 text-xl font-semibold">{selectedUser.full_name}</h3>
                  <p className="mt-1 text-sm opacity-65">{selectedUser.email}</p>
                </div>

                <div ref={messagesContainerRef} className="mt-4 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-card/20 p-3">
                  {loadingConversation ? (
                    <p className="text-sm opacity-70">Chat laden...</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm opacity-70">Nog geen berichten.</p>
                  ) : (
                    messages.map((message) => {
                      const ownMessage = message.sender_id === currentUserId;
                      const senderLabel = ownMessage ? "Jij" : selectedUser.full_name;
                      return (
                        <div key={message.id} className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-xl border px-3 py-2 ${ownMessage ? "border-accent/40 bg-accent/15" : "border-border/70 bg-card/35"}`}>
                            <p className="text-[11px] font-medium opacity-65">{senderLabel}</p>
                            <p className="mt-1 text-sm">{message.body}</p>
                            <p className="mt-1 text-[11px] opacity-55">{new Date(message.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-3 flex gap-2 border-t border-border/50 pt-3">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Typ je bericht..."
                    className="w-full rounded-2xl border border-border bg-transparent px-3 py-2.5 text-sm"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <button
                    onClick={() => void sendMessage()}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center text-sm opacity-65">
                Selecteer links een gebruiker om te chatten.
              </div>
            )}
          </section>
        </div>
      </div>
    </LayoutShell>
  );
}
