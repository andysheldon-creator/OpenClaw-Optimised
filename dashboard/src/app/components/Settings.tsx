import React, { useState, useEffect } from "react";
import { X, Eye, EyeOff, Check, RefreshCw } from "lucide-react";
import { fetchProviders, getDefaultProviders, type AIProvider } from "../lib/models";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  theme: "dark" | "light";
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, theme }) => {
  const isDark = theme === "dark";
  
  const [providers, setProviders] = useState<AIProvider[]>(getDefaultProviders());
  const [activeProvider, setActiveProvider] = useState("anthropic");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [defaultModel, setDefaultModel] = useState("claude-sonnet-4-20250514");
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Advanced settings
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState("");

  // Fetch providers on mount
  useEffect(() => {
    loadProviders();
  }, []);

  // Load settings from localStorage
  useEffect(() => {
    const savedKeys = localStorage.getItem("easyhub_api_keys");
    const savedModel = localStorage.getItem("easyhub_default_model");
    const savedProvider = localStorage.getItem("easyhub_provider");
    const savedTemp = localStorage.getItem("easyhub_temperature");
    const savedMaxTokens = localStorage.getItem("easyhub_max_tokens");
    const savedSystemPrompt = localStorage.getItem("easyhub_system_prompt");
    
    if (savedKeys) setApiKeys(JSON.parse(savedKeys));
    if (savedModel) setDefaultModel(savedModel);
    if (savedProvider) setActiveProvider(savedProvider);
    if (savedTemp) setTemperature(parseFloat(savedTemp));
    if (savedMaxTokens) setMaxTokens(parseInt(savedMaxTokens));
    if (savedSystemPrompt) setSystemPrompt(savedSystemPrompt);
  }, []);

  const loadProviders = async () => {
    try {
      const fetched = await fetchProviders();
      setProviders(fetched);
    } catch (error) {
      console.warn("Using default providers");
    }
  };

  const handleRefreshModels = async () => {
    setRefreshing(true);
    // Clear cache
    localStorage.removeItem("easyhub_models_cache");
    await loadProviders();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleSave = () => {
    localStorage.setItem("easyhub_api_keys", JSON.stringify(apiKeys));
    localStorage.setItem("easyhub_default_model", defaultModel);
    localStorage.setItem("easyhub_provider", activeProvider);
    localStorage.setItem("easyhub_temperature", temperature.toString());
    localStorage.setItem("easyhub_max_tokens", maxTokens.toString());
    localStorage.setItem("easyhub_system_prompt", systemPrompt);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleApiKeyChange = (providerId: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [providerId]: value }));
  };

  const toggleShowApiKey = (providerId: string) => {
    setShowApiKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const currentProvider = providers.find((p) => p.id === activeProvider);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 ${isDark ? "bg-black/60" : "bg-black/40"} backdrop-blur-sm`}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={`relative w-full max-w-lg mx-4 rounded-2xl border shadow-2xl max-h-[90vh] overflow-hidden flex flex-col ${
          isDark ? "bg-[#111] border-white/10" : "bg-white border-gray-200"
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
          isDark ? "border-white/10" : "border-gray-100"
        }`}>
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
            Settings
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Provider Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                AI Provider
              </label>
              <button
                onClick={handleRefreshModels}
                disabled={refreshing}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  isDark
                    ? "text-gray-400 hover:bg-white/5 hover:text-gray-300"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                }`}
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                Refresh Models
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => {
                    setActiveProvider(provider.id);
                    setDefaultModel(provider.models[0]?.id || "");
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeProvider === provider.id
                      ? "bg-[#2dd4bf] text-black"
                      : isDark
                        ? "bg-white/5 text-gray-400 hover:bg-white/10"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${
              isDark ? "text-gray-300" : "text-gray-700"
            }`}>
              API Key for {currentProvider?.name}
            </label>
            <div className="relative">
              <input
                type={showApiKey[activeProvider] ? "text" : "password"}
                value={apiKeys[activeProvider] || ""}
                onChange={(e) => handleApiKeyChange(activeProvider, e.target.value)}
                placeholder={currentProvider?.apiKeyPlaceholder || `Enter your ${currentProvider?.name} API key`}
                className={`w-full px-4 py-3 pr-12 rounded-xl border text-sm transition-colors font-mono ${
                  isDark
                    ? "bg-white/5 border-white/10 text-white placeholder-gray-500 focus:border-[#2dd4bf]/50"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#2dd4bf]"
                } outline-none`}
              />
              <button
                onClick={() => toggleShowApiKey(activeProvider)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded ${
                  isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {showApiKey[activeProvider] ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className={`mt-2 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${
              isDark ? "text-gray-300" : "text-gray-700"
            }`}>
              Default Model
            </label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors appearance-none cursor-pointer ${
                isDark
                  ? "bg-white/5 border-white/10 text-white focus:border-[#2dd4bf]/50"
                  : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#2dd4bf]"
              } outline-none`}
            >
              {currentProvider?.models.map((model) => (
                <option key={model.id} value={model.id} className={isDark ? "bg-[#111]" : ""}>
                  {model.name} {model.contextWindow ? `(${(model.contextWindow / 1000).toFixed(0)}K)` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Temperature
              </label>
              <span className={`text-sm font-mono ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#2dd4bf]"
              style={{
                background: isDark 
                  ? `linear-gradient(to right, #2dd4bf ${temperature * 50}%, #333 ${temperature * 50}%)`
                  : `linear-gradient(to right, #2dd4bf ${temperature * 50}%, #e5e7eb ${temperature * 50}%)`
              }}
            />
            <div className={`flex justify-between text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${
              isDark ? "text-gray-300" : "text-gray-700"
            }`}>
              Max Tokens
            </label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
              min="1"
              max="128000"
              className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors ${
                isDark
                  ? "bg-white/5 border-white/10 text-white focus:border-[#2dd4bf]/50"
                  : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#2dd4bf]"
              } outline-none`}
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${
              isDark ? "text-gray-300" : "text-gray-700"
            }`}>
              System Prompt (Optional)
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter a custom system prompt..."
              rows={3}
              className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors resize-none ${
                isDark
                  ? "bg-white/5 border-white/10 text-white placeholder-gray-500 focus:border-[#2dd4bf]/50"
                  : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#2dd4bf]"
              } outline-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0 ${
          isDark ? "border-white/10" : "border-gray-100"
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              isDark
                ? "text-gray-400 hover:bg-white/5"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              saved
                ? "bg-green-500 text-white"
                : "bg-[#2dd4bf] text-black hover:bg-[#5eead4]"
            }`}
          >
            {saved ? (
              <>
                <Check size={16} />
                Saved!
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
