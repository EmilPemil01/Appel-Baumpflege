"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Wenn der User direkt diese Seite ohne Token öffnet → ab zur Loginseite
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setMsg("Öffne diesen Link bitte über die Passwort-Reset-Mail.");
      }
    });
  }, []);

  async function onSave() {
    setMsg("");
    if (pw1.length < 6) return setMsg("Passwort muss mindestens 6 Zeichen haben.");
    if (pw1 !== pw2) return setMsg("Passwörter stimmen nicht überein.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);

    if (error) return setMsg(error.message);

    setMsg("Passwort geändert. Du wirst zur Login-Seite weitergeleitet…");
    await supabase.auth.signOut();
    setTimeout(() => router.replace("/login"), 900);
  }

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
        />
      </label>

      <label>
        Passwort wiederholen
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          style={{ width: "100%", padding: 10, marginTop: 6, marginBottom: 12 }}
        />
      </label>

      {msg ? <p style={{ color: msg.includes("geändert") ? "green" : "crimson" }}>{msg}</p> : null}

      <button
        onClick={onSave}
        disabled={loading}
        style={{ padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}
      >
        {loading ? "Speichern…" : "Passwort speichern"}
      </button>
    </main>
  );
}
