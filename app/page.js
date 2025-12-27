"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

/* =======================
   SOLL
   ======================= */
const WEEK_TARGET_HOURS = 40;

/* =======================
   ZEIT (Start 05:00)
   ======================= */
const MIN_TIME_MINUTES = 5 * 60; // 05:00
const MAX_TIME_MINUTES = 23 * 60; // 23:00
const DAY_SPAN_MINUTES = MAX_TIME_MINUTES - MIN_TIME_MINUTES;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function minutesToHHMM(mins) {
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function generateTimes15() {
  const out = [];
  for (let m = MIN_TIME_MINUTES; m <= MAX_TIME_MINUTES; m += 15) out.push(minutesToHHMM(m));
  return out;
}

// akzeptiert: 7 | 705 | 7:05 | 07.05 | 07,05 | 1315
function parseTimeToMinutes(input) {
  if (!input) return null;
  let t = String(input).trim().replace(",", ":").replace(".", ":");

  if (/^\d{1,4}$/.test(t) && !t.includes(":")) {
    if (t.length <= 2) t = `${t.padStart(2, "0")}:00`;
    else {
      const d = t.padStart(4, "0");
      t = `${d.slice(0, 2)}:${d.slice(2)}`;
    }
  }

  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  const mins = hh * 60 + mm;
  if (mins < MIN_TIME_MINUTES || mins > MAX_TIME_MINUTES) return null;

  return mins;
}

function normalizeTime(v) {
  const m = parseTimeToMinutes(v);
  return m === null ? null : minutesToHHMM(m);
}

function calcDuration(von, bis) {
  const s = parseTimeToMinutes(von);
  const e = parseTimeToMinutes(bis);
  if (s === null || e === null || e <= s) return null;
  return Math.round(((e - s) / 60) * 100) / 100;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =======================
   MAPS
   ======================= */
function openInGoogleMaps(address) {
  const addr = String(address || "").trim();
  if (!addr) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =======================
   DATUM / WOCHE
   ======================= */
function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 So, 1 Mo ...
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDE(date) {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  yearStart.setHours(12, 0, 0, 0);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function getISOWeekYear(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  return d.getFullYear();
}

/* =======================
   VERTIKALE POSITION
   ======================= */
function yPct(mins, viewHeight, topPadPx, bottomPadPx) {
  const inner = Math.max(1, viewHeight - topPadPx - bottomPadPx);
  const rel = (mins - MIN_TIME_MINUTES) / DAY_SPAN_MINUTES; // 0..1
  const yPx = topPadPx + rel * inner;
  return clamp((yPx / viewHeight) * 100, 0, 100);
}

/* =======================
   Overlap Tracks
   ======================= */
function layoutTracks(items) {
  const ends = [];
  const placed = [];

  for (const e of items) {
    const s = parseTimeToMinutes(e.von);
    const en = parseTimeToMinutes(e.bis);
    if (s === null || en === null) continue;

    let track = 0;
    while (ends[track] !== undefined && s < ends[track]) track++;
    ends[track] = en;

    placed.push({ e, s, en, track });
  }

  return { placed, trackCount: Math.max(1, ends.length) };
}

function fmtHours(h) {
  if (!Number.isFinite(h)) return "0,00";
  return h.toFixed(2).replace(".", ",");
}

function parsePeopleCount(v) {
  const n = Number(String(v).trim());
  if (!Number.isFinite(n)) return 1;
  return clamp(Math.round(n), 1, 99);
}

function ensureLen(arr, len) {
  const a = Array.isArray(arr) ? [...arr] : [];
  while (a.length < len) a.push("");
  if (a.length > len) a.length = len;
  return a;
}

/* =======================
   Block-Dynamik
   ======================= */
function scaleForDuration(durationMin) {
  const t = clamp((durationMin - 20) / (240 - 20), 0, 1);
  return lerp(0.66, 1.12, t);
}
function infoLevel(durationMin) {
  if (!Number.isFinite(durationMin)) return 0;
  if (durationMin < 50) return 0;
  if (durationMin < 120) return 1;
  if (durationMin < 200) return 2;
  return 3;
}

/* =======================
   SUPABASE HELPERS
   ======================= */
function normalizePeopleList(pl) {
  if (!pl) return [];
  if (Array.isArray(pl)) return pl.map((x) => String(x ?? "").trim()).filter(Boolean);
  try {
    const parsed = typeof pl === "string" ? JSON.parse(pl) : pl;
    return Array.isArray(parsed) ? parsed.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rowToEinsatz(r) {
  return {
    id: r.id,
    orgId: r.org_id ?? null,
    kunde: r.kunde ?? "",
    ort: r.ort ?? "",
    notiz: r.notiz ?? "",
    datum: r.datum ?? "",
    von: r.von ?? "",
    bis: r.bis ?? "",
    dauer: Number(r.dauer) || 0,
    peopleCount: Number(r.people_count) || 1,
    peopleList: normalizePeopleList(r.people_list),
    status: r.status ?? "geplant",
    createdAt: r.created_at ?? null,
  };
}

function einsatzToPayload(e, userId, orgId) {
  return {
    id: e.id,
    user_id: userId,
    org_id: orgId, // ✅ WICHTIG für Multi-Tenant
    kunde: e.kunde,
    ort: e.ort,
    notiz: e.notiz,
    datum: e.datum,
    von: e.von,
    bis: e.bis,
    dauer: e.dauer,
    people_count: e.peopleCount,
    people_list: e.peopleList,
    status: e.status,
    updated_at: new Date().toISOString(),
  };
}

/* =======================
   APP
   ======================= */
export default function Home() {
  const router = useRouter();

  // 🔐 AUTH
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [userId, setUserId] = useState(null);

  // 🧩 ORG / ROLLE
  const [orgId, setOrgId] = useState(null);
  const [userRole, setUserRole] = useState(null); // "admin" | "viewer"
  const isAdmin = userRole === "admin";

  // DB-Loading
  const [dataLoading, setDataLoading] = useState(false);

  // UI/State
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [kunde, setKunde] = useState("");
  const [ort, setOrt] = useState("");
  const [notiz, setNotiz] = useState("");
  const [datum, setDatum] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");

  const [peopleCount, setPeopleCount] = useState(1);
  const [peopleList, setPeopleList] = useState([""]);

  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [einsaetze, setEinsaetze] = useState([]);

  // Search/Filter (Anzeige)
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");

  // Week nav
  const [weekStartISO, setWeekStartISO] = useState(() => toISODate(startOfWeekMonday(new Date())));
  const [jumpDate, setJumpDate] = useState("");

  // today updates
  const [todayISO, setTodayISO] = useState(() => toISODate(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTodayISO(toISODate(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  const times15 = useMemo(generateTimes15, []);

  // 🔐 Auth Guard + live updates
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      const session = data.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      setUserEmail(session.user?.email ?? null);
      setUserId(session.user?.id ?? null);
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session) {
        setUserEmail(null);
        setUserId(null);
        setOrgId(null);
        setUserRole(null);
        setAuthLoading(true);
        router.replace("/login");
      } else {
        setUserEmail(session.user?.email ?? null);
        setUserId(session.user?.id ?? null);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // 🧩 Org + Rolle laden (über Helper View)
  useEffect(() => {
    if (!userId) return;

    (async () => {
      setError("");

      const { data, error: err } = await supabase
        .from("my_org")
        .select("org_id, role")
        .single();

      if (err) {
        setOrgId(null);
        setUserRole(null);
        setError(`Org/Rolle laden fehlgeschlagen: ${err.message}`);
        return;
      }

      setOrgId(data.org_id);
      setUserRole(data.role);
    })();
  }, [userId]);

  // 📥 Einsätze laden (nur meine Org)
  useEffect(() => {
    if (!userId || !orgId) return;

    (async () => {
      setDataLoading(true);
      setError("");

      const { data, error: err } = await supabase
        .from("einsaetze")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (err) {
        setError(`DB-Fehler beim Laden: ${err.message}`);
        setDataLoading(false);
        return;
      }

      setEinsaetze((data ?? []).map(rowToEinsatz));
      setDataLoading(false);
    })();
  }, [userId, orgId]);

  // ESC schließt Modal
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && isModalOpen) closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const weekDays = useMemo(() => {
    const monday = new Date(weekStartISO + "T12:00:00");
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekStartISO]);

  const kwLabel = useMemo(() => {
    const monday = weekDays[0];
    return `KW ${String(getISOWeek(monday)).padStart(2, "0")} (${getISOWeekYear(monday)})`;
  }, [weekDays]);

  const rangeLabel = useMemo(() => `${formatDE(weekDays[0])}–${formatDE(weekDays[6])}`, [weekDays]);

  // Anzeige-Filter
  const filteredEinsaetze = useMemo(() => {
    const query = q.trim().toLowerCase();
    return einsaetze.filter((e) => {
      if (statusFilter !== "alle" && e.status !== statusFilter) return false;
      if (!query) return true;
      const names = Array.isArray(e.peopleList) ? e.peopleList.join(" ") : "";
      const hay = `${e.kunde || ""} ${e.ort || ""} ${e.notiz || ""} ${names}`.toLowerCase();
      return hay.includes(query);
    });
  }, [einsaetze, q, statusFilter]);

  // Einsätze pro Tag (Anzeige)
  const weekByDay = useMemo(() => {
    const map = new Map();
    for (const d of weekDays) map.set(toISODate(d), []);
    for (const e of filteredEinsaetze) {
      if (map.has(e.datum)) map.get(e.datum).push(e);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (parseTimeToMinutes(a.von) ?? 99999) - (parseTimeToMinutes(b.von) ?? 99999));
      map.set(k, arr);
    }
    return map;
  }, [filteredEinsaetze, weekDays]);

  // Wochen-Summen (nur oben)
  const weekTotals = useMemo(() => {
    const daySet = new Set(weekDays.map((d) => toISODate(d)));

    let plannedWeek = 0;
    let doneWeek = 0;

    for (const e of einsaetze) {
      if (!daySet.has(e.datum)) continue;
      const d = Number(e.dauer) || 0;
      if (e.status === "erledigt") doneWeek += d;
      else plannedWeek += d;
    }

    const diff = plannedWeek - WEEK_TARGET_HOURS;
    return { plannedWeek, doneWeek, diff };
  }, [einsaetze, weekDays]);

  function goPrevWeek() {
    const d = new Date(weekStartISO + "T12:00:00");
    setWeekStartISO(toISODate(addDays(d, -7)));
  }
  function goNextWeek() {
    const d = new Date(weekStartISO + "T12:00:00");
    setWeekStartISO(toISODate(addDays(d, 7)));
  }
  function goThisWeek() {
    setWeekStartISO(toISODate(startOfWeekMonday(new Date())));
  }
  function goToJumpDate() {
    if (!jumpDate) return;
    setWeekStartISO(toISODate(startOfWeekMonday(new Date(jumpDate + "T12:00:00"))));
  }

  function resetForm() {
    setKunde("");
    setOrt("");
    setNotiz("");
    setDatum("");
    setVon("");
    setBis("");

    setPeopleCount(1);
    setPeopleList([""]);

    setError("");
    setEditingId(null);
  }

  function openNewEinsatz(preset = {}) {
    if (!isAdmin) {
      setError("Keine Berechtigung: Nur Admins dürfen Einsätze anlegen.");
      return;
    }
    resetForm();
    if (preset.datum) setDatum(preset.datum);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    resetForm();
  }

  function onPeopleCountChange(raw) {
    const pc = parsePeopleCount(raw);
    setPeopleCount(pc);
    setPeopleList((prev) => ensureLen(prev, pc));
  }

  function setPersonName(idx, value) {
    setPeopleList((prev) => {
      const next = ensureLen(prev, Math.max(peopleCount, prev?.length ?? 0));
      next[idx] = value;
      return next;
    });
  }

  async function saveEinsatz() {
    setError("");

    if (!isAdmin) return setError("Keine Berechtigung: Nur Admins dürfen speichern.");
    if (!userId) return setError("Kein User gefunden. Bitte neu einloggen.");
    if (!orgId) return setError("Keine Organisation gefunden. Bitte neu einloggen.");
    if (!kunde.trim()) return setError("Bitte Kunde/Job eingeben.");
    if (!datum) return setError("Bitte Datum wählen.");

    const vn = normalizeTime(von);
    const bs = normalizeTime(bis);
    if (!vn || !bs) return setError("Zeit ungültig/außerhalb 05:00–23:00.");

    const dauer = calcDuration(vn, bs);
    if (dauer === null) return setError("Bis muss nach Von liegen.");

    const pc = parsePeopleCount(peopleCount);
    const pl = ensureLen(peopleList, pc).map((x) => String(x || "").trim()).filter((x) => x.length);

    // Update
    if (editingId !== null) {
      const existing = einsaetze.find((x) => x.id === editingId);

      const updated = {
        id: editingId,
        kunde: kunde.trim(),
        ort: ort.trim(),
        notiz: notiz.trim(),
        datum,
        von: vn,
        bis: bs,
        dauer,
        peopleCount: pc,
        peopleList: pl,
        status: existing?.status ?? "geplant",
        createdAt: existing?.createdAt ?? null,
      };

      const payload = einsatzToPayload(updated, userId, orgId);

      const { error: err } = await supabase.from("einsaetze").update(payload).eq("id", editingId);
      if (err) return setError(`DB-Fehler beim Update: ${err.message}`);

      setEinsaetze((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
      setWeekStartISO(toISODate(startOfWeekMonday(new Date(datum + "T12:00:00"))));
      setIsModalOpen(false);
      resetForm();
      return;
    }

    // Insert
    const neu = {
      id: makeId(),
      kunde: kunde.trim(),
      ort: ort.trim(),
      notiz: notiz.trim(),
      datum,
      von: vn,
      bis: bs,
      dauer,
      peopleCount: pc,
      peopleList: pl,
      status: "geplant",
      createdAt: new Date().toISOString(),
    };

    const payload = einsatzToPayload(neu, userId, orgId);

    const { error: err } = await supabase.from("einsaetze").insert(payload);
    if (err) return setError(`DB-Fehler beim Speichern: ${err.message}`);

    setEinsaetze((p) => [neu, ...p]);
    setWeekStartISO(toISODate(startOfWeekMonday(new Date(datum + "T12:00:00"))));
    setIsModalOpen(false);
    resetForm();
  }

  function startEdit(e) {
    if (!isAdmin) {
      setError("Keine Berechtigung: Viewer darf nicht bearbeiten.");
      return;
    }

    setEditingId(e.id);
    setKunde(e.kunde || "");
    setOrt(e.ort || "");
    setNotiz(e.notiz || "");
    setDatum(e.datum || "");
    setVon(e.von || "");
    setBis(e.bis || "");

    const pc = Number(e.peopleCount) || (Array.isArray(e.peopleList) ? e.peopleList.length : 1) || 1;
    setPeopleCount(clamp(pc, 1, 99));
    setPeopleList(ensureLen(Array.isArray(e.peopleList) ? e.peopleList : [""], clamp(pc, 1, 99)));

    setError("");
    if (e.datum) setWeekStartISO(toISODate(startOfWeekMonday(new Date(e.datum + "T12:00:00"))));
    setIsModalOpen(true);
  }

  async function toggleErledigt(id) {
    if (!isAdmin) return setError("Keine Berechtigung: Viewer darf nicht ändern.");

    const current = einsaetze.find((e) => e.id === id);
    if (!current) return;

    const nextStatus = current.status === "erledigt" ? "geplant" : "erledigt";

    // optimistisch
    setEinsaetze((prev) => prev.map((e) => (e.id === id ? { ...e, status: nextStatus } : e)));

    const { error: err } = await supabase
      .from("einsaetze")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (err) {
      // rollback
      setEinsaetze((prev) => prev.map((e) => (e.id === id ? { ...e, status: current.status } : e)));
      setError(`DB-Fehler beim Status-Update: ${err.message}`);
    }
  }

  async function loeschen(id) {
    if (!isAdmin) return setError("Keine Berechtigung: Viewer darf nicht löschen.");

    if (editingId === id) resetForm();

    // optimistisch
    const before = einsaetze;
    setEinsaetze((prev) => prev.filter((e) => e.id !== id));

    const { error: err } = await supabase.from("einsaetze").delete().eq("id", id);
    if (err) {
      setEinsaetze(before);
      setError(`DB-Fehler beim Löschen: ${err.message}`);
    }
  }

  // Ansicht
  const viewHeight = 720;
  const topPadPx = 14;
  const bottomPadPx = 14;

  // Ticks
  const ticks = useMemo(() => {
    const out = [];
    for (let m = MIN_TIME_MINUTES; m <= MAX_TIME_MINUTES; m += 60) {
      out.push({
        m,
        label: minutesToHHMM(m),
        top: yPct(m, viewHeight, topPadPx, bottomPadPx),
        strong: m % 120 === 0,
      });
    }
    return out;
  }, [viewHeight, topPadPx, bottomPadPx]);

  const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const columns = useMemo(() => {
    return weekDays.map((day, i) => {
      const iso = toISODate(day);
      const items = weekByDay.get(iso) ?? [];
      const { placed, trackCount } = layoutTracks(items);
      return { i, day, iso, placed, trackCount };
    });
  }, [weekDays, weekByDay]);

  const diffColor = weekTotals.diff > 0.01 ? "#c33" : weekTotals.diff < -0.01 ? "#b26a00" : "#2e7d32";

  const plannedBg = "#5a5a5a";
  const plannedBorder = "#3f3f3f";
  const plannedText = "white";

  function onDayEmptyClick(iso) {
    openNewEinsatz({ datum: iso });
  }

  // ✅ Erst rendern, wenn Auth ok
  if (authLoading) {
    return <p style={{ padding: 40 }}>Lade…</p>;
  }

  // Optional: wenn Org/Rolle noch lädt
  if (!orgId || !userRole) {
    return (
      <main style={page}>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Einsatzplan</div>
          <div style={{ opacity: 0.75 }}>Lade Organisation / Rolle…</div>
          {error ? <div style={errorBox}>{error}</div> : null}
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={headerRow}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>Einsatzplan</h1>

          <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}>
            Rolle: <b>{userRole}</b>
          </span>

          {userEmail ? (
            <span
              style={{
                fontSize: 12,
                opacity: 0.7,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={userEmail}
            >
              {userEmail}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button style={btn} onClick={handleLogout} title="Abmelden">
            Logout
          </button>

          {isAdmin ? (
            <button style={addBtn} onClick={() => openNewEinsatz()} title="Einsatz hinzufügen">
              <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>+</span>
              <span>Einsatz hinzufügen</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* SEARCH + FILTER */}
      <section style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <label>
            Suche (Job/Ort/Notiz/Personen)
            <br />
            <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Müller / Hecke / Max" />
          </label>

          <label>
            Status
            <br />
            <select style={{ ...input, appearance: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="alle">Alle</option>
              <option value="geplant">Geplant</option>
              <option value="erledigt">Erledigt</option>
            </select>
          </label>
        </div>
      </section>

      {/* WEEK NAV + SUMME */}
      <section style={card}>
        <div style={navRow}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn} onClick={goPrevWeek}>
              ← Woche
            </button>
            <button style={btn} onClick={goThisWeek}>
              Heute
            </button>
            <button style={btn} onClick={goNextWeek}>
              Woche →
            </button>
          </div>

          <div style={{ fontWeight: 900 }}>
            {kwLabel} • {rangeLabel}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={chip}>
            Soll: <b>{fmtHours(WEEK_TARGET_HOURS)} h</b>
          </span>
          <span style={chip}>
            Geplant: <b>{fmtHours(weekTotals.plannedWeek)} h</b>
          </span>
          <span style={chip}>
            Erledigt: <b>{fmtHours(weekTotals.doneWeek)} h</b>
          </span>
          <span style={{ ...chip, borderColor: diffColor }}>
            Diff:{" "}
            <b style={{ color: diffColor }}>
              {weekTotals.diff >= 0 ? "+" : ""}
              {fmtHours(weekTotals.diff)} h
            </b>
          </span>
          {dataLoading ? <span style={{ ...chip, opacity: 0.7 }}>Lade DB…</span> : null}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <b>Springe zu Datum:</b>
          <input style={{ ...input, width: 170, marginTop: 0 }} type="date" value={jumpDate} onChange={(e) => setJumpDate(e.target.value)} />
          <button style={btn} onClick={goToJumpDate}>
            Springen
          </button>
        </div>

        {error ? <div style={errorBox}>{error}</div> : null}
      </section>

      {/* PLAN */}
      <section style={card}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Einsatzplan</div>

        <div style={weekWrap}>
          {/* Zeitachse */}
          <div style={timeCol}>
            <div style={timeColHeader}>Zeit</div>

            <div
              style={{
                ...timeColBody,
                height: viewHeight,
                paddingTop: topPadPx,
                paddingBottom: bottomPadPx,
              }}
            >
              {ticks.map((t) => (
                <div key={`time-${t.m}`} style={{ position: "absolute", top: `${t.top}%`, left: 0, right: 0 }}>
                  <div style={{ ...timeTickLine, background: t.strong ? "#dcdcdc" : "#efefef" }} />
                  <div style={timeTickLabel}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tage */}
          <div style={daysNoScroll}>
            <div style={daysGridFit}>
              {columns.map(({ i, day, iso, placed, trackCount }) => {
                const isToday = iso === todayISO;
                const colGap = 6;
                const innerPad = 6;

                return (
                  <div key={iso} style={{ minWidth: 0 }}>
                    <div style={{ ...dayHeader, borderColor: isToday ? "#111" : "#ddd" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{dayNames[i]}</div>
                        <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {formatDE(day)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        ...dayBody,
                        height: viewHeight,
                        borderColor: isToday ? "#111" : "#ddd",
                        paddingTop: topPadPx,
                        paddingBottom: bottomPadPx,
                      }}
                      onClick={() => onDayEmptyClick(iso)}
                      title={isAdmin ? "Klick in freie Fläche: neuen Einsatz anlegen" : "Viewer: keine Änderungen möglich"}
                    >
                      {/* Linien */}
                      {ticks.map((t) => (
                        <div
                          key={`${iso}-tick-${t.m}`}
                          style={{
                            position: "absolute",
                            top: `${t.top}%`,
                            left: 0,
                            right: 0,
                            height: 1,
                            background: t.strong ? "#e6e6e6" : "#f3f3f3",
                            pointerEvents: "none",
                          }}
                        />
                      ))}

                      {/* Einsätze */}
                      {placed.map(({ e, s, en, track }) => {
                        const top = yPct(s, viewHeight, topPadPx, bottomPadPx);
                        const bottom = yPct(en, viewHeight, topPadPx, bottomPadPx);
                        const heightPct = Math.max(0.6, bottom - top);

                        const isDone = e.status === "erledigt";
                        const durationMin = en - s;

                        const scale = scaleForDuration(durationMin);
                        const level = infoLevel(durationMin);

                        const padY = clamp(Math.round(4 * scale), 2, 8);
                        const padX = clamp(Math.round(7 * scale), 4, 12);
                        const gap = clamp(Math.round(4 * scale), 2, 8);

                        const titleFont = clamp(Math.round(12 * scale), 10, 16);
                        const subFont = clamp(Math.round(11 * scale), 9, 14);

                        const btnSize = clamp(Math.round(18 * scale), 14, 26);
                        const btnFont = clamp(Math.round(11 * scale), 9, 15);

                        const pc = Number(e.peopleCount) || (Array.isArray(e.peopleList) ? e.peopleList.length : 1) || 1;
                        const pl = Array.isArray(e.peopleList) ? e.peopleList.filter(Boolean) : [];

                        const trackLeft = trackCount === 1 ? 0 : (track / trackCount) * 100;
                        const trackWidth = trackCount === 1 ? 100 : (1 / trackCount) * 100;

                        return (
                          <div
                            key={e.id}
                            title={isAdmin ? "Klick: Details/Bearbeiten" : "Viewer: nur ansehen"}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (isAdmin) startEdit(e);
                            }}
                            style={{
                              position: "absolute",
                              top: `${top}%`,
                              height: `${heightPct}%`,
                              left: innerPad,
                              width: `calc(100% - ${innerPad * 2}px)`,
                              boxSizing: "border-box",
                              cursor: isAdmin ? "pointer" : "default",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: `calc(${trackLeft}% + ${track > 0 ? colGap / 2 : 0}px)`,
                                width: `calc(${trackWidth}% - ${colGap}px)`,
                                top: 0,
                                bottom: 0,
                                borderRadius: 12,
                                border: isDone ? "1px solid #2e7d32" : `1px solid ${plannedBorder}`,
                                background: isDone ? "#e9f7ef" : plannedBg,
                                opacity: isDone ? 0.82 : 0.92,
                                color: isDone ? "#1b5e20" : plannedText,
                                padding: `${padY}px ${padX}px`,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-start",
                                gap,
                                overflow: "hidden",
                                boxSizing: "border-box",
                              }}
                            >
                              {/* Header: Job + Buttons (Buttons nur Admin) */}
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                <div
                                  style={{
                                    fontWeight: 900,
                                    fontSize: titleFont,
                                    lineHeight: 1.05,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    minWidth: 0,
                                    paddingTop: 1,
                                  }}
                                >
                                  {e.kunde}
                                </div>

                                {isAdmin ? (
                                  <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: -1 }}>
                                    <button
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        toggleErledigt(e.id);
                                      }}
                                      style={{
                                        ...tinyActionBtnCompact,
                                        width: btnSize,
                                        height: btnSize,
                                        lineHeight: `${btnSize - 2}px`,
                                        fontSize: btnFont,
                                        borderColor: isDone ? "#2e7d32" : "#111",
                                      }}
                                      title={isDone ? "Zurück (geplant)" : "Erledigt"}
                                    >
                                      {isDone ? "↩" : "✓"}
                                    </button>

                                    <button
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        loeschen(e.id);
                                      }}
                                      style={{
                                        ...tinyActionBtnCompact,
                                        width: btnSize,
                                        height: btnSize,
                                        lineHeight: `${btnSize - 2}px`,
                                        fontSize: btnFont,
                                        borderColor: "#c33",
                                      }}
                                      title="Löschen"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ) : null}
                              </div>

                              {level >= 1 ? (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                  <span style={{ ...miniPill(isDone, plannedText), fontSize: subFont }}>
                                    {e.von}–{e.bis}
                                  </span>
                                </div>
                              ) : null}

                              {level >= 2 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap }}>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ ...miniPill(isDone, plannedText), fontSize: subFont }}>👥 {pc}</span>
                                  </div>

                                  {pl.length ? (
                                    <div style={{ fontSize: subFont, opacity: 0.92, overflow: "hidden", textOverflow: "ellipsis" }}>
                                      <b>Personen:</b> {pl.join(", ")}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              {level >= 3 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap }}>
                                  {e.ort ? (
                                    <div style={{ fontSize: subFont, opacity: 0.92, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      📍 {e.ort}
                                    </div>
                                  ) : null}
                                  {e.notiz ? (
                                    <div style={{ fontSize: subFont, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {e.notiz}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* MODAL (nur Admin erreichbar) */}
      {isModalOpen ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div style={modalCard} role="dialog" aria-modal="true">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{editingId !== null ? "Einsatz bearbeiten" : "Neuen Einsatz anlegen"}</div>
              <button style={btn} onClick={closeModal} title="Schließen" aria-label="Schließen">
                ×
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={grid2}>
                <label>
                  Kunde / Job*<br />
                  <input style={input} value={kunde} onChange={(e) => setKunde(e.target.value)} placeholder="z.B. Klaus / Hecke schneiden" />
                </label>

                <label>
                  Datum*<br />
                  <input style={input} type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
                </label>
              </div>

              <div style={{ ...grid2, marginTop: 10 }}>
                <label>
                  Von*<br />
                  <div style={timeRow}>
                    <input
                      style={input}
                      placeholder="z.B. 05:00 / 500 / 7"
                      value={von}
                      onChange={(e) => setVon(e.target.value)}
                      onBlur={() => {
                        const n = normalizeTime(von);
                        if (n) setVon(n);
                      }}
                    />
                    <select style={select} value="" onChange={(e) => setVon(e.target.value)} aria-label="Uhrzeit auswählen">
                      <option value="" disabled>
                        Uhrzeit auswählen
                      </option>
                      {times15.map((t) => (
                        <option key={`von-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label>
                  Bis*<br />
                  <div style={timeRow}>
                    <input
                      style={input}
                      placeholder="z.B. 23:00 / 1730"
                      value={bis}
                      onChange={(e) => setBis(e.target.value)}
                      onBlur={() => {
                        const n = normalizeTime(bis);
                        if (n) setBis(n);
                      }}
                    />
                    <select style={select} value="" onChange={(e) => setBis(e.target.value)} aria-label="Uhrzeit auswählen">
                      <option value="" disabled>
                        Uhrzeit auswählen
                      </option>
                      {times15.map((t) => (
                        <option key={`bis-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>

              <div style={{ ...grid2, marginTop: 10 }}>
                <label>
                  Ort<br />
                  <input style={input} value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="z.B. Rheinstraße 104, 76275 Ettlingen" />
                </label>

                <label>
                  Notiz<br />
                  <input style={input} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="kurz, was wichtig ist" />
                </label>
              </div>

              <div style={{ ...grid2, marginTop: 10 }}>
                <label>
                  Leute (Anzahl)<br />
                  <input style={input} type="number" min={1} max={99} value={peopleCount} onChange={(e) => onPeopleCountChange(e.target.value)} />
                </label>
                <div />
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Beteiligte</div>
                <div style={peopleGrid}>
                  {ensureLen(peopleList, peopleCount).map((name, idx) => (
                    <label key={`p-${idx}`}>
                      Person {idx + 1}<br />
                      <input style={input} value={name} onChange={(e) => setPersonName(idx, e.target.value)} placeholder="Name" />
                    </label>
                  ))}
                </div>
              </div>

              {error ? <div style={errorBox}>{error}</div> : null}

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                <button
                  style={{ ...mapsBtn, opacity: ort.trim() ? 1 : 0.45, cursor: ort.trim() ? "pointer" : "not-allowed" }}
                  onClick={() => openInGoogleMaps(ort)}
                  disabled={!ort.trim()}
                  title={ort.trim() ? "Ort in Google Maps öffnen" : "Bitte erst einen Ort eingeben"}
                >
                  Maps
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button style={btn} onClick={closeModal}>
                    Abbrechen
                  </button>
                  <button style={primaryBtn} onClick={saveEinsatz}>
                    {editingId !== null ? "Aktualisieren" : "Einsatz hinzufügen"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                Tipp: <b>ESC</b> schließt • Klick auf Hintergrund schließt
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* =======================
   STYLES
   ======================= */
const page = {
  padding: 24,
  fontFamily: "Arial",
  maxWidth: 1400,
  margin: "0 auto",
  display: "grid",
  gap: 12,
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const card = {
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 14,
  background: "white",
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 10,
};

const peopleGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const input = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ccc",
  marginTop: 4,
  boxSizing: "border-box",
};

const timeRow = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const select = {
  width: 140,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ccc",
  marginTop: 4,
};

const primaryBtn = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const btn = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const mapsBtn = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "white",
  color: "#111",
  fontWeight: 900,
};

const addBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #111",
  background: "#111",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const navRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const chip = {
  border: "1px solid #ddd",
  borderRadius: 999,
  padding: "6px 10px",
  background: "white",
  fontSize: 13,
};

const errorBox = {
  marginTop: 10,
  padding: 10,
  borderRadius: 12,
  border: "1px solid #c33",
  color: "#c33",
  fontWeight: 800,
};

const weekWrap = {
  display: "grid",
  gridTemplateColumns: "90px 1fr",
  gap: 10,
  alignItems: "start",
};

const timeCol = {
  display: "grid",
  gridTemplateRows: "56px 1fr",
  gap: 10,
};

const timeColHeader = {
  minHeight: 56,
  border: "1px solid #ddd",
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  background: "white",
};

const timeColBody = {
  position: "relative",
  border: "1px solid #ddd",
  borderRadius: 14,
  background: "white",
  overflow: "hidden",
};

const timeTickLine = {
  height: 1,
  background: "#efefef",
};

const timeTickLabel = {
  position: "absolute",
  left: 8,
  transform: "translateY(-50%)",
  fontSize: 11,
  opacity: 0.75,
  background: "white",
  padding: "0 6px",
  borderRadius: 10,
  border: "1px solid #eee",
};

const daysNoScroll = {
  overflowX: "hidden",
};

const daysGridFit = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 10,
  width: "100%",
};

const dayHeader = {
  minHeight: 56,
  border: "1px solid #ddd",
  borderRadius: 14,
  background: "white",
  padding: "10px 12px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
};

const dayBody = {
  position: "relative",
  border: "1px solid #ddd",
  borderRadius: 14,
  background: "white",
  overflow: "hidden",
  cursor: "pointer",
};

const tinyActionBtnCompact = {
  border: "1px solid #111",
  background: "white",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 900,
  padding: 0,
};

function miniPill(isDone, plannedText) {
  return {
    borderRadius: 999,
    padding: "2px 8px",
    border: isDone ? "1px solid #2e7d32" : "1px solid rgba(255,255,255,0.45)",
    background: isDone ? "rgba(46,125,50,0.08)" : "rgba(255,255,255,0.12)",
    fontWeight: 900,
    whiteSpace: "nowrap",
    color: isDone ? "#1b5e20" : plannedText,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const modalCard = {
  width: "min(980px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto",
  background: "white",
  borderRadius: 16,
  border: "1px solid #ddd",
  padding: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};
