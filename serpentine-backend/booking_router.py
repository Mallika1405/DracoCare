"""
booking_router.py — FastAPI router for appointment booking (DracoCare)
"""

import os
import asyncio
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta

router = APIRouter(prefix="/booking", tags=["booking"])

GOOGLE_PLACES_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class NearbyHospitalsRequest(BaseModel):
    lat: float
    lng: float
    insurance: Optional[str] = ""
    condition: Optional[str] = ""
    radius_meters: int = 5000

class VAPICallRequest(BaseModel):
    hospital_name: str
    hospital_phone: str
    patient_name: str
    patient_insurance: str
    condition: str
    preferred_time: str
    session_id: str
    # Full patient context from reception room
    duration: Optional[str] = None
    severity: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    medical_history: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class CalendarEventRequest(BaseModel):
    hospital_name: str
    hospital_address: str
    datetime_iso: str
    patient_name: str
    condition: str
    access_token: str

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

INSURANCE_KEYWORD_MAP = {
    "blue cross": ["blue cross", "bcbs", "anthem"],
    "blue shield": ["blue shield", "bcbs"],
    "aetna": ["aetna"],
    "cigna": ["cigna"],
    "united": ["united", "uhc", "unitedhealthcare"],
    "humana": ["humana"],
    "kaiser": ["kaiser", "permanente"],
    "medicaid": ["medicaid", "medi-cal", "medical"],
    "medicare": ["medicare"],
    "tricare": ["tricare"],
    "uc ship": ["uc ship", "ship", "university of california"],
}

def normalize_insurance(raw: str) -> List[str]:
    raw_lower = raw.lower()
    for canonical, keywords in INSURANCE_KEYWORD_MAP.items():
        if any(k in raw_lower for k in keywords):
            return keywords
    return [w for w in raw_lower.split() if len(w) > 3]


async def check_npi_insurance(hospital_name: str, insurance_keywords: List[str], raw_insurance: str = "") -> dict:
    if not insurance_keywords:
        return {"verified": False, "note": "Call to verify insurance"}

    url = "https://npiregistry.cms.hhs.gov/api/"
    params = {"version": "2.1", "organization_name": hospital_name[:40], "limit": 5}

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url, params=params)
            data = r.json()
        result_count = data.get("result_count", 0)
        if result_count > 0:
            return {
                "verified": True,
                "note": f"NPI verified — call to confirm {raw_insurance} coverage",
            }
        return {"verified": False, "note": "Could not verify — call ahead"}
    except Exception:
        return {"verified": False, "note": "Call to verify insurance"}


async def get_place_details(place_id: str) -> dict:
    if not GOOGLE_PLACES_KEY:
        return {}
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,formatted_address,formatted_phone_number,opening_hours,website,rating,user_ratings_total,geometry",
        "key": GOOGLE_PLACES_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, params=params)
            return r.json().get("result", {})
    except Exception:
        return {}

# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/nearby-hospitals")
async def nearby_hospitals(req: NearbyHospitalsRequest):
    if not GOOGLE_PLACES_KEY:
        return _mock_hospitals(req.insurance)

    nearby_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{req.lat},{req.lng}",
        "radius": req.radius_meters,
        "type": "doctor",
        "keyword": f"clinic {req.condition or ''}".strip(),
        "key": GOOGLE_PLACES_KEY,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(nearby_url, params=params)
        nearby_data = r.json()

    places = nearby_data.get("results", [])[:8]
    insurance_keywords = normalize_insurance(req.insurance or "")

    details_list = await asyncio.gather(
        *[get_place_details(p.get("place_id", "")) for p in places],
        return_exceptions=True
    )

    npi_list = await asyncio.gather(
        *[check_npi_insurance(p.get("name", ""), insurance_keywords, req.insurance or "") for p in places],
        return_exceptions=True
    )

    hospitals = []
    for place, details, npi_result in zip(places, details_list, npi_list):
        if isinstance(details, Exception):
            details = {}
        if isinstance(npi_result, Exception):
            npi_result = {"verified": False, "note": "Call to verify insurance"}

        plat = place["geometry"]["location"]["lat"]
        plng = place["geometry"]["location"]["lng"]
        dist_km = ((plat - req.lat)**2 + (plng - req.lng)**2)**0.5 * 111
        dist_str = f"{dist_km:.1f} km" if dist_km >= 1 else f"{int(dist_km*1000)} m"

        hospitals.append({
            "id": place.get("place_id", ""),
            "name": place.get("name", ""),
            "address": details.get("formatted_address") or place.get("vicinity", ""),
            "phone": details.get("formatted_phone_number", ""),
            "rating": details.get("rating") or place.get("rating", 0),
            "user_ratings_total": details.get("user_ratings_total", 0),
            "distance": dist_str,
            "distance_km": dist_km,
            "website": details.get("website", ""),
            "open_now": place.get("opening_hours", {}).get("open_now"),
            "hours": details.get("opening_hours", {}).get("weekday_text", []),
            "insurance_verified": npi_result["verified"],
            "insurance_note": npi_result["note"],
            "lat": plat,
            "lng": plng,
            "place_id": place.get("place_id", ""),
        })

    hospitals.sort(key=lambda h: (
        -int(h["insurance_verified"]),
        -(h["rating"] or 0),
        h["distance_km"],
    ))

    return {"hospitals": hospitals[:5], "status": "success"}


