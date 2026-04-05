from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
import os
import json
import tempfile
import asyncio
from typing import Optional
from dotenv import load_dotenv
from groq import AsyncGroq
from playwright.async_api import async_playwright

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

app = FastAPI()

# ─────────────────────────────────────────────────────────────────────────────
# Pharmacy store map
# ─────────────────────────────────────────────────────────────────────────────

PHARMACY_MAP = {
    "target":     ("https://www.target.com",     "https://www.target.com/s?searchTerm={q}"),
    "cvs":        ("https://www.cvs.com",         "https://www.cvs.com/search?searchTerm={q}"),
    "walgreens":  ("https://www.walgreens.com",   "https://www.walgreens.com/search/results.jsp?Ntt={q}"),
    "walmart":    ("https://www.walmart.com",     "https://www.walmart.com/search?q={q}"),
    "costco":     ("https://www.costco.com",      "https://www.costco.com/CatalogSearch?keyword={q}"),
    "amazon":     ("https://www.amazon.com",      "https://www.amazon.com/s?k={q}"),
    "rite aid":   ("https://www.riteaid.com",     "https://www.riteaid.com/search?q={q}"),
    "rite-aid":   ("https://www.riteaid.com",     "https://www.riteaid.com/search?q={q}"),
    "sam's club": ("https://www.samsclub.com",    "https://www.samsclub.com/s/{q}"),
    "sams club":  ("https://www.samsclub.com",    "https://www.samsclub.com/s/{q}"),
    "kroger":     ("https://www.kroger.com",      "https://www.kroger.com/search?query={q}"),
    "goodrx":     ("https://www.goodrx.com",      "https://www.goodrx.com/drugs/search?query={q}"),
}

