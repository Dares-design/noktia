// ============================================================
// NOKIA MIGRACIJA — V1 → V1.5
// Pokretanje: node migrate.js
// 1. Prvo DRY_RUN = true → proveri brojeve
// 2. Onda DRY_RUN = false → stvarna migracija
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ═══════════════ PODESI OVO ═══════════════
const SUPABASE_URL = 'https://vhpuowhgewekklbvtfie.supabase.co';
const SUPABASE_SERVICE_KEY = 'TVOJ-SERVICE-ROLE-KLJUC'; // Project Settings → API → service_role
const JELENA_USER_ID = 'UUID-IZ-auth.users';           // Authentication → Users → kopiraj UID
const JSON_FILE = './noktia-backup-2026-10-24 (5).json';
const DRY_RUN = true;  // ⚠️ PRVO true!
// ═══════════════════════════════════════════

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));

// ─── Pomoćne ────────────────────────────────────────────────
const isPlaceholder = (c) =>
  c.firstName === 'Slobodan' && c.lastName === 'Termin';

function localDateStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}

function formatMinutes(m) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

const clientIdMap = {}; // stari clientId → novi UUID

const log = {
  clientsOk: 0, clientsFail: 0,
  servicesOk: 0, servicesFail: 0,
  apptsOk: 0, apptsFail: 0,
  linesOk: 0, linesFail: 0,
  schedulesOk: 0, schedulesFail: 0,
  settingsOk: false,
};

// ─── 1. KLIJENTI ────────────────────────────────────────────
async function migrateClients() {
  const realClients = data.clients.filter(c => !isPlaceholder(c));
  const skipped = data.clients.length - realClients.length;
  console.log(`👥 Klijenti: ${realClients.length} za migraciju, ${skipped} placeholder preskočeno`);

  for (const c of realClients) {
    const row = {
      user_id: JELENA_USER_ID,
      first_name: c.firstName || '',
      last_name: c.lastName || '',
      phone: c.phone?.trim() || null,
      note: c.note?.trim() || null,
    };

    if (DRY_RUN) {
      clientIdMap[c.id] = `DRY_${c.id}`;
      log.clientsOk++;
      continue;
    }

    const { data: ins, error } = await supabase
      .from('clients').insert(row).select('id').single();

    if (error) {
      console.error(`  ❌ ${c.firstName} ${c.lastName}: ${error.message}`);
      log.clientsFail++;
      continue;
    }
    clientIdMap[c.id] = ins.id;
    log.clientsOk++;
  }
  console.log(`  ✅ ${log.clientsOk} ok, ${log.clientsFail} fail\n`);
}

// ─── 2. USLUGE ──────────────────────────────────────────────
async function migrateServices() {
  console.log(`💅 Usluge: ${data.services.length}`);
  for (const s of data.services) {
    const row = {
      user_id: JELENA_USER_ID,
      name: s.name,
      price: s.price,
      is_archived: !!s.isArchived,
    };

    if (DRY_RUN) { log.servicesOk++; continue; }

    const { error } = await supabase.from('services').insert(row);
    if (error) { console.error(`  ❌ ${s.name}: ${error.message}`); log.servicesFail++; }
    else log.servicesOk++;
  }
  console.log(`  ✅ ${log.servicesOk} ok, ${log.servicesFail} fail\n`);
}

