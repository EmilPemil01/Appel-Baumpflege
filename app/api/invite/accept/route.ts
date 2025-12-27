import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  const { token, password, fullName } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: "token und password erforderlich" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Passwort muss mindestens 8 Zeichen haben" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Env Vars fehlen" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const tokenHash = sha256(String(token));

  // 1) Invite laden (und prüfen)
  const { data: invite, error: invErr } = await admin
    .from("invites")
    .select("id, org_id, email, role, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .single();

  if (invErr || !invite) return NextResponse.json({ error: "Invite ungültig" }, { status: 400 });
  if (invite.used_at) return NextResponse.json({ error: "Invite wurde schon benutzt" }, { status: 400 });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite ist abgelaufen" }, { status: 400 });
  }

  const email = String(invite.email).toLowerCase();

  // 2) User erstellen ODER vorhandenen User updaten
  // createUser schlägt fehl, wenn User existiert -> dann finden wir ihn und setzen Passwort
  let userId: string | null = null;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { fullName } : undefined,
  });

  userId = created?.user?.id ?? null;

  if (!userId) {
    // Fallback: User suchen + Passwort setzen
    const { data: users, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) return NextResponse.json({ error: "User lookup fehlgeschlagen" }, { status: 500 });

    const u = users.users.find((x) => x.email?.toLowerCase() === email);
    if (!u) return NextResponse.json({ error: createErr?.message ?? "User existiert, aber nicht gefunden" }, { status: 400 });

    userId = u.id;

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: fullName ? { fullName } : undefined,
    });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 3) Mitgliedschaft setzen (idempotent)
  const { error: memErr } = await admin.from("organization_members").upsert({
    org_id: invite.org_id,
    user_id: userId,
    role: invite.role, // admin oder viewer kommt aus Invite
  });

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  // 4) Invite als benutzt markieren
  const { error: usedErr } = await admin
    .from("invites")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("id", invite.id);

  if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 500 });

  // 5) Rückgabe fürs Frontend (damit es signInWithPassword machen kann)
  return NextResponse.json({ ok: true, email });
}
