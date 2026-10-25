// ============================================================
// NOKIA V1.5 — KOMPLETAN (V1.0 PARITET)
// ============================================================

if (!window.supabase) {
  document.body.innerHTML = "<h1 style='color:red; text-align:center; margin-top:50px;'>Greška: Supabase biblioteka nije učitana!</h1>";
  throw new Error("Supabase library not loaded");
}

const supabaseUrl = 'https://vhpuowhgewekklbvtfie.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocHVvd2hnZXdla2tsYnZ0ZmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MzkyODAsImV4cCI6MjEwODQxNTI4MH0.-G-d7EaO8PsWo6XENi_pQorPB95DCjOr3WwuCkal8lg';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// ─── STATE ─────────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentSettings = { work_start: 8, work_end: 20 };
let allAppointments = [];
let allClients = [];
let allServices = [];
let allDaySchedules = {};
let activeClientId = null;
let selectedDate = new Date();
let clientSearchQuery = "";
let newApptClientSearch = "";
let newApptState = null;
let profileShowAll = false;
let pickerMonth = null;
let sheetVersion = 0;
let pickedHoursState = { key: null, hours: [] };

// ─── HELPERS ───────────────────────────────────────────────
const DAYS_LONG = ["nedelja","ponedeljak","utorak","sreda","četvrtak","petak","subota"];
const DAYS_SHORT = ["NED","PON","UTO","SRE","ČET","PET","SUB"];
const MONTHS = ["januar","februar","mart","april","maj","jun","jul","avgust","septembar","oktobar","novembar","decembar"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","avg","sep","okt","nov","dec"];

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function sameDay(a,b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function isToday(d) { return sameDay(d, new Date()); }
function formatTime(d) { const x = d instanceof Date ? d : new Date(d); return `${String(x.getHours()).padStart(2,"0")}:${String(x.getMinutes()).padStart(2,"0")}`; }
function formatMoney(n) { return Number(n).toLocaleString("sr-RS") + " RSD"; }
function formatMoneyShort(n) { return Number(n).toLocaleString("sr-RS"); }
function initials(c) { if (!c) return "—"; return (c.first_name?.[0] || "") + (c.last_name?.[0] || ""); }
function localDateStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}
function formatMinutes(m) {
  return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
}

function getDaySchedule(date) {
  const key = localDateStr(date);
  return allDaySchedules[key] || null;
}

function getWorkingSlotsForDay(date) {
  const schedule = getDaySchedule(date);
  if (schedule === 'off') return [];
  if (Array.isArray(schedule)) return [...schedule].sort((a, b) => a - b);
  const slots = [];
  for (let m = currentSettings.work_start * 60; m < currentSettings.work_end * 60; m += 30) {
    slots.push(m);
  }
  return slots;
}

function nextAppointmentForClient(clientId) {
  return allAppointments
    .filter(a => a.clients?.id === clientId && a.status === 'scheduled' && new Date(a.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
}

function lastCompletedForClient(clientId) {
  return allAppointments
    .filter(a => a.clients?.id === clientId && a.status === 'completed')
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

function calculateSuggestedGap(clientId) {
  const completed = allAppointments
    .filter(a => a.clients?.id === clientId && a.status === 'completed')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);
  if (completed.length < 3) return 21;
  const gaps = [];
  for (let i = 0; i < completed.length - 1; i++) {
    const gap = Math.round((new Date(completed[i].date) - new Date(completed[i+1].date)) / 86400000);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 21;
  const avg = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  const consistent = gaps.every(g => Math.abs(g - avg) <= 4);
  return consistent ? avg : 21;
}

// ─── TOAST ─────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const colors = {
    info: 'background:#18181b;color:#fafafa;',
    success: 'background:#16a34a;color:#fff;',
    error: 'background:#dc2626;color:#fff;',
  };
  const container = document.getElementById("toast-container");
  if (!container) { console.log(`[${type}] ${msg}`); return; }
  const el = document.createElement("div");
  el.className = "toast";
  el.style.cssText = `padding:12px 18px;border-radius:12px;margin:8px auto;max-width:88%;text-align:center;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.2);${colors[type] || colors.info}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2400);
}

function toastUndo(msg, undoFn) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast undo-toast";
  el.style.cssText = "padding:12px 18px;border-radius:12px;margin:8px auto;max-width:88%;background:#18181b;color:#fafafa;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.2);";
  el.innerHTML = `<span>${msg}</span><button style="background:none;border:none;color:#60a5fa;font-weight:700;cursor:pointer;padding:4px 8px;font-size:13px;">Poništi</button>`;
  container.appendChild(el);
  let active = true;
  el.querySelector("button").onclick = async () => {
    if (!active) return;
    active = false;
    await undoFn();
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  };
  setTimeout(() => {
    if (!active) return;
    active = false;
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 5000);
}

// ─── INICIJALIZACIJA ───────────────────────────────────────
async function initApp() {
  const overlay = document.getElementById("welcome-overlay");
  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    if (!session) {
      overlay.classList.remove("hidden");
      overlay.classList.add("visible");
      overlay.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-logo">N</div>
          <h1 class="welcome-title">Dobrodošla u Noktia</h1>
          <p class="welcome-sub">Prijavi se da nastaviš.</p>
          <div class="welcome-actions">
            <button class="btn btn-primary" onclick="loginWithGoogle()">Prijavi se sa Google</button>
          </div>
        </div>
      `;
      return;
    }

    currentUser = session.user;

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (profileError) throw profileError;

    if (!profile) {
      overlay.classList.remove("hidden");
      overlay.classList.add("visible");
      overlay.innerHTML = `
        <div class="welcome-card" style="text-align: left;">
          <div class="welcome-logo" style="margin: 0 auto 20px;">N</div>
          <h1 class="welcome-title" style="text-align: center;">Dobrodošla!</h1>
          <p class="welcome-sub" style="text-align: center;">Hajde da podesimo tvoj profil.</p>
          <div class="field">
            <label class="field-label">Kako da te zovemo?</label>
            <input type="text" id="onboarding-name" class="field-input" placeholder="Tvoje ime">
          </div>
          <div class="field">
            <label class="field-label">Šta radiš?</label>
            <input type="text" id="onboarding-profession" class="field-input" placeholder="npr. Manikirka">
          </div>
          <div class="welcome-actions" style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="saveOnboarding()">Nastavi</button>
          </div>
        </div>
      `;
      return;
    }

    currentProfile = profile;
    overlay.classList.remove("visible");
    overlay.classList.add("hidden");

    selectedDate = startOfDay(new Date());
    await loadData();
    setupTabs();
    setupButtons();
    setupSwipe();

    const header = document.querySelector("#screen-today .screen-header");
    if (header) {
      header.style.display = "grid";
      header.style.gridTemplateColumns = "44px 1fr 44px 44px";
      header.style.alignItems = "center";
    }

  } catch (err) {
    console.error("Greška pri inicijalizaciji:", err);
    toast("Greška: " + err.message, 'error');
  }
}

async function saveOnboarding() {
  const nameInput = document.getElementById("onboarding-name").value.trim();
  const profInput = document.getElementById("onboarding-profession").value.trim();
  if (!nameInput || !profInput) { toast("Popuni oba polja.", 'error'); return; }
  try {
    const { error } = await supabaseClient
      .from('profiles').insert([{ id: currentUser.id, first_name: nameInput, profession: profInput }]);
    if (error) throw error;
    await initApp();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── UČITAVANJE ────────────────────────────────────────────
async function loadData() {
  try {
    const { data: settings, error: setErr } = await supabaseClient
      .from('user_settings').select('*').eq('user_id', currentUser.id).maybeSingle();
    if (!setErr && settings) {
      currentSettings = settings;
    } else {
      await supabaseClient.from('user_settings').insert([{ user_id: currentUser.id, work_start: 8, work_end: 20 }]);
    }

    const { data: appts, error: apptError } = await supabaseClient
      .from('appointments')
      .select(`id, date, status, payment_status, clients (id, first_name, last_name, phone), service_lines (name_snapshot, price_snapshot)`);
    if (apptError) throw apptError;
    allAppointments = appts || [];

    const { data: clients, error: clientError } = await supabaseClient
      .from('clients').select('*').order('first_name');
    if (clientError) throw clientError;
    allClients = clients || [];

    const { data: services, error: svcError } = await supabaseClient
      .from('services').select('*').eq('is_archived', false).order('name');
    if (svcError) throw svcError;
    allServices = services || [];

    await loadDaySchedules();

    renderTodayV15();
    renderClientsV15();
    renderRevenueV15();
    renderPricelistV15();
    updateSettingsSub();
    if (activeClientId) renderClientProfileV15(activeClientId);
  } catch (err) {
    console.error("Greška pri učitavanju:", err);
    toast("Greška pri učitavanju podataka", 'error');
  }
}

async function loadDaySchedules() {
  const { data, error } = await supabaseClient
    .from('day_schedules').select('date, schedule').eq('user_id', currentUser.id);
  if (error) { console.warn("day_schedules greška:", error.message); allDaySchedules = {}; return; }
  allDaySchedules = {};
  (data || []).forEach(row => {
    const key = row.date.split('T')[0];
    allDaySchedules[key] = row.schedule;
  });
}

async function saveDaySchedule(date, schedule) {
  const key = localDateStr(date);
  await supabaseClient.from('day_schedules').delete().eq('user_id', currentUser.id).eq('date', key);
  if (schedule === null) {
    delete allDaySchedules[key];
    return true;
  }
  const { error } = await supabaseClient.from('day_schedules').insert([{
    user_id: currentUser.id, date: key, schedule: schedule,
  }]);
  if (error) { toast("Greška: " + error.message, 'error'); return false; }
  allDaySchedules[key] = schedule;
  return true;
}

// ─── NAVIGACIJA ────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add("active");
  document.getElementById("main-content").scrollTop = 0;
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const tabName = tab.dataset.tab;
      showScreen(tabName);
      if (tabName === 'today') renderTodayV15();
      if (tabName === 'clients') renderClientsV15();
      if (tabName === 'revenue') renderRevenueV15();
      if (tabName === 'settings') updateSettingsSub();
      document.getElementById("btn-new-appointment").classList.toggle("hidden", tabName !== "today");
    };
  });
}