def resolve_pharmacy(name: str) -> tuple[str, str | None]:
    lower = name.lower().strip()
    for key, urls in PHARMACY_MAP.items():
        if key in lower:
            return urls
    first_word = lower.split()[0]
    return (f"https://www.{first_word}.com", None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Mount booking router
# ─────────────────────────────────────────────────────────────────────────────
from booking_router import router as booking_router
app.include_router(booking_router)

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str
    session_id: str = "default"
    lat: float = None
    lng: float = None

class AnalysisResult(BaseModel):
    session_id: str

class MedRequest(BaseModel):
    drug: str
    dosage: str
    quantity: Optional[int] = 90

class MedResult(BaseModel):
    store: str
    price: float
    title: str
    all_results: list[str] = []

# ─────────────────────────────────────────────────────────────────────────────
# In-memory stores
# ─────────────────────────────────────────────────────────────────────────────

chat_sessions = {}
patient_store = {}
call_queue = []
conversation_history = {}

# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

RECEPTIONIST_PROMPT = """You are Anita, a warm and friendly medical receptionist AI.

Your goal is to collect the patient's intake information as efficiently and naturally as possible.

PHASE 1 — Start here every time:
Ask for their full name, age, and biological sex in ONE opening message.
Example: "Hi! I'm Anita. Before we get started, could I get your full name, age, and biological sex?"

PHASE 2 — Lab report offer:
Once you have name/age/sex, ask if they have any lab reports or medical documents to upload.
Be casual about it: something like "Do you happen to have any recent lab results or reports you could upload? It saves a lot of back-and-forth — there's an upload button right below."
Wait for their response before continuing.

PHASE 3 — Adaptive questioning:
• If they uploaded a PDF: You will receive a message starting with "[LAB_CONTEXT]" that contains extracted info.
  Use that to understand what's already known, then ONLY ask about what's genuinely missing.
  Do NOT re-ask anything already in the lab data.
• If they skipped upload: Ask the following ONE at a time, conversationally:
  - Symptoms they're experiencing
  - How long they've had them
  - Severity 1-10
  - Current medications
  - Known allergies
  - Any chronic conditions or relevant medical history
  - Insurance provider
  - Best phone number to contact
  - Email address

RULES:
- One question at a time — never fire multiple questions at once
- Be warm, reassuring, and human
- Never diagnose anything
- Skip questions that are already answered from lab context

COMPLETION:
Once you have name, age, sex, symptoms, duration, severity, medications, allergies, medical history, and insurance — say:
"Great, I have everything I need. Let me get Dr. Stitch for you right away."
Then end your message with exactly: [READY_FOR_CONSULTATION]"""

DOCTOR_PROMPT = """You are Dr Stitch MD, a compassionate physician.
You will receive a full patient summary including their symptoms, history, and lab results.

ALWAYS start with: "Remember, this is not professional medical advice. Please seek professional care."

Then:
- Address the patient by name
- Explain what their symptoms and lab results are commonly associated with
- Flag any concerning lab values or drug interactions
- List 3 specific questions to ask their in-person doctor
- Ask if they would like to book an appointment

Keep responses under 150 words.
Never diagnose. Never prescribe.
Always say 'commonly associated with' not 'you have'."""

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def safe_parse_json(text: str):
    """Strip markdown fences and return the first JSON object or array found."""
    text = text.replace("```json", "").replace("```", "").strip()
    candidates = [i for i in [text.find("{"), text.find("[")] if i != -1]
    if not candidates:
        raise ValueError(f"No JSON found: {text[:200]}")
    return json.loads(text[min(candidates):])


def build_doctor_context(session_id: str) -> str:
    patient = patient_store.get(session_id, {})
    context = f"""
PATIENT SUMMARY:
- Name: {patient.get('name', 'Unknown')}
- Age: {patient.get('age', 'Not provided')}
- Biological Sex: {patient.get('sex', 'Not provided')}
- Phone: {patient.get('phone', 'Not provided')}
- Email: {patient.get('email', 'Not provided')}
- Insurance: {patient.get('insurance', 'Not provided')}
- Symptoms: {patient.get('symptoms', 'Not provided')}
- Duration: {patient.get('duration', 'Not provided')}
- Severity: {patient.get('severity', 'Not provided')}/10
- Current Medications: {patient.get('medications', 'None reported')}
- Allergies: {patient.get('allergies', 'None reported')}
- Medical History: {patient.get('medical_history', 'None reported')}
- Location: {patient.get('location', 'Not provided')}
"""
    if 'lab_results' in patient:
        context += f"\nLAB RESULTS:\n{patient['lab_results']}"
    return context


def save_patient_to_file(session_id: str):
    os.makedirs("patient_data", exist_ok=True)
    with open(f"patient_data/{session_id}.json", "w") as f:
        json.dump(patient_store[session_id], f, indent=2)


async def extract_patient_info(session_id: str):
    if session_id not in conversation_history:
        return

    history_text = "\n".join(conversation_history[session_id])

    extraction_chat = client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(
            system_instruction="""You extract structured data from medical intake conversations.
Return ONLY valid raw JSON with no markdown, no backticks, no explanation.
If a field is not mentioned, use empty string."""
        )
    )

    response = extraction_chat.send_message(f"""
Extract ONLY the patient information the patient provided. Return this exact JSON structure:
{{
    "name": "full name here",
    "age": "age here",
    "sex": "biological sex here",
    "phone": "phone number here",
    "email": "email here",
    "symptoms": "symptoms here",
    "duration": "duration here",
    "severity": "number here",
    "medications": "medications here",
    "allergies": "allergies here",
    "medical_history": "history here",
    "insurance": "insurance here"
}}

Conversation to extract from:
{history_text}
""")

    try:
        extracted = safe_parse_json(response.text)
        if session_id not in patient_store:
            patient_store[session_id] = {}
        patient_store[session_id].update(extracted)
        save_patient_to_file(session_id)
        print(f"✅ Patient data saved: {extracted}")
    except Exception as e:
        print(f"❌ Extraction error: {e}\nRaw: {response.text}")


# ─────────────────────────────────────────────────────────────────────────────
# Browser agent (pharmacy price finder) — Playwright + Groq
# ─────────────────────────────────────────────────────────────────────────────

