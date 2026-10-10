"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { IconLock } from "./icons";
import Topbar from "./Topbar";

export default function Unlock({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth", { method: "POST", json: { action: "unlock", password } });
      // Full load so the server renders with the new session.
      window.location.assign(next);
      return;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setPassword("");
      } else setError("Can’t reach the server. Check your connection.");
    }
    setBusy(false);
  };

  return (
    <div className="app">
      <Topbar standalone title="Locked" />

      <main className="page">
        <section className="welcome">
          <span className="label">media</span>
          <h1 className="welcome-title">This library is locked.</h1>
          <p className="welcome-lede">Enter the password to open the library on this device.</p>

          <form className="settings-form unlock-form" onSubmit={submit}>
            <label className="field">
              <span className="label">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || !password}>
              <IconLock /> {busy ? "Unlocking…" : "Unlock"}
            </button>
          </form>

          {error && (
            <p className="welcome-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