function setupButtons() {
  document.getElementById("btn-add-client").onclick = () => openNewClientSheetV15(false);
  document.getElementById("btn-new-appointment").onclick = () => openNewAppointmentSheetV15();
  document.getElementById("btn-open-calendar").onclick = openDatePicker;

  document.getElementById("settings-pricelist").onclick = () => { showScreen("pricelist"); renderPricelistV15(); };
  document.getElementById("btn-back-from-pricelist").onclick = () => showScreen("settings");
  document.getElementById("btn-add-service").onclick = () => openServiceSheetV15();

  document.getElementById("btn-back-from-profile").onclick = () => {
    activeClientId = null;
    showScreen("clients");
    renderClientsV15();
  };

  document.getElementById("btn-edit-client").onclick = openEditClientSheetV15;

  document.getElementById("client-search").oninput = (e) => {
    clientSearchQuery = e.target.value;
    renderClientsV15();
  };

  document.getElementById("settings-export-slots").onclick = openExportSlotsSheetV15;
  document.getElementById("settings-work-hours").onclick = openWorkHoursSheetV15;
  document.getElementById("settings-export").onclick = exportBackupV15;

  document.getElementById("settings-logout").onclick = () => {
    if (confirm("Odjaviti se?")) logout();
  };

  document.getElementById("btn-prev-day").onclick = () => {
    selectedDate = startOfDay(addDays(selectedDate, -1));
    renderTodayV15();
  };
  document.getElementById("btn-next-day").onclick = () => {
    selectedDate = startOfDay(addDays(selectedDate, 1));
    renderTodayV15();
  };
  document.getElementById("btn-back-today").onclick = () => {
    selectedDate = startOfDay(new Date());
    renderTodayV15();
  };
}

function updateSettingsSub() {
  const active = allServices.length;
  const el = document.getElementById("settings-pricelist-sub");
  if (el) el.textContent = `${active} ${active === 1 ? "usluga" : "usluge"}`;
  const whEl = document.getElementById("settings-work-hours-sub");
  if (whEl) whEl.textContent = `${String(currentSettings.work_start).padStart(2,"0")}:00 — ${String(currentSettings.work_end).padStart(2,"0")}:00`;
}

// ─── RADNO VREME ───────────────────────────────────────────
function openWorkHoursSheetV15() {
  let startOpts = "", endOpts = "";
  for (let h=6; h<=14; h++) startOpts += `<option value="${h}" ${currentSettings.work_start===h?"selected":""}>${String(h).padStart(2,"0")}:00</option>`;
  for (let h=15; h<=23; h++) endOpts += `<option value="${h}" ${currentSettings.work_end===h?"selected":""}>${String(h).padStart(2,"0")}:00</option>`;

  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">Radno vreme</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <p style="font-size:13px; color:var(--text-2); margin-bottom:16px;">Ovo je podrazumevano radno vreme. Za pojedinačne dane koristi „Podesi sate" na ekranu Danas.</p>
      <div class="field-row">
        <div class="field"><label class="field-label">Od</label><select class="field-input" id="work-start">${startOpts}</select></div>
        <div class="field"><label class="field-label">Do</label><select class="field-input" id="work-end">${endOpts}</select></div>
      </div>
      <button class="btn btn-primary" onclick="saveWorkHoursV15()">Sačuvaj</button>
    </div>`;
  openSheet(html);
}

async function saveWorkHoursV15() {
  const start = Number(document.getElementById("work-start").value);
  const end = Number(document.getElementById("work-end").value);
  if (end <= start) { toast("Kraj mora biti posle početka", 'error'); return; }
  try {
    const { error } = await supabaseClient.from('user_settings').update({ work_start: start, work_end: end }).eq('user_id', currentUser.id);
    if (error) throw error;
    currentSettings.work_start = start;
    currentSettings.work_end = end;
    closeSheet();
    updateSettingsSub();
    toast("Sačuvano", 'success');
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── DANAS ─────────────────────────────────────────────────
function renderTodayV15() {
  const d = selectedDate;
  let title = "Danas";
  const today = startOfDay(new Date());
  const diff = Math.round((d - today) / 86400000);
  if (diff === 1) title = "Sutra";
  else if (diff === -1) title = "Juče";
  else if (diff !== 0) title = capitalize(DAYS_LONG[d.getDay()]);

  document.getElementById("day-title").textContent = title;
  document.getElementById("day-subtitle").textContent = `${DAYS_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;

  const strip = document.getElementById("week-strip");
  strip.innerHTML = "";
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = addDays(d, diffToMonday);

  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const btn = document.createElement("button");
    btn.className = "week-day";
    if (sameDay(day, d)) btn.classList.add("selected");
    if (isToday(day)) btn.classList.add("today");
    const hasAppts = allAppointments.some(a => sameDay(new Date(a.date), day) && a.status === 'scheduled');
    if (hasAppts) btn.classList.add("has-appointments");
    btn.innerHTML = `
      <span class="week-day-label">${DAYS_SHORT[day.getDay()]}</span>
      <span class="week-day-number">${day.getDate()}</span>
      <span class="week-day-dot"></span>`;
    btn.onclick = () => { selectedDate = startOfDay(day); renderTodayV15(); };
    strip.appendChild(btn);
  }

  const list = document.getElementById("appointments-list");
  list.innerHTML = "";

  const todaysAppts = allAppointments
    .filter(a => sameDay(new Date(a.date), d))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const summary = document.getElementById("day-summary");
  const scheduledCount = todaysAppts.filter(a => a.status === 'scheduled').length;
  if (todaysAppts.length === 0) {
    summary.textContent = "Nemaš termina";
  } else {
    const total = todaysAppts.filter(a => a.status !== 'cancelled')
      .reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
    summary.textContent = `${scheduledCount} ${scheduledCount === 1 ? "termin" : "termina"} · ${formatMoney(total)}`;
  }

  // Podesi sate traka
  const oldRow = document.getElementById("day-schedule-row");
  if (oldRow) oldRow.remove();

  if (startOfDay(d) >= startOfDay(new Date())) {
    const schedRow = document.createElement("div");
    schedRow.id = "day-schedule-row";
    schedRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin:0 4px 12px;padding:10px 14px;background:var(--surface-2);border-radius:12px;";

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:13px;font-weight:500;flex:1;";
    const schedule = getDaySchedule(d);

    if (schedule === 'off') {
      hint.textContent = "Ne radiš ovaj dan";
      hint.style.color = "var(--danger, #dc2626)";
    } else if (Array.isArray(schedule)) {
      const times = schedule.map(m => formatMinutes(m)).join(", ");
      hint.textContent = times.length > 42 ? `Radiš: ${schedule.length} sata` : `Radiš: ${times}`;
      hint.style.color = "var(--success, #16a34a)";
    } else {
      hint.textContent = `Radiš ceo dan (${String(currentSettings.work_start).padStart(2,"0")}–${String(currentSettings.work_end).padStart(2,"0")}h)`;
    }

    const btn = document.createElement("button");
    btn.style.cssText = "font-size:13px;font-weight:700;color:var(--info, #2563eb);padding:4px 10px;white-space:nowrap;";
    btn.textContent = "Podesi sate";
    btn.onclick = () => openDayScheduleSheet(d);

    schedRow.appendChild(hint);
    schedRow.appendChild(btn);
    summary.parentNode.insertBefore(schedRow, summary.nextSibling);
  }

  // Termini
  if (todaysAppts.length === 0) {
    list.innerHTML = `<div class="empty-state"><p class="empty-title">Slobodan dan</p></div>`;
  } else {
    todaysAppts.forEach(apt => {
      const client = apt.clients;
      const total = apt.service_lines.reduce((sum, s) => sum + Number(s.price_snapshot), 0);
      const servicesText = apt.service_lines.map(s => s.name_snapshot).join(", ");

      const card = document.createElement("div");
      card.className = "appointment-card";
      if (apt.status === 'completed') card.classList.add("completed");
      if (apt.status === 'cancelled') card.classList.add("cancelled");

      const isAwaitingPayment = apt.status === 'completed' && apt.payment_status === 'unpaid';
      const badge = isAwaitingPayment ? `<div class="appointment-badge">Čeka naplatu</div>` : '';
      const timeClass = apt.status === 'completed' ? "appointment-time completed-time" : "appointment-time";

      card.innerHTML = `
        <div class="appointment-row-1">
          <span class="${timeClass}">${formatTime(apt.date)}</span>
          <span class="appointment-price">${formatMoney(total)}</span>
        </div>
        <div class="appointment-name">${client ? `${client.first_name} ${client.last_name || ""}`.trim() : "Nepoznat"}</div>
        <div class="appointment-services">${servicesText}</div>
        ${badge}`;
      card.onclick = () => openAppointmentDetailV15(apt.id);
      list.appendChild(card);
    });
  }

  document.getElementById("btn-back-today").classList.toggle("hidden", isToday(d));
}

// ─── DATE PICKER ───────────────────────────────────────────
function openDatePicker() {
  const d = selectedDate || new Date();
  pickerMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderDatePicker();
}