async def run_agent(drug: str, dosage: str, quantity: int) -> dict:
    search_term = f"{drug} {dosage} {quantity} tablets buy price"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        page = await context.new_page()
        await page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        await page.goto("https://www.google.com", wait_until="domcontentloaded")
        await asyncio.sleep(1.5)

        search_box = await page.wait_for_selector('textarea[name="q"]', timeout=10000)
        await search_box.click()
        await asyncio.sleep(0.5)
        await page.keyboard.type(search_term, delay=60)
        await asyncio.sleep(0.8)
        await page.keyboard.press("Enter")

        await page.wait_for_load_state("domcontentloaded", timeout=15000)
        await asyncio.sleep(2)

        try:
            shopping_tab = await page.wait_for_selector('a:has-text("Shopping")', timeout=6000)
            await asyncio.sleep(0.5)
            await shopping_tab.click()
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
            await asyncio.sleep(2)
        except Exception:
            pass

        page_text = await page.inner_text("body")
        await browser.close()

    groq_prompt = f"""You are a pharmacy price analyst.

You will be given raw scraped text from a Google Shopping results page.

Your job:
1. Extract ONLY legitimate, trustworthy pharmacy or retail listings.
2. IGNORE any unknown, suspicious, or non-medical sellers.

TRUSTED STORES INCLUDE (but are not limited to):
- CVS, Walgreens, Walmart, Target, Costco
- Amazon, Rite Aid, Kroger, Sam's Club, GoodRx

FILTER OUT:
- Random domains or unknown brand names
- Liquor stores, marketplaces, or unrelated shops
- Listings without clear store names
- Anything that looks like a scam, reseller, or third-party seller

Only include results that clearly come from well-known national retailers or verified pharmacy platforms.

Then:
- From the filtered results, determine the cheapest valid option.
- If NO trustworthy results are found, return "CHEAPEST: NONE".

OUTPUT FORMAT (STRICT — no extra text):

CHEAPEST: [store name or NONE]
PRICE: $[price or N/A]
PRODUCT: [product name or N/A]
PACK SIZE: {quantity} units

ALL RESULTS:
- [Store]: $[price] ([product name])

DATA:
\"\"\"
{page_text[:6000]}
\"\"\"
"""

    groq_response = await groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": groq_prompt}],
        max_tokens=400,
        temperature=0.1,
    )
    raw = groq_response.choices[0].message.content.strip()

    cheapest_store, cheapest_price, cheapest_title = "", "", ""
    all_results = []
    in_all = False

    for line in raw.split("\n"):
        line = line.strip()
        if line.startswith("CHEAPEST:"):
            cheapest_store = line.replace("CHEAPEST:", "").strip()
        elif line.startswith("PRICE:"):
            cheapest_price = line.replace("PRICE:", "").strip().lstrip("$")
        elif line.startswith("PRODUCT:"):
            cheapest_title = line.replace("PRODUCT:", "").strip()
        elif line.startswith("ALL RESULTS:"):
            in_all = True
        elif in_all and line.startswith("-"):
            all_results.append(line.lstrip("- ").strip())

    if not cheapest_store or cheapest_store.upper() == "NONE" or not cheapest_price or cheapest_price == "N/A":
        raise ValueError(f"No trusted pharmacy results found. Raw:\n{raw}")

    return {
        "store": cheapest_store,
        "price": float(cheapest_price.replace(",", "")),
        "title": cheapest_title,
        "all_results": all_results,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLINIC ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(body: ChatMessage):
    if body.session_id not in chat_sessions:
        chat_sessions[body.session_id] = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=RECEPTIONIST_PROMPT
            )
        )
        conversation_history[body.session_id] = []

    if body.lat and body.lng:
        if body.session_id not in patient_store:
            patient_store[body.session_id] = {}
        patient_store[body.session_id]["location"] = {"lat": body.lat, "lng": body.lng}

    chat_obj = chat_sessions[body.session_id]
    response = chat_obj.send_message(body.message)

    conversation_history[body.session_id].append(f"patient: {body.message}")
    conversation_history[body.session_id].append(f"Anita: {response.text}")

    ready_for_consultation = "[READY_FOR_CONSULTATION]" in response.text
    clean_response = response.text.replace("[READY_FOR_CONSULTATION]", "").strip()

    asking_for_labs = (
        "upload" in response.text.lower() and
        any(w in response.text.lower() for w in ["lab", "report", "document", "result"])
    )

    if ready_for_consultation:
        await extract_patient_info(body.session_id)

    return {
        "response": clean_response,
        "character": "receptionist",
        "ready_for_consultation": ready_for_consultation,
        "asking_for_labs": asking_for_labs,
    }


