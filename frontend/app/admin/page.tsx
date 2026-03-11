"use client";

import { useEffect, useMemo, useState } from "react";
import { HardDrive, RefreshCw, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

type User = { id: string; email: string; full_name: string; is_active: boolean };

type Usage = { email: string; used_bytes: number };

function formatStorage(bytes: number) {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("ChangeMe123!");
  const [role, setRole] = useState("employee");
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<"name" | "email">("name");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [u, s] = await Promise.all([api<User[]>("/admin/users"), api<Usage[]>("/admin/storage-usage")]);
      setUsers(u);
      setUsage(s);
    } catch (err) {
      setUsers([]);
      setUsage([]);
      setError(err instanceof Error ? err.message : "Admingegevens laden mislukt");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function renameUser(userId: string, currentName: string) {
    const fullName = prompt("Nieuwe naam", currentName)?.trim();
    if (!fullName || fullName === currentName) return;

    setStatus("");
    setError("");
    try {
      const result = await api<{ message: string }>(`/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName }),
      });
      setStatus(result.message || "Gebruiker bijgewerkt");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gebruiker bijwerken mislukt");
    }
  }

  async function deleteUser(userId: string, fullName: string) {
    if (!confirm(`Gebruiker \"${fullName}\" verwijderen?`)) return;

    setStatus("");
    setError("");
    try {
      const result = await api<{ message: string }>(`/admin/users/${userId}`, {
        method: "DELETE",
      });
      setStatus(result.message || "Gebruiker verwijderd");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gebruiker verwijderen mislukt");
    }
  }

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    setError("");
    try {
      const result = await api<{ message: string }>("/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, full_name: name, password, role }),
      });
      setEmail("");
      setName("");
      setPassword("ChangeMe123!");
      setStatus(result.message || "Gebruiker aangemaakt");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gebruiker aanmaken mislukt");
    }
  }

  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    const filtered = users.filter((user) => {
      if (!query) return true;
      return [user.full_name, user.email].some((field) => field.toLowerCase().includes(query));
    });

    return [...filtered].sort((a, b) => {
      if (userSort === "email") return a.email.localeCompare(b.email);
      return a.full_name.localeCompare(b.full_name);
    });
  }, [users, userSearch, userSort]);

  const totalStorageMb = Math.round(usage.reduce((sum, row) => sum + row.used_bytes, 0) / 1024 / 1024);
  const activeUsers = users.filter((u) => u.is_active).length;
  const inactiveUsers = users.length - activeUsers;

  return (
    <LayoutShell>
      <div className="space-y-5">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                Administratie
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Admin centrum</h1>
              <p className="mt-3 max-w-3xl text-sm opacity-70 sm:text-base">
                Beheer gebruikers, accounts en opslag vanuit een duidelijk controlepaneel voor dagelijkse operaties.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Verversen..." : "Admingegevens verversen"}
                </button>
                <div className="rounded-2xl border border-border px-4 py-2.5 text-sm opacity-70">
                  {visibleUsers.length} gefilterde gebruikers zichtbaar
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Gebruikers</p>
                <p className="mt-2 text-2xl font-semibold">{users.length}</p>
                <p className="mt-1 text-sm opacity-60">Geregistreerde teamleden</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Actief</p>
                <p className="mt-2 text-2xl font-semibold">{activeUsers}</p>
                <p className="mt-1 text-sm opacity-60">Accounts momenteel actief</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Inactief</p>
                <p className="mt-2 text-2xl font-semibold">{inactiveUsers}</p>
                <p className="mt-1 text-sm opacity-60">Accounts voor opvolging</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Opslag</p>
                <p className="mt-2 text-2xl font-semibold">{totalStorageMb >= 1024 ? `${(totalStorageMb / 1024).toFixed(2)} GB` : `${totalStorageMb} MB`}</p>
                <p className="mt-1 text-sm opacity-60">Totaal gebruik gebruikers</p>
              </div>
            </div>
          </div>
        </section>

        {status && (
          <div className="glass rounded-[1.5rem] border border-border bg-card/50 p-4 text-sm">
            {status}
          </div>
        )}
        {error && (
          <div className="rounded-[1.5rem] border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.05fr_1.2fr]">
          <form onSubmit={inviteUser} className="glass rounded-[2rem] p-5 sm:p-6">
            <div className="flex items-start gap-4 border-b border-border/60 pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Gebruikerstoegang</p>
                <h2 className="mt-1 text-xl font-semibold">Gebruiker aanmaken</h2>
                <p className="mt-2 text-sm opacity-65">Maak een gebruiker met tijdelijk wachtwoord aan. De gebruiker kan direct inloggen.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">E-mail</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@bedrijf.com" className="w-full rounded-2xl border border-border bg-transparent px-3 py-2.5" required />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">Volledige naam</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className="w-full rounded-2xl border border-border bg-transparent px-3 py-2.5" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Tijdelijk wachtwoord</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tijdelijk wachtwoord" className="w-full rounded-2xl border border-border bg-transparent px-3 py-2.5" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-2xl border border-border bg-transparent px-3 py-2.5">
                  <option value="employee">medewerker</option>
                  <option value="admin">beheerder</option>
                </select>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-card/30 p-4 text-sm opacity-70">
              Nieuwe gebruikers kunnen meteen inloggen met het tijdelijke wachtwoord en dit daarna wijzigen.
            </div>

            <button className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90">
              <UserPlus className="h-4 w-4" />
              Gebruiker aanmaken
            </button>
          </form>

          <section className="glass rounded-[2rem] p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Overzicht</p>
                  <h3 className="mt-1 text-xl font-semibold">Gebruikers</h3>
                  <p className="mt-2 text-sm opacity-65">Bekijk gebruikersaccounts snel met zoeken en sorteren.</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Zoek naam of e-mail"
                    className="w-full rounded-2xl border border-border bg-transparent py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
                <select
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value as "name" | "email")}
                  className="rounded-2xl border border-border bg-transparent px-3 py-2.5 text-sm"
                >
                  <option value="name">Sorteer op naam</option>
                  <option value="email">Sorteer op e-mail</option>
                </select>
              </div>
            </div>

            <ul className="mt-5 space-y-3 text-sm">
              {visibleUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-border bg-card/25 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.full_name}</p>
                    <p className="mt-1 truncate text-xs opacity-70">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${u.is_active ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                      {u.is_active ? "actief" : "inactief"}
                    </span>
                    <button
                      onClick={() => void renameUser(u.id, u.full_name)}
                      className="rounded-xl border border-border px-3 py-1 text-xs transition hover:bg-card/70"
                    >
                      Naam wijzigen
                    </button>
                    <button
                      onClick={() => void deleteUser(u.id, u.full_name)}
                      className="rounded-xl border border-red-500/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/15"
                    >
                      Verwijderen
                    </button>
                  </div>
                </li>
              ))}
              {visibleUsers.length === 0 && <li className="rounded-[1.5rem] border border-dashed border-border p-5 text-center opacity-60">Geen gebruikers gevonden voor deze filter.</li>}
            </ul>
          </section>
        </div>

        <section className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="flex items-start gap-4 border-b border-border/60 pb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Capaciteit</p>
              <h3 className="mt-1 text-xl font-semibold">Opslaggebruik</h3>
              <p className="mt-2 text-sm opacity-65">Zie welke accounts het meeste opslag gebruiken in de cloudomgeving.</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
            {usage.map((u) => (
              <li key={u.email} className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                <p className="truncate font-medium">{u.email}</p>
                <p className="mt-2 text-lg font-semibold">{formatStorage(u.used_bytes)}</p>
                <p className="mt-1 text-xs opacity-55">Huidig toegewezen gebruik</p>
              </li>
            ))}
            {usage.length === 0 && <li className="rounded-[1.5rem] border border-dashed border-border p-5 text-center opacity-60 md:col-span-2 xl:col-span-3">Geen opslagdata beschikbaar.</li>}
          </ul>
        </section>
      </div>
    </LayoutShell>
  );
}
