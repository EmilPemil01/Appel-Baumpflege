"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Wenn bereits eingeloggt → weiterleiten
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError("E-Mail oder Passwort falsch.");
      return;
    }

    router.replace("/");
  }

  return (
    <main style={page}>
      <h1>Login</h1>

      <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
        <label>
          E-Mail
          <input
            style={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Passwort
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button style={btn} disabled={loading}>
          {loading ? "Login…" : "Login"}
        </button>
      </form>

      {/* 🔑 Forgot Password Link */}
      <p style={{ textAlign: "center", marginTop: 8 }}>
        <Link href="/forgot-password" style={forgotLink}>
          Passwort vergessen?
        </Link>
      </p>

      {error && <p style={errorText}>{error}</p>}
    </main>
  );
}

/* =======================
   Styles
   ======================= */

const page = {
  maxWidth: 400,
  margin: "60px auto",
  padding: 24,
  border: "1px solid #ddd",
  borderRadius: 12,
  display: "grid",
  gap: 12,
  fontFamily: "Arial",
};

const input = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  marginTop: 4,
  boxSizing: "border-box",
};

const btn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const forgotLink = {
  textDecoration: "underline",
  fontSize: 14,
};

const errorText = {
  color: "#c33",
  fontWeight: 700,
  textAlign: "center",
};
