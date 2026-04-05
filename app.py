import os
import json
import urllib.parse
import httpx
import asyncio
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

# NEW
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

# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def safe_parse_json(text: str):
    text = text.replace("```json", "").replace("```", "").strip()
    start = min([i for i in [text.find("{"), text.find("[")] if i != -1])
    return json.loads(text[start:])


def get_gemini_client():
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def get_groq_client():
    return Groq(api_key=os.getenv("GROQ_API_KEY"))


# ─────────────────────────────────────────────────────────────
# Step 1 — Gemini (unchanged, but stable)
# ─────────────────────────────────────────────────────────────

async def generate_search_query(patient: PatientContext) -> dict:
    client = get_gemini_client()

    prompt = f"""
Pick the correct medical specialist.

Patient:
Age: {patient.age}
Sex: {patient.sex}
Symptoms: {", ".join(patient.symptoms)}
Labs: {", ".join(patient.lab_flags) if patient.lab_flags else "none"}
ZIP: {patient.zip_code}

Output ONLY JSON:
{{
  "specialty_label": "...",
  "primary_search": "...",
  "fallback_search": "...",
  "reasoning": "..."
}}
"""

    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return safe_parse_json(resp.text)


# ─────────────────────────────────────────────────────────────
# Step 2 — Browser agent (UNCHANGED)
# ─────────────────────────────────────────────────────────────

async def get_clinic_urls_via_browser(search_query: str, fallback_query: str):
    from browser_use import Agent
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.0,
    )

    search_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(search_query)}"
    fallback_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(fallback_query)}"

    task = f"""Find 3 clinic websites.

Go to:
{search_url}

Extract top 3 clinics from local results.
Return ONLY JSON array with:
name, rating, review_count, address, phone, website_url

If <3 results → use:
{fallback_url}
"""

    agent = Agent(task=task, llm=llm)

    result = await agent.run()
    raw = result.final_result()

    try:
        return safe_parse_json(raw)
    except:
        return []


# ─────────────────────────────────────────────────────────────
# Step 3 — Scraping (UNCHANGED)
# ─────────────────────────────────────────────────────────────

HEADERS = {"User-Agent": "Mozilla/5.0"}

async def scrape_clinic_website(session, url):
    try:
        r = await session.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()

        text = soup.get_text("\n", strip=True)
        lines = [l for l in text.splitlines() if len(l) > 20]

        return "\n".join(lines[:60])

    except Exception as e:
        return f"[scrape failed: {e}]"


async def scrape_all_clinics(clinic_stubs):
    async with httpx.AsyncClient() as session:
        tasks = [
            scrape_clinic_website(session, c.get("website_url", ""))
            for c in clinic_stubs
        ]
        results = await asyncio.gather(*tasks)

    enriched = []
    for stub, text in zip(clinic_stubs, results):
        enriched.append({**stub, "page_text": text})

    return enriched


# ─────────────────────────────────────────────────────────────
# Step 4 — GROQ (NEW 🔥)
# ─────────────────────────────────────────────────────────────

async def extract_and_score(enriched_clinics, patient, specialty):
    client = get_groq_client()
    insurance = patient.insurance or "unknown"

    clinic_blocks = []
    for i, c in enumerate(enriched_clinics[:3]):
        text = (c.get("page_text") or "")[:800]  # 🔥 CRITICAL FIX

        clinic_blocks.append(f"""
Clinic:
Name: {c.get('name')}
Rating: {c.get('rating')} ({c.get('review_count')})
Address: {c.get('address')}
Phone: {c.get('phone')}
Website: {c.get('website_url')}
Content:
{text}
""")

    prompt = f"""
Return ONLY valid JSON.

Patient:
{patient.age}yo {patient.sex}
Symptoms: {", ".join(patient.symptoms)}
Insurance: {insurance}
Needs: {specialty}

Clinics:
{''.join(clinic_blocks)}

Output:
[
  {{
    "name": "",
    "address": "",
    "phone": "",
    "rating": 0,
    "review_count": 0,
    "accepting_new_patients": true,
    "wait_time": null,
    "insurance_accepted": [],
    "insurance_match": true,
    "insurance_notes": "",
    "website_url": "",
    "review_highlights": [],
    "review_complaints": [],
    "summary": "",
    "pros": [],
    "cons": [],
    "score": 0
  }}
]
"""

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "Return ONLY JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )

        raw = completion.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()

        data = json.loads(raw)

    except Exception as e:
        print("[Groq ERROR]", e)

        data = [{
            "name": c.get("name"),
            "address": c.get("address"),
            "phone": c.get("phone"),
            "rating": c.get("rating"),
            "review_count": c.get("review_count"),
            "summary": "Fallback result",
            "pros": [],
            "cons": ["Scoring failed"],
            "score": 5.0
        } for c in enriched_clinics]

    clinics = []
    for s in data:
        clinics.append(Clinic(
            name=s.get("name", "Unknown"),
            address=s.get("address", ""),
            phone=s.get("phone"),
            rating=s.get("rating"),
            review_count=s.get("review_count"),
            specialty=specialty,
            accepting_new_patients=s.get("accepting_new_patients"),
            wait_time=s.get("wait_time"),
            insurance_accepted=s.get("insurance_accepted", []),
            insurance_match=s.get("insurance_match"),
            insurance_notes=s.get("insurance_notes"),
            review_highlights=s.get("review_highlights", []),
            review_complaints=s.get("review_complaints", []),
            summary=s.get("summary", ""),
            pros=s.get("pros", []),
            cons=s.get("cons", []),
            score=s.get("score", 5.0),
            website_url=s.get("website_url"),
        ))

    return sorted(clinics, key=lambda c: c.score, reverse=True)


# ─────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────

@app.post("/find-clinic", response_model=FindClinicResponse)
async def find_clinic(patient: PatientContext):
    query_data = await generate_search_query(patient)

    stubs = await get_clinic_urls_via_browser(
        query_data["primary_search"],
        query_data["fallback_search"],
    )

    if not stubs:
        return FindClinicResponse(
            query_used=query_data["primary_search"],
            specialty_detected=query_data["specialty_label"],
            clinics=[],
            sage_message="No clinics found.",
        )

    enriched = await scrape_all_clinics(stubs)

    clinics = await extract_and_score(
        enriched, patient, query_data["specialty_label"]
    )

    return FindClinicResponse(
        query_used=query_data["primary_search"],
        specialty_detected=query_data["specialty_label"],
        clinics=clinics,
        sage_message=f"Found {len(clinics)} options.",
    )