@app.post("/extract-labs")
async def extract_labs(
    file: UploadFile = File(...),
    session_id: str = Form("default")
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        uploaded_file = client.files.upload(
            file=tmp_path,
            config={"mime_type": "application/pdf"}
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                uploaded_file,
                """Extract all information from this medical document. Return ONLY raw JSON, no markdown:
{
    "patient_name": "",
    "age": "",
    "sex": "",
    "date_of_test": "",
    "symptoms_mentioned": "",
    "medications": [
        {"name": "med name", "dosage": "dosage", "frequency": "frequency"}
    ],
    "allergies": "",
    "medical_history": "",
    "insurance": "",
    "labs": [
        {"name": "test name", "value": "result", "unit": "unit", "reference_range": "range", "status": "NORMAL/HIGH/LOW"}
    ]
}"""
            ]
        )

        if session_id not in patient_store:
            patient_store[session_id] = {}
        patient_store[session_id]["lab_results"] = response.text
        save_patient_to_file(session_id)

        try:
            lab_data = safe_parse_json(response.text)
            field_map = {
                "patient_name": "name", "age": "age", "sex": "sex",
                "allergies": "allergies", "medical_history": "medical_history",
                "insurance": "insurance", "symptoms_mentioned": "symptoms",
            }
            for lab_key, store_key in field_map.items():
                val = lab_data.get(lab_key, "")
                if val and not patient_store[session_id].get(store_key):
                    patient_store[session_id][store_key] = val

            meds = lab_data.get("medications", [])
            if meds and not patient_store[session_id].get("medications"):
                med_str = ", ".join(
                    f"{m.get('name','')} {m.get('dosage','')} {m.get('frequency','')}".strip()
                    for m in meds if m.get("name")
                )
                if med_str:
                    patient_store[session_id]["medications"] = med_str

            save_patient_to_file(session_id)
        except Exception as e:
            print(f"Pre-population warning: {e}")

        summary_chat = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction="You summarise medical lab documents into plain English for a receptionist AI. Be concise."
            )
        )
        summary_resp = summary_chat.send_message(
            f"Summarise what patient information and lab results are present in this data, in 3-5 sentences:\n{response.text}"
        )

        return {"extracted": response.text, "summary": summary_resp.text, "status": "success"}

    finally:
        os.unlink(tmp_path)


@app.post("/notify-lab-upload")
async def notify_lab_upload(body: ChatMessage):
    session_id = body.session_id
    patient = patient_store.get(session_id, {})

    if session_id not in chat_sessions:
        chat_sessions[session_id] = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(system_instruction=RECEPTIONIST_PROMPT)
        )
        conversation_history[session_id] = []

    known_fields = [
        label for field, label in [
            ("name", "name"), ("age", "age"), ("sex", "biological sex"),
            ("symptoms", "symptoms"), ("medications", "medications"),
            ("allergies", "allergies"), ("medical_history", "medical history"),
            ("insurance", "insurance"),
        ] if patient.get(field)
    ]

    internal_msg = (
        f"[LAB_CONTEXT] The patient just uploaded their lab report. "
        f"Here is what was extracted:\n\n{body.message}\n\n"
        f"Fields already known from the document: {', '.join(known_fields) or 'nothing specific yet'}.\n"
        f"Please acknowledge the upload warmly, then ONLY ask about what's still missing to complete the intake. "
        f"Do not re-ask anything already answered."
    )

    chat_obj = chat_sessions[session_id]
    response = chat_obj.send_message(internal_msg)

    conversation_history[session_id].append("[system]: lab report uploaded")
    conversation_history[session_id].append(f"anita: {response.text}")

    ready_for_consultation = "[READY_FOR_CONSULTATION]" in response.text
    clean_response = response.text.replace("[READY_FOR_CONSULTATION]", "").strip()

    if ready_for_consultation:
        await extract_patient_info(session_id)

    return {
        "response": clean_response,
        "character": "receptionist",
        "ready_for_consultation": ready_for_consultation,
        "asking_for_labs": False,
    }


@app.post("/consultation")
async def consultation(body: ChatMessage):
    session_key = f"doctor_{body.session_id}"

    if session_key not in chat_sessions:
        patient_context = build_doctor_context(body.session_id)
        chat_sessions[session_key] = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=DOCTOR_PROMPT + f"\n\n{patient_context}"
            )
        )

    chat_obj = chat_sessions[session_key]
    response = chat_obj.send_message(body.message)

    wants_appointment = any(word in body.message.lower() for word in [
        "yes", "sure", "book", "appointment", "please", "yeah", "yep"
    ])

    if wants_appointment and body.session_id in patient_store:
        patient = patient_store[body.session_id]
        call_queue.append({
            "session_id": body.session_id,
            "name": patient.get("name", "Unknown"),
            "phone": patient.get("phone", ""),
            "insurance": patient.get("insurance", ""),
            "symptoms": patient.get("symptoms", ""),
            "location": patient.get("location", {}),
        })
        save_patient_to_file(body.session_id)

    return {"response": response.text, "character": "doctor", "wants_appointment": wants_appointment}


