"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function InvitePage({ params }) {
  const router = useRouter();
  const token = params.token;

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);

    if (password.length < 8) return setErr("Passwort muss mindestens 8 Zeichen haben.");
    if (password !== password2) return setErr("Passwörter stimmen nicht überein.");

    setLoading(true);

    // 1) Invite annehmen (User + org_member + invite used)
    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, fullName }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Fehler beim Annehmen der Einladung.");
      setLoading(false);
      return;
    }

    // 2) Danach normal einloggen
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password,
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    router.push("/app"); // Zielseite nach Login
  }

  return (
    <div style={{ maxWidth: 460, margin: "48px auto", padding: 16 }}>
      <h1>Einladung annehmen</h1>
      <p>Lege jetzt deine Zugangsdaten fest.</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <input
          placeholder="Name (optional)"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          type="password"
          placeholder="Passwort (min. 8 Zeichen)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          type="password"
          placeholder="Passwort wiederholen"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          style={{ padding: 10 }}
        />

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button type="submit" disabled={loading} style={{ padding: 12 }}>
          {loading ? "..." : "Account erstellen"}
        </button>
      </form>
    </div>
  );
}
