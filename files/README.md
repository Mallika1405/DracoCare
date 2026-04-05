# Serpentine — Clinic Finder Agent

Browser Use agent that takes patient symptoms + location → finds and ranks nearby clinics.

## What it does

1. **LLM query generation** — Gemini reads symptoms/labs/meds and decides which specialist is needed (e.g. "ear ache" → ENT, "elevated LDL + drug interaction" → cardiologist). Writes 3 Google Maps search strings (specific → broad fallback).

2. **Browser Use agent** — Opens Google Maps (pre-centered on coords if available), searches, clicks top 5 results, scrapes: name, address, phone, rating, review count, accepting new patients, wait time, insurance info.

3. **LLM scoring + summary** — Gemini scores each clinic 0–10 based on rating, availability, wait time, insurance, and patient-symptom fit. Writes a 1–2 sentence summary and pros/cons specific to this patient.

4. **Returns** ranked list best → worst with everything your friend needs to build the cards.

---

## Setup

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Fill in your key
echo "GEMINI_API_KEY=your_key_here" > .env

uvicorn app:app --reload --port 8000
```

### Frontend (simple test UI)

Just open `frontend/index.html` in a browser — no build step needed.

- **"Find Clinics (Live Agent)"** — runs the real Browser Use agent (~60s)
- **"Mock Data (Fast Test)"** — instant, uses hardcoded data, good for UI work

---

## API

### `POST /find-clinic` — Live agent

```json
{
  "name": "Maria Chen",
  "age": 58,
  "sex": "F",
  "zip_code": "92101",
  "symptoms": ["elevated LDL", "chest tightness", "fatigue"],
  "lab_flags": ["LDL 187 mg/dL", "HbA1c 6.1%"],
  "medications": ["Metformin", "Atorvastatin", "Azithromycin"],
  "latitude": 32.7157,   // optional — from browser Geolocation API
  "longitude": -117.1611 // optional
}
```

Response:
```json
{
  "query_used": "cardiologist near 92101 accepting new patients",
  "specialty_detected": "Cardiologist",
  "sage_message": "I found 5 Cardiologist options near you. My top pick is...",
  "clinics": [
    {
      "name": "UC San Diego Health – Cardiology",
      "address": "9350 Campus Point Dr, La Jolla, CA 92037",
      "phone": "+18582495678",
      "rating": 4.8,
      "review_count": 512,
      "specialty": "Cardiologist",
      "accepting_new_patients": true,
      "wait_time": "Next available: April 7",
      "insurance_notes": "Accepts Medicare, Blue Cross, Aetna",
      "summary": "Top-rated academic center ideal for elevated LDL and drug interaction review.",
      "pros": ["4.8 stars", "Accepting new patients", "Lipid specialists on staff"],
      "cons": ["Academic center feel", "Parking difficult"],
      "score": 9.2,
      "google_maps_url": "https://www.google.com/maps/place/..."
    }
    // ...sorted best → worst
  ]
}
```

### `POST /find-clinic-mock` — Same shape, instant, no agent

Same request body, same response shape — hardcoded data.

---

## Location API (browser side)

In your React frontend, get coords before calling the endpoint:

```js
navigator.geolocation.getCurrentPosition(pos => {
  const body = {
    // ...patient data
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };
  fetch('/find-clinic', { method: 'POST', body: JSON.stringify(body), ... });
});
```

If coords are not provided, the agent falls back to ZIP code search.

---

## Notes

- Live agent takes ~60 seconds (Browser Use opens a real Chrome window)
- Mock endpoint is instant — your friend can build the frontend cards against `/find-clinic-mock` with no backend running
- `score` field (0–10) is what you sort cards by — already sorted best→worst in response
- `accepting_new_patients` can be `true`, `false`, or `null` (unknown) — handle all three in UI
