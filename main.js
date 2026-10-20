import { createClient } from "@supabase/supabase-js";

// Keys come from environment variables (set in Vercel, or a local .env file).
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);
let habits = [], view = "week", mo = 0, signUp = false;

const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const lastDays = (n) => { const a = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(d); } return a; };
function el(t, c, x) { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
const say = (m) => { $("app-msg").textContent = m || ""; };

// ---------- Auth ----------
function showAuth(show) { $("auth").hidden = !show; $("app").hidden = show; }

$("auth-toggle").onclick = () => {
  signUp = !signUp;
  $("auth-btn").textContent = signUp ? "Sign up" : "Log in";
  $("auth-toggle").textContent = signUp ? "Have an account? Log in" : "No account? Sign up";
  $("auth-msg").textContent = "";
};

$("auth-btn").onclick = async () => {
  const email = $("email").value.trim(), password = $("password").value;
  $("auth-msg").textContent = "";
  const { data, error } = signUp
    ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    : await supabase.auth.signInWithPassword({ email, password });
  if (error) { $("auth-msg").textContent = error.message; return; }
  if (signUp && !data.session) $("auth-msg").textContent = "Check your email to confirm your account, then log in.";
};

$("signout").onclick = () => supabase.auth.signOut();

supabase.auth.onAuthStateChange((event, session) => {
  if (session) { showAuth(false); if (event === "INITIAL_SESSION" || event === "SIGNED_IN") loadAll(); }
  else { habits = []; showAuth(true); }
});

// ---------- Data ----------
async function loadAll() {
  const since = key(new Date(Date.now() - 180 * 864e5));
  const [h, c] = await Promise.all([
    supabase.from("habits").select("*").order("id"),
    supabase.from("habit_checks").select("habit_id,day").gte("day", since),
  ]);
  if (h.error || c.error) { say((h.error || c.error).message); return; }
  say("");
  habits = h.data.map((x) => ({ ...x, days: {} }));
  c.data.forEach((r) => { const hb = habits.find((x) => x.id === r.habit_id); if (hb) hb.days[r.day] = true; });
  render();
}

async function addHabit() {
  const name = $("input").value.trim(); if (!name) return;
  $("input").value = "";
  const { data, error } = await supabase.from("habits").insert({ name }).select().single();
  if (error) return say(error.message);
  habits.push({ ...data, days: {} }); render();
}

async function toggle(h, k) {
  if (h.days[k]) {
    const { error } = await supabase.from("habit_checks").delete().eq("habit_id", h.id).eq("day", k);
    if (error) return say(error.message);
    delete h.days[k];
  } else {
    const { error } = await supabase.from("habit_checks").insert({ habit_id: h.id, day: k });
    if (error) return say(error.message);
    h.days[k] = true;
  }
  say(""); render();
}

async function setGoal(h, g) {
  const { error } = await supabase.from("habits").update({ goal: g }).eq("id", h.id);
  if (error) return say(error.message);
  h.goal = g; render();
}

async function removeHabit(h) {
  const { error } = await supabase.from("habits").delete().eq("id", h.id);
  if (error) return say(error.message);
  habits = habits.filter((x) => x.id !== h.id); render();
}

// ---------- View ----------
function streak(h) { const d = new Date(); if (!h.days[key(d)]) d.setDate(d.getDate() - 1); let c = 0; while (h.days[key(d)]) { c++; d.setDate(d.getDate() - 1); } return c; }
function weekCount(h) { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); let c = 0; for (let i = 0; i < 7; i++) { const x = new Date(d); x.setDate(d.getDate() + i); if (h.days[key(x)]) c++; } return c; }

function goalBlock(h) {
  const c = weekCount(h), g = h.goal, box = el("div", "goal"), row = el("div", "goalrow");
  row.appendChild(el("span", "", "This week: " + c + " / " + g + " days" + (c >= g ? " 🎉" : "")));
  const st = el("div", "step"), m = el("button", "", "−"), p = el("button", "", "+");
  m.type = p.type = "button"; m.setAttribute("aria-label", "Lower weekly goal"); p.setAttribute("aria-label", "Raise weekly goal");
  m.onclick = () => { if (h.goal > 1) setGoal(h, h.goal - 1); };
  p.onclick = () => { if (h.goal < 7) setGoal(h, h.goal + 1); };
  st.append(el("span", "", "Goal"), m, p); row.appendChild(st);
  const bar = el("div", "bar"), f = el("div"); f.style.width = Math.min(100, Math.round((c / g) * 100)) + "%"; bar.appendChild(f);
  box.append(row, bar); return box;
}

function weekGrid(h, todayKey) {
  const week = el("div", "week");
  lastDays(7).forEach((d) => {
    const k = key(d), b = el("button", "day" + (h.days[k] ? " on" : "") + (k === todayKey ? " today" : "")); b.type = "button";
    b.setAttribute("aria-label", d.toDateString() + (h.days[k] ? ", done" : ", not done"));
    b.append(el("span", "dot", h.days[k] ? "✓" : ""), el("span", "", k === todayKey ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)));
    b.onclick = () => toggle(h, k); week.appendChild(b);
  });
  return week;
}

function monthGrid(h, todayKey) {
  const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + mo, 1), y = first.getFullYear(), m = first.getMonth();
  const n = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7, wrap = el("div"), g = el("div", "week"); let cnt = 0;
  ["M", "T", "W", "T", "F", "S", "S"].forEach((l) => g.appendChild(el("div", "dh", l)));
  for (let i = 0; i < lead; i++) g.appendChild(el("div"));
  for (let d = 1; d <= n; d++) {
    const dt = new Date(y, m, d), k = key(dt), b = el("button", "cell" + (h.days[k] ? " on" : "") + (k === todayKey ? " today" : ""), String(d)); b.type = "button";
    if (h.days[k]) cnt++;
    if (dt > now && k !== todayKey) b.disabled = true;
    b.onclick = () => toggle(h, k); g.appendChild(b);
  }
  wrap.append(g, el("div", "mstat", cnt + (cnt === 1 ? " day" : " days") + " done this month"));
  return wrap;
}

function render() {
  const list = $("list"); list.innerHTML = "";
  const todayKey = key(new Date()), done = habits.filter((h) => h.days[todayKey]).length;
  $("sub").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + (habits.length ? " · " + done + " of " + habits.length + " done today" : "");
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
  $("nav").hidden = view !== "month";
  const now = new Date(); $("mlabel").textContent = new Date(now.getFullYear(), now.getMonth() + mo, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("next").disabled = mo >= 0;
  if (!habits.length) { list.appendChild(el("div", "empty", "Add your first habit above.")); return; }
  habits.forEach((h) => {
    const card = el("div", "card"), head = el("div", "head"), left = el("div");
    left.appendChild(el("div", "name", h.name));
    const st = streak(h); left.appendChild(el("div", "streak" + (st > 0 ? " hot" : ""), st > 0 ? "🔥 " + st + " day streak" : "No streak yet. Start today!"));
    const del = el("button", "del", "×"); del.type = "button"; del.setAttribute("aria-label", "Delete habit"); del.onclick = () => removeHabit(h);
    head.append(left, del);
    card.append(head, goalBlock(h), view === "week" ? weekGrid(h, todayKey) : monthGrid(h, todayKey));
    list.appendChild(card);
  });
}

$("add").onclick = addHabit;
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter") addHabit(); });
document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { view = b.dataset.v; render(); }));
$("prev").onclick = () => { mo--; render(); };
$("next").onclick = () => { if (mo < 0) { mo++; render(); } };