// ─── 3. TERMINI + SERVICE_LINES ─────────────────────────────
async function migrateAppointments() {
  const fakeIds = new Set(data.clients.filter(isPlaceholder).map(c => c.id));
  const realAppts = data.appointments.filter(a => !fakeIds.has(a.clientId));

  const byStatus = {};
  realAppts.forEach(a => byStatus[a.status] = (byStatus[a.status] || 0) + 1);

  console.log(`📅 Termini: ${realAppts.length} za migraciju, ${data.appointments.length - realAppts.length} fake preskočeno`);
  console.log(`  Statusi:`, byStatus);

  for (const a of realAppts) {
    const newClientId = clientIdMap[a.clientId];
    if (!newClientId) {
      console.warn(`  ⚠️  Termin ${a.id}: klijent ${a.clientId} nije mapiran`);
      log.apptsFail++;
      continue;
    }

    if (DRY_RUN) {
      log.apptsOk++;
      log.linesOk += (a.services?.length || 0);
      continue;
    }

    const { data: ins, error } = await supabase.from('appointments').insert({
      user_id: JELENA_USER_ID,
      client_id: newClientId,
      date: a.date,           // ISO string — direktno
      status: a.status,
      payment_status: a.paymentStatus,
    }).select('id').single();

    if (error) {
      console.error(`  ❌ Termin ${a.id}: ${error.message}`);
      log.apptsFail++;
      continue;
    }
    log.apptsOk++;

    // service_lines (BEZ user_id — RLS radi kroz JOIN)
    if (a.services && a.services.length > 0) {
      const lines = a.services.map(s => ({
        appointment_id: ins.id,
        name_snapshot: s.name,
        price_snapshot: s.price,
      }));
      const { error: lineErr } = await supabase.from('service_lines').insert(lines);
      if (lineErr) { console.error(`  ⚠️  Lines ${a.id}: ${lineErr.message}`); log.linesFail += lines.length; }
      else log.linesOk += lines.length;
    }
  }
  console.log(`  ✅ Termini: ${log.apptsOk} ok, ${log.apptsFail} fail`);
  console.log(`  ✅ Service lines: ${log.linesOk} ok, ${log.linesFail} fail\n`);
}

// ─── 4. USER_SETTINGS ───────────────────────────────────────
async function migrateSettings() {
  console.log(`⚙️  Radno vreme: ${data.settings.workStart}:00 – ${data.settings.workEnd}:00`);
  if (DRY_RUN) { console.log(`  (dry run)\n`); log.settingsOk = true; return; }

  const { error } = await supabase.from('user_settings').upsert({
    user_id: JELENA_USER_ID,
    work_start: data.settings.workStart,
    work_end: data.settings.workEnd,
  });
  if (error) { console.error(`  ❌ ${error.message}`); }
  else { console.log(`  ✅ Sačuvano\n`); log.settingsOk = true; }
}

// ─── 5. DAY_SCHEDULES (fake termini → raspored) ─────────────
async function migrateDaySchedules() {
  const fakeIds = new Set(data.clients.filter(isPlaceholder).map(c => c.id));
  const scheduledFakes = data.appointments.filter(a =>
    fakeIds.has(a.clientId) && a.status === 'scheduled'
  );

  // Grupisanje po danu
  const byDay = {};
  scheduledFakes.forEach(a => {
    const d = new Date(a.date);
    const key = localDateStr(d);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(d.getHours() * 60 + d.getMinutes());
  });

  // Sortiraj sate unutar svakog dana
  Object.values(byDay).forEach(slots => slots.sort((a, b) => a - b));

  const dayCount = Object.keys(byDay).length;
  console.log(`🗓️  Raspored: ${dayCount} dana, ${scheduledFakes.length} sati`);

  if (DRY_RUN) {
    console.log(`  Primer (prvih 3 dana):`);
    Object.entries(byDay).sort().slice(0, 3).forEach(([date, hours]) => {
      console.log(`    ${date}: ${hours.map(formatMinutes).join(', ')}`);
    });
    console.log(`  (dry run)\n`);
    log.schedulesOk = dayCount;
    return;
  }

  for (const [dateKey, hours] of Object.entries(byDay)) {
    const { error } = await supabase.from('day_schedules').insert({
      user_id: JELENA_USER_ID,
      date: dateKey,
      schedule: hours,   // JSONB array minuta
    });
    if (error) {
      console.error(`  ❌ ${dateKey}: ${error.message}`);
      log.schedulesFail++;
    } else {
      log.schedulesOk++;
    }
  }
  console.log(`  ✅ ${log.schedulesOk} dana, ${log.schedulesFail} fail\n`);
}

