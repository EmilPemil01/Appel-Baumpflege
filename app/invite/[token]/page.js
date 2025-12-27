"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();

  // token kommt zuverlässig aus der URL /invite/<token>
  const token = useMemo(() => {
    // params.token kann string oder string[] sein
    const t = params?.token;
    return Array.isArray(t) ? t[0] : t;
  }, [params]);

  const [email, setEmail] = useState(""); // optional: kannst du später aus API holen
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);

    if (!token) {
      setErr("Token fehlt in der URL. Bitte Invite-Link erneut öffnen.");
      return;
    }
    if (!password || password.length < 8) {
      setErr("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (password !== password2) {
      setErr("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);

    try {
      // 1) Invite accept (legt User an, org_member an, invite used)
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, fullName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErr(data?.error || "Fehler beim Annehmen der Einladung.");
        setLoading(false);
        return;
      }

      // API gibt email zurück → damit normal einloggen
      const returnedEmail = data.email;
      if (!returnedEmail) {
        setErr("Kein E-Mail-Wert vom Server erhalten.");
        setLoading(false);
        return;
      }

      // optional: in UI anzeigen
      setEmail(returnedEmail);

      // 2) Login
      const { error } = await supabase.auth.signInWithPassword({
        email: returnedEmail,
        password,
      });

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      // 3) Weiterleitung
      router.push("/app");
    } catch (e) {
      setErr("Unerwarteter Fehler. Bitte erneut versuchen.");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "56px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Einladung annehmen</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>Lege jetzt deine Zugangsdaten fest.</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail (wird automatisch gesetzt)"
          style={{ padding: 10 }}
          disabled
        />

        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Name (optional)"
          style={{ padding: 10 }}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort (min. 8 Zeichen)"
          style={{ padding: 10 }}
        />

        <input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="Passwort wiederholen"
          style={{ padding: 10 }}
        />

        {err && (
          <div style={{ color: "crimson", fontSize: 14, marginTop: 4 }}>
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, marginTop: 6, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "..." : "Account erstellen"}
        </button>

        {!token && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Hinweis: Token wurde nicht erkannt. Prüfe, ob du wirklich über einen Invite-Link hier gelandet bist.
          </div>
        )}
      </form>
    </div>
  );
}