function renderDatePicker() {
  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header">
      <div class="sheet-title">Izaberi datum</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      ${renderCalendarGrid({
        displayedMonth: pickerMonth,
        selectedDate: selectedDate,
        onPrevMonth: 'pickerPrevMonth',
        onNextMonth: 'pickerNextMonth',
        onPickDay: 'pickerPickDay',
        disablePast: false
      })}
      <button class="btn btn-secondary" style="margin-top:20px;" onclick="pickerGoToday()">Idi na danas</button>
    </div>`;
  openSheet(html);
}

function pickerPrevMonth() { pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1); renderDatePicker(); }
function pickerNextMonth() { pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1); renderDatePicker(); }
function pickerPickDay(ts) { selectedDate = startOfDay(new Date(ts)); closeSheet(); renderTodayV15(); }
function pickerGoToday() { selectedDate = startOfDay(new Date()); closeSheet(); renderTodayV15(); }

// ─── CALENDAR GRID HELPER ──────────────────────────────────
function renderCalendarGrid({ displayedMonth, selectedDate, onPrevMonth, onNextMonth, onPickDay, disablePast = true }) {
  const month = displayedMonth;
  const year = month.getFullYear();
  const m = month.getMonth();
  const today = startOfDay(new Date());

  let html = `<div class="calendar">
    <div class="calendar-header">
      <button class="calendar-nav" onclick="${onPrevMonth}()" aria-label="Prethodni mesec">‹</button>
      <div class="calendar-title">${MONTHS[m]} ${year}</div>
      <button class="calendar-nav" onclick="${onNextMonth}()" aria-label="Sledeći mesec">›</button>
    </div>
    <div class="calendar-weekdays">
      <span class="calendar-weekday">Pon</span>
      <span class="calendar-weekday">Uto</span>
      <span class="calendar-weekday">Sre</span>
      <span class="calendar-weekday">Čet</span>
      <span class="calendar-weekday">Pet</span>
      <span class="calendar-weekday">Sub</span>
      <span class="calendar-weekday">Ned</span>
    </div>
    <div class="calendar-grid">`;

  const firstOfMonth = new Date(year, m, 1);
  const firstDow = firstOfMonth.getDay();
  const diffToMonday = firstDow === 0 ? -6 : 1 - firstDow;
  const startDate = addDays(firstOfMonth, diffToMonday);

  for (let i = 0; i < 42; i++) {
    const day = addDays(startDate, i);
    const dayStart = startOfDay(day);
    const inMonth = day.getMonth() === m;
    const isSelected = selectedDate && sameDay(day, selectedDate);
    const isTodayCell = sameDay(day, new Date());
    const isPast = disablePast && dayStart < today;
    const disabled = isPast && !isTodayCell;
    const hasAppts = allAppointments.some(a => sameDay(new Date(a.date), day));

    let cls = "calendar-day";
    if (!inMonth) cls += " other-month";
    if (isSelected) cls += " selected";
    if (isTodayCell && !isSelected) cls += " today";
    if (isPast && !isTodayCell) cls += " past";
    if (hasAppts) cls += " has-appts";

    html += `<button class="${cls}" ${disabled ? 'disabled' : `onclick="${onPickDay}(${day.getTime()})"`}>${day.getDate()}</button>`;
  }

  html += `</div></div>`;
  return html;
}

// ─── DAY SCHEDULE SHEET (Danas) ────────────────────────────
function openDayScheduleSheet(date) {
  const key = localDateStr(date);
  const dayLabel = `${capitalize(DAYS_LONG[date.getDay()])}, ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
  const schedule = allDaySchedules[key];

  let currentInfo = '';
  if (schedule === 'off') currentInfo = '<div style="color:var(--danger);margin-bottom:12px;text-align:center;font-size:13px;">Trenutno: Ne radiš</div>';
  else if (Array.isArray(schedule)) currentInfo = `<div style="color:var(--success);margin-bottom:12px;text-align:center;font-size:13px;">Trenutno: ${schedule.map(formatMinutes).join(', ')}</div>`;
  else currentInfo = '<div style="color:var(--text-2);margin-bottom:12px;text-align:center;font-size:13px;">Trenutno: Ceo dan</div>';

  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header">
      <div class="sheet-title">Podesi sate</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <p style="text-align:center;font-size:13px;color:var(--text-2);margin-bottom:6px;">${dayLabel}</p>
      ${currentInfo}
      <button class="btn btn-primary" style="margin-bottom:10px;" onclick="setScheduleAll('${key}')">Ceo dan (${String(currentSettings.work_start).padStart(2,"0")}–${String(currentSettings.work_end).padStart(2,"0")}h)</button>
      <button class="btn btn-secondary" style="margin-bottom:10px;" onclick="openPickHoursSheet('${key}')">Samo neki sati</button>
      <button class="btn btn-secondary" style="margin-bottom:10px;" onclick="setScheduleOff('${key}')">Ne radim</button>
      <button class="btn btn-secondary" style="background:transparent;color:var(--text-3);" onclick="clearDaySchedule('${key}')">Vrati na podrazumevano</button>
    </div>`;
  openSheet(html);
}

function openPickHoursSheet(key) {
  const existing = allDaySchedules[key];
  pickedHoursState.key = key;
  if (Array.isArray(existing)) {
    pickedHoursState.hours = [...existing];
  } else if (existing === 'off') {
    pickedHoursState.hours = [];
  } else {
    pickedHoursState.hours = [];
    for (let m = currentSettings.work_start * 60; m < currentSettings.work_end * 60; m += 30) {
      pickedHoursState.hours.push(m);
    }
  }
  renderPickHoursSheet();
}

function renderPickHoursSheet() {
  const { key, hours } = pickedHoursState;
  const start = currentSettings.work_start * 60;
  const end = currentSettings.work_end * 60;

  let grid = '';
  for (let m = start; m < end; m += 30) {
    const sel = hours.includes(m);
    grid += `<button class="time-chip ${sel ? 'selected' : ''}" onclick="togglePickedHour(${m})">${formatMinutes(m)}</button>`;
  }

  const count = hours.length;
  const label = count === 0 ? "Ništa nije označeno" : `${count} ${count === 1 ? "sat" : count <= 4 ? "sata" : "sati"}`;

  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header">
      <div class="sheet-title">Koje sate radiš?</div>
      <button class="sheet-close" onclick="openDayScheduleSheet(new Date('${key}T12:00:00'))">×</button>
    </div>
    <div class="sheet-body">
      <div class="time-grid">${grid}</div>
      <div style="display:flex;justify-content:space-between;padding:14px 4px;border-top:1px solid var(--border, #e5e5e5);margin-top:14px;">
        <span style="font-weight:600;">Označeno</span>
        <span style="font-weight:700;">${label}</span>
      </div>
      <button class="btn btn-primary" style="margin-top:16px;" onclick="savePickedHours()">Sačuvaj</button>
    </div>`;
  openSheet(html);
}

function togglePickedHour(m) {
  const idx = pickedHoursState.hours.indexOf(m);
  if (idx >= 0) pickedHoursState.hours.splice(idx, 1);
  else pickedHoursState.hours.push(m);
  renderPickHoursSheet();
}

async function savePickedHours() {
  if (pickedHoursState.hours.length === 0) { toast("Označi bar jedan sat", 'error'); return; }
  const sorted = [...pickedHoursState.hours].sort((a, b) => a - b);
  const ok = await saveDaySchedule(new Date(pickedHoursState.key + 'T12:00:00'), sorted);
  if (!ok) return;
  closeSheet();
  toast("Sačuvano", 'success');
  renderTodayV15();
}

async function setScheduleAll(key) {
  const ok = await saveDaySchedule(new Date(key + 'T12:00:00'), 'all');
  if (!ok) return;
  closeSheet();
  toast("Sačuvano", 'success');
  renderTodayV15();
}

async function setScheduleOff(key) {
  const conflicts = allAppointments.filter(a => a.status === 'scheduled' && localDateStr(new Date(a.date)) === key);
  if (conflicts.length > 0 && !confirm(`Imaš ${conflicts.length} ${conflicts.length === 1 ? "zakazan termin" : "zakazana termina"} tog dana. Označiti kao neradan ipak?`)) return;
  const ok = await saveDaySchedule(new Date(key + 'T12:00:00'), 'off');
  if (!ok) return;
  closeSheet();
  toast("Sačuvano", 'success');
  renderTodayV15();
}

async function clearDaySchedule(key) {
  const ok = await saveDaySchedule(new Date(key + 'T12:00:00'), null);
  if (!ok) return;
  closeSheet();
  toast("Vraćeno na podrazumevano", 'success');
  renderTodayV15();
}

// ─── SWIPE ─────────────────────────────────────────────────
function setupSwipe() {
  const el = document.getElementById("main-content");
  let startX=0, startY=0, tracking=false;
  el.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    if (document.getElementById("sheet-overlay").classList.contains("visible")) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  el.addEventListener("touchend", e => {
    if (!tracking) return;
    tracking = false;
    if (!document.querySelector("#screen-today.active")) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX; const dy = t.clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    selectedDate = startOfDay(addDays(selectedDate, dx > 0 ? -1 : 1));
    renderTodayV15();
  }, { passive: true });
}

