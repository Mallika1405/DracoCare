"""
clinic_finder_fast.py

Architecture:
- Gemini 2.5 Flash: Picks the right medical specialist
- Browser Use Agent 1: Google Maps → extracts top 3 clinics (isolated browser)
- Browser Use Agents 2-4: Each searches "{clinic} accepted insurance" SEQUENTIALLY (isolated browsers)
- Groq llama-3.3-70b: Scores and summarizes using real insurance data
"""

import os
import json
import asyncio
import urllib.parse
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from groq import Groq
from google import genai

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# ── Models ─────────────────────────────────────────────────────────────────────

class PatientContext(BaseModel):
    name: str
    age: int
    sex: str
    zip_code: str
    symptoms: List[str]
    lab_flags: Optional[List[str]] = []
    medications: Optional[List[str]] = []
    insurance: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class Clinic(BaseModel):
    name: str
    address: str
    phone: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    specialty: Optional[str] = None
    accepting_new_patients: Optional[bool] = None
    wait_time: Optional[str] = None
    insurance_accepted: Optional[List[str]] = []
    insurance_match: Optional[bool] = None
    insurance_notes: Optional[str] = None
    review_highlights: Optional[List[str]] = []
    review_complaints: Optional[List[str]] = []
    summary: str
    pros: List[str]
    cons: List[str]
    score: float
    google_maps_url: Optional[str] = None
    website_url: Optional[str] = None

class FindClinicResponse(BaseModel):
    query_used: str
    specialty_detected: str
    clinics: List[Clinic]
    sage_message: str

# ── Helpers ────────────────────────────────────────────────────────────────────

def make_llm():
    from browser_use.llm import ChatOpenAI
    return ChatOpenAI(
        model="gpt-4o-mini",
        api_key=OPENAI_API_KEY,
        temperature=0.0,
    )

def make_browser():
    from browser_use import Browser
    return Browser(headless=True)

# ── Step 1: Gemini picks specialist ───────────────────────────────────────────

async def generate_search_query(patient: PatientContext) -> dict:
    client = genai.Client(api_key=GEMINI_API_KEY)
    location = (
        f"{patient.latitude},{patient.longitude}"
        if patient.latitude else patient.zip_code
    )
    prompt = f"""Pick the right medical specialist. Output ONLY JSON, no preamble.

Patient: {patient.age}yo {patient.sex}
Symptoms: {", ".join(patient.symptoms)}
Labs: {", ".join(patient.lab_flags) if patient.lab_flags else "none"}
Location: {location}

Rules: vague symptoms → "primary care physician" | clear signal → specialist | labs override symptoms

{{"specialty_label":"Cardiologist","primary_search":"cardiologist near {patient.zip_code}","fallback_search":"heart doctor near {patient.zip_code}","reasoning":"one sentence"}}"""

    resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
    text = resp.text.replace("```json", "").replace("```", "").strip()
    return json.loads(text[text.find("{"):])

# ── Step 2: Browser Use Agent 1 — Google Maps, isolated browser ────────────────

# CHANGE 1: Added website_url as an optional field to the Maps task output
MAPS_TASK = """You are a web scraping agent. Follow these steps EXACTLY.

STEP 1: Navigate to this exact URL: {maps_url}
STEP 2: Wait 3 seconds.
STEP 3: Call extract_content on the page.
STEP 4: Find the top 3 clinic results from the visible results list.
STEP 5: Call done with ONLY this JSON array:

[
  {{
    "name": "exact clinic name",
    "address": "exact address or null",
    "phone": "phone or null",
    "rating": 4.6,
    "review_count": 78,
    "website_url": "official website if clearly visible, else null",
    "google_maps_url": "https://www.google.com/maps/search/{query_encoded}"
  }},
  {{
    "name": "second clinic name",
    "address": "second address or null",
    "phone": "phone or null",
    "rating": 4.8,
    "review_count": 138,
    "website_url": "official website if clearly visible, else null",
    "google_maps_url": "https://www.google.com/maps/search/{query_encoded}"
  }},
  {{
    "name": "third clinic name",
    "address": "third address or null",
    "phone": "phone or null",
    "rating": 4.4,
    "review_count": 55,
    "website_url": "official website if clearly visible, else null",
    "google_maps_url": "https://www.google.com/maps/search/{query_encoded}"
  }}
]

STRICT RULES:
- Do NOT click anything
- Do NOT navigate to any other page
- Use null for any missing field
- Use only information directly visible in extracted content
- Output ONLY the JSON array, nothing else"""

