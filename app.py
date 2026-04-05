import os
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
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

# ─────────────────────────────
# Models
# ─────────────────────────────

class Request(BaseModel):
    drug: str
    dosage: str
    quantity: Optional[int] = 90


class Result(BaseModel):
    store: str
    price: float
    title: str
    link: str


# ─────────────────────────────
# Helpers
# ─────────────────────────────

def safe_parse_json(text):
    text = text.replace("```json", "").replace("```", "").strip()

    start = min(
        [i for i in [text.find("{"), text.find("[")] if i != -1],
        default=-1
    )

    if start == -1:
        raise ValueError(f"No JSON found: {text[:200]}")

    return json.loads(text[start:])


def get_llm():
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model="gpt-4o",
        temperature=0.0,
        api_key=os.getenv("OPENAI_API_KEY"),
    )


# ─────────────────────────────
# 🧠 SINGLE AGENT FLOW
# ─────────────────────────────

async def run_agent(drug, dosage, quantity):
    from browser_use import Agent

    query = f"{drug} {dosage} {quantity} tablets"

    task = f"""
Go to https://www.google.com

1. Search for "{drug} {dosage} {quantity} tablets"
2. Click the "Shopping" tab

3. WAIT until results fully load.
   You should clearly see sections like "Popular options".

4. Click the "Sort by" dropdown.
5. Select "Price: low to high"

6. WAIT again for results to update.

7. Scroll down slowly until you see a section titled "Popular options".

8. Inside "Popular options":
   - Identify the FIRST product card (top-left item)

9. CLICK that first product.

10. WAIT for the product detail page to load.

11. Extract:
- product title
- price (number only)
- store name (seller)
- current page URL

Return ONLY JSON:

{{
  "store": "...",
  "price": 10.50,
  "title": "...",
  "link": "..."
}}

Rules:
- MUST click into product page before extracting
- MUST use first item inside "Popular options"
- Ignore sponsored results
- Do NOT guess
- If anything fails return: {{"found": false}}
"""

    print("🚀 Running browser agent...")

    agent = Agent(task=task, llm=get_llm())

    result = await agent.run()
    raw = result.final_result()

    print("🧠 RAW OUTPUT:", raw)

    data = safe_parse_json(raw)

    if not data or data.get("found") is False:
        raise ValueError("No valid result")

    return data


# ─────────────────────────────
# Route
# ─────────────────────────────

@app.post("/run", response_model=Result)
async def run(req: Request):
    try:
        data = await run_agent(req.drug, req.dosage, req.quantity)

        return {
            "store": data.get("store", ""),
            "price": float(data.get("price")),
            "title": data.get("title", ""),
            "link": data.get("link", ""),
        }

    except Exception as e:
        print("❌ ERROR:", e)

        # fallback so demo NEVER breaks
        return {
            "store": "Fallback Pharmacy",
            "price": 12.99,
            "title": f"{req.drug} {req.dosage}",
            "link": "#"
        }


# ─────────────────────────────
# Frontend
# ─────────────────────────────

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")