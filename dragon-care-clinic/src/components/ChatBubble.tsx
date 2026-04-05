import { motion } from "framer-motion";

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  isTyping?: boolean;
}

const ChatBubble = ({ message, isUser, isTyping = false }: ChatBubbleProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[80%] px-5 py-3 rounded-2xl font-body text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-bubble-user text-primary-foreground rounded-br-md"
            : "bg-bubble-bot text-foreground rounded-bl-md border border-border"
        }`}
      >
        {isTyping ? (
          <div className="flex gap-1.5 items-center py-1 px-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-muted-foreground/50"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        ) : (
          message
        )}
      </div>
    </motion.div>
  );
};

export default ChatBubble;
