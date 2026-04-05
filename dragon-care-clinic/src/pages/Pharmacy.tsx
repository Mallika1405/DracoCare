import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Paperclip,
  Search,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Plus,
  X,
  Package,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import dragonPharmacist from "@/assets/dragon-pharmacist.png";
import DragonCharacter from "@/components/DragonCharacter";

const API = "http://localhost:8000";

interface MedResult {
  drug: string;
  dosage: string;
  quantity: number;
  status: "pending" | "searching" | "done" | "error";
  store?: string;
  price?: number;
  title?: string;
  link?: string;
  error?: string;
  allResults?: string[];
}

interface ParsedMed {
  drug: string;
  dosage: string;
  quantity: number;
}

// Store config: color + short display name
const STORE_CONFIG: Record<string, { color: string; bg: string; short: string }> = {
  costco:     { color: "#1a3c8f", bg: "#e8edf8", short: "Costco" },
  walmart:    { color: "#0071ce", bg: "#e5f3ff", short: "Walmart" },
  cvs:        { color: "#cc0000", bg: "#fde8e8", short: "CVS" },
  walgreens:  { color: "#e4002b", bg: "#fde8ec", short: "Walgreens" },
  "rite aid": { color: "#003087", bg: "#e5ebf7", short: "Rite Aid" },
  amazon:     { color: "#e47911", bg: "#fef3e2", short: "Amazon" },
  "sam's club": { color: "#0067a0", bg: "#e5f0f8", short: "Sam's" },
  kroger:     { color: "#214FC6", bg: "#eaedfc", short: "Kroger" },
  target:     { color: "#cc0000", bg: "#fde8e8", short: "Target" },
};

const getStoreConfig = (store: string) => {
  const lower = store.toLowerCase();
  for (const [key, cfg] of Object.entries(STORE_CONFIG)) {
    if (lower.includes(key)) return cfg;
  }
  return { color: "#0f766e", bg: "#e6f7f5", short: store.split(" ")[0] };
};

const parsePrice = (result: string): number | null => {
  const match = result.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(",", ""));
  return isNaN(val) ? null : val;
};

// Parse "StoreName: $X.XX (product name)" into parts
const parseResultLine = (result: string) => {
  const colonIdx = result.indexOf(":");
  const storeName = colonIdx > -1 ? result.slice(0, colonIdx).trim() : result.split(/[\s$]/)[0].trim();
  const rest = colonIdx > -1 ? result.slice(colonIdx + 1).trim() : result;
  const price = parsePrice(rest);
  // Extract product name from parens if present
  const parenMatch = rest.match(/\(([^)]+)\)/);
  const product = parenMatch ? parenMatch[1] : rest.replace(/\$[\d.,]+/, "").trim();
  return { storeName, price, product };
};