// ─── KLIJENTKINJE ──────────────────────────────────────────
function renderClientsV15() {
  const list = document.getElementById("clients-list");
  list.innerHTML = "";

  const active = allClients.filter(c => !c.is_archived);
  const q = clientSearchQuery.toLowerCase().trim();
  const filtered = q
    ? active.filter(c => `${c.first_name} ${c.last_name || ''}`.toLowerCase().includes(q))
    : active;

  filtered.sort((a, b) => {
    const an = nextAppointmentForClient(a.id);
    const bn = nextAppointmentForClient(b.id);
    if (an && bn) return new Date(an.date) - new Date(bn.date);
    if (an) return -1;
    if (bn) return 1;
    const al = lastCompletedForClient(a.id);
    const bl = lastCompletedForClient(b.id);
    if (al && bl) return new Date(bl.date) - new Date(al.date);
    if (al) return -1;
    if (bl) return 1;
    return a.first_name.localeCompare(b.first_name, "sr");
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><p class="empty-title">${q ? "Nema rezultata" : "Nemaš klijentkinja"}</p></div>`;
    return;
  }

  filtered.forEach(client => {
    const clientAppts = allAppointments.filter(a => a.clients?.id === client.id && a.status === 'completed');
    const visits = clientAppts.length;
    const revenue = clientAppts.reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
    const next = nextAppointmentForClient(client.id);

    const nextText = next
      ? `${formatTime(new Date(next.date))} · ${new Date(next.date).getDate()}. ${MONTHS_SHORT[new Date(next.date).getMonth()]}`
      : "Nema zakazano";

    const card = document.createElement("div");
    card.className = "client-card";
    card.innerHTML = `
      <div class="client-row-1">
        <div style="flex:1; min-width:0;">
          <div class="client-name">${client.first_name} ${client.last_name || ""}</div>
          <div class="client-next ${next ? '' : 'empty'}">${nextText}</div>
        </div>
        <div class="avatar">${initials(client)}</div>
      </div>
      <div class="client-stats">${visits} poseta · ${formatMoney(revenue)}</div>`;
    card.onclick = () => openClientProfileV15(client.id);
    list.appendChild(card);
  });
}

// ─── PROFIL ────────────────────────────────────────────────
function openClientProfileV15(clientId) {
  activeClientId = clientId;
  profileShowAll = false;
  showScreen("client-profile");
  renderClientProfileV15(clientId);
}

function expandHistory() {
  profileShowAll = true;
  renderClientProfileV15(activeClientId);
}

function renderClientProfileV15(clientId) {
  const client = allClients.find(c => c.id === clientId);
  if (!client) return;
  document.getElementById("profile-name").textContent = client.first_name;

  const clientAppts = allAppointments.filter(a => a.clients?.id === clientId).sort((a, b) => new Date(b.date) - new Date(a.date));
  const completed = clientAppts.filter(a => a.status === 'completed');
  const cancelled = clientAppts.filter(a => a.status === 'cancelled');
  const visits = completed.length;
  const revenue = completed.reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
  const unpaid = completed.filter(a => a.payment_status === 'unpaid').reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
  const next = nextAppointmentForClient(clientId);
  const allHistory = [...completed, ...cancelled].sort((a, b) => new Date(b.date) - new Date(a.date));
  const shown = profileShowAll ? allHistory : allHistory.slice(0, 8);

  let html = `<div class="profile-hero">
    <div class="profile-avatar">${initials(client)}</div>
    ${client.phone ? `<a href="tel:${client.phone.replace(/\s/g,"")}" class="profile-phone">${client.phone}</a>` : ""}
  </div>`;

  if (next) {
    const nd = new Date(next.date);
    html += `<div>
      <div class="section-title">Sledeći termin</div>
      <div class="next-card">
        <div class="next-card-time">${formatTime(nd)}</div>
        <div class="next-card-date">${capitalize(DAYS_LONG[nd.getDay()])}, ${nd.getDate()}. ${MONTHS[nd.getMonth()]}</div>
        <div class="next-card-services">${next.service_lines.map(s => s.name_snapshot).join(", ")} · ${formatMoney(next.service_lines.reduce((s,x)=>s+Number(x.price_snapshot),0))}</div>
      </div>
    </div>`;
  }

  html += `<button class="btn btn-primary" onclick="openNewApptForClient('${clientId}')" style="margin-bottom:16px;">+ Zakaži termin</button>`;

  html += `<div>
    <div class="section-title">Ukupno</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-label">Poseta</div><div class="stat-value">${visits}</div></div>
      <div class="stat-box"><div class="stat-label">Naplaćeno</div><div class="stat-value" style="font-size:20px;">${formatMoneyShort(revenue)}<span style="font-size:13px;color:var(--text-3);font-weight:500;margin-left:4px;">RSD</span></div></div>
    </div>
    ${unpaid > 0 ? `<div class="unpaid-card" style="margin-top:12px;"><div class="unpaid-header"><div class="unpaid-title">Čeka naplatu</div><div class="unpaid-total">${formatMoney(unpaid)}</div></div></div>` : ""}
  </div>`;

  if (allHistory.length > 0) {
    html += `<div><div class="section-title">Istorija</div><div class="history-list">`;
    shown.forEach(apt => {
      const d = new Date(apt.date);
      const total = apt.service_lines.reduce((sum, s) => sum + Number(s.price_snapshot), 0);
      let statusText = "", statusClass = "";
      if (apt.status === 'completed') {
        statusText = apt.payment_status === 'paid' ? "✓ Plaćeno" : "⏳ Nije plaćeno";
        statusClass = apt.payment_status === 'paid' ? "paid" : "unpaid";
      } else if (apt.status === 'cancelled') {
        statusText = "✕ Otkazano"; statusClass = "cancelled";
      } else {
        statusText = "Zakazano"; statusClass = "";
      }
      html += `<div class="history-item" onclick="openAppointmentDetailV15('${apt.id}')" style="cursor:pointer;">
        <div class="history-item-left">
          <div class="history-item-date">${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}</div>
          <div class="history-item-service">${apt.service_lines.map(s => s.name_snapshot).join(", ")}</div>
          <div class="history-item-status ${statusClass}">${statusText}</div>
        </div>
        <div class="history-item-price">${formatMoney(total)}</div>
      </div>`;
    });
    if (allHistory.length > 8 && !profileShowAll) {
      html += `<div class="history-show-all" onclick="expandHistory()" style="cursor:pointer;text-align:center;padding:12px;color:var(--info, #2563eb);font-weight:600;">Prikaži sve (${allHistory.length})</div>`;
    }
    html += `</div></div>`;
  }

  if (client.note) {
    html += `<div><div class="section-title">Napomena</div><div class="note-card">${client.note}</div></div>`;
  }

  document.getElementById("profile-content").innerHTML = html;
}

function openNewApptForClient(clientId) {
  openNewAppointmentSheetV15(clientId);
}

// ─── ZARADA ────────────────────────────────────────────────
function renderRevenueV15() {
  const el = document.getElementById("revenue-content");
  el.innerHTML = "";
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const paidAppts = allAppointments.filter(a => a.status === 'completed' && a.payment_status === 'paid');
  const todayTotal = paidAppts.filter(a => sameDay(new Date(a.date), today)).reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
  const monthTotal = paidAppts.filter(a => new Date(a.date) >= startOfMonth).reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
  const unpaidAppts = allAppointments.filter(a => a.status === 'completed' && a.payment_status === 'unpaid');
  const unpaidTotal = unpaidAppts.reduce((sum, a) => sum + a.service_lines.reduce((s, x) => s + Number(x.price_snapshot), 0), 0);
  const completedCount = allAppointments.filter(a => a.status === 'completed').length;
  const paidCount = paidAppts.length;
  const clientIds = new Set(allAppointments.map(a => a.clients?.id).filter(Boolean));
  const serviceCount = {};
  allAppointments.filter(a => a.status === 'completed').forEach(a => a.service_lines.forEach(s => { serviceCount[s.name_snapshot] = (serviceCount[s.name_snapshot] || 0) + 1; }));
  const topService = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  let html = `<div class="revenue-hero">
    <div class="revenue-hero-label">Ovaj mesec</div>
    <div class="revenue-hero-value"><span>${formatMoneyShort(monthTotal)}</span><span class="revenue-hero-unit">RSD</span></div>
  </div>
  <div class="revenue-grid">
    <div class="revenue-box"><div class="revenue-box-label">Danas</div><div class="revenue-box-value">${formatMoneyShort(todayTotal)}</div></div>
    <div class="revenue-box"><div class="revenue-box-label">Završenih</div><div class="revenue-box-value">${paidCount}</div></div>
  </div>`;

  if (unpaidAppts.length > 0) {
    html += `<div class="unpaid-card"><div class="unpaid-header"><div class="unpaid-title">Čeka naplatu</div><div class="unpaid-total">${formatMoney(unpaidTotal)}</div></div><div class="unpaid-list">`;
    unpaidAppts.forEach(apt => {
      const d = new Date(apt.date);
      const client = apt.clients;
      const total = apt.service_lines.reduce((sum, s) => sum + Number(s.price_snapshot), 0);
      html += `<div class="unpaid-item" onclick="openAppointmentDetailV15('${apt.id}')" style="cursor:pointer;">
        <div><div class="unpaid-item-name">${client ? client.first_name : "—"}</div><div class="unpaid-item-date">${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}</div></div>
        <div class="unpaid-item-amount">${formatMoneyShort(total)} RSD</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  html += `<div class="section-title">Statistika</div><div class="stats-list">
    <div class="stats-row"><span class="stats-row-label">Završenih termina</span><span class="stats-row-value">${completedCount}</span></div>
    <div class="stats-row"><span class="stats-row-label">Plaćenih termina</span><span class="stats-row-value">${paidCount}</span></div>
    <div class="stats-row"><span class="stats-row-label">Broj klijentkinja</span><span class="stats-row-value">${clientIds.size}</span></div>
    <div class="stats-row"><span class="stats-row-label">Najpopularnija usluga</span><span class="stats-row-value">${topService}</span></div>
  </div>`;
  el.innerHTML = html;
}

// ─── CENOVNIK ──────────────────────────────────────────────
function renderPricelistV15() {
  const el = document.getElementById("pricelist-content");
  el.innerHTML = "";
  if (allServices.length === 0) {
    el.innerHTML = `<div class="empty-state"><p class="empty-title">Prazan cenovnik</p><p class="empty-message">Dodaj prvu uslugu pomoću + gore.</p></div>`;
    return;
  }
  allServices.forEach(svc => {
    const card = document.createElement("div");
    card.className = "price-card";
    card.innerHTML = `<div class="price-card-name">${svc.name}</div><div class="price-card-price">${formatMoney(svc.price)}</div>`;
    card.onclick = () => openServiceSheetV15(svc.id);
    el.appendChild(card);
  });
}

// ─── USLUGA ────────────────────────────────────────────────
function openServiceSheetV15(serviceId = null) {
  const isEdit = serviceId !== null && serviceId !== 'null';
  const svc = isEdit ? allServices.find(s => s.id === serviceId) : null;
  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">${isEdit ? "Izmeni uslugu" : "Nova usluga"}</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <div class="field"><label class="field-label">Naziv</label><input type="text" class="field-input" id="svc-name" value="${svc ? svc.name : ''}" placeholder="npr. Gel lak"></div>
      <div class="field"><label class="field-label">Cena (RSD)</label><input type="number" class="field-input" id="svc-price" value="${svc ? svc.price : ''}" placeholder="npr. 2500"></div>
      <button class="btn btn-primary" onclick="saveServiceV15(${isEdit ? `'${serviceId}'` : 'null'})">Sačuvaj</button>
      ${isEdit ? `<button class="btn btn-danger" style="margin-top:12px;" onclick="archiveServiceV15('${serviceId}')">Arhiviraj</button>` : ''}
    </div>`;
  openSheet(html);
  setTimeout(() => document.getElementById("svc-name")?.focus(), 350);
}

async function saveServiceV15(serviceId) {
  if (serviceId === 'null' || serviceId === 'undefined') serviceId = null;
  const name = document.getElementById("svc-name").value.trim();
  const price = Number(document.getElementById("svc-price").value);
  if (!name || isNaN(price) || price < 0) { toast("Proveri unos!", 'error'); return; }
  try {
    if (serviceId) {
      const { error } = await supabaseClient.from('services').update({ name, price }).eq('id', serviceId);
      if (error) throw error;
      toast("Usluga izmenjena", 'success');
    } else {
      const { error } = await supabaseClient.from('services').insert([{ user_id: currentUser.id, name, price }]);
      if (error) throw error;
      toast("Usluga dodata", 'success');
    }
    closeSheet();
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

async function archiveServiceV15(serviceId) {
  if (!confirm("Arhivirati ovu uslugu?")) return;
  try {
    const { error } = await supabaseClient.from('services').update({ is_archived: true }).eq('id', serviceId);
    if (error) throw error;
    closeSheet();
    toast("Usluga arhivirana", 'success');
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── DETALJ TERMINA ────────────────────────────────────────
function openAppointmentDetailV15(aptId) {
  const apt = allAppointments.find(a => a.id === aptId);
  if (!apt) return;
  const d = new Date(apt.date);
  const total = apt.service_lines.reduce((sum, s) => sum + Number(s.price_snapshot), 0);
  const servicesHtml = apt.service_lines.map(s => `<div class="detail-service-row"><span class="detail-service-name">${s.name_snapshot}</span><span class="detail-service-price">${formatMoney(s.price_snapshot)}</span></div>`).join("");

  let actionsHtml = "";
  if (apt.status === 'scheduled') {
    actionsHtml = `
      <button class="btn btn-success" onclick="openCompletionSheetV15('${apt.id}')">Završeno</button>
      <button class="btn btn-secondary" style="margin-top:12px;" onclick="sendReminder('${apt.id}')">Pošalji podsetnik</button>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn btn-secondary" onclick="openEditAppointment('${apt.id}')">Izmeni</button>
        <button class="btn btn-danger" onclick="cancelAppointmentV15('${apt.id}')">Otkaži</button>
      </div>`;
  } else if (apt.status === 'completed') {
    if (apt.payment_status === 'unpaid') {
      actionsHtml = `<div class="unpaid-card" style="margin-bottom:16px;"><div class="unpaid-header"><div class="unpaid-title">Čeka naplatu</div><div class="unpaid-total">${formatMoney(total)}</div></div></div>
        <button class="btn btn-success" onclick="markPaidV15('${apt.id}')">Označi kao plaćeno</button>`;
    } else {
      actionsHtml = `<div class="stat-box" style="background:var(--success-bg);box-shadow:none;text-align:center;padding:20px;"><div style="color:var(--success);font-weight:700;font-size:16px;">✓ Plaćeno</div></div>`;
    }
    actionsHtml += `<button class="btn btn-secondary" style="margin-top:12px;color:var(--danger);" onclick="deleteAppointmentV15('${apt.id}')">Obriši termin</button>`;
  } else if (apt.status === 'cancelled') {
    actionsHtml = `<div class="stat-box" style="background:var(--surface-2);box-shadow:none;text-align:center;padding:20px;"><div style="color:var(--text-2);font-weight:600;">Otkazano</div></div>
      <button class="btn btn-secondary" style="margin-top:12px;color:var(--danger);" onclick="deleteAppointmentV15('${apt.id}')">Obriši termin</button>`;
  }

  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">Termin</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <div class="detail-hero"><div class="detail-time">${formatTime(d)}</div><div class="detail-date">${capitalize(DAYS_LONG[d.getDay()])}, ${d.getDate()}. ${MONTHS[d.getMonth()]}</div></div>
      <div class="detail-client-card">
        <div class="avatar">${initials(apt.clients)}</div>
        <div class="detail-client-info"><div class="detail-client-name">${apt.clients ? `${apt.clients.first_name} ${apt.clients.last_name || ""}`.trim() : "Nepoznat"}</div></div>
      </div>
      <div class="detail-services">${servicesHtml}</div>
      <div class="detail-total"><span class="detail-total-label">Ukupno</span><span class="detail-total-value">${formatMoney(total)}</span></div>
      ${actionsHtml}
    </div>`;
  openSheet(html);
}

function sendReminder(aptId) {
  const apt = allAppointments.find(a => a.id === aptId);
  if (!apt) return;
  const client = apt.clients;
  const d = new Date(apt.date);
  const dateStr = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  const text = `${client.first_name}, tvoj termin:\n${dateStr}. u ${formatTime(d)}\nVidimo se! 💅`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => toast("Kopirano", 'success'));
  }
}

