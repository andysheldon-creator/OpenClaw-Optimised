import React, { useRef, useEffect, useState, useCallback } from "react";
import { ChevronDown, ArrowUp, Paperclip, Globe, Zap, Sparkles, Command, User, Bot, AlertCircle, Loader2, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { sendMessageStream } from "../lib/chat";
import { generateId, generateTitle, type Message, type Conversation, type ChatSettings } from "../lib/types";
import { saveConversation, getConversation, loadConversations } from "../lib/chat";
import { getDefaultProviders } from "../lib/models";

interface ChatInterfaceProps {
  theme: "dark" | "light";
  chatId?: string | null;
  onConversationUpdate?: () => void;
}

const QUICK_ACTIONS = [
  { label: "Search", icon: Globe, prompt: "Search the web for " },
  { label: "Analyze", icon: Zap, prompt: "Analyze this: " },
  { label: "Summarize", icon: Sparkles, prompt: "Summarize: " },
  { label: "Code", icon: Command, prompt: "Write code to " },
];

const SUGGESTIONS = [
  "Write a marketing plan for a tech startup",
  "Explain quantum computing in simple terms",
  "How do I optimize my React application?",
];

// Markdown-like renderer (basic)
function renderContent(content: string, isDark: boolean) {
  // Simple code block detection
  const parts = content.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part, idx) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
      const lang = match?.[1] || "";
      const code = match?.[2] || part.slice(3, -3);
      
      return (
        <pre
          key={idx}
          className={`my-3 p-4 rounded-xl overflow-x-auto text-sm font-mono ${
            isDark ? "bg-black/40" : "bg-gray-100"
          }`}
        >
          {lang && (
            <div className={`text-xs mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {lang}
            </div>
          )}
          <code>{code}</code>
        </pre>
      );
    }
    
    // Handle inline code
    const inlineFormatted = part.split(/(`[^`]+`)/g).map((segment, i) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return (
          <code
            key={i}
            className={`px-1.5 py-0.5 rounded text-sm font-mono ${
              isDark ? "bg-white/10" : "bg-gray-200"
            }`}
          >
            {segment.slice(1, -1)}
          </code>
        );
      }
      return segment;
    });
    
    return <span key={idx}>{inlineFormatted}</span>;
  });
}

