import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Paperclip, X } from "lucide-react";
import dragonReceptionist from "@/assets/dragon-receptionist.png";

interface Message {
  text: string;
  isUser: boolean;
}

const SESSION_ID = "session-" + Date.now();
const API = "http://localhost:8000";

const Reception = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [labsUploaded, setLabsUploaded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { sendToBackend("hello"); }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, showUpload]);

  const addBotMessage = (text: string, askingForLabs: boolean) => {
    setIsTyping(false);
    setIsSpeaking(true);
    setMessages(prev => [...prev, { text, isUser: false }]);
    setTimeout(() => setIsSpeaking(false), 1500);
    if (askingForLabs && !labsUploaded) setTimeout(() => setShowUpload(true), 400);
  };

  const sendToBackend = async (message: string) => {
    setIsTyping(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: SESSION_ID }),
      });
      const data = await res.json();
      addBotMessage(data.response, data.asking_for_labs ?? false);
      if (data.ready_for_consultation) {
        setTimeout(() => navigate("/consultation", { state: { sessionId: SESSION_ID } }), 2000);
      }
    } catch {
      setIsTyping(false);
      addBotMessage("Sorry, I'm having trouble connecting. Is the backend running?", false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { text: userMsg, isUser: true }]);
    if (showUpload) setShowUpload(false);
    sendToBackend(userMsg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) { setUploadStatus("❌ Please upload a PDF file"); return; }
    setUploadStatus("⏳ Reading your lab results...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", SESSION_ID);

    try {
      const res = await fetch(`${API}/extract-labs`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();

      if (data.status === "success") {
        setLabsUploaded(true);
        setShowUpload(false);
        setUploadStatus("");
        setMessages(prev => [...prev, { text: "✅ Lab results uploaded!", isUser: true }]);
        setIsTyping(true);
        const notifyRes = await fetch(`${API}/notify-lab-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: data.summary || "Lab results uploaded successfully.", session_id: SESSION_ID }),
        });
        const notifyData = await notifyRes.json();
        addBotMessage(notifyData.response, false);
        if (notifyData.ready_for_consultation) {
          setTimeout(() => navigate("/consultation", { state: { sessionId: SESSION_ID } }), 2000);
        }
      } else {
        setUploadStatus("❌ Upload failed. Please try again.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus("❌ Connection error. Make sure the backend is running.");
    }
  };

  const skipUpload = () => {
    setShowUpload(false);
    setUploadStatus("");
    setMessages(prev => [...prev, { text: "I don't have any lab results to upload right now", isUser: true }]);
    sendToBackend("I don't have any lab results to upload right now");
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: "linear-gradient(180deg, hsl(195 30% 95%) 0%, hsl(180 20% 98%) 40%, hsl(var(--background)) 100%)" }}>
      <div className="absolute top-[-100px] left-[-80px] w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(195 40% 85% / 0.4)" }} />
      <div className="absolute bottom-[-80px] right-[-60px] w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "hsl(170 35% 88% / 0.3)" }} />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="relative z-10 px-4 py-3 flex items-center gap-3 border-b border-border bg-background/60 backdrop-blur-sm flex-shrink-0">
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-border transition-colors">
          <ArrowLeft size={16} className="text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <img src={dragonReceptionist} alt="Anita Checkin" className="w-6 h-6 rounded-full object-cover" />
          <span className="font-heading font-extrabold text-foreground text-sm">Anita Checkin — Receptionist</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="text-xs text-muted-foreground font-body font-semibold">Online</span>
        </div>
      </motion.div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehavior: "contain" }}>
        <div className="max-w-sm mx-auto space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`flex ${msg.isUser ? "justify-end" : "justify-start"} items-end gap-2`}>
                {!msg.isUser && (
                  <img src={dragonReceptionist} alt="Anita Checkin" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-1"
                    style={{ border: "2px solid hsl(195 40% 85%)" }} />
                )}
                <div className={`max-w-[75%] flex flex-col ${msg.isUser ? "items-end" : "items-start"}`}>
                  <span className="text-[10px] font-body font-semibold text-muted-foreground/60 px-1 mb-0.5">
                    {msg.isUser ? "You" : "Anita"}
                  </span>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm font-body font-semibold leading-relaxed shadow-sm ${
                    msg.isUser ? "bg-secondary text-secondary-foreground rounded-br-sm" : "bg-white/80 text-foreground rounded-bl-sm border border-border/50"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex justify-start items-end gap-2">
                <img src={dragonReceptionist} alt="Anita Checkin" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-1"
                  style={{ border: "2px solid hsl(195 40% 85%)" }} />
                <div className="bg-white/80 border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/40"
                        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }} />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {showUpload && !labsUploaded && (
              <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex justify-start items-end gap-2">
                <img src={dragonReceptionist} alt="Anita Checkin" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-1"
                  style={{ border: "2px solid hsl(195 40% 85%)" }} />
                <div className={`max-w-[80%] p-4 rounded-2xl rounded-bl-sm border-2 border-dashed transition-all ${
                  isDragging ? "border-secondary bg-secondary/10" : "border-border bg-white/60"
                }`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }}>
                  <p className="text-xs font-body font-semibold text-muted-foreground mb-2">📄 Upload your lab results (PDF)</p>
                  {uploadStatus && <p className="text-xs font-body text-muted-foreground mb-2">{uploadStatus}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-xl text-xs font-heading font-bold hover:brightness-110 transition-all">
                      <Paperclip size={11} />Choose PDF
                    </button>
                    <button onClick={skipUpload}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border text-muted-foreground rounded-xl text-xs font-body font-semibold hover:bg-border transition-all">
                      <X size={11} />Skip for now
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 mt-2">or drag & drop here • Anita will read it and skip questions already answered</p>
                  <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                    onClick={e => (e.currentTarget.value = "")}
                    onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); e.target.value = ""; }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
        className="relative z-10 w-full bg-background/80 backdrop-blur-sm border-t border-border px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 max-w-sm mx-auto">
          <div className="flex-1 relative">
            <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Type your answer..."
              className="w-full bg-muted border-2 border-border rounded-2xl px-4 py-3 pr-12 text-sm font-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all font-semibold" />
            <button onClick={handleSend} disabled={!input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center disabled:opacity-20 hover:brightness-110 transition-all">
              <Send size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Reception;