@app.post("/analyze")
async def analyze(body: AnalysisResult):
    patient = patient_store.get(body.session_id, {})
    if not patient:
        return {"error": "No patient data found"}

    patient_context = build_doctor_context(body.session_id)

    analysis_chat = client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(
            system_instruction="""You are a medical AI assistant that analyzes patient data.
Return ONLY raw JSON, no markdown, no backticks, no explanation."""
        )
    )

    response = analysis_chat.send_message(f"""
Analyze this patient's data and return ONLY this exact JSON:
{{
    "patient_name": "name here",
    "summary": "one sentence summary of their situation",
    "urgent": false,
    "urgent_reason": "",
    "flags": [
        {{
            "severity": "RED_FLAG",
            "title": "flag title",
            "description": "what to do about it"
        }}
    ],
    "possible_conditions": [
        {{
            "name": "condition name",
            "likelihood": "possible/likely/very likely",
            "explanation": "plain english explanation"
        }}
    ],
    "drug_interactions": [],
    "recommendations": ["recommendation 1", "recommendation 2"],
    "questions_for_doctor": ["question 1", "question 2", "question 3"]
}}

Severity levels must be exactly: RED_FLAG, WATCH, or GOOD

Patient data:
{patient_context}

Symptoms: {patient.get('symptoms', 'none')}
Duration: {patient.get('duration', 'unknown')}
Severity: {patient.get('severity', 'unknown')}/10
Medications: {patient.get('medications', 'none')}
Allergies: {patient.get('allergies', 'none')}
Medical history: {patient.get('medical_history', 'none')}
""")

    try:
        analysis = safe_parse_json(response.text)
        if body.session_id in patient_store:
            patient_store[body.session_id]["analysis"] = analysis
            save_patient_to_file(body.session_id)
        return {"analysis": analysis, "status": "success"}
    except Exception as e:
        print(f"Analysis error: {e}")
        return {"error": str(e), "raw": response.text}


@app.get("/patient/{session_id}")
def get_patient(session_id: str):
    return patient_store.get(session_id, {"error": "not found"})


@app.get("/call-queue")
def get_call_queue():
    return {"queue": call_queue}


@app.get("/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# PHARMACY ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/run", response_model=MedResult)
async def run_med_search(req: MedRequest):
    try:
        data = await run_agent(req.drug, req.dosage, req.quantity)
        return {
            "store": data.get("store", ""),
            "price": float(data.get("price")),
            "title": data.get("title", ""),
            "all_results": data.get("all_results", []),
        }
    except Exception as e:
        print(f"❌ /run error: {e}")
        return {
            "store": "Fallback Pharmacy",
            "price": 12.99,
            "title": f"{req.drug} {req.dosage}",
            "all_results": [],
        }


@app.post("/parse-prescription")
async def parse_prescription(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        uploaded_file = client.files.upload(
            file=tmp_path,
            config={"mime_type": "application/pdf"}
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                uploaded_file,
                """You are a pharmacy assistant. Extract every medication from this prescription.

Return ONLY a JSON array — no markdown, no backticks, no explanation.
Each object must have exactly these three fields:
  "drug"     — brand or generic name, title-cased  (string)
  "dosage"   — e.g. "500mg", "10mg/5ml"; use "standard" if not specified  (string)
  "quantity" — number of tablets/units as an integer; default 90 if not mentioned  (int)

Example output:
[
  {"drug": "Metformin",  "dosage": "500mg", "quantity": 90},
  {"drug": "Lisinopril", "dosage": "10mg",  "quantity": 30}
]

If no medications are found, return: []"""
            ]
        )

        raw = response.text.strip()
        medications = safe_parse_json(raw)

        if not isinstance(medications, list):
            raise ValueError("Expected a JSON array from Gemini")

        clean = [
            {
                "drug":     str(m.get("drug", "Unknown")).strip(),
                "dosage":   str(m.get("dosage", "standard")).strip(),
                "quantity": int(m.get("quantity", 90)),
            }
            for m in medications if m.get("drug")
        ]

        return {"status": "success", "medications": clean}

    except Exception as e:
        print(f"❌ /parse-prescription error: {e}")
        return {
            "status": "error",
            "message": f"Could not parse prescription: {e}",
        }

    finally:
        os.unlink(tmp_path)


# ─────────────────────────────────────────────────────────────────────────────
# Static frontend
# ─────────────────────────────────────────────────────────────────────────────

if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

    @app.get("/")
    async def root():
        return FileResponse("static/index.html")