async def get_clinic_stubs_via_browser(query_data: dict) -> list[dict]:
    from browser_use import Agent

    query = query_data["primary_search"]
    query_encoded = urllib.parse.quote_plus(query)
    maps_url = f"https://www.google.com/maps/search/{query_encoded}"

    browser = make_browser()
    agent = Agent(
        task=MAPS_TASK.format(maps_url=maps_url, query_encoded=query_encoded),
        llm=make_llm(),
        browser=browser,
        max_actions_per_step=2,
        max_input_tokens=8000,
    )

    try:
        result = await agent.run(max_steps=8)
        raw = result.final_result() if hasattr(result, "final_result") else str(result)
        print(f"[maps_agent] raw: {raw[:400]}")

        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            return []

        stubs = json.loads(raw[start:end])
        if not isinstance(stubs, list) or len(stubs) == 0:
            return []

        print(f"[maps_agent] got: {[s.get('name') for s in stubs]}")
        return stubs[:3]

    except Exception as e:
        print(f"[maps_agent] failed: {e}")
        return []
    finally:
        close_fn = getattr(browser, "close", None)
        if callable(close_fn):
            maybe_result = close_fn()
            if asyncio.iscoroutine(maybe_result):
                await maybe_result

# ── Step 3: Browser Use Agents — insurance lookup SEQUENTIALLY ────────────────

# CHANGE 3: Insurance task now targets clinic website or Maps URL directly,
# not a Google Search query. This avoids CAPTCHA/rate-limit issues.
INSURANCE_FROM_WEBSITE_TASK = """You are a web research agent.

Your goal is to determine insurance information for a clinic.

STEP 1: Navigate to this URL: {target_url}
STEP 2: Wait 2 seconds.
STEP 3: Call extract_content immediately.
STEP 4: From the extracted text, look for:
- accepted insurance plans
- insurance
- billing
- Medicare
- Medicaid
- payer / payers
- health plans

STEP 5: Call done with ONLY this JSON:

{{
  "insurance_accepted": ["Plan1", "Plan2"],
  "insurance_match": true,
  "insurance_notes": "short factual note"
}}

Rules:
- true = "{patient_insurance}" explicitly appears
- false = insurance list exists but "{patient_insurance}" is not listed
- null = no trustworthy insurance information found

STRICT RULES:
- Do NOT click anything
- Do NOT navigate anywhere else
- Use only directly extracted page content
- Output ONLY the JSON object
"""

# CHANGE 2 & 3: Accepts full stub dict instead of just clinic_name,
# uses website_url first and falls back to google_maps_url.
# No longer uses Google Search at all.
async def get_insurance_for_clinic(stub: dict, patient_insurance: str) -> dict:
    from browser_use import Agent

    clinic_name = stub.get("name", "")
    website_url = stub.get("website_url")
    google_maps_url = stub.get("google_maps_url")

    target_url = website_url or google_maps_url
    if not target_url:
        return {
            "insurance_accepted": [],
            "insurance_match": None,
            "insurance_notes": "No clinic website or maps URL available for verification."
        }

    browser = make_browser()
    agent = Agent(
        task=INSURANCE_FROM_WEBSITE_TASK.format(
            target_url=target_url,
            patient_insurance=patient_insurance or "unknown",
        ),
        llm=make_llm(),
        browser=browser,
        max_actions_per_step=2,
        max_input_tokens=2000,  # CHANGE 4: Lowered from 6000 to 2000
    )

    try:
        result = await agent.run(max_steps=4)  # Reduced from 5 to 4
        raw = result.final_result() if hasattr(result, "final_result") else str(result)
        print(f"[insurance_agent:{clinic_name[:30]}] {raw[:200]}")

        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end == 0:
            return {
                "insurance_accepted": [],
                "insurance_match": None,
                "insurance_notes": "No structured insurance data could be extracted."
            }

        parsed = json.loads(raw[start:end])

        return {
            "insurance_accepted": parsed.get("insurance_accepted") or [],
            "insurance_match": parsed.get("insurance_match"),
            "insurance_notes": parsed.get("insurance_notes") or "Insurance information not confirmed."
        }

    except Exception as e:
        print(f"[insurance_agent:{clinic_name[:30]}] failed: {e}")
        return {
            "insurance_accepted": [],
            "insurance_match": None,
            "insurance_notes": "Automatic insurance lookup failed."
        }
    finally:
        close_fn = getattr(browser, "close", None)
        if callable(close_fn):
            maybe_result = close_fn()
            if asyncio.iscoroutine(maybe_result):
                await maybe_result

# CHANGE 2: Sequential enrichment with a 1.5s delay between requests
# to avoid triggering CAPTCHA / rate limits.
async def enrich_with_insurance_sequential(stubs: list[dict], patient_insurance: str) -> list[dict]:
    enriched = []

    for stub in stubs:
        res = await get_insurance_for_clinic(stub, patient_insurance)
        if res:
            enriched.append({**stub, **res})
        else:
            enriched.append({
                **stub,
                "insurance_accepted": [],
                "insurance_match": None,
                "insurance_notes": "Insurance could not be verified automatically."
            })

        await asyncio.sleep(1.5)

    return enriched

# ── Step 4: Groq scores + summarizes ──────────────────────────────────────────