// ─── 6. BACKUP RASPOREDA U FAJL ─────────────────────────────
function writeScheduleReport() {
  const fakeIds = new Set(data.clients.filter(isPlaceholder).map(c => c.id));
  const scheduledFakes = data.appointments.filter(a =>
    fakeIds.has(a.clientId) && a.status === 'scheduled'
  );

  const byDay = {};
  scheduledFakes.forEach(a => {
    const d = new Date(a.date);
    const key = localDateStr(d);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(d.getHours() * 60 + d.getMinutes());
  });

  let report = '╔══════════════════════════════════════════════════╗\n';
  report +=   '║  JELENIN RASPORED — migriran u day_schedules    ║\n';
  report +=   '╚══════════════════════════════════════════════════╝\n\n';
  report += `Generisano: ${new Date().toLocaleString('sr-RS')}\n`;
  report += `Dana: ${Object.keys(byDay).length}\n`;
  report += `Ukupno sati: ${scheduledFakes.length}\n\n`;
  report += '─'.repeat(50) + '\n\n';

  Object.entries(byDay).sort().forEach(([dateKey, hours]) => {
    const d = new Date(dateKey + 'T12:00:00');
    const dayLabel = d.toLocaleDateString('sr-RS', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const times = hours.sort((a,b)=>a-b).map(formatMinutes).join(', ');
    report += `${dayLabel}\n  Radiš: ${times}\n\n`;
  });

  fs.writeFileSync('./jelena_raspored.txt', report, 'utf-8');
  console.log(`📄 Backup rasporeda: jelena_raspored.txt\n`);
}

// ─── MAIN ───────────────────────────────────────────────────
async function migrate() {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  ${DRY_RUN ? '🧪 DRY RUN — ništa se ne upisuje' : '🚀 LIVE MIGRACIJA'}`);
  console.log(`${'═'.repeat(55)}\n`);

  await migrateClients();
  await migrateServices();
  await migrateAppointments();
  await migrateSettings();
  await migrateDaySchedules();

  writeScheduleReport();

  console.log(`${'═'.repeat(55)}`);
  console.log(`📊 REZIME:`);
  console.log(`  Klijenti:       ${log.clientsOk} ok, ${log.clientsFail} fail`);
  console.log(`  Usluge:         ${log.servicesOk} ok, ${log.servicesFail} fail`);
  console.log(`  Termini:        ${log.apptsOk} ok, ${log.apptsFail} fail`);
  console.log(`  Service lines:  ${log.linesOk} ok, ${log.linesFail} fail`);
  console.log(`  Raspored dana:  ${log.schedulesOk} ok, ${log.schedulesFail} fail`);
  console.log(`  User settings:  ${log.settingsOk ? 'ok' : 'fail'}`);
  console.log(`${'═'.repeat(55)}\n`);

  if (DRY_RUN) {
    console.log(`✅ DRY RUN završen. Ako su brojevi OK:`);
    console.log(`   1. Postavi DRY_RUN = false u migrate.js`);
    console.log(`   2. Pokreni ponovo: node migrate.js`);
    console.log(`   3. Otvori aplikaciju kao Jelena i proveri\n`);
  } else {
    console.log(`🎉 MIGRACIJA ZAVRŠENA\n`);
    console.log(`Proveri u aplikaciji kao Jelena:`);
    console.log(`  ✓ Klijentkinje — treba ~72`);
    console.log(`  ✓ Cenovnik — treba 5 usluga`);
    console.log(`  ✓ Danas → odaberi 07.10.2026 → vidi 4 termina`);
    console.log(`  ✓ Podesi sate za taj dan → pokazuje 06:00, 12:00, 13:00, 14:00`);
    console.log(`  ✓ Zarada → ukupna naplata\n`);
  }
}

migrate().catch(err => {
  console.error('\n💥 GREŠKA:', err);
  process.exit(1);
});