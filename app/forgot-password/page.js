"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function onReset() {
    setMsg("");
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://appel-baumpflege.vercel.app/password-reset",
    });

    setLoading(false);

    if (error) return setMsg(error.message);
    setMsg("E-Mail wurde gesendet. Bitte Postfach prüfen.");
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 20, fontFamily: "Arial" }}>
      <h1>Passwort vergessen</h1>

      <input
        type="email"
        placeholder="E-Mail-Adresse"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 12 }}
      />

      <button onClick={onReset} disabled={loading || !email}>
        {loading ? "Sende…" : "Reset-Mail senden"}
      </button>

      {msg && <p>{msg}</p>}
    </main>
  );
}