async def score_with_groq(stubs: list[dict], patient: PatientContext, specialty: str) -> list[Clinic]:
    client = Groq(api_key=GROQ_API_KEY)
    insurance = patient.insurance or "unknown"

    clinic_blocks = []
    for c in stubs[:3]:
        clinic_blocks.append(f"""
Name: {c.get('name')}
Address: {c.get('address')}
Phone: {c.get('phone')}
Rating: {c.get('rating')} ({c.get('review_count')} reviews)
Insurance accepted: {c.get('insurance_accepted') or 'unknown'}
Insurance match for {insurance}: {c.get('insurance_match')}
Insurance notes: {c.get('insurance_notes')}
Maps: {c.get('google_maps_url')}
""")

    prompt = f"""Score these clinics for a patient. Return ONLY a JSON array.

Patient: {patient.age}yo {patient.sex} | Insurance: {insurance} | Needs: {specialty}
Symptoms: {", ".join(patient.symptoms)}

Scoring weights: insurance match 30% | rating 30% | specialty fit 25% | review count 15%
insurance_match true=30pts | false=0pts | null=10pts

Clinics:
{"---".join(clinic_blocks)}

For each clinic output:
- name, address, phone, rating, review_count
- insurance_accepted, insurance_match, insurance_notes
- accepting_new_patients: null
- wait_time: null
- review_highlights: []
- review_complaints: []
- website_url: null
- google_maps_url
- summary: 2 sentences. If insurance_match is null, explicitly say insurance could not be verified.
- pros: 3 specific points
- cons: 2 points
- score: 0.0-10.0

[{{"name":"...","address":"...","phone":"...","rating":0,"review_count":0,"accepting_new_patients":null,"wait_time":null,"insurance_accepted":[],"insurance_match":null,"insurance_notes":"...","review_highlights":[],"review_complaints":[],"website_url":null,"google_maps_url":"...","summary":"...","pros":[],"cons":[],"score":0.0}}]"""

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "Return ONLY valid JSON array. No preamble. No explanation."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        raw = completion.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        scored = json.loads(raw)
    except Exception as e:
        print(f"[groq] failed: {e}")
        scored = [{
            "name": c.get("name", "Unknown"),
            "address": c.get("address", ""),
            "phone": c.get("phone"),
            "rating": c.get("rating"),
            "review_count": c.get("review_count"),
            "summary": "Clinic found nearby. Insurance could not be verified.",
            "pros": [f"Rating: {c.get('rating')}"],
            "cons": ["Insurance not verified"],
            "score": float(c.get("rating") or 5.0),
            "google_maps_url": c.get("google_maps_url"),
        } for c in stubs]

    clinics = []
    for s in scored:
        clinics.append(Clinic(
            name=s.get("name", "Unknown"),
            address=s.get("address", ""),
            phone=s.get("phone"),
            rating=s.get("rating"),
            review_count=s.get("review_count"),
            specialty=specialty,
            accepting_new_patients=None,
            wait_time=None,
            insurance_accepted=s.get("insurance_accepted") or [],
            insurance_match=s.get("insurance_match"),
            insurance_notes=s.get("insurance_notes"),
            review_highlights=[],
            review_complaints=[],
            summary=s.get("summary", ""),
            pros=s.get("pros") or [],
            cons=s.get("cons") or [],
            score=float(s.get("score", 5.0)),
            google_maps_url=s.get("google_maps_url"),
            website_url=None,
        ))

    return sorted(clinics, key=lambda c: c.score, reverse=True)

# ── Endpoint ───────────────────────────────────────────────────────────────────

@app.post("/find-clinic", response_model=FindClinicResponse)
async def find_clinic(patient: PatientContext):
    insurance = patient.insurance or "unknown"

    # 1. Gemini picks specialist (~1s)
    query_data = await generate_search_query(patient)
    print(f"[step1] specialty: {query_data['specialty_label']}, query: {query_data['primary_search']}")

    # 2. Browser Use Agent → Google Maps → 3 clinic stubs (~20s)
    stubs = await get_clinic_stubs_via_browser(query_data)
    print(f"[step2] got {len(stubs)} stubs")

    if not stubs:
        return FindClinicResponse(
            query_used=query_data["primary_search"],
            specialty_detected=query_data["specialty_label"],
            clinics=[],
            sage_message="Couldn't find clinics. Try adjusting your ZIP or symptoms.",
        )

    # 3. Browser Use Agents → insurance lookup SEQUENTIALLY (~20-25s)
    # CHANGE 2: Sequential instead of parallel to avoid CAPTCHA/rate-limit issues
    stubs = await enrich_with_insurance_sequential(stubs, insurance)
    print(f"[step3] enriched insurance for {len(stubs)} clinics")

    # 4. Groq scores everything (~1-2s)
    clinics = await score_with_groq(stubs, patient, query_data["specialty_label"])
    print(f"[step4] scored {len(clinics)} clinics")

    top = clinics[0] if clinics else None
    insurance_note = f" {patient.insurance} coverage checked for each clinic." if patient.insurance else ""
    sage_msg = (
        f"Found {len(clinics)} {query_data['specialty_label']} options near you.{insurance_note} "
        + (f"Top pick: {top.name} — {top.summary}" if top else "")
    )

    return FindClinicResponse(
        query_used=query_data["primary_search"],
        specialty_detected=query_data["specialty_label"],
        clinics=clinics,
        sage_message=sage_msg,
    )

@app.get("/health")
def health():
    return {"status": "ok"}