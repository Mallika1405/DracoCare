import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle, Info, ArrowLeft, Shield, Zap, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import DragonCharacter from "@/components/DragonCharacter";
import dragonDoctor from "@/assets/dragon-doctor.png";

const API = "http://localhost:8000";

const flagConfig = {
  RED_FLAG: { icon: AlertTriangle, bg: "bg-red-50", border: "border-red-200", iconColor: "text-red-500", label: "Red Flag", dot: "bg-red-500", pulse: true },
  WATCH: { icon: Info, bg: "bg-amber-50", border: "border-amber-200", iconColor: "text-amber-500", label: "Watch", dot: "bg-amber-400", pulse: false },
  GOOD: { icon: CheckCircle, bg: "bg-emerald-50", border: "border-emerald-200", iconColor: "text-emerald-500", label: "Good", dot: "bg-emerald-500", pulse: false },
};

const Consultation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = location.state?.sessionId;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [entranceComplete, setEntranceComplete] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentDialogue, setCurrentDialogue] = useState("Reviewing your case...");
  const [showContent, setShowContent] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => setEntranceComplete(true), 800);
    fetchAnalysis();
  }, []);

  const fetchAnalysis = async () => {
    if (!sessionId) { setLoading(false); return; }
    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (data.status === "success") {
        const a = data.analysis;
        setAnalysis(a);
        setLoading(false);

        const dialogues = [
          `Hi ${a.patient_name?.split(" ")[0]}! I've reviewed everything.`,
          a.summary || "Let me walk you through my findings.",
          a.urgent ? `⚠️ ${a.urgent_reason}` : "Swipe through the cards below.",
        ];

        dialogues.forEach((d, i) => {
          setTimeout(() => {
            setCurrentDialogue(d);
            setIsSpeaking(true);
            setTimeout(() => setIsSpeaking(false), 1000);
          }, i * 2500);
        });

        setTimeout(() => setShowContent(true), 1000);
      }
    } catch (e) {
      console.error("Analysis failed:", e);
      setLoading(false);
    }
  };

  const sections = analysis ? [
    { id: "summary", title: "Summary", icon: Shield, color: "text-secondary", dotColor: "bg-secondary" },
    { id: "flags", title: "Flags", icon: AlertTriangle, color: "text-amber-500", dotColor: "bg-amber-400", count: analysis.flags?.length, hasRed: analysis.flags?.some((f: any) => f.severity === "RED_FLAG") },
    { id: "conditions", title: "Conditions", icon: Shield, color: "text-secondary", dotColor: "bg-secondary", count: analysis.possible_conditions?.length },
    { id: "recommendations", title: "Next Steps", icon: CheckCircle, color: "text-emerald-500", dotColor: "bg-emerald-500" },
    { id: "questions", title: "Ask Doctor", icon: Info, color: "text-secondary", dotColor: "bg-secondary" },
  ] : [];

  const goNext = () => setActiveSection(prev => Math.min(prev + 1, sections.length - 1));
  const goPrev = () => setActiveSection(prev => Math.max(prev - 1, 0));

  const handleDragEnd = (_e: any, info: any) => {
    if (info.offset.x < -50) goNext();
    else if (info.offset.x > 50) goPrev();
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "linear-gradient(180deg, hsl(195 30% 95%) 0%, hsl(180 20% 98%) 40%, hsl(var(--background)) 100%)" }}>
        <DragonCharacter src={dragonDoctor} alt="Dr. Stitch MD" isSpeaking={true} className="w-32 h-32" />
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-2 h-2 rounded-full bg-secondary"
              animate={{ y: [0, -6, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground font-semibold">Dr. Stitch MD is reviewing your case...</p>
      </div>
    );
  }

  const renderCardContent = () => {
    if (!analysis) return null;
    const section = sections[activeSection];

    if (section.id === "summary") {
      return (
        <div className="space-y-4">
          {analysis.urgent && (
            <div className="bg-red-500 text-white rounded-2xl p-3 flex items-center gap-3">
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <Zap size={16} className="flex-shrink-0" />
              </motion.div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide mb-0.5">Urgent</p>
                <p className="text-xs opacity-90">{analysis.urgent_reason}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-red-500">{analysis.flags?.filter((f: any) => f.severity === "RED_FLAG").length || 0}</p>
              <p className="text-[10px] text-red-400 font-bold">Red Flags</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-amber-500">{analysis.flags?.filter((f: any) => f.severity === "WATCH").length || 0}</p>
              <p className="text-[10px] text-amber-400 font-bold">Watch</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-emerald-500">{analysis.flags?.filter((f: any) => f.severity === "GOOD").length || 0}</p>
              <p className="text-[10px] text-emerald-400 font-bold">Good</p>
            </div>
          </div>
          <div className="bg-muted/60 rounded-2xl p-4">
            <p className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wide mb-2">Overview</p>
            <p className="text-sm font-body text-foreground leading-relaxed">{analysis.summary}</p>
          </div>
          <p className="text-[11px] text-center text-muted-foreground font-body">Swipe left to see details →</p>
        </div>
      );
    }

    if (section.id === "flags") {
      return (
        <div className="space-y-2">
          {analysis.flags?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No flags found 🎉</p>}
          {analysis.flags?.map((flag: any, i: number) => {
            const config = flagConfig[flag.severity as keyof typeof flagConfig] || flagConfig.WATCH;
            const Icon = config.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className={`${config.bg} border ${config.border} rounded-xl p-3 relative overflow-hidden`}>
                {config.pulse && (
                  <motion.div className="absolute inset-0 bg-red-400/10 rounded-xl"
                    animate={{ opacity: [0, 0.6, 0] }} transition={{ duration: 2, repeat: Infinity }} />
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} className={config.iconColor} />
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${config.iconColor}`}>{config.label}</span>
                </div>
                <p className="font-heading font-bold text-foreground text-xs mb-0.5">{flag.title}</p>
                <p className="text-[11px] text-muted-foreground font-body">{flag.description}</p>
              </motion.div>
            );
          })}
        </div>
      );
    }

    if (section.id === "conditions") {
      return (
        <div className="space-y-2">
          {analysis.possible_conditions?.map((c: any, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="bg-muted rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-heading font-bold text-foreground text-xs">{c.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  c.likelihood === "very likely" ? "bg-secondary/15 text-secondary" : c.likelihood === "likely" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"
                }`}>{c.likelihood}</span>
              </div>
              <p className="text-xs text-muted-foreground font-body leading-relaxed">{c.explanation}</p>
            </motion.div>
          ))}
        </div>
      );
    }

    if (section.id === "recommendations") {
      return (
        <div className="space-y-2">
          {analysis.recommendations?.map((rec: string, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className="flex items-start gap-3 bg-muted rounded-xl p-3">
              <div className="w-6 h-6 rounded-lg bg-secondary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle size={12} className="text-secondary" />
              </div>
              <p className="text-xs font-body text-foreground font-semibold leading-relaxed">{rec}</p>
            </motion.div>
          ))}
        </div>
      );
    }

    if (section.id === "questions") {
      return (
        <div className="space-y-2">
          {analysis.questions_for_doctor?.map((q: string, i: number) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
              className="flex items-start gap-3 bg-muted rounded-xl p-3">
              <span className="w-6 h-6 rounded-full bg-secondary/15 text-secondary font-extrabold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-xs font-body text-foreground font-semibold leading-relaxed">{q}</p>
            </motion.div>
          ))}
        </div>
      );
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: "linear-gradient(180deg, hsl(195 30% 95%) 0%, hsl(180 20% 98%) 40%, hsl(var(--background)) 100%)" }}>
      <div className="absolute top-[-100px] left-[-80px] w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(195 40% 85% / 0.4)" }} />
      <div className="absolute bottom-[-80px] right-[-60px] w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(170 35% 88% / 0.3)" }} />

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="relative z-10 px-4 py-3 flex items-center gap-3 border-b border-border bg-background/60 backdrop-blur-sm flex-shrink-0">
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-border transition-colors">
          <ArrowLeft size={16} className="text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <img src={dragonDoctor} alt="Dr. Stitch MD" className="w-6 h-6 rounded-full object-cover" />
          <span className="font-heading font-extrabold text-foreground text-sm">Dr. Stitch MD</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="text-xs text-muted-foreground font-body font-semibold">In Session</span>
        </div>
      </motion.div>

      <div className="flex flex-col items-center pt-3 pb-2 px-6 flex-shrink-0">
        <motion.div initial={{ x: 120, opacity: 0 }} animate={entranceComplete ? { x: 0, opacity: 1 } : {}}
          transition={{ type: "spring", stiffness: 80, damping: 14 }}>
          <DragonCharacter src={dragonDoctor} alt="Dr. Stitch MD" isSpeaking={isSpeaking} className="w-24 h-24" />
        </motion.div>
        <div className="w-full max-w-sm mt-2">
          <AnimatePresence mode="wait">
            <motion.div key={currentDialogue} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white/80 border border-border/50 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
              <p className="text-sm font-body text-foreground leading-relaxed font-semibold">{currentDialogue}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {showContent && (
        <div className="flex justify-center px-4 pb-2 flex-shrink-0">
          <div className="flex gap-1.5 overflow-x-auto">
            {sections.map((s, i) => (
              <button key={s.id} onClick={() => setActiveSection(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-heading font-bold whitespace-nowrap transition-all ${
                  activeSection === i ? "bg-secondary text-secondary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-border"
                }`}>
                {s.id === "flags" && (s as any).hasRed && activeSection !== i && (
                  <motion.div className="w-1.5 h-1.5 rounded-full bg-red-500" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                )}
                {s.title}
                {(s as any).count && <span className="opacity-60">({(s as any).count})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {showContent && (
        <div className="flex-1 overflow-hidden px-4 min-h-0">
          <div className="max-w-sm mx-auto h-full flex flex-col">
            <div className="flex-1 min-h-0 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSection} ref={cardRef}
                  initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={handleDragEnd}
                  className="absolute inset-0 bg-card border-2 border-border rounded-2xl p-4 shadow-sm overflow-y-auto cursor-grab active:cursor-grabbing">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const s = sections[activeSection];
                        const Icon = s.icon;
                        return (<><Icon size={15} className={s.color} /><h3 className="font-heading font-extrabold text-foreground text-sm">{s.title}</h3></>);
                      })()}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-body">{activeSection + 1} / {sections.length}</span>
                  </div>
                  {renderCardContent()}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between pt-3 flex-shrink-0">
              <button onClick={goPrev} disabled={activeSection === 0}
                className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center disabled:opacity-20 hover:bg-border transition-all">
                <ChevronLeft size={18} className="text-foreground" />
              </button>
              <div className="flex gap-1.5">
                {sections.map((_, i) => (
                  <button key={i} onClick={() => setActiveSection(i)}
                    className={`rounded-full transition-all ${activeSection === i ? "w-4 h-2 bg-secondary" : "w-2 h-2 bg-muted-foreground/30"}`} />
                ))}
              </div>
              <button onClick={goNext} disabled={activeSection === sections.length - 1}
                className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center disabled:opacity-20 hover:bg-border transition-all">
                <ChevronRight size={18} className="text-foreground" />
              </button>
            </div>

            <motion.button
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
              onClick={() => navigate("/booking", { state: { sessionId } })}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="mt-3 mb-1 w-full py-3.5 rounded-2xl text-sm font-heading font-extrabold text-white flex items-center justify-center gap-2 shadow-md flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--secondary) / 0.8))" }}>
              <Calendar size={15} />Book an Appointment
            </motion.button>

            <p className="text-center text-[10px] text-muted-foreground font-body pb-3 flex-shrink-0">
              Not medical advice. Always consult a licensed physician.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Consultation;