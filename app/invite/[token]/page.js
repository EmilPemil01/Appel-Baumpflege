"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();

  // token kommt aus /invite/<token>
  const token = useMemo(() => {
    const t = params?.token;
    return Array.isArray(t) ? t[0] : t;
  }, [params]);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setErr(null);

    // ENV-Check (sonst läuft Login nie)
    if (!supabase) {
      setErr("Supabase ENV fehlt (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
      return;
    }

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
      // 1) Einladung annehmen (Server erstellt User + Org-Membership + markiert invite used)
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          fullName: fullName?.trim() || null,
        }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // falls der Server mal kein JSON liefert
      }

      if (!res.ok) {
        setErr(data?.error || `Fehler beim Annehmen der Einladung (${res.status}).`);
        return;
      }

      const returnedEmail = data?.email;
      if (!returnedEmail) {
        setErr("Server hat keine E-Mail zurückgegeben. Invite-Flow unvollständig.");
        return;
      }

      setEmail(returnedEmail);

      // 2) Login (direkt einloggen)
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: returnedEmail,
        password,
      });

      if (signInErr) {
        setErr(`Login fehlgeschlagen: ${signInErr.message}`);
        return;
      }

      // 3) Redirect (WICHTIG: nicht /app)
      router.replace("/"); // dein Einsatzplan liegt auf "/"
    } catch (e) {
      setErr("Unerwarteter Fehler. Bitte erneut versuchen.");
    } finally {
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
          style={{
            padding: 12,
            marginTop: 6,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
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
