import os
import json
import urllib.parse
import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, SecretStr
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Speed system prompt injected into every Gemini call ───────────────────────
# For the browser agent LLM (ChatGoogleGenerativeAI)
AGENT_SYSTEM_PROMPT = """You are a fast, decisive web research agent. 

SPEED RULES — follow these at all times:
- Act immediately. Do not re-read instructions or summarize what you are about to do.
- Never explain your reasoning before acting. Just act.
- After arriving on any page, use extract_content RIGHT AWAY. Do not scroll first.
- After extracting, move to the next URL immediately. Do not reflect or summarize.
- If a page fails to load or has no useful content, skip it and move on — do not retry.
- Never ask clarifying questions. Make a decision and proceed.
- You are done when you have extracted content from all assigned URLs. Output the JSON immediately."""

# For direct Gemini API calls (generate_search_query, score_and_summarize)
GEMINI_SPEED_INSTRUCTION = "Be concise and fast. No preamble. No explanation. Output only what is asked."

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

def safe_parse_json(text: str):
    text = text.replace("```json", "").replace("```", "").strip()
    start = len(text)
    for c in ["{", "["]:
        idx = text.find(c)
        if idx != -1 and idx < start:
            start = idx
    return json.loads(text[start:])

def get_gemini_client():
    from google import genai
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def google_search_url(query: str) -> str:
    return f"https://www.google.com/search?q={urllib.parse.quote_plus(query)}"


# ── Step 1: Gemini picks specialist ───────────────────────────────────────────

async def generate_search_query(patient: PatientContext) -> dict:
    client = get_gemini_client()
    from google.genai import types

    location_hint = (
        f"coordinates {patient.latitude},{patient.longitude}"
        if patient.latitude else f"ZIP {patient.zip_code}"
    )

    prompt = f"""{GEMINI_SPEED_INSTRUCTION}

Medical triage: pick the right specialist and write a search query.

Patient: {patient.age}yo {patient.sex}
Symptoms: {", ".join(patient.symptoms)}
Labs: {", ".join(patient.lab_flags) if patient.lab_flags else "none"}
Meds: {", ".join(patient.medications) if patient.medications else "none"}
Insurance: {patient.insurance or "unknown"}
Location: {location_hint}

Rules:
- Vague symptoms → "urgent care" or "primary care physician"
- Clear signals → use that specialist (ear ache→ENT, chest pain→cardiologist, eye→ophthalmologist)
- Lab flags can override (elevated LDL → cardiologist)
- Queries must include the ZIP

Output ONLY this JSON:
{{
  "specialty": "cardiologist",
  "specialty_label": "Cardiologist",
  "primary_query": "cardiologist near {patient.zip_code}",
  "fallback_query": "heart doctor near {patient.zip_code}",
  "reasoning": "one sentence"
}}"""

    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.0,
            system_instruction=GEMINI_SPEED_INSTRUCTION,
        ),
    )
    return safe_parse_json(resp.text)


# ── Step 2: Python scrapes Google → picks 3 clean clinic URLs ─────────────────

SKIP_DOMAINS = {
    "healthgrades.com", "zocdoc.com", "yelp.com", "webmd.com",
    "vitals.com", "npiprofile.com", "psychologytoday.com",
    "doximity.com", "usnews.com", "castleconnolly.com",
    "google.com", "youtube.com", "wikipedia.org",
}

async def fetch_clinic_urls(query_data: dict) -> list[str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }

    urls = []
    for query in [query_data["primary_query"], query_data["fallback_query"]]:
        if len(urls) >= 3:
            break
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
                r = await client.get(google_search_url(query), headers=headers)
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.select("a[href]"):
                href = a["href"]
                if href.startswith("/url?q="):
                    href = urllib.parse.unquote(href[7:].split("&")[0])
                if not href.startswith("http"):
                    continue
                domain = urllib.parse.urlparse(href).netloc.replace("www.", "")
                if any(skip in domain for skip in SKIP_DOMAINS):
                    continue
                path = urllib.parse.urlparse(href).path
                if path.count("/") > 2:
                    continue
                if any(domain in u for u in urls):
                    continue
                urls.append(href)
                if len(urls) >= 3:
                    break
        except Exception as e:
            print(f"URL fetch error: {e}")

    print(f"[fetch_clinic_urls] Found: {urls}")
    return urls[:3]


# ── Step 3: Browser Use — visits exactly the 3 pre-chosen URLs ────────────────

