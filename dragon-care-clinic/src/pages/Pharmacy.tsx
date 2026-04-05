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
    <div className="h-screen flex flex-col items-center justify-between overflow-hidden relative">
      {/* Rich vibrant gradient background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(160deg, #0a4f3f 0%, #0d6e55 25%, #0f8a69 50%, #1ba87d 75%, #22c898 100%)"
      }} />

      {/* Layered glow blobs */}
      <div className="absolute top-[-80px] left-[-60px] w-80 h-80 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(34,200,152,0.35) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-60px] right-[-40px] w-72 h-72 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(15,138,105,0.4) 0%, transparent 70%)" }} />
      <div className="absolute top-[35%] right-[-60px] w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(34,200,152,0.2) 0%, transparent 70%)" }} />

      {/* Soft hex pattern overlay */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1.5px, transparent 1.5px)",
        backgroundSize: "28px 28px"
      }} />

      {/* Top section — title */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto px-6 pt-8">
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-2"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 120 }}
            className="inline-flex items-center gap-2 bg-white/15 border border-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            <span className="text-white/90 text-xs font-bold tracking-widest uppercase">Open Now</span>
          </motion.div>
          <h1 className="font-black text-[36px] text-white tracking-tight leading-[1.1] drop-shadow-lg">
            Dragon Care<br />Clinic
          </h1>
          <p className="text-emerald-100/80 text-base mt-2 font-medium leading-snug">
            Where tiny dragons take<br />big care of you
          </p>
        </motion.div>

        {/* Characters */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6, type: "spring" }}
          className="relative flex items-end justify-center gap-2 w-full mt-4"
        >
          {/* Dr. Stitch */}
          <motion.div
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 80 }}
            className="flex flex-col items-center"
          >
            <DragonCharacter src={dragonDoctor} alt="Dr. Stitch MD" className="w-36 h-36 drop-shadow-2xl" />
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="mt-2 text-[11px] font-bold text-white/80 bg-white/15 border border-white/20 backdrop-blur-sm px-3 py-1 rounded-full"
            >
              Dr. Stitch MD
            </motion.span>
          </motion.div>

          {/* Anita — center, largest */}
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 80 }}
            className="flex flex-col items-center -mb-1 z-10"
          >
            <DragonCharacter src={dragonReceptionist} alt="Anita Checkin" className="w-48 h-48 drop-shadow-2xl" />
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              className="mt-2 text-[11px] font-bold text-white bg-white/20 border border-white/30 backdrop-blur-sm px-3 py-1 rounded-full"
            >
              Anita Checkin
            </motion.span>
          </motion.div>

          {/* Ash Pirin */}
          <motion.div
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.7, type: "spring", stiffness: 80 }}
            className="flex flex-col items-center"
          >
            <DragonCharacter src={dragonPharmacist} alt="Ash Pirin" className="w-36 h-36 drop-shadow-2xl" />
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="mt-2 text-[11px] font-bold text-white/80 bg-white/15 border border-white/20 backdrop-blur-sm px-3 py-1 rounded-full"
            >
              Ash Pirin
            </motion.span>
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, type: "spring" }}
        className="relative z-10 w-full px-6 pb-10 pt-4"
      >
        <div className="max-w-sm mx-auto space-y-3">
          <motion.button
            onMouseEnter={() => setHoveredBtn("doctor")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => navigate("/reception")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full font-black text-[17px] py-4 rounded-2xl relative overflow-hidden transition-all shadow-xl"
            style={{
              background: hoveredBtn === "doctor" ? "#ffffff" : "rgba(255,255,255,0.95)",
              color: "#0d6e55",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            🏥 See a Doctor
          </motion.button>

          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/60 text-xs font-semibold">or</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          <motion.button
            onMouseEnter={() => setHoveredBtn("pharmacy")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => navigate("/pharmacy")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full font-black text-[17px] py-4 rounded-2xl transition-all"
            style={{
              background: hoveredBtn === "pharmacy" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)",
              color: "#ffffff",
              border: "2px solid rgba(255,255,255,0.3)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            }}
          >
            💊 Visit Pharmacy
          </motion.button>

          <p className="text-center text-white/50 text-xs font-medium pt-1">
            Our friendly team is here to help
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Index;