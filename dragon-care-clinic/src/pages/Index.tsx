import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import DragonCharacter from "@/components/DragonCharacter";
import dragonReceptionist from "@/assets/dragon-receptionist.png";
import dragonDoctor from "@/assets/dragon-doctor.png";
import dragonPharmacist from "@/assets/dragon-pharmacist.png";

const Index = () => {
  const navigate = useNavigate();
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  return (
    <div
      className="h-screen flex flex-col items-center justify-between overflow-hidden relative"
      style={{
        background:
          "linear-gradient(180deg, hsl(195 30% 95%) 0%, hsl(180 20% 98%) 40%, hsl(var(--background)) 100%)",
      }}
    >
      <div className="absolute top-[-100px] left-[-80px] w-72 h-72 rounded-full blur-3xl" style={{ background: "hsl(195 40% 85% / 0.4)" }} />
      <div className="absolute bottom-[-80px] right-[-60px] w-64 h-64 rounded-full blur-3xl" style={{ background: "hsl(170 35% 88% / 0.3)" }} />
      <div className="absolute top-[40%] right-[-40px] w-40 h-40 rounded-full blur-2xl" style={{ background: "hsl(200 30% 90% / 0.3)" }} />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto px-6 pt-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-1">
          <h1 className="font-heading font-black text-[28px] text-foreground tracking-tight leading-tight">DracoCare</h1>
          <p className="text-muted-foreground font-body text-sm mt-1.5 font-semibold">Where tiny dragons take big care of you</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6, type: "spring" }}
          className="relative flex items-end justify-center gap-0 w-full mt-2"
        >
          {/* Dr. Stitch MD */}
          <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 80 }} className="flex flex-col items-center">
            <DragonCharacter src={dragonDoctor} alt="Dr. Stitch MD" className="w-40 h-40 md:w-44 md:h-44" />
            <motion.span initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
              className="mt-1.5 text-xs font-heading font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Dr. Stitch MD
            </motion.span>
          </motion.div>

          {/* Anita Checkin — center, largest */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, type: "spring", stiffness: 80 }} className="flex flex-col items-center -mb-1 z-10">
            <DragonCharacter src={dragonReceptionist} alt="Anita Checkin" className="w-48 h-48 md:w-52 md:h-52" />
            <motion.span initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}
              className="mt-1.5 text-xs font-heading font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Anita Checkin
            </motion.span>
          </motion.div>

          {/* Ash Pirin */}
          <motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.7, type: "spring", stiffness: 80 }} className="flex flex-col items-center">
            <DragonCharacter src={dragonPharmacist} alt="Ash Pirin" className="w-40 h-40 md:w-44 md:h-44" />
            <motion.span initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}
              className="mt-1.5 text-xs font-heading font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Ash Pirin
            </motion.span>
          </motion.div>
        </motion.div>
      </div>

      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.2, type: "spring" }} className="w-full px-6 pb-8 pt-3">
        <div className="max-w-sm mx-auto space-y-3">
          <motion.button
            onMouseEnter={() => setHoveredBtn("doctor")} onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => navigate("/reception")} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="w-full font-heading font-bold text-[15px] py-3.5 rounded-xl relative overflow-hidden transition-all"
            style={{
              background: hoveredBtn === "doctor" ? "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--secondary) / 0.85))" : "hsl(var(--secondary) / 0.12)",
              color: hoveredBtn === "doctor" ? "hsl(var(--secondary-foreground))" : "hsl(var(--secondary))",
              border: "2px solid hsl(var(--secondary) / 0.3)",
            }}>
            <motion.span className="flex items-center justify-center gap-2" animate={hoveredBtn === "doctor" ? { x: [0, 3, 0] } : {}} transition={{ duration: 0.3 }}>
              See a Doctor
            </motion.span>
          </motion.button>

          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground font-body font-semibold">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <motion.button
            onMouseEnter={() => setHoveredBtn("pharmacy")} onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => navigate("/pharmacy")} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="w-full font-heading font-bold text-[15px] py-3.5 rounded-xl relative overflow-hidden transition-all"
            style={{
              background: hoveredBtn === "pharmacy" ? "linear-gradient(135deg, hsl(170 50% 40%), hsl(170 50% 35%))" : "hsl(170 50% 40% / 0.1)",
              color: hoveredBtn === "pharmacy" ? "#ffffff" : "hsl(170 50% 35%)",
              border: "2px solid hsl(170 50% 40% / 0.3)",
            }}>
            <motion.span className="flex items-center justify-center gap-2" animate={hoveredBtn === "pharmacy" ? { x: [0, 3, 0] } : {}} transition={{ duration: 0.3 }}>
              Visit Pharmacy
            </motion.span>
          </motion.button>

          <p className="text-center text-xs text-muted-foreground font-body font-semibold">Our friendly team is here to help</p>
        </div>
      </motion.div>
    </div>
  );
};

export default Index;