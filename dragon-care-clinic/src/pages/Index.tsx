import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import DragonCharacter from "@/components/DragonCharacter";
import dragonReceptionist from "@/assets/dragon-receptionist.png";
import dragonDoctor from "@/assets/dragon-doctor.png";

const Index = () => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div className="h-screen flex flex-col items-center justify-between overflow-hidden relative"
      style={{
        background: "linear-gradient(180deg, hsl(195 30% 95%) 0%, hsl(180 20% 98%) 40%, hsl(var(--background)) 100%)",
      }}
    >
      {/* Soft ambient blobs */}
      <div className="absolute top-[-100px] left-[-80px] w-72 h-72 rounded-full blur-3xl" style={{ background: "hsl(195 40% 85% / 0.4)" }} />
      <div className="absolute bottom-[-80px] right-[-60px] w-64 h-64 rounded-full blur-3xl" style={{ background: "hsl(170 35% 88% / 0.3)" }} />
      <div className="absolute top-[40%] right-[-40px] w-40 h-40 rounded-full blur-2xl" style={{ background: "hsl(200 30% 90% / 0.3)" }} />

      {/* Dot pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }} />

      {/* Top section */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto px-6 pt-10">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-2"
        >
          <h1 className="font-heading font-black text-[28px] text-foreground tracking-tight leading-tight">
            Dragon Care Clinic
          </h1>
          <p className="text-muted-foreground font-body text-sm mt-2 font-semibold">
            Where tiny dragons take big care of you
          </p>
        </motion.div>

        {/* Characters */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6, type: "spring" }}
          className="relative flex items-end justify-center gap-2 w-full mt-4"
        >
          {/* Dr. Sage */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 80 }}
            className="flex flex-col items-center"
          >
            <DragonCharacter src={dragonDoctor} alt="Dr. Sage" className="w-40 h-40 md:w-48 md:h-48" />
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="mt-1.5 text-xs font-heading font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full"
            >
              Dr. Sage
            </motion.span>
          </motion.div>

          {/* Puff */}
          <motion.div
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.7, type: "spring", stiffness: 80 }}
            className="flex flex-col items-center"
          >
            <DragonCharacter src={dragonReceptionist} alt="Puff" className="w-40 h-40 md:w-48 md:h-48" />
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="mt-1.5 text-xs font-heading font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full"
            >
              Puff
            </motion.span>
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, type: "spring" }}
        className="w-full px-6 pb-8 pt-4"
      >
        <div className="max-w-sm mx-auto space-y-3">
          <motion.button
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => navigate("/reception")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full font-heading font-bold text-[15px] py-3.5 rounded-xl text-foreground bg-background border-2 border-border relative overflow-hidden transition-all hover:border-foreground/20 hover:shadow-md"
          >
            <motion.span
              className="flex items-center justify-center gap-2"
              animate={hovered ? { x: [0, 3, 0] } : {}}
              transition={{ duration: 0.3 }}
            >
              Get Started
              <span className="text-base">→</span>
            </motion.span>
          </motion.button>
          <p className="text-center text-xs text-muted-foreground font-body font-semibold">
            Our friendly receptionist will check you in
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Index;
