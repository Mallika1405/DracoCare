import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, MapPin, Phone, Shield, CheckCircle, Calendar,
  Clock, Star, ExternalLink, CalendarPlus, Loader2,
  AlertCircle, ChevronRight, Navigation,
  Pencil, X, PhoneCall, Sparkles
} from "lucide-react";
import dragonReceptionist from "@/assets/dragon-receptionist.png";
import DragonCharacter from "@/components/DragonCharacter";

const API = "http://localhost:8000";

interface Hospital {
  id: string;
  name: string;
  address: string;
  phone: string;
  rating: number;
  user_ratings_total: number;
  distance: string;
  website: string;
  open_now: boolean | null;
  hours: string[];
  insurance_verified: boolean;
  insurance_note: string;
  lat: number;
  lng: number;
  place_id: string;
}

type Step = "locating" | "hospitals" | "scheduling" | "calling" | "calendar" | "done";

interface SlotItem { day: string; date: string; dateISO: string; time: string }
interface DaySlot { day: string; date: string; dateISO: string; times: string[] }

function buildWeekSlots(busyPeriods: { start: string; end: string }[]): DaySlot[] {
  const allTimes = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "4:30 PM"];
  const today = new Date();
  const slots: DaySlot[] = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
    const dateLabel = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const dateISO = d.toISOString().split("T")[0];

    const freeTimes = allTimes.filter((t) => {
      const [time, meridiem] = t.split(" ");
      const [hStr, mStr] = time.split(":");
      let h = parseInt(hStr);
      if (meridiem === "PM" && h !== 12) h += 12;
      const slotStart = new Date(d);
      slotStart.setHours(h, parseInt(mStr || "0"), 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + 60);
      return !busyPeriods.some((b) => {
        const bs = new Date(b.start);
        const be = new Date(b.end);
        return slotStart < be && slotEnd > bs;
      });
    });

    if (freeTimes.length > 0) {
      slots.push({ day: dayLabel, date: dateLabel, dateISO, times: freeTimes });
    }
  }
  return slots;
}

function timeToISO(dateISO: string, timeStr: string): string {
  const [time, meridiem] = timeStr.split(" ");
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr);
  if (meridiem === "PM" && h !== 12) h += 12;
  return `${dateISO}T${String(h).padStart(2, "0")}:${mStr || "00"}:00`;
}

function requestGoogleCalendarToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      reject(new Error("VITE_GOOGLE_CLIENT_ID not set"));
      return;
    }
    const goog = (window as any).google;
    if (!goog?.accounts?.oauth2) {
      reject(new Error("Google Identity Services not loaded. Add the GIS script to index.html."));
      return;
    }
    const client = goog.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
      callback: (resp: any) => {
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

const AnitaBubble = ({ text, isSpeaking }: { text: string; isSpeaking: boolean }) => (
  <div className="flex items-end gap-2 mb-4">
    <div className="flex-shrink-0">
      <DragonCharacter src={dragonReceptionist} alt="Anita" isSpeaking={isSpeaking} className="w-10 h-10" />
    </div>
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }}
        className="bg-white/90 border border-border/60 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm max-w-[80%]"
      >
        <p className="text-sm font-body font-semibold text-foreground leading-relaxed">{text}</p>
      </motion.div>
    </AnimatePresence>
  </div>
);