async def run_clinic_agent(clinic_urls: list[str], patient: PatientContext, specialty_label: str) -> list:
    from browser_use import Agent
    from langchain_google_genai import ChatGoogleGenerativeAI

    # Speed system prompt injected directly into the LLM the agent uses
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        api_key=SecretStr(os.getenv("GEMINI_API_KEY")),
        temperature=0.0,
        # This becomes the system prompt for every single agent step
        convert_system_message_to_human=False,
    )

    insurance = patient.insurance or "unknown"

    while len(clinic_urls) < 3:
        clinic_urls.append(clinic_urls[0] if clinic_urls else "https://www.google.com")

    url1, url2, url3 = clinic_urls[0], clinic_urls[1], clinic_urls[2]

    def review_url(site_url):
        domain = urllib.parse.urlparse(site_url).netloc.replace("www.", "")
        return google_search_url(domain + " reviews")

    task = f"""{AGENT_SYSTEM_PROMPT}

Your job: visit 6 URLs, extract content from each, output JSON. That's it.

The 6 URLs in order:
1. {url1}  ← clinic website
2. {review_url(url1)}  ← Google reviews for clinic 1
3. {url2}  ← clinic website
4. {review_url(url2)}  ← Google reviews for clinic 2
5. {url3}  ← clinic website
6. {review_url(url3)}  ← Google reviews for clinic 3

For each URL: go_to_url → extract_content → done. Move to next URL immediately.

From clinic websites extract: name, address, phone, insurance plans, new patient info, testimonials.
From Google review pages extract: star rating, review count, patient praise, patient complaints.

When all 6 are done, output ONLY this JSON array:

[
  {{
    "name": "Clinic Name",
    "address": "full address or null",
    "phone": "phone or null",
    "rating": 4.5,
    "review_count": 120,
    "accepting_new_patients": true,
    "wait_time": "info or null",
    "insurance_accepted": ["plan1", "plan2"],
    "insurance_match": true,
    "insurance_notes": "brief note or null",
    "google_maps_url": "url or null",
    "website_url": "clinic website url",
    "review_highlights": ["what patients praised"],
    "review_complaints": ["what patients complained about"]
  }},
  {{ ... }},
  {{ ... }}
]

insurance_match: true="{insurance}" in their list | false=list exists without it | null=no list
Use null for missing fields. Never invent data. Output ONLY the JSON array."""

    agent = Agent(
        task=task,
        llm=llm,
        max_actions_per_step=2,
        max_input_tokens=8000,
    )

    result = await agent.run(max_steps=30)
    raw = result.final_result() if hasattr(result, "final_result") else str(result)
    return safe_parse_json(raw)


# ── Step 4: Gemini scores + summarizes ────────────────────────────────────────

async def score_and_summarize(raw_clinics: list, patient: PatientContext, specialty: str) -> list:
    client = get_gemini_client()
    from google.genai import types

    insurance = patient.insurance or "unknown"

    prompt = f"""{GEMINI_SPEED_INSTRUCTION}

Score and summarize these clinics for a patient.

Patient: {patient.age}yo {patient.sex} | Insurance: {insurance} | Needs: {specialty}
Symptoms: {", ".join(patient.symptoms)}

Clinics:
{json.dumps(raw_clinics, indent=2)}

Scoring: insurance match 25% | rating+reviews 25% | accepting new patients 20% | wait time 15% | specialty fit 15%
insurance_match true→25pts | false→0pts | null→10pts

For each clinic:
- summary: 1-2 sentences (insurance status first, then top review theme)
- pros: 2-4 points (insurance first if matched)
- cons: 1-3 points (always flag unconfirmed insurance)
- score: 0.0-10.0

Output ONLY JSON array sorted best-first:
[{{"name":"exact name","score":8.5,"summary":"...","pros":["..."],"cons":["..."]}}]"""

    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.0,
            system_instruction=GEMINI_SPEED_INSTRUCTION,
        ),
    )
    scored = safe_parse_json(resp.text)
    scored_map = {s["name"]: s for s in scored}

    clinics = []
    for raw in raw_clinics:
        s = scored_map.get(raw.get("name", ""), {})
        clinics.append(Clinic(
            name=raw.get("name", "Unknown"),
            address=raw.get("address", ""),
            phone=raw.get("phone"),
            rating=raw.get("rating"),
            review_count=raw.get("review_count"),
            specialty=specialty,
            accepting_new_patients=raw.get("accepting_new_patients"),
            wait_time=raw.get("wait_time"),
            insurance_accepted=raw.get("insurance_accepted", []),
            insurance_match=raw.get("insurance_match"),
            insurance_notes=raw.get("insurance_notes"),
            review_highlights=raw.get("review_highlights", []),
            review_complaints=raw.get("review_complaints", []),
            summary=s.get("summary", ""),
            pros=s.get("pros", []),
            cons=s.get("cons", []),
            score=s.get("score", 5.0),
            google_maps_url=raw.get("google_maps_url"),
            website_url=raw.get("website_url"),
        ))

    clinics.sort(key=lambda c: c.score, reverse=True)
    return clinics


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/find-clinic", response_model=FindClinicResponse)
async def find_clinic(patient: PatientContext):
    query_data   = await generate_search_query(patient)
    clinic_urls  = await fetch_clinic_urls(query_data)
    raw_clinics  = await run_clinic_agent(clinic_urls, patient, query_data["specialty_label"])
    clinics      = await score_and_summarize(raw_clinics, patient, query_data["specialty_label"])

    top = clinics[0] if clinics else None
    insurance_note = f" Your insurance ({patient.insurance}) was factored into the ranking." if patient.insurance else ""
    sage_msg = (
        f"I found {len(clinics)} {query_data['specialty_label']} options near you.{insurance_note} "
        + (f"My top pick is {top.name} — {top.summary}" if top else "Check the results below.")
    )
    return FindClinicResponse(
        query_used=query_data["primary_query"],
        specialty_detected=query_data["specialty_label"],
        clinics=clinics,
        sage_message=sage_msg,
    )