// ── Price bar chart row ──────────────────────────────────────────────────────
const PriceBar = ({
  result,
  maxPrice,
  isCheapest,
  rank,
}: {
  result: string;
  maxPrice: number;
  isCheapest: boolean;
  rank: number;
}) => {
  const { storeName, price, product } = parseResultLine(result);
  const cfg = getStoreConfig(storeName);
  const barPct = maxPrice > 0 && price !== null ? (price / maxPrice) * 100 : 50;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05, type: "spring", stiffness: 300, damping: 28 }}
      className={`relative rounded-2xl overflow-hidden ${isCheapest ? "ring-2 ring-emerald-400/60" : ""}`}
      style={{ background: isCheapest ? "#f0fdf8" : "#f8f9fa" }}
    >
      {/* Bar fill */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${barPct}%` }}
        transition={{ delay: rank * 0.05 + 0.15, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="absolute inset-y-0 left-0 rounded-2xl"
        style={{
          background: isCheapest
            ? "linear-gradient(90deg, #d1fae5, #a7f3d0)"
            : `linear-gradient(90deg, ${cfg.bg}, ${cfg.bg}88)`,
          opacity: 0.8,
        }}
      />

      <div className="relative flex items-center gap-2.5 px-3 py-2.5">
        {/* Rank badge */}
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
          style={{
            background: isCheapest ? "#10b981" : "#e5e7eb",
            color: isCheapest ? "white" : "#6b7280",
          }}
        >
          {isCheapest ? "✓" : rank + 1}
        </div>

        {/* Store pill */}
        <span
          className="text-[11px] font-black px-2 py-0.5 rounded-lg flex-shrink-0"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.short}
        </span>

        {/* Product name */}
        <span className="text-[11px] text-gray-500 font-medium flex-1 truncate leading-tight">
          {product.slice(0, 38)}{product.length > 38 ? "…" : ""}
        </span>

        {/* Price */}
        <span
          className="text-sm font-black flex-shrink-0"
          style={{ color: isCheapest ? "#059669" : "#374151" }}
        >
          {price !== null ? `$${price.toFixed(2)}` : "—"}
        </span>
      </div>
    </motion.div>
  );
};

// ── Med result card ──────────────────────────────────────────────────────────
const MedCard = ({ med, index }: { med: MedResult; index: number }) => {
  const [expanded, setExpanded] = useState(false);

  const sortedResults = med.allResults
    ? [...med.allResults].sort((a, b) => {
        const pa = parsePrice(a) ?? Infinity;
        const pb = parsePrice(b) ?? Infinity;
        return pa - pb;
      })
    : [];

  const maxPrice = sortedResults.reduce((m, r) => Math.max(m, parsePrice(r) ?? 0), 0);
  const cfg = getStoreConfig(med.store || "");

  // Savings vs most expensive
  const mostExpensive = sortedResults.length > 1 ? (parsePrice(sortedResults[sortedResults.length - 1]) ?? 0) : 0;
  const savings = mostExpensive > 0 && med.price ? mostExpensive - med.price : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 240, damping: 24 }}
      className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100"
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => med.status === "done" && setExpanded(e => !e)}
      >
        {/* Status / store icon */}
        <div className="flex-shrink-0">
          {med.status === "pending" && (
            <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Package size={16} className="text-gray-400" />
            </div>
          )}
          {med.status === "searching" && (
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Loader2 size={16} className="text-amber-500 animate-spin" />
            </div>
          )}
          {med.status === "done" && (
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.short.slice(0, 2).toUpperCase()}
            </div>
          )}
          {med.status === "error" && (
            <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
              <AlertCircle size={16} className="text-red-400" />
            </div>
          )}
        </div>

        {/* Drug name + dosage */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 text-[15px] truncate tracking-tight">
            {med.drug}
          </p>
          <p className="text-[12px] text-gray-400 font-medium mt-0.5">
            {med.dosage} &middot; {med.quantity} tablets
          </p>
        </div>

        {/* Price column */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {med.status === "done" && med.price !== undefined && (
            <div className="text-right">
              <p className="font-black text-2xl leading-none tracking-tight" style={{ color: cfg.color }}>
                ${med.price.toFixed(2)}
              </p>
              <p className="text-[11px] font-bold mt-0.5" style={{ color: cfg.color, opacity: 0.7 }}>
                {cfg.short}
              </p>
            </div>
          )}
          {med.status === "searching" && (
            <span className="text-[12px] text-amber-500 font-bold">Searching…</span>
          )}
          {med.status === "pending" && (
            <span className="text-[12px] text-gray-400 font-medium">Queued</span>
          )}
          {med.status === "error" && (
            <span className="text-[12px] text-red-400 font-bold">Not found</span>
          )}
          {med.status === "done" && (
            <div className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 ml-1">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          )}
        </div>
      </div>

      {/* Savings ribbon */}
      {med.status === "done" && savings > 0.01 && (
        <div className="mx-4 mb-3 -mt-1 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
          <TrendingDown size={12} className="text-emerald-600 flex-shrink-0" />
          <span className="text-[11px] font-bold text-emerald-700">
            Save ${savings.toFixed(2)} vs most expensive option
          </span>
        </div>
      )}

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && med.status === "done" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100">

              {/* Best deal highlight */}
              <div
                className="mt-3 rounded-2xl p-3.5 flex items-start justify-between gap-3"
                style={{ background: cfg.bg }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={12} style={{ color: cfg.color }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
                      Best Deal
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-gray-700 leading-snug line-clamp-2">
                    {med.title}
                  </p>
                  <p className="text-[11px] font-medium mt-1" style={{ color: cfg.color, opacity: 0.8 }}>
                    at {med.store}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="text-2xl font-black tracking-tight" style={{ color: cfg.color }}>
                    ${med.price?.toFixed(2)}
                  </span>
                  {med.link && med.link !== "#" && (
                    <a
                      href={med.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white"
                      style={{ background: cfg.color }}
                    >
                      Shop <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>

              {/* Price comparison */}
              {sortedResults.length > 1 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                      Price Comparison
                    </span>
                    <span className="text-[11px] font-semibold text-gray-400">
                      {sortedResults.length} stores
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedResults.map((result, i) => (
                      <PriceBar
                        key={i}
                        result={result}
                        maxPrice={maxPrice}
                        isCheapest={i === 0}
                        rank={i}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Searching shimmer bar */}
      {med.status === "searching" && (
        <div className="h-0.5 bg-gray-100 overflow-hidden mx-4 mb-3 rounded-full">
          <motion.div
            className="h-full bg-amber-400 rounded-full"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "45%" }}
          />
        </div>
      )}
    </motion.div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────
const Pharmacy = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<"input" | "results">("input");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [dialogue, setDialogue] = useState(
    "Hey! Upload your prescription PDF or type your meds and I'll find the cheapest prices 💊"
  );

  const [manualDrug, setManualDrug] = useState("");
  const [manualDosage, setManualDosage] = useState("");
  const [manualQty, setManualQty] = useState("90");
  const [manualList, setManualList] = useState<ParsedMed[]>([]);

  const [results, setResults] = useState<MedResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const speak = (text: string) => {
    setDialogue(text);
    setIsSpeaking(true);
    setTimeout(() => setIsSpeaking(false), 1500);
  };

  const handlePdfUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus("❌ Please upload a PDF");
      return;
    }
    setUploadStatus("⏳ Reading prescription with Gemini…");
    speak("Reading your prescription…");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/parse-prescription`, { method: "POST", body: formData });
      const data = await res.json();

      if (data.status === "success" && data.medications?.length) {
        setUploadStatus(`✅ Found ${data.medications.length} medication(s)`);
        speak(`Found ${data.medications.length} med${data.medications.length > 1 ? "s" : ""}! Starting price search now 🔍`);
        startSearch(data.medications);
      } else {
        setUploadStatus("❌ Couldn't parse medications. Try typing them manually.");
        speak("Hmm, I couldn't read that. Try typing your meds below!");
      }
    } catch {
      setUploadStatus("❌ Connection error. Is the backend running?");
    }
  };

  const addManualMed = () => {
    if (!manualDrug.trim()) return;
    const med: ParsedMed = {
      drug: manualDrug.trim(),
      dosage: manualDosage.trim() || "standard",
      quantity: parseInt(manualQty) || 90,
    };
    setManualList(prev => [...prev, med]);
    setManualDrug("");
    setManualDosage("");
    setManualQty("90");
    speak(`Added ${med.drug}! Add more or hit search.`);
  };

  const removeManual = (i: number) =>
    setManualList(prev => prev.filter((_, idx) => idx !== i));

  const searchManual = () => {
    if (!manualList.length) return;
    speak(`Searching ${manualList.length} medication${manualList.length > 1 ? "s" : ""} — hold tight! 🐉`);
    startSearch(manualList);
  };

  const startSearch = async (meds: ParsedMed[]) => {
    setIsRunning(true);
    setPhase("results");
    setResults(meds.map(m => ({ ...m, status: "pending" })));

    for (let i = 0; i < meds.length; i++) {
      const med = meds[i];
      speak(`Searching for ${med.drug}… (${i + 1}/${meds.length})`);
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "searching" } : r));

      try {
        const res = await fetch(`${API}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ drug: med.drug, dosage: med.dosage, quantity: med.quantity }),
        });
        const data = await res.json();

        setResults(prev =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "done", store: data.store, price: data.price, title: data.title, link: data.link, allResults: data.all_results ?? [] }
              : r
          )
        );
      } catch {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: "Search failed" } : r));
      }

      if (i < meds.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setIsRunning(false);
    speak("All done! Tap any card to compare all pharmacy prices. 🎉");
  };

  const doneResults = results.filter(r => r.status === "done" && r.price !== undefined);
  const totalCost = doneResults.reduce((sum, r) => sum + (r.price ?? 0), 0);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: "linear-gradient(160deg, #f0fdf9 0%, #f8fffe 35%, #ffffff 100%)" }}
    >
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(#059669 1px, transparent 1px), linear-gradient(90deg, #059669 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 px-4 pt-3 pb-2.5 flex items-center gap-3 border-b border-gray-100/80 bg-white/70 backdrop-blur-md flex-shrink-0"
      >
        <button
          onClick={() => navigate("/")}
          className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft size={15} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <img src={dragonPharmacist} alt="Rx" className="w-6 h-6 rounded-full object-cover" />
          <span className="font-black text-gray-900 text-sm tracking-tight">Rx — Pharmacist</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
          <span className="text-[11px] text-gray-400 font-semibold">
            {isRunning ? "Searching…" : "Online"}
          </span>
        </div>
      </motion.div>

      {/* ── Dragon dialogue ── */}
      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0 max-w-sm mx-auto w-full">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120 }}
          className="flex-shrink-0"
        >
          <DragonCharacter src={dragonPharmacist} alt="Rx" isSpeaking={isSpeaking} className="w-14 h-14" />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={dialogue}
            initial={{ opacity: 0, x: 8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="flex-1 bg-white border border-gray-100 rounded-2xl rounded-tl-md px-3.5 py-2.5 shadow-sm"
          >
            <p className="text-[13px] font-semibold text-gray-700 leading-relaxed">{dialogue}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ══════════════ INPUT PHASE ══════════════ */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="max-w-sm mx-auto space-y-5">

            {/* PDF drop zone */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-2">
                Option 1 — Upload Prescription
              </p>
              <div
                className={`relative border-2 border-dashed rounded-3xl p-6 text-center transition-all cursor-pointer ${
                  isDragging ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handlePdfUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 mx-auto mb-3 flex items-center justify-center">
                  <Paperclip size={18} className="text-emerald-600" />
                </div>
                <p className="text-[14px] font-black text-gray-800 mb-1">Drop prescription PDF</p>
                <p className="text-[12px] text-gray-400 mb-3">Gemini reads and extracts all medications</p>
                {uploadStatus && (
                  <p className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-1.5 inline-block mb-2">{uploadStatus}</p>
                )}
                <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-colors">
                  Choose PDF
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </motion.div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] text-gray-400 font-semibold">or type manually</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Manual entry */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                Option 2 — Enter Manually
              </p>

              <div className="bg-white border border-gray-100 rounded-3xl p-4 space-y-2.5 shadow-sm">
                <input
                  type="text"
                  value={manualDrug}
                  onChange={e => setManualDrug(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addManualMed()}
                  placeholder="Drug name (e.g. Metformin)"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualDosage}
                    onChange={e => setManualDosage(e.target.value)}
                    placeholder="Dosage (e.g. 500mg)"
                    className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                  />
                  <input
                    type="number"
                    value={manualQty}
                    onChange={e => setManualQty(e.target.value)}
                    placeholder="Qty"
                    className="w-20 bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2.5 text-[13px] font-semibold text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                  />
                </div>
                <button
                  onClick={addManualMed}
                  disabled={!manualDrug.trim()}
                  className="w-full py-2.5 rounded-2xl text-[13px] font-black text-white bg-emerald-600 disabled:opacity-30 hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} />
                  Add Medication
                </button>
              </div>

              {/* Queued meds */}
              <AnimatePresence>
                {manualList.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 bg-white border border-emerald-100 rounded-2xl px-3.5 py-2.5 shadow-sm"
                  >
                    <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={13} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-800 text-[13px] truncate">{m.drug}</p>
                      <p className="text-[11px] text-gray-400 font-medium">{m.dosage} · {m.quantity} tablets</p>
                    </div>
                    <button
                      onClick={() => removeManual(i)}
                      className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                      <X size={11} className="text-gray-500" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {manualList.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={searchManual}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-4 rounded-3xl text-[15px] font-black text-white shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  style={{ background: "linear-gradient(135deg, #059669, #0f766e)" }}
                >
                  <Search size={16} />
                  Find Cheapest Prices ({manualList.length})
                </motion.button>
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* ══════════════ RESULTS PHASE ══════════════ */}
      {phase === "results" && (
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="max-w-sm mx-auto space-y-3">

            {/* Summary card */}
            <AnimatePresence>
              {!isRunning && doneResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="rounded-3xl p-4 flex items-center justify-between"
                  style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}
                >
                  <div>
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.12em] mb-0.5">
                      Total Cost Found
                    </p>
                    <p className="font-black text-3xl text-emerald-800 tracking-tight leading-none">
                      ${totalCost.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                      across {doneResults.length} medication{doneResults.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-white/50 flex items-center justify-center text-3xl">
                    🎉
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Searching indicator */}
            {isRunning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-3.5 py-2.5"
              >
                <Loader2 size={13} className="text-amber-500 animate-spin flex-shrink-0" />
                <p className="text-[12px] text-amber-700 font-semibold">
                  Searching for the best prices across pharmacies…
                </p>
              </motion.div>
            )}

            {/* Result cards */}
            {results.map((med, i) => (
              <MedCard key={i} med={med} index={i} />
            ))}

            {/* Search again */}
            {!isRunning && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={() => {
                  setPhase("input");
                  setResults([]);
                  setManualList([]);
                  setUploadStatus("");
                  speak("Hey! Upload your prescription PDF or type your meds and I'll find the cheapest prices 💊");
                }}
                className="w-full py-3.5 rounded-2xl text-[13px] font-black text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-[0.98] transition-all"
              >
                ← Search Again
              </motion.button>
            )}

            <p className="text-center text-[10px] text-gray-300 font-medium pb-1">
              Prices sourced from major pharmacy chains · Always verify before purchasing
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pharmacy;