// Message component
function MessageBubble({ 
  message, 
  isDark 
}: { 
  message: Message; 
  isDark: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isDark ? "bg-[#2dd4bf]/20" : "bg-[#2dd4bf]/10"
        }`}>
          <Bot size={18} className="text-[#2dd4bf]" />
        </div>
      )}
      
      <div className={`relative max-w-[80%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${
            isUser
              ? "bg-[#2dd4bf] text-black rounded-br-md"
              : isDark
                ? "bg-white/5 text-gray-200 rounded-bl-md"
                : "bg-gray-100 text-gray-800 rounded-bl-md"
          }`}
        >
          {isUser ? message.content : renderContent(message.content, isDark)}
        </div>
        
        {!isUser && (
          <button
            onClick={handleCopy}
            className={`absolute -bottom-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs ${
              isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      
      {isUser && (
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isDark ? "bg-white/10" : "bg-gray-200"
        }`}>
          <User size={18} className={isDark ? "text-gray-400" : "text-gray-600"} />
        </div>
      )}
    </motion.div>
  );
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  theme, 
  chatId,
  onConversationUpdate 
}) => {
  const isDark = theme === "dark";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

  // Get settings from localStorage
  const getSettings = useCallback((): ChatSettings => {
    const provider = localStorage.getItem("easyhub_provider") || "anthropic";
    const model = localStorage.getItem("easyhub_default_model") || "claude-sonnet-4-20250514";
    const apiKeysStr = localStorage.getItem("easyhub_api_keys");
    const apiKeys = apiKeysStr ? JSON.parse(apiKeysStr) : {};
    const temperature = parseFloat(localStorage.getItem("easyhub_temperature") || "0.7");
    const maxTokens = parseInt(localStorage.getItem("easyhub_max_tokens") || "4096");
    const systemPrompt = localStorage.getItem("easyhub_system_prompt") || undefined;

    return {
      provider,
      model,
      apiKey: apiKeys[provider] || "",
      temperature,
      maxTokens,
      systemPrompt,
    };
  }, []);

  // Get current model name for display
  const getCurrentModelName = useCallback((): string => {
    const settings = getSettings();
    const providers = getDefaultProviders();
    const provider = providers.find(p => p.id === settings.provider);
    const model = provider?.models.find(m => m.id === settings.model);
    return model?.name || settings.model;
  }, [getSettings]);

  // Load conversation when chatId changes
  useEffect(() => {
    if (chatId) {
      const conv = getConversation(chatId);
      if (conv) {
        setCurrentConversation(conv);
        setMessages(conv.messages || []);
      }
    } else {
      // New chat
      setCurrentConversation(null);
      setMessages([]);
    }
    setError(null);
    setStreamingContent("");
  }, [chatId]);

  // Auto-resize textarea
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Send message
  const handleSend = async () => {
    const content = value.trim();
    if (!content || isLoading) return;

    setError(null);
    setValue("");
    
    const settings = getSettings();
    
    // Create user message
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);
    setStreamingContent("");

    // Create or update conversation
    let conversation = currentConversation;
    if (!conversation) {
      conversation = {
        id: generateId(),
        title: generateTitle(content),
        messages: newMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider: settings.provider,
        model: settings.model,
      };
      setCurrentConversation(conversation);
    } else {
      conversation = {
        ...conversation,
        messages: newMessages,
        updatedAt: Date.now(),
      };
    }

    // Save immediately with user message
    saveConversation(conversation);
    onConversationUpdate?.();

    try {
      let fullResponse = "";

      await sendMessageStream(newMessages, settings, {
        onToken: (token) => {
          fullResponse += token;
          setStreamingContent(fullResponse);
        },
        onComplete: (response) => {
          const assistantMessage: Message = {
            id: generateId(),
            role: "assistant",
            content: response,
            timestamp: Date.now(),
            model: settings.model,
          };

          const updatedMessages = [...newMessages, assistantMessage];
          setMessages(updatedMessages);
          setStreamingContent("");
          setIsLoading(false);

          // Save conversation with assistant response
          const updatedConversation = {
            ...conversation!,
            messages: updatedMessages,
            updatedAt: Date.now(),
          };
          setCurrentConversation(updatedConversation);
          saveConversation(updatedConversation);
          onConversationUpdate?.();
        },
        onError: (err) => {
          setError(err.message);
          setIsLoading(false);
          setStreamingContent("");
        },
      });
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setIsLoading(false);
      setStreamingContent("");
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setValue(suggestion);
    textareaRef.current?.focus();
  };

  const handleQuickAction = (prompt: string) => {
    setValue(prompt);
    textareaRef.current?.focus();
  };

  // Show chat view if we have messages
  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className="flex flex-col items-center w-full max-w-[720px] px-6 h-full">
      <AnimatePresence mode="wait">
        {!hasMessages ? (
          // Welcome screen
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center w-full"
          >
            <div className="text-center mb-10">
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
            </div>

            {/* Input Box */}
            <InputBox
              ref={textareaRef}
              value={value}
              onChange={setValue}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              isDark={isDark}
              isLoading={isLoading}
              modelName={getCurrentModelName()}
            />

            {/* Quick Actions */}
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
                    onClick={() => handleQuickAction(action.prompt)}
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

            {/* Suggestions */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
              className="mt-12 flex flex-col items-center gap-3"
            >
              <span className={`text-xs uppercase tracking-[0.2em] font-medium ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                Try These
              </span>
              <div className="flex flex-col gap-2 w-full">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`text-sm text-left px-4 py-2 rounded-lg transition-colors ${
                      isDark ? "hover:bg-white/5 text-gray-500 hover:text-gray-300" : "hover:bg-black/5 text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    "{suggestion}"
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          // Chat view
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col w-full h-full min-h-[60vh]"
          >
            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 mb-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} isDark={isDark} />
              ))}
              
              {/* Streaming response */}
              {streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4"
                >
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isDark ? "bg-[#2dd4bf]/20" : "bg-[#2dd4bf]/10"
                  }`}>
                    <Bot size={18} className="text-[#2dd4bf]" />
                  </div>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md text-[15px] leading-relaxed ${
                    isDark ? "bg-white/5 text-gray-200" : "bg-gray-100 text-gray-800"
                  }`}>
                    {renderContent(streamingContent, isDark)}
                    <span className="inline-block w-2 h-4 ml-1 bg-[#2dd4bf] animate-pulse rounded-sm" />
                  </div>
                </motion.div>
              )}

              {/* Loading indicator */}
              {isLoading && !streamingContent && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-4"
                >
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isDark ? "bg-[#2dd4bf]/20" : "bg-[#2dd4bf]/10"
                  }`}>
                    <Loader2 size={18} className="text-[#2dd4bf] animate-spin" />
                  </div>
                  <div className={`px-4 py-3 rounded-2xl rounded-bl-md ${
                    isDark ? "bg-white/5" : "bg-gray-100"
                  }`}>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-[#2dd4bf] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-[#2dd4bf] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-[#2dd4bf] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl ${
                    isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"
                  }`}
                >
                  <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>
                      Error
                    </p>
                    <p className={`text-sm mt-1 ${isDark ? "text-red-300/70" : "text-red-600"}`}>
                      {error}
                    </p>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Box (sticky at bottom) */}
            <div className="shrink-0 pb-4">
              <InputBox
                ref={textareaRef}
                value={value}
                onChange={setValue}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
                isDark={isDark}
                isLoading={isLoading}
                modelName={getCurrentModelName()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Separate InputBox component for reuse
interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isDark: boolean;
  isLoading: boolean;
  modelName: string;
}

const InputBox = React.forwardRef<HTMLTextAreaElement, InputBoxProps>(
  ({ value, onChange, onSend, onKeyDown, isDark, isLoading, modelName }, ref) => {
    return (
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
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything. Press Enter to send, Shift+Enter for new line."
            disabled={isLoading}
            className={`w-full bg-transparent outline-hidden resize-none min-h-[48px] px-4 pt-3 pb-2 text-[17px] leading-relaxed overflow-y-auto transition-colors ${
              isDark ? "text-gray-200 placeholder-gray-500" : "text-gray-800 placeholder-gray-400"
            } disabled:opacity-50`}
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
                {modelName}
                <ChevronDown size={14} />
              </button>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSend}
              disabled={!value.trim() || isLoading}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-all shadow-lg ${
                value.trim() && !isLoading
                  ? "bg-[#2dd4bf] text-black" 
                  : (isDark ? "bg-white/5 text-gray-600" : "bg-black/5 text-gray-300")
              } disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <ArrowUp size={20} strokeWidth={3} />
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }
);

InputBox.displayName = "InputBox";
