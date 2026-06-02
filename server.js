const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data.json')
  : path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────────────────────────────

function readData() {
  if (!fs.existsSync(DATA_FILE)) return { requests: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { requests: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── webhook: Make.com → POST /webhook/party-request ──────────────────────────
//
// Make should send a JSON body with these fields (all strings):
//   name        — guest full name
//   email       — guest reply-to email
//   phone       — guest phone number (optional)
//   party_date  — desired party date, e.g. "Saturday June 14 2025"
//   guest_count — number of guests, e.g. "20"
//   message     — full message / notes from the email
//   received_at — ISO timestamp Make received the email (use {{1.date}})
//
// Map these in Make's HTTP module → Body → Raw JSON

app.post('/webhook/party-request', (req, res) => {
  const body = req.body;

  // Log what Make sends so you can debug during local testing
  console.log('\n📬 Webhook received:', JSON.stringify(body, null, 2));

  const {
    name,
    email,
    phone = '',
    party_date = '',
    guest_count = '',
    message = '',
    received_at,
  } = body;

  if (!name && !email) {
    console.warn('⚠️  Missing name and email — rejecting');
    return res.status(400).json({ error: 'name or email required' });
  }

  const db = readData();
// Duplicate check — skip if same email AND same received_at already exists
  const duplicate = db.requests.find(r => {
    const sameEmail = r.email && email && r.email.toLowerCase() === email.toLowerCase();
    const sameDate = r.received_at && received_at && r.received_at === received_at;
    return sameEmail && sameDate;
  });

  if (duplicate) {
    console.log(`⏭️  Duplicate skipped: ${email} (${received_at})`);
    return res.json({ ok: true, duplicate: true, id: duplicate.id });
  }
  const entry = {
    id: generateId(),
    status: 'new',          // new → pending → confirmed → past
    name: name || '(unknown)',
    email: email || '',
    phone,
    party_date,
    guest_count,
    message,
    received_at: received_at || new Date().toISOString(),
    notes: '',              // internal notes you add via the dashboard
    replied: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.requests.unshift(entry);
  writeData(db);

  console.log(`✅ Saved request ${entry.id} from ${entry.name}`);
  res.json({ ok: true, id: entry.id });
});

// ── API: list all requests ────────────────────────────────────────────────────
app.get('/api/requests', (req, res) => {
  const db = readData();
  res.json(db.requests);
});

// ── API: update a request (status, notes, replied) ───────────────────────────
app.patch('/api/requests/:id', (req, res) => {
  const db = readData();
  const idx = db.requests.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const allowed = ['status', 'notes', 'replied', 'party_date', 'guest_count', 'phone'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) db.requests[idx][k] = req.body[k];
  });
  db.requests[idx].updated_at = new Date().toISOString();

  writeData(db);
  res.json(db.requests[idx]);
});

// ── API: delete a request ─────────────────────────────────────────────────────
app.delete('/api/requests/:id', (req, res) => {
  const db = readData();
  db.requests = db.requests.filter(r => r.id !== req.params.id);
  writeData(db);
  res.json({ ok: true });
});

// ── Google Calendar deep-link for confirmed parties ───────────────────────────
// Returns a gcal "add event" URL — no OAuth needed, opens in browser
app.get('/api/requests/:id/calendar-link', (req, res) => {
  const db = readData();
  const r = db.requests.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });

  const title = encodeURIComponent(`🍕 Party: ${r.name} (${r.guest_count || '?'} guests)`);
  const details = encodeURIComponent(
    `Email: ${r.email}\nPhone: ${r.phone}\nNotes: ${r.notes}\n\nOriginal message:\n${r.message}`
  );
  const location = encodeURIComponent('The Pizza Box NY, Bleecker Street, New York, NY');

  // Date parsing — best-effort from the free-text party_date field
  // If Make sends an ISO date you can parse it properly; otherwise opens gcal with prefilled text
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;

  res.json({ url });
});

// ── Admin: clear all data (dev/reset) ────────────────────────────────────────
app.post('/admin/clear', (req, res) => {
  writeData({ requests: [] });
  console.log('🗑️  Data cleared via /admin/clear');
  res.json({ ok: true });
});

// ── Admin: seed with example data ────────────────────────────────────────────
app.post('/admin/seed', (req, res) => {
  const seed = require('./data.seed.json');
  writeData(seed);
  console.log('🌱 Data seeded');
  res.json({ ok: true });
});

// ── Debug: echo back whatever Make sends (use during ngrok testing) ───────────
app.post('/webhook/debug', (req, res) => {
  console.log('\n🔍 DEBUG webhook hit:');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  res.json({ received: req.body, headers: req.headers });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🍕 Pizza Party App running on http://localhost:${PORT}`);
  console.log(`   Webhook: POST http://localhost:${PORT}/webhook/party-request`);
  console.log(`   Debug:   POST http://localhost:${PORT}/webhook/debug`);
  console.log(`   Admin:   POST http://localhost:${PORT}/admin/clear\n`);
});
