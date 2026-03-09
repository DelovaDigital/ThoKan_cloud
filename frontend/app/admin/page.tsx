"use client";

import { useEffect, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

type User = { id: string; email: string; full_name: string; is_active: boolean };

type Usage = { email: string; used_bytes: number };

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("ChangeMe123!");
  const [role, setRole] = useState("employee");

  async function load() {
    const [u, s] = await Promise.all([api<User[]>("/admin/users"), api<Usage[]>("/admin/storage-usage")]);
    setUsers(u);
    setUsage(s);
  }

  useEffect(() => {
    load().catch(() => {
      setUsers([]);
      setUsage([]);
    });
  }, []);

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    await api("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, full_name: name, password, role }),
    });
    setEmail("");
    setName("");
    setPassword("ChangeMe123!");
    await load();
  }

  return (
    <LayoutShell>
      <div className="space-y-4">
        <form onSubmit={inviteUser} className="glass rounded-2xl p-4">
          <h2 className="text-lg font-semibold">Invite user</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-border bg-transparent px-3 py-2" required />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-xl border border-border bg-transparent px-3 py-2" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" className="rounded-xl border border-border bg-transparent px-3 py-2" required />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-border bg-transparent px-3 py-2">
              <option value="employee">employee</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button className="mt-3 rounded-xl bg-accent/80 px-4 py-2 text-white">Send invite</button>
        </form>

        <section className="glass rounded-2xl p-4">
          <h3 className="font-medium">Users</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border border-border p-2">
                {u.full_name} — {u.email}
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-2xl p-4">
          <h3 className="font-medium">Storage usage</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {usage.map((u) => (
              <li key={u.email} className="rounded-xl border border-border p-2">
                {u.email}: {Math.round(u.used_bytes / 1024 / 1024)} MB
              </li>
            ))}
          </ul>
        </section>
      </div>
    </LayoutShell>
  );
}