const HospitalCard = ({
  h, selected, onSelect, index,
}: { h: Hospital; selected: boolean; onSelect: () => void; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.08, type: "spring", stiffness: 220, damping: 26 }}
    onClick={onSelect}
    className={`relative rounded-2xl border-2 p-4 cursor-pointer transition-all select-none ${
      selected
        ? "border-secondary bg-secondary/5 shadow-lg shadow-secondary/10"
        : "border-border bg-white/70 hover:border-secondary/40 hover:shadow-md"
    }`}
  >
    <div className="absolute -top-2.5 -left-2 w-6 h-6 rounded-full bg-secondary text-white text-[10px] font-extrabold flex items-center justify-center shadow">
      {index + 1}
    </div>
    {selected && (
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
        className="absolute -top-2 -right-2 w-6 h-6 bg-secondary rounded-full flex items-center justify-center shadow">
        <CheckCircle size={13} className="text-white" />
      </motion.div>
    )}
    <div className="flex items-start gap-3 mb-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h3 className="font-heading font-extrabold text-foreground text-sm leading-tight">{h.name}</h3>
          {h.open_now === true && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">OPEN</span>}
          {h.open_now === false && <span className="text-[9px] font-bold bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">CLOSED</span>}
        </div>
        <p className="text-[11px] text-muted-foreground font-body leading-snug flex items-start gap-1">
          <MapPin size={9} className="mt-0.5 flex-shrink-0" />{h.address}
        </p>
      </div>
      <div className="flex flex-col items-end flex-shrink-0 gap-1">
        <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-0.5">
          <Navigation size={9} /> {h.distance}
        </span>
        <div className="flex items-center gap-0.5">
          <Star size={9} className="text-amber-400 fill-amber-400" />
          <span className="text-[10px] font-bold text-muted-foreground">{h.rating > 0 ? h.rating.toFixed(1) : "—"}</span>
          {h.user_ratings_total > 0 && <span className="text-[9px] text-muted-foreground/60">({h.user_ratings_total})</span>}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
        h.insurance_verified ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"
      }`}>
        <Shield size={9} />{h.insurance_note}
      </div>
      {h.phone && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
          <Phone size={9} />{h.phone}
        </div>
      )}
      {h.website && (
        <a href={h.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border hover:bg-secondary/10 hover:text-secondary transition-colors">
          <ExternalLink size={9} />Website
        </a>
      )}
    </div>
  </motion.div>
);

const Booking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = location.state?.sessionId;

  const [patient, setPatient] = useState<any>(null);
  const [step, setStep] = useState<Step>("locating");
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [searchError, setSearchError] = useState("");

  const [weekSlots, setWeekSlots] = useState<DaySlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<SlotItem[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);

  const [callId, setCallId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState("idle");
  const [callTranscript, setCallTranscript] = useState("");
  const [callConfirmed, setCallConfirmed] = useState(false);

  const [eventLink, setEventLink] = useState("");
  const [calendarAdded, setCalendarAdded] = useState(false);

  const [anitaText, setAnitaText] = useState("Let me find the best clinics near you…");
  const [anitaSpeaking, setAnitaSpeaking] = useState(true);

  const primarySlot = selectedSlots[0] ?? null;

  function say(text: string) {
    setAnitaText(text);
    setAnitaSpeaking(true);
    setTimeout(() => setAnitaSpeaking(false), 1600);
  }

  function toggleSlot(slot: SlotItem) {
    setSelectedSlots(prev => {
      const exists = prev.some(s => s.day === slot.day && s.time === slot.time);
      if (exists) return prev.filter(s => !(s.day === slot.day && s.time === slot.time));
      if (prev.length >= 3) return prev;
      return [...prev, slot];
    });
  }

  useEffect(() => {
    const fetchPatientAndSearch = async () => {
      let loc: { lat: number; lng: number } | null = null;
      let patientData: any = {};

      if (sessionId) {
        try {
          const r = await fetch(`${API}/patient/${sessionId}`);
          patientData = await r.json();
          setPatient(patientData);
          if (patientData?.location?.lat) loc = patientData.location;
        } catch { }
      }

      if (!loc) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          );
          loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {
          loc = { lat: 34.0522, lng: -118.2437 };
        }
      }

      await searchHospitals(loc, patientData);
    };

    fetchPatientAndSearch();
  }, [sessionId]);

  const searchHospitals = async (loc: { lat: number; lng: number }, patientData?: any) => {
    const p = patientData || patient || {};
    try {
      const r = await fetch(`${API}/booking/nearby-hospitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng, insurance: p.insurance || "", condition: p.symptoms || "" }),
      });
      const data = await r.json();
      if (data.status === "success") {
        setHospitals(data.hospitals);
        setStep("hospitals");
        say(`Found ${data.hospitals.length} clinics near you! Ranked by insurance match and rating.`);
      } else {
        setSearchError("Couldn't load clinics. Check your network.");
      }
    } catch {
      setSearchError("Couldn't connect to the server.");
    }
  };

  const loadCalendarSlots = useCallback(async (token: string) => {
    setCalendarLoading(true);
    try {
      const r = await fetch(`${API}/booking/calendar-freebusy?access_token=${token}&days_ahead=7`);
      const data = await r.json();
      const slots = buildWeekSlots(data.busy || []);
      setWeekSlots(slots);

      if (slots.length > 0 && slots[0].times.length > 0) {
        const first = slots[0];
        const autoSlot = { day: first.day, date: first.date, dateISO: first.dateISO, time: first.times[0] };
        setSelectedSlots([autoSlot]);
        say(`Your next free slot is ${first.day} ${first.date} at ${first.times[0]}. You can pick more or just call now!`);
      } else {
        say("No free slots found this week — pick a time manually.");
        setManualMode(true);
      }
    } catch {
      setWeekSlots(buildWeekSlots([]));
      say("Couldn't read calendar. Pick a time below:");
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const handleConnectCalendar = async () => {
    try {
      const token = await requestGoogleCalendarToken();
      setCalendarToken(token);
      say("Connected! Checking your calendar for free slots…");
      await loadCalendarSlots(token);
    } catch (e) {
      console.error("Calendar token error:", e);
      say("No worries! Here are some available times:");
      setWeekSlots(buildWeekSlots([]));
    }
  };

  const handleSkipCalendar = () => {
    say("No problem! Pick up to 3 times that work for you:");
    setWeekSlots(buildWeekSlots([]));
  };

  const initiateVAPICall = async () => {
    if (!selectedHospital) return;
    const p = patient || {};

    const preferredTime = selectedSlots.length > 0
      ? selectedSlots.map(s => `${s.day} ${s.date} at ${s.time}`).join(", or ")
      : manualMode ? `${manualDate} at ${manualTime}` : "next available";

    say(`Calling ${selectedHospital.name} now… Riley will handle it for you!`);
    setStep("calling");
    setCallStatus("in-progress");

    try {
      const r = await fetch(`${API}/booking/vapi-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospital_name: selectedHospital.name,
          hospital_phone: "+16197628722",
          patient_name: p.name || "the patient",
          patient_insurance: p.insurance || "self-pay",
          condition: p.symptoms || "general checkup",
          preferred_time: preferredTime,
          session_id: sessionId || "default",
          // Full patient context from reception
          duration: p.duration || null,
          severity: p.severity || null,
          medications: p.medications || null,
          allergies: p.allergies || null,
          medical_history: p.medical_history || null,
          age: p.age || null,
          sex: p.sex || null,
          phone: p.phone || null,
          email: p.email || null,

        }),
      });
      const data = await r.json();
      setCallId(data.call_id || null);

      if (data.call_id) {
        pollCallStatus(data.call_id);
      } else {
        setTimeout(() => {
          setCallStatus("ended");
          setCallConfirmed(true);
          setCallTranscript("Demo: Appointment booked successfully for the requested time slot.");
          setStep("calendar");
          say("Call done! Appointment booked. Want me to add it to your Google Calendar?");
        }, 3000);
      }
    } catch {
      setCallStatus("error");
      say("The call couldn't go through. You can always call the clinic directly.");
    }
  };

  const pollCallStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API}/booking/vapi-call-status/${id}`);
        const data = await r.json();
        setCallStatus(data.status);
        if (data.transcript) setCallTranscript(data.transcript);
        if (data.status === "ended" || data.status === "error") {
          clearInterval(interval);
          setCallConfirmed(data.appointment_confirmed || false);
          setStep("calendar");
          if (data.appointment_confirmed) {
            say("Call done! Your appointment is confirmed. Add it to Google Calendar?");
          } else {
            say("Call finished. You may want to follow up directly. Add a reminder?");
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
  };

  const addToCalendar = async () => {
    if (!selectedHospital) return;
    const p = patient || {};

    const datetimeISO = primarySlot
      ? timeToISO(primarySlot.dateISO, primarySlot.time)
      : manualDate && manualTime
      ? `${manualDate}T${manualTime}:00`
      : new Date(Date.now() + 86400000).toISOString().slice(0, 19);

    let token = calendarToken;
    if (!token) {
      try {
        token = await requestGoogleCalendarToken();
        setCalendarToken(token);
      } catch (e) {
        console.error("Calendar auth failed:", e);
        say("Couldn't connect to Google Calendar. Make sure VITE_GOOGLE_CLIENT_ID is set.");
        setCalendarAdded(true);
        setStep("done");
        return;
      }
    }

    try {
      const r = await fetch(`${API}/booking/calendar-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospital_name: selectedHospital.name,
          hospital_address: selectedHospital.address,
          datetime_iso: datetimeISO,
          patient_name: p.name || "Patient",
          condition: p.symptoms || "Medical appointment",
          access_token: token,
        }),
      });
      const data = await r.json();
      if (data.status === "created") {
        setEventLink(data.event_link || "");
        setCalendarAdded(true);
        setStep("done");
        say("Done! Your appointment is in Google Calendar with a reminder. Take care! 🐉");
      } else {
        say("Calendar sync had a hiccup. Your appointment is still booked!");
        setStep("done");
      }
    } catch {
      say("Calendar sync had a hiccup. Your appointment is still booked!");
      setStep("done");
    }
  };

  const canCall = selectedSlots.length > 0 || (manualMode && manualDate && manualTime);

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden"
      style={{ background: "linear-gradient(160deg, hsl(195 30% 95%) 0%, hsl(180 20% 98%) 45%, hsl(var(--background)) 100%)" }}>
      <div className="absolute top-[-80px] left-[-60px] w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(195 40% 85% / 0.35)" }} />
      <div className="absolute bottom-[-60px] right-[-40px] w-56 h-56 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(170 35% 88% / 0.3)" }} />

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 border-b border-border bg-background/70 backdrop-blur-md">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-border transition-colors">
          <ArrowLeft size={16} className="text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <img src={dragonReceptionist} alt="Anita" className="w-6 h-6 rounded-full object-cover" />
          <span className="font-heading font-extrabold text-foreground text-sm">Anita Checkin — Booking</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {["hospitals", "scheduling", "calling", "done"].map((s, i) => (
            <div key={s} className={`rounded-full transition-all ${
              ["hospitals", "scheduling", "calling", "calendar", "done"].indexOf(step) >= i
                ? "w-4 h-1.5 bg-secondary" : "w-1.5 h-1.5 bg-muted-foreground/25"
            }`} />
          ))}
        </div>
      </motion.div>

      <div className="flex-1 px-4 py-4 max-w-sm mx-auto w-full pb-10">
        <AnitaBubble text={anitaText} isSpeaking={anitaSpeaking} />

        {step === "locating" && (
          <motion.div className="flex flex-col items-center gap-4 py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Navigation size={28} className="text-secondary" />
            </motion.div>
            <p className="text-sm text-muted-foreground font-semibold text-center">Finding clinics near you and checking insurance…</p>
            {searchError && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertCircle size={14} />{searchError}</div>}
          </motion.div>
        )}

        {step === "hospitals" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {patient?.insurance && (
              <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2 mb-1">
                <Shield size={12} className="text-secondary" />
                <p className="text-xs font-semibold text-secondary">
                  Searching with insurance: <span className="font-extrabold">{patient.insurance}</span>
                </p>
              </div>
            )}
            {hospitals.map((h, i) => (
              <HospitalCard key={h.id} h={h} index={i} selected={selectedHospital?.id === h.id} onSelect={() => setSelectedHospital(h)} />
            ))}
            {hospitals.length === 0 && !searchError && (
              <div className="text-center py-8 text-muted-foreground text-sm">No clinics found nearby.</div>
            )}
            <AnimatePresence>
              {selectedHospital && (
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => { setStep("scheduling"); say("Connect your calendar and I'll auto-pick your first free slot, or choose up to 3 times yourself!"); }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 rounded-2xl font-heading font-extrabold text-white text-sm flex items-center justify-center gap-2 shadow-lg shadow-secondary/20 mt-2"
                  style={{ background: "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--secondary) / 0.8))" }}>
                  Schedule at {selectedHospital.name.split(" ")[0]} <ChevronRight size={15} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {step === "scheduling" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            {!calendarToken && weekSlots.length === 0 && !manualMode && (
              <motion.div className="rounded-2xl border-2 border-dashed border-secondary/30 bg-secondary/5 p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto">
                  <Calendar size={22} className="text-secondary" />
                </div>
                <div>
                  <p className="font-heading font-extrabold text-foreground text-sm">Sync your calendar</p>
                  <p className="text-xs text-muted-foreground font-body mt-1">Anita will auto-pick your first free slot — or you can choose up to 3</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={handleConnectCalendar} disabled={calendarLoading}
                    className="w-full py-2.5 rounded-xl font-heading font-bold text-sm text-white flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #4285F4, #34A853)" }}>
                    {calendarLoading ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                    Connect Google Calendar
                  </button>
                  <button onClick={handleSkipCalendar}
                    className="w-full py-2 rounded-xl font-body font-semibold text-xs text-muted-foreground bg-muted hover:bg-border transition-colors">
                    Skip — I'll pick manually
                  </button>
                </div>
              </motion.div>
            )}

            {weekSlots.length > 0 && !manualMode && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-widest">
                      {calendarToken ? "Your free slots this week" : "Available times"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Select up to 3 — Riley will offer them all to the clinic
                      {selectedSlots.length > 0 && <span className="text-secondary font-bold"> ({selectedSlots.length} selected)</span>}
                    </p>
                  </div>
                  <button onClick={() => setManualMode(true)} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0">
                    <Pencil size={9} /> Manual
                  </button>
                </div>

                {weekSlots.map((daySlot) => (
                  <div key={daySlot.day}>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{daySlot.day} · {daySlot.date}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {daySlot.times.map((t) => {
                        const isSelected = selectedSlots.some(s => s.day === daySlot.day && s.time === t);
                        const isDisabled = !isSelected && selectedSlots.length >= 3;
                        return (
                          <button key={t}
                            onClick={() => !isDisabled && toggleSlot({ day: daySlot.day, date: daySlot.date, dateISO: daySlot.dateISO, time: t })}
                            className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition-all ${
                              isSelected
                                ? "bg-secondary text-white shadow-md shadow-secondary/20"
                                : isDisabled
                                ? "bg-muted text-muted-foreground/40 border border-border cursor-not-allowed"
                                : "bg-muted text-muted-foreground hover:bg-secondary/10 hover:text-secondary border border-border"
                            }`}>
                            <Clock size={9} className="inline mr-1" />{t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {manualMode && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-widest">Enter your preferred time</p>
                  {weekSlots.length > 0 && (
                    <button onClick={() => setManualMode(false)} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X size={9} /> Back to slots
                    </button>
                  )}
                </div>
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm font-body text-foreground focus:outline-none focus:border-secondary transition-colors" />
                <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm font-body text-foreground focus:outline-none focus:border-secondary transition-colors" />
              </motion.div>
            )}

            {selectedSlots.length > 0 && (
              <div className="bg-secondary/5 border border-secondary/20 rounded-xl px-3 py-2 space-y-1">
                <p className="text-[10px] font-heading font-bold text-secondary uppercase tracking-wide">Offering these times to the clinic:</p>
                {selectedSlots.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-xs text-foreground font-semibold">{s.day} {s.date} at {s.time}</p>
                    <button onClick={() => toggleSlot(s)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {canCall && (
              <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                onClick={initiateVAPICall} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 rounded-2xl font-heading font-extrabold text-white text-sm flex items-center justify-center gap-2 shadow-lg shadow-secondary/20"
                style={{ background: "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--secondary) / 0.8))" }}>
                <PhoneCall size={14} />
                Call & Book with Riley
                {selectedSlots.length > 1 && <span className="text-white/70 font-normal text-[11px]">({selectedSlots.length} options)</span>}
              </motion.button>
            )}
          </motion.div>
        )}

        {step === "calling" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="rounded-2xl border border-border bg-white/70 p-5 text-center space-y-4">
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
                <PhoneCall size={28} className="text-secondary" />
              </motion.div>
              <div>
                <p className="font-heading font-extrabold text-foreground text-sm">Riley is calling {selectedHospital?.name}</p>
                <p className="text-xs text-muted-foreground font-body mt-1">
                  {callStatus === "in-progress" ? "Call in progress…" : callStatus === "ended" ? "Call completed!" : callStatus === "error" ? "Call failed" : "Connecting…"}
                </p>
              </div>
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div key={i} className="w-1.5 rounded-full bg-secondary"
                    animate={{ height: callStatus === "in-progress" ? ["6px", "20px", "6px"] : "6px" }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }} />
                ))}
              </div>
              {callTranscript && (
                <div className="bg-muted rounded-xl p-3 text-left max-h-32 overflow-y-auto">
                  <p className="text-[10px] font-heading font-bold text-muted-foreground uppercase tracking-wide mb-1">Live transcript</p>
                  <p className="text-xs font-body text-foreground leading-relaxed">{callTranscript}</p>
                </div>
              )}
            </div>
            {callStatus === "error" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-center text-muted-foreground">
                  Call directly: <span className="font-bold text-foreground">{selectedHospital?.phone}</span>
                </p>
                <button onClick={() => { setStep("calendar"); say("You can still add a reminder to your calendar!"); }}
                  className="w-full py-2.5 rounded-xl bg-muted border border-border font-body font-semibold text-sm text-muted-foreground hover:bg-border transition-colors">
                  Skip — Add to calendar anyway
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === "calendar" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className={`rounded-2xl border-2 p-4 ${callConfirmed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-2 mb-2">
                {callConfirmed ? <CheckCircle size={16} className="text-emerald-500" /> : <AlertCircle size={16} className="text-amber-500" />}
                <p className={`font-heading font-extrabold text-sm ${callConfirmed ? "text-emerald-700" : "text-amber-700"}`}>
                  {callConfirmed ? "Appointment confirmed!" : "Follow-up may be needed"}
                </p>
              </div>
              {selectedHospital && (
                <p className="text-xs font-body text-muted-foreground">
                  <span className="font-bold text-foreground">{selectedHospital.name}</span>
                  {primarySlot && ` · ${primarySlot.day} ${primarySlot.date} at ${primarySlot.time}`}
                </p>
              )}
              {!callConfirmed && (
                <p className="text-xs text-amber-700 mt-1">
                The clinic couldn't confirm one of your slots. You can call them directly at{" "}
                <span className="font-bold">{selectedHospital?.phone}</span> or try booking a different time.
                </p>
                )}
              {callTranscript && <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed line-clamp-3">{callTranscript}</p>}
            </div>
            <button onClick={addToCalendar}
              className="w-full py-3.5 rounded-2xl font-heading font-extrabold text-white text-sm flex items-center justify-center gap-2 shadow-lg"
              style={{ background: "linear-gradient(135deg, #4285F4, #34A853)" }}>
              <CalendarPlus size={14} />
              Add to Google Calendar
              {primarySlot && <span className="text-white/70 font-normal text-[11px]">({primarySlot.day} at {primarySlot.time})</span>}
            </button>
            {!callConfirmed && (
                <button onClick={() => { setStep("scheduling"); setCallStatus("idle"); setCallTranscript(""); }}
                className="w-full py-2.5 rounded-xl font-body font-semibold text-xs text-muted-foreground bg-muted hover:bg-border transition-colors">
                ← Try different time slots
            </button>
            )}
            <button onClick={() => { setCalendarAdded(true); setStep("done"); say("All done! Take care of yourself. 🐉"); }}
              className="w-full py-2.5 rounded-xl font-body font-semibold text-xs text-muted-foreground bg-muted hover:bg-border transition-colors">
              Skip calendar — I'm done
            </button>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="rounded-2xl border-2 border-secondary/30 bg-secondary/5 p-6 text-center space-y-4">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
                <Sparkles size={28} className="text-secondary" />
              </motion.div>
              <div>
                <p className="font-heading font-extrabold text-foreground text-lg">You're all set!</p>
                <p className="text-xs text-muted-foreground font-body mt-1 leading-relaxed">
                  {calendarAdded && eventLink ? "Your appointment is booked and saved to Google Calendar." : calendarAdded ? "Your appointment is booked!" : "Your appointment has been scheduled."}
                </p>
              </div>
              {eventLink && (
                <a href={eventLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-border text-sm font-heading font-bold text-foreground hover:bg-muted transition-colors">
                  <ExternalLink size={13} />View in Google Calendar
                </a>
              )}
              {selectedHospital && (
                <div className="text-left bg-white/60 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-heading font-bold text-muted-foreground uppercase tracking-widest">Summary</p>
                  <p className="text-xs font-body text-foreground font-semibold">{selectedHospital.name}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedHospital.address}</p>
                  {primarySlot && <p className="text-[11px] text-muted-foreground">{primarySlot.day}, {primarySlot.date} at {primarySlot.time}</p>}
                  {selectedHospital.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone size={9} />{selectedHospital.phone}</p>}
                </div>
              )}
            </div>
            <motion.button onClick={() => navigate("/")} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="w-full py-3 rounded-2xl font-heading font-bold text-sm bg-muted border border-border text-muted-foreground hover:bg-border transition-colors flex items-center justify-center gap-2">
              Back to DracoCare
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Booking;