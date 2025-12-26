"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function PasswordResetPage() {
  const router = useRouter();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      setMsg("");

      // 🔹 Unterstützt neue Supabase-Links mit ?code=...
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!active) return;

        if (error) {
          setMsg("Reset-Link ist ungültig oder abgelaufen. Bitte erneut anfordern.");
          setLoading(false);
          return;
        }

        // URL aufräumen (code entfernen)
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.toString());
      }

      // 🔹 Prüfen, ob wir jetzt eine gültige Session haben
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        setMsg("Bitte öffne diese Seite über den Passwort-Reset-Link aus der E-Mail.");
        setLoading(false);
        return;
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  async function onSave() {
    setMsg("");

    if (pw1.length < 6) return setMsg("Passwort muss mindestens 6 Zeichen haben.");
    if (pw1 !== pw2) return setMsg("Passwörter stimmen nicht überein.");

    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) return setMsg(error.message);

    setMsg("Passwort erfolgreich geändert. Weiterleitung zum Login …");

    await supabase.auth.signOut();
    setTimeout(() => router.replace("/login"), 800);
  }

  if (loading) return <p style={{ padding: 40 }}>Lade…</p>;

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 20, fontFamily: "Arial" }}>
      <h1>Passwort zurücksetzen</h1>

      <label>
        Neues Passwort
        <input
          type="password"
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          style={{ width: "100%", padding: 10, marginTop: 6, marginBottom: 12 }}
          autoComplete="new-password"
        />
      </label>

      <label>
        Passwort wiederholen
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          style={{ width: "100%", padding: 10, marginTop: 6, marginBottom: 12 }}
          autoComplete="new-password"
        />
      </label>

      {msg && (
        <p style={{ color: msg.includes("erfolgreich") ? "green" : "crimson" }}>
          {msg}
        </p>
      )}

      <button
        onClick={onSave}
        style={{ padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}
        disabled={loading}
      >
        Passwort speichern
      </button>
    </main>
  );
}
