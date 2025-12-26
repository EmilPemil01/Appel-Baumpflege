'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "../../lib/supabase";


export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wenn schon eingeloggt → direkt zur Startseite
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/');
      }
    });
  }, [router]);

  async function handleLogin() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace('/');
  }

  return (
    <main style={page}>
      <h1>Login</h1>

      <label>
        E-Mail
        <input
          style={input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label>
        Passwort
        <input
          style={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <button style={btn} onClick={handleLogin} disabled={loading}>
        {loading ? 'Login…' : 'Login'}
      </button>

      {error && <p style={errorText}>{error}</p>}
    </main>
  );
}

/* =======================
   Styles (JS, kein TS)
   ======================= */

const page = {
  maxWidth: 400,
  margin: '60px auto',
  padding: 24,
  border: '1px solid #ddd',
  borderRadius: 12,
  display: 'grid',
  gap: 12,
  fontFamily: 'Arial',
};

const input = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ccc',
  marginTop: 4,
  boxSizing: 'border-box',
};

const btn = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #111',
  background: '#111',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
};

const errorText = {
  color: '#c33',
  fontWeight: 700,
};
