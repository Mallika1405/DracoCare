# DracoCare

> Your personal dragon-powered health clinic — making healthcare accessible, understandable, and actually kind of fun.

---

## What is DracoCare?

DracoCare is an AI-powered health assistant that helps anyone — whether you're 18 and confused about insurance or 96 and overwhelmed by a 20-page lab report — navigate the healthcare system with ease.

We built a full clinic experience with three dragon characters, two main tracks, and a seamless end-to-end flow from symptoms to booked appointment.

---

## Features

### Track 1: Patient Visit (Feeling Sick)

1. **Anita Checkin** (Receptionist Dragon) — Collects your name, age, gender, symptoms, current medications, optional lab results, and insurance info via friendly chat.
2. **Dr. Stitch** (AI Doctor Dragon) — Reviews your case and generates a comprehensive, interactive report including:
   - Flagged lab values and concern levels
   - Urgency assessment
   - Potential conditions or causes
   - Recommended next steps
   - Questions to ask your provider
3. **Clinic Finder** — Uses your location and insurance to surface top-rated nearby clinics that match your condition, displayed in card format.
4. **Appointment Booking** — Select a clinic, connect Google Calendar or enter availability manually.
5. **Riley** (Voice Assistant) — Automatically calls the clinic on your behalf, books a reasonable appointment, and adds it to your calendar. No phone call required.

### Track 2: Prescription Price Finder

- **Ash Pirin** (Pharmacist Dragon) — Takes your medication details and searches the web in real time to find the lowest prices from reputable pharmacies and verified retailers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python + FastAPI |
| Frontend | TypeScript + Vite (prototyped with Lovable) |
| Medical AI | Gemini API |
| Drug Search Parsing | Groq (llama-3) |
| Voice Assistant | VAPI |
| Calendar Integration | Google Calendar API |
| Clinic Discovery | Google Places API |
| Pharmacy Scraping | Playwright (headless) |

---

## Getting Started

> _Setup instructions coming soon — fill this section in before publishing._

```bash
# Clone the repo
git clone https://github.com/your-org/dracocare.git
cd dracocare

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Environment Variables

Create a `.env` file in the root with the following keys:

```env
GEMINI_API_KEY=
GROQ_API_KEY=
VAPI_API_KEY=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_PLACES_API_KEY=
```

---

## Architecture

```
User
 ├── Track 1: Symptom Check
 │    ├── Anita Checkin (intake chat)
 │    ├── Dr. Stitch (Gemini-powered report)
 │    ├── Clinic Finder (Google Places)
 │    └── Riley (VAPI voice → calendar booking)
 │
 └── Track 2: Drug Price Finder
      └── Ash Pirin (Playwright scraper + Groq parser)
```

---

## Challenges

- **Browser automation fragility** — We originally planned to use Browser Use for pharmacy search, but it was too slow and unreliable for live demos. We pivoted to Playwright for a much more stable scraping layer.
- **Automatic prescription refills** — We attempted to build an agent that could navigate pharmacy sites and place orders directly, but the variation in site layouts made reliable completion impossible. Still on the roadmap.
- **Multi-API chaining** — Getting Google Calendar, Google Places, and VAPI to work sequentially without any failures required careful orchestration.

---

## What's Next

- [ ] Automatic prescription refills (smarter multi-site approach)
- [ ] Deeper insurance integration for even better clinic matching
- [ ] Health history tracker — Dr. Stitch remembers your past visits, trends, and flagged values over time
- [ ] Follow-up reminders after appointments
- [ ] Expanded Riley capabilities (call insurance, check coverage, follow up on referrals)
- [ ] Multi-language support

---


