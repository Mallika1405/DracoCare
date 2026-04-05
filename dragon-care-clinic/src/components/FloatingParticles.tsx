import { motion } from "framer-motion";

const particles = [
  { icon: "✦", size: "text-base", delay: 0, x: "12%", y: "18%" },
  { icon: "♥", size: "text-xs", delay: 1, x: "82%", y: "22%" },
  { icon: "✦", size: "text-xs", delay: 2, x: "22%", y: "75%" },
  { icon: "♥", size: "text-[10px]", delay: 1.5, x: "88%", y: "55%" },
  { icon: "✧", size: "text-sm", delay: 0.5, x: "6%", y: "48%" },
  { icon: "♡", size: "text-xs", delay: 2.5, x: "70%", y: "80%" },
  { icon: "⊹", size: "text-base", delay: 0.8, x: "50%", y: "10%" },
];

interface FloatingParticlesProps {
  variant?: "blue" | "green";
}

const FloatingParticles = ({ variant = "blue" }: FloatingParticlesProps) => {
  const colorClass = variant === "blue" ? "text-kawaii-pink/40" : "text-kawaii-lavender/40";

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute ${p.size} ${colorClass} select-none`}
          style={{ left: p.x, top: p.y }}
          animate={{ y: [0, -12, 0], opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 3.5 + i * 0.4, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        >
          {p.icon}
        </motion.span>
      ))}
    </div>
  );
};

export default FloatingParticles;
