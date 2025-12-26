
"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function onReset() {
    setMsg("");
    setLoading(true);

    // Beweis-Logs (damit klar ist, ob diese Seite wirklich feuert)
    console.log("[FORGOT_PASSWORD] clicked:", email);
    console.log("[FORGOT_PASSWORD] supabase url:", process.env.NEXT_PUBLIC_SUPABASE_URL);

    const redirectTo =
      "https://appel-baumpflege.vercel.app/password-reset?from=FORGOT_PAGE_TEST";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    console.log("[FORGOT_PASSWORD] redirectTo used:", redirectTo);
    console.log("[FORGOT_PASSWORD] result error:", error);

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("E-Mail wurde gesendet. Bitte Postfach prüfen. (Test: FORGOT_PAGE_TEST)");
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto" }}>
      <h1>Passwort vergessen</h1>

      <input
        type="email"
        placeholder="E-Mail-Adresse"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 12 }}
      />

      <button onClick={onReset} disabled={loading || !email}>
        {loading ? "Sende…" : "Passwort zurücksetzen"}
      </button>

      {msg && <p>{msg}</p>}
    </main>
  );
}
