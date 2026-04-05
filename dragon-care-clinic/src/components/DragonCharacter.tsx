import { motion } from "framer-motion";

interface DragonCharacterProps {
  src: string;
  alt: string;
  isSpeaking?: boolean;
  className?: string;
}

const DragonCharacter = ({ src, alt, isSpeaking = false, className = "" }: DragonCharacterProps) => {
  return (
    <motion.div
      className={`relative ${className}`}
      animate={{
        y: [0, -6, 0],
        rotate: isSpeaking ? [0, 1.5, -1.5, 0] : 0,
      }}
      transition={{
        y: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
        rotate: isSpeaking ? { duration: 0.35, repeat: Infinity, ease: "easeInOut" } : {},
      }}
    >
      <motion.img
        src={src}
        alt={alt}
        className="relative z-10 w-full h-full object-contain drop-shadow-lg"
        animate={isSpeaking ? { scale: [1, 1.03, 1] } : {}}
        transition={isSpeaking ? { duration: 0.5, repeat: Infinity } : {}}
      />
    </motion.div>
  );
};

export default DragonCharacter;