def _mock_hospitals(insurance: str) -> dict:
    ins = insurance or "your insurance"
    return {
        "status": "success",
        "hospitals": [
            {
                "id": "mock1", "name": "Westside Medical Center",
                "address": "2450 Westwood Blvd, Los Angeles, CA 90064",
                "phone": "+13105551234", "rating": 4.7, "user_ratings_total": 832,
                "distance": "0.8 km", "distance_km": 0.8,
                "website": "https://westsidemedical.example.com",
                "open_now": True, "hours": ["Monday: 8:00 AM – 6:00 PM"],
                "insurance_verified": True, "insurance_note": f"NPI verified — call to confirm {ins} coverage",
                "lat": 34.0522, "lng": -118.2437, "place_id": "mock1",
            },
            {
                "id": "mock2", "name": "Pacific Coast Clinic",
                "address": "1810 Wilshire Blvd, Santa Monica, CA 90403",
                "phone": "+13105559876", "rating": 4.5, "user_ratings_total": 519,
                "distance": "1.4 km", "distance_km": 1.4, "website": "",
                "open_now": True, "hours": [],
                "insurance_verified": True, "insurance_note": f"NPI verified — call to confirm {ins} coverage",
                "lat": 34.0195, "lng": -118.4912, "place_id": "mock2",
            },
            {
                "id": "mock3", "name": "Harbor View Hospital",
                "address": "3800 W 120th St, Inglewood, CA 90303",
                "phone": "+13105554321", "rating": 4.3, "user_ratings_total": 290,
                "distance": "2.1 km", "distance_km": 2.1,
                "website": "https://harborview.example.com",
                "open_now": False, "hours": [],
                "insurance_verified": False, "insurance_note": "Call to verify insurance",
                "lat": 33.9533, "lng": -118.3406, "place_id": "mock3",
            },
        ]
    }


