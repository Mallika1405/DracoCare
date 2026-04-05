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
}

interface ParsedMed {
  drug: string;
  dosage: string;
  quantity: number;
}

const storeColors: Record<string, string> = {
  "costco": "hsl(220 70% 50%)",
  "walmart": "hsl(210 80% 45%)",
  "cvs": "hsl(355 70% 45%)",
  "walgreens": "hsl(255 60% 45%)",
  "rite aid": "hsl(5 70% 45%)",
  "amazon": "hsl(35 90% 45%)",
  "sam's club": "hsl(220 70% 45%)",
  "kroger": "hsl(280 55% 45%)",
  "target": "hsl(355 65% 45%)",
};

const getStoreColor = (store: string) => {
  const lower = store.toLowerCase();
  for (const key of Object.keys(storeColors)) {
    if (lower.includes(key)) return storeColors[key];
  }
  return "hsl(170 50% 38%)";
};

const MedCard = ({ med, index }: { med: MedResult; index: number }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: "spring", stiffness: 260, damping: 22 }}
      className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm"
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3.5 cursor-pointer"
        onClick={() => med.status === "done" && setExpanded(e => !e)}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {med.status === "pending" && (
            <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
              <Package size={14} className="text-muted-foreground" />
            </div>
          )}
          {med.status === "searching" && (
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Loader2 size={14} className="text-amber-500 animate-spin" />
            </div>
          )}
          {med.status === "done" && (
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <CheckCircle size={14} className="text-emerald-500" />
            </div>
          )}
          {med.status === "error" && (
            <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
              <AlertCircle size={14} className="text-red-400" />
            </div>
          )}
        </div>

        {/* Drug info */}
        <div className="flex-1 min-w-0">
          <p className="font-heading font-extrabold text-foreground text-sm truncate">
            {med.drug}
          </p>
          <p className="text-[11px] text-muted-foreground font-body font-semibold">
            {med.dosage} · {med.quantity} tablets
          </p>
        </div>

        {/* Price / status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {med.status === "done" && med.price !== undefined && (
            <div className="text-right">
              <p className="font-heading font-black text-lg text-emerald-600 leading-none">
                ${med.price.toFixed(2)}
              </p>
              <p
                className="text-[10px] font-bold truncate max-w-[80px]"
                style={{ color: getStoreColor(med.store || "") }}
              >
                {med.store}
              </p>
            </div>
          )}
          {med.status === "searching" && (
            <span className="text-[11px] text-amber-500 font-bold font-heading">Searching…</span>
          )}
          {med.status === "pending" && (
            <span className="text-[11px] text-muted-foreground font-body">Queued</span>
          )}
          {med.status === "error" && (
            <span className="text-[11px] text-red-400 font-bold font-heading">Not found</span>
          )}
          {med.status === "done" && (
            <div className="w-6 h-6 flex items-center justify-center text-muted-foreground">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && med.status === "done" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 pt-0 border-t border-border/60">
              <div className="mt-3 bg-muted/60 rounded-xl p-3 space-y-2">
                <p className="text-[11px] font-body text-muted-foreground uppercase tracking-wide font-bold">
                  Best Deal Found
                </p>
                <p className="font-body text-sm font-semibold text-foreground leading-snug">
                  {med.title}
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="font-heading font-extrabold text-2xl"
                      style={{ color: getStoreColor(med.store || "") }}
                    >
                      ${med.price?.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground font-body font-semibold">
                      at {med.store}
                    </p>
                  </div>
                  {med.link && med.link !== "#" && (
                    <a
                      href={med.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-bold text-white shadow-sm hover:brightness-110 transition-all"
                      style={{ background: getStoreColor(med.store || "") }}
                      onClick={e => e.stopPropagation()}
                    >
                      View Deal
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Searching progress bar */}
      {med.status === "searching" && (
        <div className="h-1 bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-amber-400"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "50%" }}
          />
        </div>
      )}
    </motion.div>
  );
};

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

  // Manual entry
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

  /* ──────── PDF UPLOAD ──────── */
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
      const res = await fetch(`${API}/parse-prescription`, {
        method: "POST",
        body: formData,
      });
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

  /* ──────── MANUAL ADD ──────── */
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

  /* ──────── SEARCH LOOP ──────── */
  const startSearch = async (meds: ParsedMed[]) => {
    setIsRunning(true);
    setPhase("results");

    const initial: MedResult[] = meds.map(m => ({
      ...m,
      status: "pending",
    }));
    setResults(initial);

    for (let i = 0; i < meds.length; i++) {
      const med = meds[i];
      speak(`Searching for ${med.drug}… (${i + 1}/${meds.length})`);

      // Mark as searching
      setResults(prev =>
        prev.map((r, idx) => idx === i ? { ...r, status: "searching" } : r)
      );

      try {
        const res = await fetch(`${API}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            drug: med.drug,
            dosage: med.dosage,
            quantity: med.quantity,
          }),
        });
        const data = await res.json();

        setResults(prev =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "done",
                  store: data.store,
                  price: data.price,
                  title: data.title,
                  link: data.link,
                }
              : r
          )
        );
      } catch {
        setResults(prev =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "error", error: "Search failed" } : r
          )
        );
      }

      // Small delay between searches so browser agent isn't spammed
      if (i < meds.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setIsRunning(false);
    speak("All done! Tap any result to see the deal. 🎉");
  };

  const totalSaved = results
    .filter(r => r.status === "done" && r.price !== undefined)
    .reduce((sum, r) => sum + (r.price ?? 0), 0);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative"
      style={{
        background:
          "linear-gradient(180deg, hsl(170 30% 94%) 0%, hsl(160 20% 97%) 40%, hsl(var(--background)) 100%)",
      }}
    >
      {/* Ambient blobs */}
      <div
        className="absolute top-[-100px] left-[-80px] w-72 h-72 rounded-full blur-3xl pointer-events-none"
        style={{ background: "hsl(170 40% 82% / 0.4)" }}
      />
      <div
        className="absolute bottom-[-80px] right-[-60px] w-64 h-64 rounded-full blur-3xl pointer-events-none"
        style={{ background: "hsl(180 35% 85% / 0.3)" }}
      />
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 px-4 py-3 flex items-center gap-3 border-b border-border bg-background/60 backdrop-blur-sm flex-shrink-0"
      >
        <button
          onClick={() => navigate("/")}
          className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-border transition-colors"
        >
          <ArrowLeft size={16} className="text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <img
            src={dragonPharmacist}
            alt="Rx"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="font-heading font-extrabold text-foreground text-sm">
            Rx — Pharmacist
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "hsl(170 50% 40%)" }}
          />
          <span className="text-xs text-muted-foreground font-body font-semibold">
            {isRunning ? "Searching…" : "Online"}
          </span>
        </div>
      </motion.div>

      {/* Dragon + Dialogue */}
      <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0 max-w-sm mx-auto w-full">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120 }}
          className="flex-shrink-0"
        >
          <DragonCharacter
            src={dragonPharmacist}
            alt="Rx"
            isSpeaking={isSpeaking}
            className="w-16 h-16"
          />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={dialogue}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 bg-white/80 border border-border/50 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
          >
            <p className="text-sm font-body text-foreground leading-relaxed font-semibold">
              {dialogue}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── INPUT PHASE ── */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="max-w-sm mx-auto space-y-4">

            {/* PDF Upload */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-[11px] font-heading font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Option 1 — Upload Prescription PDF
              </p>
              <div
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                  isDragging
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-border bg-white/50 hover:border-border/80 hover:bg-white/70"
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handlePdfUpload(file);
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                  style={{ background: "hsl(170 50% 40% / 0.12)" }}
                >
                  <Paperclip size={20} style={{ color: "hsl(170 50% 38%)" }} />
                </div>
                <p className="text-sm font-heading font-bold text-foreground mb-1">
                  Drop your prescription here
                </p>
                <p className="text-xs text-muted-foreground font-body mb-3">
                  Gemini will extract all medications automatically
                </p>
                {uploadStatus && (
                  <p className="text-xs font-body text-muted-foreground mb-3">
                    {uploadStatus}
                  </p>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl text-sm font-heading font-bold text-white shadow-sm hover:brightness-110 transition-all"
                  style={{ background: "hsl(170 50% 38%)" }}
                >
                  Choose PDF
                </button>
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
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground font-body font-semibold">
                or type them in
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Manual entry */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3"
            >
              <p className="text-[11px] font-heading font-bold text-muted-foreground uppercase tracking-wide">
                Option 2 — Enter Manually
              </p>

              <div className="bg-white/60 border border-border rounded-2xl p-4 space-y-3">
                <input
                  type="text"
                  value={manualDrug}
                  onChange={e => setManualDrug(e.target.value)}
                  placeholder="Drug name (e.g. Metformin)"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm font-body font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualDosage}
                    onChange={e => setManualDosage(e.target.value)}
                    placeholder="Dosage (e.g. 500mg)"
                    className="flex-1 bg-muted border border-border rounded-xl px-3 py-2.5 text-sm font-body font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all"
                  />
                  <input
                    type="number"
                    value={manualQty}
                    onChange={e => setManualQty(e.target.value)}
                    placeholder="Qty"
                    className="w-20 bg-muted border border-border rounded-xl px-3 py-2.5 text-sm font-body font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all"
                  />
                </div>
                <button
                  onClick={addManualMed}
                  disabled={!manualDrug.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-heading font-bold text-white disabled:opacity-30 hover:brightness-110 transition-all flex items-center justify-center gap-2"
                  style={{ background: "hsl(170 50% 38%)" }}
                >
                  <Plus size={14} />
                  Add Medication
                </button>
              </div>

              {/* Manual list */}
              <AnimatePresence>
                {manualList.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5"
                  >
                    <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-foreground text-sm truncate">
                        {m.drug}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-body">
                        {m.dosage} · {m.quantity} tablets
                      </p>
                    </div>
                    <button
                      onClick={() => removeManual(i)}
                      className="w-6 h-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <X size={12} className="text-emerald-600" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {manualList.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={searchManual}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 rounded-xl text-[15px] font-heading font-extrabold text-white shadow-md flex items-center justify-center gap-2 hover:brightness-110 transition-all"
                  style={{
                    background: "linear-gradient(135deg, hsl(170 50% 38%), hsl(170 50% 32%))",
                  }}
                >
                  <Search size={16} />
                  Find Cheapest Prices ({manualList.length})
                </motion.button>
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* ── RESULTS PHASE ── */}
      {phase === "results" && (
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="max-w-sm mx-auto space-y-3">

            {/* Summary bar */}
            <AnimatePresence>
              {!isRunning && results.some(r => r.status === "done") && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide font-heading">
                      Total Found
                    </p>
                    <p className="font-heading font-black text-2xl text-emerald-700">
                      ${totalSaved.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-emerald-500 font-body font-semibold">
                      across {results.filter(r => r.status === "done").length} medications
                    </p>
                  </div>
                  <div className="text-4xl">🎉</div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress indicator while running */}
            {isRunning && (
              <div className="flex items-center gap-2 px-1">
                <Loader2 size={14} className="text-amber-500 animate-spin flex-shrink-0" />
                <p className="text-xs text-muted-foreground font-body font-semibold">
                  Searching one by one for the best prices…
                </p>
              </div>
            )}

            {/* Med cards */}
            {results.map((med, i) => (
              <MedCard key={i} med={med} index={i} />
            ))}

            {/* Start over */}
            {!isRunning && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                onClick={() => {
                  setPhase("input");
                  setResults([]);
                  setManualList([]);
                  setUploadStatus("");
                  speak(
                    "Hey! Upload your prescription PDF or type your meds and I'll find the cheapest prices 💊"
                  );
                }}
                className="w-full py-3 rounded-xl text-sm font-heading font-bold text-muted-foreground bg-muted hover:bg-border transition-all"
              >
                ← Search Again
              </motion.button>
            )}

            <p className="text-center text-[10px] text-muted-foreground font-body pb-1">
              Prices sourced from major pharmacy chains. Always verify before purchasing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pharmacy;