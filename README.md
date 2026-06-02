# 🍕 The Pizza Box NY — Party Request Manager

A lightweight web app that auto-ingests party inquiry emails from Owner.com
via Make.com, displays them in a dashboard, lets you manage/reply, and
pushes confirmed parties to Google Calendar.

**Stack:** Node.js + Express · JSON file storage · Vanilla HTML/CSS/JS · Railway · Make.com

---

## Local Setup

```bash
npm install
npm start
# → http://localhost:3000
```

---

## Phase 1 — Local Testing with ngrok

Test the webhook before touching Make or Railway.

### 1. Start the server
```bash
npm start
```

### 2. Start ngrok in a new terminal
```bash
ngrok http 3000
```
Copy the **Forwarding URL**, e.g. `https://abc123.ngrok.io`

### 3. Test the debug endpoint first
```bash
curl -X POST https://abc123.ngrok.io/webhook/debug \
  -H "Content-Type: application/json" \
  -d '{"hello": "world"}'
```
You should see the payload echoed back and logged in your server terminal.

### 4. Test the real webhook
```bash
curl -X POST https://abc123.ngrok.io/webhook/party-request \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Guest",
    "email": "test@example.com",
    "phone": "212-555-0100",
    "party_date": "Saturday August 2 2025",
    "guest_count": "20",
    "message": "We want to book a birthday party for 20 guests!",
    "received_at": "2025-06-21T14:00:00.000Z"
  }'
```
Open `http://localhost:3000` — the request should appear in the dashboard.

---

## Phase 2 — Configure Make.com

Create a scenario: **Gmail → HTTP**

### Gmail Module (Watch Emails)
- Filter: from `noreply@owner.com` (or whatever Owner.com sends from)
- Or filter by subject containing "party" or "reservation"

### HTTP Module (Make an API Call)
- **URL:** `https://abc123.ngrok.io/webhook/party-request` (local) or your Railway URL (production)
- **Method:** POST
- **Body type:** Raw (JSON)
- **Content type:** `application/json`

### Body mapping (Raw JSON):
```json
{
  "name": "{{1.from.name}}",
  "email": "{{1.headers.reply-to}}",
  "phone": "",
  "party_date": "",
  "guest_count": "",
  "message": "{{1.snippet}}",
  "received_at": "{{1.date}}"
}
```

> **Pro tip:** If Make can parse the email body, map specific fields.
> Otherwise use `{{1.snippet}}` and fill in details manually in the dashboard.

---

## Phase 3 — Deploy to Railway

```bash
# Push to GitHub first
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pizza-party-app.git
git push -u origin main
```

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the repo
3. Railway auto-detects Node.js and runs `node server.js`
4. Copy the generated Railway URL (e.g. `https://pizza-party-app.up.railway.app`)
5. Update Make's HTTP module URL to the Railway URL
6. Done — no environment variables needed for basic setup

### Persistent Storage on Railway
Railway's filesystem is ephemeral — `data.json` resets on redeploy.
For persistence, add a Railway Volume:
1. Railway dashboard → your service → Volumes → Add Volume
2. Mount path: `/app`
3. Update `DATA_FILE` in `server.js` to `/app/data.json`

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/party-request` | Make.com → ingest new request |
| `POST` | `/webhook/debug` | Echo back payload (testing) |
| `GET`  | `/api/requests` | List all requests |
| `PATCH`| `/api/requests/:id` | Update status/notes/replied |
| `DELETE`| `/api/requests/:id` | Delete request |
| `GET`  | `/api/requests/:id/calendar-link` | Get Google Calendar deep link |
| `POST` | `/admin/clear` | Delete all data |
| `POST` | `/admin/seed` | Reset to seed data |

---

## Webhook Payload Schema

```json
{
  "name":        "Sofia Marchetti",
  "email":       "sofia@gmail.com",
  "phone":       "917-555-0182",
  "party_date":  "Saturday July 12 2025",
  "guest_count": "24",
  "message":     "Hi! We'd love to book a birthday party…",
  "received_at": "2025-06-18T14:32:00.000Z"
}
```

---

## Dashboard Features

- **All / New / Pending / Confirmed / Past** tabs with live counts
- Click any request to open the full detail view
- Change status with one click (New → Pending → Confirmed → Past)
- Add internal notes (deposit received, menu agreed, etc.)
- Mark as replied
- **Reply** button → pre-fills a mailto with a template reply
- **Add to Calendar** → Google Calendar deep link (confirmed parties only)
- Auto-refreshes every 30 seconds
- Unread indicator (red dot) on new, unreplied requests