@router.post("/vapi-call")
async def vapi_call(req: VAPICallRequest):
    if not VAPI_API_KEY:
        return {
            "status": "simulated",
            "call_id": "demo-call-123",
            "message": "VAPI call simulated",
        }

    # Build full patient context string from reception room data
    patient_details = f"""- Name: {req.patient_name}
- Age: {req.age or "not provided"}
- Sex: {req.sex or "not provided"}
- Insurance: {req.patient_insurance}
- Reason for visit: {req.condition}
- Symptom duration: {req.duration or "not specified"}
- Severity: {req.severity + "/10" if req.severity else "not specified"}
- Current medications: {req.medications or "none reported"}
- Allergies: {req.allergies or "none reported"}
- Medical history: {req.medical_history or "none reported"}
- Phone: {req.phone or "not provided"}
- Email: {req.email or "not provided"}"""

    system_prompt = f"""You are Riley, a medical appointment booking assistant calling from DracoCare on behalf of a patient.

Full patient information collected during intake:
{patient_details}

Available time slots (already verified free in patient's calendar):
{req.preferred_time}

Your job — follow these steps in order:
1. Greet the receptionist warmly and confirm you're speaking with {req.hospital_name}
2. Explain you're calling from DracoCare to book an appointment for {req.patient_name}
3. State their insurance: {req.patient_insurance}
4. Briefly describe the reason for visit: {req.condition}
5. Offer the available time slots and ask which one works for them
6. Confirm the exact date and time agreed upon
7. Thank them and end the call professionally

RULES:
- Only accept one of the offered time slots. Do not agree to any time not listed.
- If none of the slots work, politely ask for their next available appointment.
- Be professional, concise, and friendly throughout.
- You have full patient context — use it if the clinic asks any questions."""

    payload = {
        "assistantId": os.getenv("VAPI_ASSISTANT_ID", ""),
        "assistantOverrides": {
            "firstMessage": f"Hello! I'm Riley calling from DracoCare. I'm looking to book an appointment for {req.patient_name}. Am I speaking with {req.hospital_name}?",
            "model": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "system", "content": system_prompt}],
            },
        },
        "phoneNumberId": os.getenv("VAPI_PHONE_NUMBER_ID", ""),
        "customer": {
            "number": req.hospital_phone,
            "name": req.hospital_name,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                "https://api.vapi.ai/call/phone",
                headers={"Authorization": f"Bearer {VAPI_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
            data = r.json()
        return {
            "status": "initiated",
            "call_id": data.get("id", ""),
            "message": "Riley is calling now",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VAPI error: {e}")


@router.get("/vapi-call-status/{call_id}")
async def vapi_call_status(call_id: str):
    if call_id == "demo-call-123":
        return {
            "status": "ended",
            "ended_reason": "assistant-ended-call",
            "transcript": "Demo: Appointment booked for the requested time.",
            "appointment_confirmed": True,
        }

    if not VAPI_API_KEY:
        return {"status": "unknown"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"https://api.vapi.ai/call/{call_id}",
                headers={"Authorization": f"Bearer {VAPI_API_KEY}"},
            )
            data = r.json()
    except httpx.ReadTimeout:
        return {"status": "in-progress", "transcript": "", "appointment_confirmed": False}
    except Exception:
        return {"status": "in-progress", "transcript": "", "appointment_confirmed": False}

    transcript = data.get("transcript", "")
    ended = data.get("status") == "ended"
    # Replace the confirmed logic with something stricter
    confirmed = ended and any(
        w in transcript.lower()
        for w in ["confirmed", "booked", "scheduled", "see you", "all set"]
    ) and not any(
        w in transcript.lower()
        for w in ["unable", "not available", "can't", "cannot", "no availability", "fully booked", "no openings"]
    )

    return {
        "status": data.get("status", "in-progress"),
        "ended_reason": data.get("endedReason", ""),
        "transcript": transcript,
        "appointment_confirmed": confirmed,
    }


@router.post("/calendar-event")
async def create_calendar_event(req: CalendarEventRequest):
    start_dt = datetime.fromisoformat(req.datetime_iso)
    end_dt = start_dt + timedelta(minutes=60)

    event = {
        "summary": f"Doctor Appointment — {req.hospital_name}",
        "location": req.hospital_address,
        "description": (
            f"Patient: {req.patient_name}\n"
            f"Reason: {req.condition}\n"
            f"Booked via DracoCare\n\n"
            f"Remember to bring your insurance card and a valid ID."
        ),
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "America/Los_Angeles"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "America/Los_Angeles"},
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 24 * 60},
                {"method": "popup", "minutes": 60},
            ],
        },
        "colorId": "2",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {req.access_token}", "Content-Type": "application/json"},
                json=event,
            )
            data = r.json()

        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"]["message"])

        return {
            "status": "created",
            "event_id": data.get("id"),
            "event_link": data.get("htmlLink"),
            "message": "Event added to Google Calendar",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calendar error: {e}")


@router.get("/calendar-freebusy")
async def calendar_freebusy(access_token: str, days_ahead: int = 7):
    now = datetime.utcnow()
    future = now + timedelta(days=days_ahead)
    body = {
        "timeMin": now.isoformat() + "Z",
        "timeMax": future.isoformat() + "Z",
        "items": [{"id": "primary"}],
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(
                "https://www.googleapis.com/calendar/v3/freeBusy",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=body,
            )
            data = r.json()
        busy = data.get("calendars", {}).get("primary", {}).get("busy", [])
        return {"status": "success", "busy": busy}
    except Exception as e:
        return {"status": "error", "busy": [], "detail": str(e)}