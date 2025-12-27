import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  const { orgName, email, role } = await req.json();

  if (!orgName || !email || !role) {
    return NextResponse.json(
      { error: "orgName, email, role erforderlich" },
      { status: 400 }
    );
  }

  if (!["admin", "viewer"].includes(role)) {
    return NextResponse.json(
      { error: "role muss admin oder viewer sein" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const appUrl = process.env.APP_URL!;

  if (!supabaseUrl || !serviceKey || !appUrl) {
    return NextResponse.json(
      { error: "Env Vars fehlen" },
      { status: 500 }
    );
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Organisation anlegen
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();

  if (orgErr) {
    return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  // Invite erzeugen
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(token);
  const expiresAt = new Date(
    Date.now() + 1000 * 60 * 60 * 24 * 7
  ).toISOString();

  const { error: invErr } = await sb.from("invites").insert({
    org_id: org.id,
    email: String(email).toLowerCase(),
    role,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  const inviteLink = `${appUrl.replace(/\/$/, "")}/invite/${token}`;

  return NextResponse.json({
    org_id: org.id,
    inviteLink,
  });
}
