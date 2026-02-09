import React, { useRef, useEffect, useState } from "react";
import { ChevronDown, ArrowUp, Paperclip, Globe, Zap, Sparkles, Command } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChatInterfaceProps {
  theme: "dark" | "light";
}

const QUICK_ACTIONS = [
  { label: "Search", icon: Globe },
  { label: "Analyze", icon: Zap },
  { label: "Summarize", icon: Sparkles },
  { label: "Code", icon: Command },
];

const SUGGESTIONS = [
  "Write a marketing plan for a tech startup",
  "Explain quantum computing in simple terms",
  "How do I optimize my React application?",
];

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ theme }) => {
  const isDark = theme === "dark";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 240);
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    handleInput();
  }, [value]);

  return (
    <div className="flex flex-col items-center w-full max-w-[720px] px-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center mb-10"
      >
        <h1 
          className={`font-light text-[56px] tracking-tight mb-2 ${
            isDark ? "text-white/90" : "text-black/80"
          }`}
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          EasyHub
        </h1>
        <p className={`${isDark ? "text-gray-500" : "text-gray-400"} text-lg font-light`}>
          How can I help you today?
        </p>
      </motion.div>

      {/* Input Box - Enhanced with Glassmorphism and better alignment */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className={`group relative w-full rounded-[28px] p-2 border transition-all duration-500 shadow-2xl ${
          isDark 
            ? "bg-[#161616]/80 backdrop-blur-xl border-white/10 focus-within:border-[#2dd4bf]/50 focus-within:ring-4 ring-[#2dd4bf]/5" 
            : "bg-white/80 backdrop-blur-xl border-gray-200 focus-within:border-[#2dd4bf]/50 focus-within:ring-4 ring-[#2dd4bf]/5"
        }`}
      >
        <div className="flex flex-col">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask anything. Type @ for tools and / for commands."
            className={`w-full bg-transparent outline-hidden resize-none min-h-[48px] px-4 pt-3 pb-2 text-[17px] leading-relaxed overflow-y-auto transition-colors ${
              isDark ? "text-gray-200 placeholder-gray-500" : "text-gray-800 placeholder-gray-400"
            }`}
            rows={1}
          />
          
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <button 
                className={`p-2 rounded-full transition-colors ${
                  isDark ? "hover:bg-white/5 text-gray-500 hover:text-gray-300" : "hover:bg-black/5 text-gray-400 hover:text-gray-600"
                }`}
                title="Attach file"
              >
                <Paperclip size={20} />
              </button>
              <div className={`w-[1px] h-4 mx-1 ${isDark ? "bg-white/10" : "bg-black/10"}`} />
              <button 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all border ${
                  isDark 
                    ? "text-gray-400 border-white/5 hover:border-white/20 hover:bg-white/5" 
                    : "text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                Claude 3.5 Sonnet
                <ChevronDown size={14} />
              </button>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-all shadow-lg ${
                value.trim() 
                  ? "bg-[#2dd4bf] text-black" 
                  : (isDark ? "bg-white/5 text-gray-600" : "bg-black/5 text-gray-300")
              }`}
              disabled={!value.trim()}
            >
              <ArrowUp size={20} strokeWidth={3} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Suggested Prompts - New Feature */}
      <div className="w-full mt-10">
        <div className="flex flex-wrap justify-center gap-3">
          {QUICK_ACTIONS.map((action, idx) => (
            <motion.button
              key={action.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + idx * 0.1 }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-2 px-5 py-2 rounded-2xl text-[14px] font-medium border transition-all ${
                isDark 
                  ? "border-white/5 text-gray-400 bg-white/[0.02] hover:border-[#2dd4bf]/30 hover:text-[#2dd4bf] hover:bg-[#2dd4bf]/5" 
                  : "border-gray-200 text-gray-600 bg-white hover:border-[#2dd4bf]/30 hover:text-[#0d9488] shadow-sm hover:shadow-md"
              }`}
            >
              <action.icon size={16} />
              {action.label}
            </motion.button>
          ))}
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="mt-12 flex flex-col items-center gap-3"
      >
        <span className={`text-xs uppercase tracking-[0.2em] font-medium ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          Recent Explorations
        </span>
        <div className="flex flex-col gap-2 w-full">
          {SUGGESTIONS.map((suggestion, idx) => (
            <button 
              key={idx}
              className={`text-sm text-left px-4 py-2 rounded-lg transition-colors ${
                isDark ? "hover:bg-white/5 text-gray-500 hover:text-gray-300" : "hover:bg-black/5 text-gray-500 hover:text-gray-800"
              }`}
            >
              "{suggestion}"
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