async function markPaidV15(aptId) {
  try {
    const { error } = await supabaseClient.from('appointments').update({ payment_status: 'paid' }).eq('id', aptId);
    if (error) throw error;
    closeSheet();
    toast("Plaćeno", 'success');
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

async function deleteAppointmentV15(aptId) {
  if (!confirm("Obrisati termin trajno?")) return;
  try {
    await supabaseClient.from('service_lines').delete().eq('appointment_id', aptId);
    const { error } = await supabaseClient.from('appointments').delete().eq('id', aptId);
    if (error) throw error;
    closeSheet();
    toast("Termin obrisan", 'success');
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

async function cancelAppointmentV15(aptId) {
  if (!confirm("Otkazati termin?")) return;
  try {
    const { error } = await supabaseClient.from('appointments').update({ status: 'cancelled' }).eq('id', aptId);
    if (error) throw error;
    closeSheet();
    toastUndo("Termin otkazan", async () => {
      await supabaseClient.from('appointments').update({ status: 'scheduled' }).eq('id', aptId);
      await loadData();
    });
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── ZAVRŠAVANJE ───────────────────────────────────────────
function openCompletionSheetV15(aptId) {
  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-body" style="padding-top:12px;">
      <div class="success-hero">
        <div class="success-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="success-title">Završeno</div>
        <div class="success-sub">Da li je plaćeno?</div>
      </div>
      <div class="payment-choice">
        <button class="payment-btn paid" onclick="completeAppointmentV15('${aptId}', 'paid')">
          <svg class="payment-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
          <div class="payment-btn-label">Plaćeno</div>
        </button>
        <button class="payment-btn unpaid" onclick="completeAppointmentV15('${aptId}', 'unpaid')">
          <svg class="payment-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div class="payment-btn-label">Nije plaćeno</div>
        </button>
      </div>
      <button class="btn btn-secondary" style="margin-top:16px;" onclick="closeSheet()">Otkaži</button>
    </div>`;
  openSheet(html);
}

async function completeAppointmentV15(aptId, paymentStatus) {
  try {
    const { error } = await supabaseClient.from('appointments').update({ status: 'completed', payment_status: paymentStatus }).eq('id', aptId);
    if (error) throw error;
    const apt = allAppointments.find(a => a.id === aptId);
    if (apt) { apt.status = 'completed'; apt.payment_status = paymentStatus; }
    closeSheet();
    await loadData();
    setTimeout(() => { openNextAppointmentPromptV15(aptId); }, 450);
  } catch (err) { console.error(err); toast("Greška pri završavanju: " + err.message, 'error'); }
}

// ─── PREDLOG SLEDEĆEG ──────────────────────────────────────
function openNextAppointmentPromptV15(aptId) {
  const apt = allAppointments.find(a => a.id === aptId);
  if (!apt || !apt.clients) { loadData(); return; }

  const daysToAdd = calculateSuggestedGap(apt.clients.id);
  const currentDate = new Date(apt.date);
  const suggestedDate = addDays(currentDate, daysToAdd);
  const lastTime = currentDate.getHours() * 60 + currentDate.getMinutes();
  suggestedDate.setHours(Math.floor(lastTime / 60), lastTime % 60, 0, 0);

  const dayStr = `${capitalize(DAYS_LONG[suggestedDate.getDay()])}, ${suggestedDate.getDate()}. ${MONTHS[suggestedDate.getMonth()]}`;
  const timeStr = formatTime(suggestedDate);
  const gapLabel = daysToAdd <= 7 ? `${daysToAdd} dana` : daysToAdd <= 30 ? `${Math.round(daysToAdd/7)} nedelje` : `${Math.round(daysToAdd/30)} meseca`;

  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-body" style="padding-top:12px;">
      <div class="success-hero">
        <div class="success-title" style="font-size:24px;">Sledeći termin?</div>
        <div class="success-sub">${apt.clients.first_name} obično dolazi na ${gapLabel}.</div>
      </div>
      <div class="next-card" style="margin-bottom:20px;">
        <div class="next-card-time">${timeStr}</div>
        <div class="next-card-date">${dayStr}</div>
      </div>
      <button class="btn btn-primary" onclick="confirmNextAppointmentV15('${apt.id}', ${suggestedDate.getTime()})">Zakaži</button>
      <button class="btn btn-secondary" style="margin-top:12px;" onclick="openNewAppointmentSheetV15('${apt.clients.id}')">Drugi termin</button>
      <button class="btn btn-secondary" style="margin-top:12px;background:transparent;color:var(--text-2);" onclick="closeSheet(); loadData();">Ne sada</button>
    </div>`;
  openSheet(html);
}

async function confirmNextAppointmentV15(aptId, timestamp) {
  const prevApt = allAppointments.find(a => a.id === aptId);
  if (!prevApt) return;
  try {
    const newDate = new Date(timestamp);
    const { data: apptData, error: apptError } = await supabaseClient.from('appointments').insert([{
      user_id: currentUser.id, client_id: prevApt.clients.id, date: newDate.toISOString(), status: 'scheduled', payment_status: 'unpaid'
    }]).select();
    if (apptError) throw apptError;

    const newApptId = apptData[0].id;
    const newLines = prevApt.service_lines.map(s => ({ appointment_id: newApptId, name_snapshot: s.name_snapshot, price_snapshot: s.price_snapshot }));
    const { error: lineError } = await supabaseClient.from('service_lines').insert(newLines);
    if (lineError) throw lineError;

    closeSheet();
    toast("Sledeći termin zakazan", 'success');
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── IZVOZ SLOBODNIH TERMINA ───────────────────────────────
function openExportSlotsSheetV15() {
  const today = new Date();
  const startStr = localDateStr(today);
  const endStr = localDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">Izvezi slobodne termine</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <div class="field-row" style="margin-bottom: 20px;">
        <div class="field"><label class="field-label">Od datuma</label><input type="date" class="field-input" id="export-start" value="${startStr}"></div>
        <div class="field"><label class="field-label">Do datuma</label><input type="date" class="field-input" id="export-end" value="${endStr}"></div>
      </div>
      <button class="btn btn-primary" onclick="generateSlotsTextV15()">Izračunaj i prikaži</button>
    </div>`;
  openSheet(html);
}

function generateSlotsTextV15() {
  const startInput = document.getElementById("export-start").value;
  const endInput = document.getElementById("export-end").value;
  if (!startInput || !endInput) { toast("Izaberi oba datuma", 'error'); return; }

  let current = new Date(startInput); current.setHours(0,0,0,0);
  const end = new Date(endInput); end.setHours(0,0,0,0);
  if (current > end) { toast("Datum 'Od' mora biti pre datuma 'Do'", 'error'); return; }

  let text = "";
  while (current <= end) {
    if (getDaySchedule(current) === 'off') { current.setDate(current.getDate() + 1); continue; }
    const workingSlots = getWorkingSlotsForDay(current);
    const booked = allAppointments.filter(a => a.status === 'scheduled' && sameDay(new Date(a.date), current))
      .map(a => { const d = new Date(a.date); return d.getHours() * 60 + d.getMinutes(); });
    const available = workingSlots.filter(m => !booked.includes(m));

    if (available.length > 0) {
      available.sort((a, b) => a - b);
      const formattedSlots = available.map(m => {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return min === 0 ? String(h).padStart(2, "0") : `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }).join(",");
      const dayStr = String(current.getDate()).padStart(2, "0");
      const monthStr = String(current.getMonth() + 1).padStart(2, "0");
      text += `${dayStr}.${monthStr}–${formattedSlots}\n`;
    }
    current.setDate(current.getDate() + 1);
  }
  if (text === "") text = "Nema slobodnih termina u izabranom periodu.";

  const resultHtml = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">Rezultat</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <textarea id="slots-text" readonly style="width:100%; height:300px; padding:12px; border-radius:12px; background:var(--surface-2); border:none; font-family:monospace; font-size:15px; line-height:1.5; margin-bottom:16px; color:var(--text);">${text.trim()}</textarea>
      <div class="btn-row">
        <button class="btn btn-secondary" onclick="openExportSlotsSheetV15()">Nazad</button>
        <button class="btn btn-primary" onclick="copySlotsTextV15()">Kopiraj tekst</button>
      </div>
    </div>`;
  openSheet(resultHtml);
}

function copySlotsTextV15() {
  const text = document.getElementById("slots-text").value;
  navigator.clipboard.writeText(text).then(() => { toast("Kopirano!", 'success'); closeSheet(); });
}

function exportBackupV15() {
  const backup = {
    exported_at: new Date().toISOString(), app_version: '1.5',
    profile: currentProfile, clients: allClients, services: allServices,
    appointments: allAppointments, settings: currentSettings, day_schedules: allDaySchedules,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noktia-backup-${localDateStr(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Kopija preuzeta", 'success');
}

// ─── NOVA KLIJENTKINJA ─────────────────────────────────────
function openNewClientSheetV15(returnToAppt = false) {
  window._newClientReturnToAppt = returnToAppt;
  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">Nova klijentkinja</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <div class="field-row">
        <div class="field"><label class="field-label">Ime</label><input class="field-input" id="new-client-first" type="text" autocomplete="off"></div>
        <div class="field"><label class="field-label">Prezime</label><input class="field-input" id="new-client-last" type="text" autocomplete="off"></div>
      </div>
      <div class="field"><label class="field-label">Telefon (opciono)</label><input class="field-input" id="new-client-phone" type="tel" autocomplete="off"></div>
      <button class="btn btn-primary" onclick="saveNewClientV15()">Sačuvaj</button>
    </div>`;
  openSheet(html);
  setTimeout(() => document.getElementById("new-client-first")?.focus(), 350);
}

async function saveNewClientV15() {
  const firstName = document.getElementById("new-client-first").value.trim();
  const lastName = document.getElementById("new-client-last").value.trim();
  const phone = document.getElementById("new-client-phone").value.trim();
  if (!firstName) { toast("Unesi ime!", 'error'); return; }

  try {
    const { data, error } = await supabaseClient.from('clients').insert([{ user_id: currentUser.id, first_name: firstName, last_name: lastName, phone }]).select();
    if (error) throw error;
    if (data && data.length > 0) {
      allClients.push(data[0]);
      allClients.sort((a, b) => a.first_name.localeCompare(b.first_name));

      if (window._newClientReturnToAppt && newApptState) {
        newApptState.clientId = data[0].id;
        newApptState.services = [];
        newApptState.step = 'services';
        newApptClientSearch = "";
        window._newClientReturnToAppt = false;
        closeSheet();
        setTimeout(() => renderNewAppointmentSheetV15(), 450);
      } else {
        closeSheet();
        toast("Klijentkinja dodata", 'success');
        renderClientsV15();
      }
    }
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── IZMENA KLIJENTKINJE ───────────────────────────────────
function openEditClientSheetV15() {
  const client = allClients.find(c => c.id === activeClientId);
  if (!client) return;
  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">Izmeni</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">
      <div class="field-row">
        <div class="field"><label class="field-label">Ime</label><input class="field-input" id="edit-first" type="text" value="${client.first_name}"></div>
        <div class="field"><label class="field-label">Prezime</label><input class="field-input" id="edit-last" type="text" value="${client.last_name || ""}"></div>
      </div>
      <div class="field"><label class="field-label">Telefon</label><input class="field-input" id="edit-phone" type="tel" value="${client.phone || ""}"></div>
      <div class="field"><label class="field-label">Napomena</label><input class="field-input" id="edit-note" type="text" value="${client.note || ""}"></div>
      <button class="btn btn-primary" onclick="saveEditClientV15()">Sačuvaj</button>
      <button class="btn btn-danger" style="margin-top:12px;" onclick="deleteClientV15()">Obriši klijentkinju</button>
    </div>`;
  openSheet(html);
}

async function saveEditClientV15() {
  const first = document.getElementById("edit-first").value.trim();
  const last = document.getElementById("edit-last").value.trim();
  const phone = document.getElementById("edit-phone").value.trim();
  const note = document.getElementById("edit-note").value.trim();
  if (!first) { toast("Unesi ime", 'error'); return; }
  try {
    const { error } = await supabaseClient.from('clients').update({ first_name: first, last_name: last, phone, note }).eq('id', activeClientId);
    if (error) throw error;
    closeSheet();
    toast("Sačuvano", 'success');
    await loadData();
    renderClientProfileV15(activeClientId);
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

async function deleteClientV15() {
  if (!confirm("Obrisati klijentkinju? Brišu se i svi njeni termini.")) return;
  try {
    const aptIds = allAppointments.filter(a => a.clients?.id === activeClientId).map(a => a.id);
    if (aptIds.length > 0) {
      await supabaseClient.from('service_lines').delete().in('appointment_id', aptIds);
      await supabaseClient.from('appointments').delete().in('id', aptIds);
    }
    const { error } = await supabaseClient.from('clients').delete().eq('id', activeClientId);
    if (error) throw error;
    closeSheet();
    activeClientId = null;
    toast("Klijentkinja obrisana", 'success');
    showScreen("clients");
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── NOVI TERMIN (V1.0 FLOW) ──────────────────────────────
function openNewAppointmentSheetV15(preselectClientId = null) {
  const baseDate = selectedDate ? startOfDay(selectedDate) : startOfDay(new Date());
  newApptState = {
    mode: 'new', editingId: null,
    clientId: preselectClientId,
    date: null, time: null, services: [],
    step: 'calendar',
    displayedMonth: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
    pickedHours: [],
    fromProfile: !!preselectClientId,
  };
  newApptClientSearch = "";
  renderNewAppointmentSheetV15();
}

function openEditAppointment(aptId) {
  const apt = allAppointments.find(a => a.id === aptId);
  if (!apt) return;
  if (apt.status !== 'scheduled') { toast("Ne može da se menja završen ili otkazan termin", 'error'); return; }
  const d = new Date(apt.date);
  const minutes = d.getHours() * 60 + d.getMinutes();
  newApptState = {
    mode: 'edit', editingId: aptId,
    clientId: apt.clients?.id,
    date: startOfDay(d), time: minutes,
    services: apt.service_lines.map(sl => ({ id: null, name: sl.name_snapshot, price: Number(sl.price_snapshot) })),
    step: 'time',
    displayedMonth: new Date(d.getFullYear(), d.getMonth(), 1),
    pickedHours: [],
    fromProfile: false,
  };
  newApptClientSearch = "";
  closeSheet();
  setTimeout(() => renderNewAppointmentSheetV15(), 500);
}

function renderNewAppointmentSheetV15() {
  const s = newApptState;
  if (!s) return;

  const isEdit = s.mode === 'edit';

  let html = `<div class="sheet-grabber"></div>
    <div class="sheet-header"><div class="sheet-title">${isEdit ? "Izmeni termin" : "Novi termin"}</div>
      <button class="sheet-close" onclick="closeSheet()">×</button>
    </div>
    <div class="sheet-body">`;

  // Badges
  const badges = [];
  if (s.date) badges.push({ text: `${capitalize(DAYS_LONG[s.date.getDay()])}, ${s.date.getDate()}. ${MONTHS_SHORT[s.date.getMonth()]}`, action: 'newAppt_changeDate' });
  if (s.time !== null) badges.push({ text: formatMinutes(s.time), action: 'newAppt_changeTime' });
  if (s.clientId) {
    const c = allClients.find(x => x.id === s.clientId);
    if (c) badges.push({ text: c.first_name, action: 'newAppt_changeClient' });
  }
  if (badges.length > 0) {
    html += '<div class="picked-row">';
    badges.forEach(b => { html += `<div class="picked-badge">${b.text}<button onclick="${b.action}()">Promeni</button></div>`; });
    html += '</div>';
  }

  // Step content
  let stepHtml = '';
  if (s.step === 'calendar') stepHtml = renderCalendarStepInAppt();
  else if (s.step === 'ask-schedule') stepHtml = renderAskScheduleStep();
  else if (s.step === 'day-off') stepHtml = renderDayOffStep();
  else if (s.step === 'pick-hours') stepHtml = renderPickHoursStepInAppt();
  else if (s.step === 'time') stepHtml = renderTimeGridStep();
  else if (s.step === 'client') stepHtml = renderClientPickerStep();
  else if (s.step === 'services') stepHtml = renderServicePickerStep();

  html += stepHtml + '</div>';
  openSheet(html);
}

// ─── KORAK: KALENDAR ───────────────────────────────────────
function renderCalendarStepInAppt() {
  return renderCalendarGrid({
    displayedMonth: newApptState.displayedMonth,
    selectedDate: newApptState.date,
    onPrevMonth: 'calendarPrevMonth',
    onNextMonth: 'calendarNextMonth',
    onPickDay: 'calendarPickDay',
    disablePast: true,
  });
}

function calendarPrevMonth() { const m = newApptState.displayedMonth; newApptState.displayedMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderNewAppointmentSheetV15(); }
function calendarNextMonth() { const m = newApptState.displayedMonth; newApptState.displayedMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderNewAppointmentSheetV15(); }

function calendarPickDay(ts) {
  const s = newApptState;
  const day = startOfDay(new Date(ts));
  s.date = day;
  s.time = null;
  s.services = [];

  const schedule = getDaySchedule(day);
  if (schedule === null) s.step = 'ask-schedule';
  else if (schedule === 'off') s.step = 'day-off';
  else s.step = 'time';
  renderNewAppointmentSheetV15();
}

// ─── KORAK: RADIŠ LI OVAJ DAN? ─────────────────────────────
function renderAskScheduleStep() {
  const s = newApptState;
  const dayLabel = `${capitalize(DAYS_LONG[s.date.getDay()])}, ${s.date.getDate()}. ${MONTHS[s.date.getMonth()]}`;
  return `<div style="text-align:center; padding: 20px 0;">
    <div style="font-size:13px; color:var(--text-2); margin-bottom:6px;">${dayLabel}</div>
    <div style="font-size:22px; font-weight:700; letter-spacing:-.4px; margin-bottom:24px;">Radiš li ovaj dan?</div>
    <button class="btn btn-primary" onclick="schedulePickAll()" style="margin-bottom:10px;">Ceo dan (${String(currentSettings.work_start).padStart(2,"0")}–${String(currentSettings.work_end).padStart(2,"0")}h)</button>
    <button class="btn btn-secondary" onclick="schedulePickSome()" style="margin-bottom:10px;">Samo neki sati</button>
    <button class="btn btn-secondary" onclick="schedulePickOff()">Ne radim</button>
  </div>`;
}

async function schedulePickAll() {
  const s = newApptState;
  const ok = await saveDaySchedule(s.date, 'all');
  if (!ok) return;
  s.step = 'time';
  renderNewAppointmentSheetV15();
}

function schedulePickSome() {
  const s = newApptState;
  s.pickedHours = [];
  for (let m = currentSettings.work_start * 60; m < currentSettings.work_end * 60; m += 30) s.pickedHours.push(m);
  s.step = 'pick-hours';
  renderNewAppointmentSheetV15();
}

async function schedulePickOff() {
  const s = newApptState;
  const conflicts = allAppointments.filter(a => a.status === 'scheduled' && sameDay(new Date(a.date), s.date));
  if (conflicts.length > 0 && !confirm(`Imaš ${conflicts.length} ${conflicts.length === 1 ? "zakazan termin" : "zakazana termina"} tog dana. Označiti kao neradan ipak?`)) return;
  const ok = await saveDaySchedule(s.date, 'off');
  if (!ok) return;
  s.step = 'day-off';
  renderNewAppointmentSheetV15();
}

// ─── KORAK: NE RADIM ───────────────────────────────────────
function renderDayOffStep() {
  const s = newApptState;
  const dayLabel = `${capitalize(DAYS_LONG[s.date.getDay()])}, ${s.date.getDate()}. ${MONTHS[s.date.getMonth()]}`;
  return `<div style="text-align:center; padding: 30px 20px;">
    <div style="font-size:56px; margin-bottom:12px;">🚫</div>
    <div style="font-size:20px; font-weight:700; margin-bottom:6px;">Ne radiš ovaj dan</div>
    <div style="font-size:14px; color:var(--text-2); margin-bottom:24px;">${dayLabel}</div>
    <button class="btn btn-secondary" onclick="dayOffChange()">Ipak radiš</button>
  </div>`;
}

async function dayOffChange() {
  const s = newApptState;
  const ok = await saveDaySchedule(s.date, null);
  if (!ok) return;
  s.step = 'ask-schedule';
  renderNewAppointmentSheetV15();
}

// ─── KORAK: PICK HOURS ─────────────────────────────────────
function renderPickHoursStepInAppt() {
  const s = newApptState;
  const start = currentSettings.work_start * 60;
  const end = currentSettings.work_end * 60;
  let grid = '';
  for (let m = start; m < end; m += 30) {
    const sel = s.pickedHours.includes(m);
    grid += `<button class="time-chip ${sel ? 'selected' : ''}" onclick="togglePickedHourInAppt(${m})">${formatMinutes(m)}</button>`;
  }
  const count = s.pickedHours.length;
  const label = count === 0 ? "Ništa nije označeno" : `${count} ${count === 1 ? "sat" : count <= 4 ? "sata" : "sati"}`;
  return `<div class="sheet-section">
    <div class="sheet-section-label">Označi sate koje radiš</div>
    <div class="time-grid">${grid}</div>
  </div>
  <div style="display:flex;justify-content:space-between;padding:14px 4px;border-top:1px solid var(--border, #e5e5e5);margin-top:14px;">
    <span style="font-weight:600;">Označeno</span>
    <span style="font-weight:700;">${label}</span>
  </div>
  <button class="btn btn-primary" style="margin-top:16px;" onclick="savePickedHoursInAppt()">Sačuvaj</button>`;
}

function togglePickedHourInAppt(m) {
  const s = newApptState;
  const idx = s.pickedHours.indexOf(m);
  if (idx >= 0) s.pickedHours.splice(idx, 1);
  else s.pickedHours.push(m);
  renderNewAppointmentSheetV15();
}

async function savePickedHoursInAppt() {
  const s = newApptState;
  if (s.pickedHours.length === 0) { toast("Označi bar jedan sat", 'error'); return; }
  const sorted = [...s.pickedHours].sort((a, b) => a - b);
  const ok = await saveDaySchedule(s.date, sorted);
  if (!ok) return;
  s.step = 'time';
  renderNewAppointmentSheetV15();
}

function editDayScheduleFromCurrent() {
  const s = newApptState;
  const existing = allDaySchedules[localDateStr(s.date)];
  if (Array.isArray(existing)) s.pickedHours = [...existing];
  else if (existing === 'off') s.pickedHours = [];
  else {
    s.pickedHours = [];
    for (let m = currentSettings.work_start * 60; m < currentSettings.work_end * 60; m += 30) s.pickedHours.push(m);
  }
  s.step = 'pick-hours';
  renderNewAppointmentSheetV15();
}

// ─── KORAK: TIME ───────────────────────────────────────────
function renderTimeGridStep() {
  const s = newApptState;
  const schedule = getDaySchedule(s.date);

  if (schedule === 'off') {
    return `<div style="padding:24px 12px;text-align:center;color:var(--text-2);font-size:14px;">
      Ne radiš ovaj dan.
      <div style="margin-top:10px;"><button style="font-size:13px;font-weight:700;color:var(--info, #2563eb);" onclick="openDayScheduleSheet(new Date('${localDateStr(s.date)}T12:00:00'))">Podesi sate</button></div>
    </div>`;
  }

  const workingHours = getWorkingSlotsForDay(s.date);
  const dayAppts = allAppointments.filter(a => a.status === 'scheduled' && sameDay(new Date(a.date), s.date) && a.id !== s.editingId);
  const bookedMinutes = dayAppts.map(a => { const dt = new Date(a.date); return dt.getHours() * 60 + dt.getMinutes(); });

  let html = '';

  // Hint: Radiš ...
  if (Array.isArray(schedule)) {
    const times = schedule.map(formatMinutes).join(", ");
    html += `<div style="font-size:13px; color:var(--success); margin-bottom:10px; padding-left:4px; font-weight:600;">Radiš: ${times}</div>`;
  } else {
    html += `<div style="font-size:13px; color:var(--success); margin-bottom:10px; padding-left:4px; font-weight:600;">Radiš ceo dan (${String(currentSettings.work_start).padStart(2,"0")}–${String(currentSettings.work_end).padStart(2,"0")}h)</div>`;
  }

  html += `<div style="text-align:right; margin-bottom:10px;"><button style="font-size:13px; font-weight:700; color:var(--info, #2563eb); padding:4px 8px;" onclick="editDayScheduleFromCurrent()">Podesi sate</button></div>`;

  const hasFree = workingHours.some(m => !bookedMinutes.includes(m));
  if (!hasFree) {
    return html + `<div style="text-align:center; padding:20px; color:var(--text-2);">Nema slobodnih sati za ovaj dan.</div>`;
  }

  html += `<div class="sheet-section"><div class="sheet-section-label">U koliko</div><div class="time-grid">`;
  workingHours.forEach(m => {
    const isBusy = bookedMinutes.includes(m);
    const sel = s.time === m;
    const t = formatMinutes(m);
    if (isBusy) html += `<button class="time-chip busy" disabled>${t}</button>`;
    else html += `<button class="time-chip ${sel ? 'selected' : ''}" onclick="newApptPickTime(${m})">${t}</button>`;
  });
  html += `</div></div>`;
  return html;
}

function newApptPickTime(m) {
  const s = newApptState;
  if (s.time === m && s.step === 'time') {
    s.step = s.clientId ? 'services' : 'client';
    renderNewAppointmentSheetV15();
    return;
  }
  s.time = m;
  if (s.mode !== 'edit') s.services = [];
  s.step = s.clientId ? 'services' : 'client';
  renderNewAppointmentSheetV15();
}

// ─── KORAK: CLIENT ─────────────────────────────────────────
function renderClientPickerStep() {
  const q = newApptClientSearch.toLowerCase().trim();
  const filtered = q
    ? allClients.filter(c => !c.is_archived && `${c.first_name} ${c.last_name || ''}`.toLowerCase().includes(q))
    : allClients.filter(c => !c.is_archived);

  let html = `<div style="position:relative;margin-bottom:12px;">
    <svg style="position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--text-3);pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="text" id="newappt-client-search" placeholder="Pretraži klijentkinje..." value="${newApptClientSearch}" oninput="onNewApptClientSearch(this.value)" autocomplete="off" style="width:100%;padding:12px 16px 12px 42px;background:var(--surface-2);border-radius:12px;font-size:16px;border:none;outline:none;color:inherit;">
  </div>`;

  if (filtered.length > 0) {
    html += '<div class="chip-grid" style="max-height:220px;overflow-y:auto;">';
    filtered.forEach(c => { html += `<button class="chip" onclick="newApptPickClient('${c.id}')">${c.first_name} ${c.last_name || ""}</button>`; });
    html += '</div>';
  } else if (q) {
    html += '<div style="text-align:center;padding:12px;color:var(--text-2);font-size:14px;">Nema rezultata</div>';
  }

  html += '<div style="margin-top:14px;"><button class="btn btn-secondary" onclick="openNewClientSheetV15(true)">+ Nova klijentkinja</button></div>';
  return html;
}

function onNewApptClientSearch(value) {
  newApptClientSearch = value;
  renderNewAppointmentSheetV15();
  requestAnimationFrame(() => {
    const input = document.getElementById("newappt-client-search");
    if (input) { input.focus(); const len = input.value.length; input.setSelectionRange(len, len); }
  });
}

function newApptPickClient(id) {
  const s = newApptState;
  s.clientId = id;
  if (s.mode !== 'edit') s.services = [];
  s.step = 'services';
  renderNewAppointmentSheetV15();
}

// ─── KORAK: SERVICES ───────────────────────────────────────
function renderServicePickerStep() {
  const s = newApptState;
  let html = `<div class="sheet-section"><div class="sheet-section-label">Usluge</div><div class="chip-grid">`;
  allServices.forEach(svc => {
    const sel = s.services.some(x => x.name === svc.name);
    html += `<button class="chip ${sel ? 'selected' : ''}" onclick="newApptToggleService('${svc.id}')">${svc.name} <span class="chip-sub">${formatMoney(svc.price)}</span></button>`;
  });
  html += '</div>';

  if (s.services.length > 0) {
    const total = s.services.reduce((sum, x) => sum + x.price, 0);
    html += `<div style="display:flex;justify-content:space-between;padding:14px 4px;border-top:1px solid var(--border, #e5e5e5);margin-top:14px;">
      <span style="font-weight:600;">Ukupno</span>
      <span style="font-weight:700;">${formatMoney(total)}</span>
    </div>`;
  }
  html += '</div>';

  if (s.services.length > 0) {
    html += `<button class="btn btn-primary" style="margin-top:20px;" onclick="saveNewAppointment()">${s.mode === 'edit' ? 'Sačuvaj izmene' : 'Zakaži termin'}</button>`;
  }
  return html;
}

function newApptToggleService(id) {
  const svc = allServices.find(x => x.id === id);
  if (!svc) return;
  const idx = newApptState.services.findIndex(x => x.name === svc.name);
  if (idx >= 0) newApptState.services.splice(idx, 1);
  else newApptState.services.push({ id: svc.id, name: svc.name, price: svc.price });
  renderNewAppointmentSheetV15();
}

// ─── CHANGE BADGES ─────────────────────────────────────────
function newAppt_changeDate() {
  const s = newApptState;
  s.step = 'calendar';
  s.time = null;
  s.services = [];
  renderNewAppointmentSheetV15();
}

function newAppt_changeTime() {
  const s = newApptState;
  s.step = 'time';
  if (s.mode !== 'edit') s.services = [];
  renderNewAppointmentSheetV15();
}

function newAppt_changeClient() {
  const s = newApptState;
  s.step = 'client';
  if (s.mode !== 'edit') s.services = [];
  newApptClientSearch = "";
  renderNewAppointmentSheetV15();
}

// ─── SAVE / CONFLICT ───────────────────────────────────────
function saveNewAppointment() {
  const s = newApptState;
  if (!s.clientId || s.time === null || s.services.length === 0 || !s.date) return;

  const conflict = allAppointments.find(a => {
    if (a.status !== 'scheduled') return false;
    if (s.mode === 'edit' && a.id === s.editingId) return false;
    const d = new Date(a.date);
    return sameDay(d, s.date) && (d.getHours() * 60 + d.getMinutes()) === s.time;
  });

  if (conflict) {
    const otherClient = allClients.find(c => c.id === conflict.clients?.id);
    const newClient = allClients.find(c => c.id === s.clientId);
    openOverlapWarning(otherClient, newClient, commitAppointment);
    return;
  }
  commitAppointment();
}

function openOverlapWarning(otherClient, newClient, onConfirm) {
  const timeStr = formatMinutes(newApptState.time);
  const otherName = otherClient ? `${otherClient.first_name} ${otherClient.last_name || ''}`.trim() : 'Neka klijentkinja';
  const newName = newClient ? newClient.first_name : 'klijentkinju';
  const html = `<div class="sheet-grabber"></div>
    <div class="sheet-body" style="padding-top:16px;">
      <div style="text-align:center;font-size:48px;margin-bottom:12px;">⚠️</div>
      <div style="text-align:center;font-size:20px;font-weight:700;margin-bottom:8px;">Već imaš termin</div>
      <div style="text-align:center;color:var(--text-2);font-size:15px;line-height:1.5;margin-bottom:24px;">
        <strong>${otherName}</strong> već ima termin u <strong>${timeStr}</strong>.<br><br>
        Sigurno želiš da zakažeš <strong>${newName}</strong> u isto vreme?
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" onclick="closeSheet()">Promeni vreme</button>
        <button class="btn btn-primary" onclick="window._overlapConfirm()">Zakaži</button>
      </div>
    </div>`;
  window._overlapConfirm = () => { onConfirm(); window._overlapConfirm = null; };
  openSheet(html);
}

async function commitAppointment() {
  const s = newApptState;
  try {
    const dateObj = new Date(s.date);
    dateObj.setHours(Math.floor(s.time / 60), s.time % 60, 0, 0);
    const isoDate = dateObj.toISOString();

    if (s.mode === 'edit' && s.editingId) {
      const { error } = await supabaseClient.from('appointments').update({ client_id: s.clientId, date: isoDate }).eq('id', s.editingId);
      if (error) throw error;
      await supabaseClient.from('service_lines').delete().eq('appointment_id', s.editingId);
      const lines = s.services.map(sv => ({ appointment_id: s.editingId, name_snapshot: sv.name, price_snapshot: sv.price }));
      const { error: lineErr } = await supabaseClient.from('service_lines').insert(lines);
      if (lineErr) throw lineErr;
      closeSheet();
      toast("Izmena sačuvana", 'success');
    } else {
      const { data: apptData, error: apptError } = await supabaseClient.from('appointments').insert([{
        user_id: currentUser.id, client_id: s.clientId, date: isoDate, status: 'scheduled', payment_status: 'unpaid'
      }]).select();
      if (apptError) throw apptError;

      const newApptId = apptData[0].id;
      const lines = s.services.map(sv => ({ appointment_id: newApptId, name_snapshot: sv.name, price_snapshot: sv.price }));
      const { error: lineErr } = await supabaseClient.from('service_lines').insert(lines);
      if (lineErr) throw lineErr;
      closeSheet();
      toast("Termin zakazan", 'success');
    }
    await loadData();
  } catch (err) { toast("Greška: " + err.message, 'error'); }
}

// ─── SHEET SISTEM ──────────────────────────────────────────
function openSheet(html) {
  sheetVersion++;
  const container = document.getElementById("sheet-container");
  const overlay = document.getElementById("sheet-overlay");
  container.innerHTML = `<div class="sheet">${html}</div>`;
  requestAnimationFrame(() => { overlay.classList.add("visible"); container.classList.add("visible"); });
  overlay.onclick = () => closeSheet();
}

function closeSheet() {
  const container = document.getElementById("sheet-container");
  const overlay = document.getElementById("sheet-overlay");
  const myVersion = sheetVersion;
  overlay.classList.remove("visible");
  container.classList.remove("visible");
  setTimeout(() => { if (sheetVersion === myVersion) container.innerHTML = ""; }, 400);
}

// ─── LOGIN / LOGOUT ────────────────────────────────────────
async function loginWithGoogle() {
  await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/index.html' }
  });
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.reload();
}

// ─── START ─────────────────────────────────────────────────
window.onload = initApp;