@app.post("/find-clinic-mock", response_model=FindClinicResponse)
async def find_clinic_mock(patient: PatientContext):
    clinics = [
        Clinic(
            name="UC San Diego Health – Cardiology",
            address="9350 Campus Point Dr, La Jolla, CA 92037",
            phone="+18582495678",
            rating=4.8, review_count=512,
            specialty="Cardiologist",
            accepting_new_patients=True,
            wait_time="Next available: April 7",
            insurance_accepted=["Medicare", "Blue Cross", "Aetna", "Cigna"],
            insurance_match=True,
            insurance_notes="Lists Medicare on their insurance page",
            review_highlights=["Cardiologists very thorough", "Quick follow-ups", "Staff explains everything clearly"],
            review_complaints=["Parking garage can be crowded", "Large academic center feel"],
            summary="Top-rated academic cardiology center that accepts Medicare; reviewers highlight thorough care and quick follow-ups.",
            pros=["✓ Accepts Medicare (your plan)", "4.8 stars with 500+ reviews", "Lipid disorder specialists on staff", "Available April 7"],
            cons=["Large academic center — less personal", "Parking can be difficult"],
            score=9.2,
            google_maps_url="https://maps.google.com/?q=UC+San+Diego+Health+Cardiology",
            website_url="https://health.ucsd.edu/care/heart",
        ),
        Clinic(
            name="Sharp Rees-Stealy Cardiology",
            address="7901 Frost St, San Diego, CA 92123",
            phone="+16195416600",
            rating=4.6, review_count=289,
            specialty="Cardiologist",
            accepting_new_patients=True,
            wait_time="Next available: April 9",
            insurance_accepted=["Blue Cross", "Aetna", "United", "Cigna"],
            insurance_match=False,
            insurance_notes="Does not list Medicare — call to confirm",
            review_highlights=["Easy online scheduling", "Friendly staff", "Short in-office wait"],
            review_complaints=["Some billing confusion reported", "Slightly rushed appointments"],
            summary="Well-rated cardiology group with easy scheduling, but Medicare not confirmed — verify before booking.",
            pros=["4.6 stars, 289 reviews", "Available April 9", "Easy online booking praised by patients"],
            cons=["⚠ Medicare not listed — call to verify", "Some billing confusion in reviews"],
            score=7.1,
            google_maps_url="https://maps.google.com/?q=Sharp+Rees-Stealy+Cardiology",
            website_url="https://www.sharp.com/find-a-doctor/cardiology",
        ),
        Clinic(
            name="Scripps Clinic Cardiology",
            address="10666 N Torrey Pines Rd, La Jolla, CA 92037",
            phone="+18585544000",
            rating=4.5, review_count=198,
            specialty="Cardiologist",
            accepting_new_patients=None,
            wait_time="2–3 weeks",
            insurance_accepted=["PPO plans", "Blue Shield", "United"],
            insurance_match=None,
            insurance_notes="No Medicare info found — PPO plans listed",
            review_highlights=["Cardiac imaging on-site", "Very experienced doctors"],
            review_complaints=["Long wait for new patients", "Hard to reach by phone"],
            summary="Reputable Scripps system with on-site imaging, but 2–3 week wait and Medicare not confirmed.",
            pros=["Cardiac imaging on-site", "Experienced cardiologists"],
            cons=["2–3 week wait", "⚠ Insurance match unknown", "Hard to reach by phone"],
            score=6.2,
            google_maps_url="https://maps.google.com/?q=Scripps+Clinic+Cardiology",
            website_url="https://www.scripps.org/locations/cardiology",
        ),
    ]
    return FindClinicResponse(
        query_used="cardiologist near 92101",
        specialty_detected="Cardiologist",
        clinics=clinics,
        sage_message="I found 3 Cardiologist options near you. Your insurance (Medicare) was factored into the ranking. My top pick is UC San Diego Health — confirms Medicare and has the highest rating.",
    )
