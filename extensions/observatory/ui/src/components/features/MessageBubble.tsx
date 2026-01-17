import { useState } from "react"
import { format } from "date-fns"
import { User, Bot, Wrench, Settings, ChevronDown, ChevronRight, Clock, Coins, Terminal, CheckCircle, XCircle, Copy, Check, AlertCircle, Info } from "lucide-react"
import { cn, formatCost, formatTokens, formatDuration } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { MarkdownContent } from "./MarkdownContent"
import { JsonViewer } from "./JsonViewer"
import type { Message, MessageContent } from "@/types"

interface MessageBubbleProps {
  message: Message
  className?: string
}

// Format tool params as readable key-value pairs
function formatToolParams(input: any): { key: string; value: string; full: string }[] {
  if (!input || typeof input !== 'object') return []
  return Object.entries(input).map(([key, value]) => {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value)
    const truncated = strValue.length > 80 ? strValue.slice(0, 80) + '...' : strValue
    return { key, value: truncated, full: strValue }
  })
}

// Truncate content for preview
function truncateContent(content: string, maxLength = 200): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}

// Parse user message to extract system logs and actual message
interface ParsedUserMessage {
  systemLogs: { timestamp: string; type: 'error' | 'warning' | 'info'; message: string }[]
  chatMessage: { channel: string; sender: string; timestamp: string; text: string; messageId?: string } | null
  rawText: string
}

function parseUserMessage(content: string): ParsedUserMessage {
  const result: ParsedUserMessage = {
    systemLogs: [],
    chatMessage: null,
    rawText: content
  }
  
  // Extract system logs: System: [timestamp] message
  const systemRegex = /System:\s*\[([^\]]+)\]\s*([^\n]+?)(?=System:|$|\[(?:WhatsApp|Telegram|Slack|Discord))/g
  let match
  while ((match = systemRegex.exec(content)) !== null) {
    const timestamp = match[1]
    const message = match[2].trim()
    const type = message.toLowerCase().includes('error') ? 'error' 
      : message.toLowerCase().includes('warn') ? 'warning' 
      : 'info'
    result.systemLogs.push({ timestamp, type, message })
  }
  
  // Extract chat message: [Channel sender timestamp] message [message_id: xxx]
  const chatRegex = /\[(WhatsApp|Telegram|Slack|Discord|Signal)\s+([^\]]+?)\s+(\d{4}-\d{2}-\d{2}T[\d:Z]+)\]\s*(.+?)(?:\[message_id:\s*([^\]]+)\])?$/s
  const chatMatch = content.match(chatRegex)
  if (chatMatch) {
    result.chatMessage = {
      channel: chatMatch[1],
      sender: chatMatch[2],
      timestamp: chatMatch[3],
      text: chatMatch[4].trim().replace(/\[message_id:\s*[^\]]+\]\s*$/, '').trim(),
      messageId: chatMatch[5]
    }
  }
  
  return result
}

// Component to render parsed user messages nicely
function UserMessageContent({ content }: { content: string }) {
  const [showSystemLogs, setShowSystemLogs] = useState(false)
  const parsed = parseUserMessage(content)
  
  // If we couldn't parse anything useful, show raw
  if (!parsed.chatMessage && parsed.systemLogs.length === 0) {
    return (
      <div className="prose-sm max-w-none">
        <MarkdownContent content={content} />
      </div>
    )
  }
  
  const channelIcons: Record<string, string> = {
    WhatsApp: '💬',
    Telegram: '✈️',
    Slack: '💼',
    Discord: '🎮',
    Signal: '🔒'
  }
  
  return (
    <div className="space-y-3">
      {/* System logs - collapsed by default */}
      {parsed.systemLogs.length > 0 && (
        <div className="rounded-lg border border-muted bg-muted/30 overflow-hidden">
          <button
            onClick={() => setShowSystemLogs(!showSystemLogs)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>{parsed.systemLogs.length} system event{parsed.systemLogs.length !== 1 ? 's' : ''}</span>
              {parsed.systemLogs.some(l => l.type === 'error') && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1">
                  {parsed.systemLogs.filter(l => l.type === 'error').length} error
                </Badge>
              )}
            </div>
            {showSystemLogs ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {showSystemLogs && (
            <div className="px-3 pb-2 space-y-1 border-t border-muted">
              {parsed.systemLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs pt-1">
                  {log.type === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  ) : log.type === 'warning' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className="font-mono text-muted-foreground">{log.timestamp.split('T')[1]?.replace('Z', '') || log.timestamp}</span>
                    <span className={cn(
                      "ml-2",
                      log.type === 'error' && "text-red-600 dark:text-red-400",
                      log.type === 'warning' && "text-yellow-600 dark:text-yellow-400"
                    )}>
                      {log.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Actual chat message */}
      {parsed.chatMessage && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{channelIcons[parsed.chatMessage.channel] || '💬'}</span>
            <span className="font-medium">{parsed.chatMessage.sender}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {parsed.chatMessage.timestamp.split('T')[1]?.replace('Z', '') || parsed.chatMessage.timestamp}
            </span>
          </div>
          <div className="text-base leading-relaxed pl-8">
            {parsed.chatMessage.text}
          </div>
        </div>
      )}
      
      {/* Fallback if only system logs */}
      {!parsed.chatMessage && parsed.systemLogs.length > 0 && !showSystemLogs && (
        <p className="text-xs text-muted-foreground italic">Click above to view system events</p>
      )}
    </div>
  )
}

export function MessageBubble({ message, className }: MessageBubbleProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const isTool = message.role === "tool"
  const isSystem = message.role === "system"
  const isToolResult = isTool && message.name

  const Icon = isUser ? User : isAssistant ? Bot : isTool ? Terminal : Settings
  
  // Copy to clipboard helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getContent = (): string => {
    if (typeof message.content === "string") {
      return message.content
    }
    if (Array.isArray(message.content)) {
      return message.content
        .filter((c): c is MessageContent & { type: "text" } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
    }
    return ""
  }

  const getToolCalls = () => {
    if (typeof message.content === "string") return []
    if (!Array.isArray(message.content)) return []
    return message.content.filter(
      (c): c is MessageContent & { type: "tool_use" } => c.type === "tool_use"
    )
  }

  const getToolResults = () => {
    if (typeof message.content === "string") return []
    if (!Array.isArray(message.content)) return []
    return message.content.filter(
      (c): c is MessageContent & { type: "tool_result" } => c.type === "tool_result"
    )
  }

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const content = getContent()
  const toolCalls = getToolCalls()
  const toolResults = getToolResults()

  // Calculate message-specific cost
  const messageCost = message.cost || 0
  const totalTokens = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0)

  // Special rendering for tool result messages
  if (isToolResult) {
    const details = (message as any).details
    const resultContent = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    const isError = (message as any).isError
    const isExpanded = expandedTools.has(message.tool_call_id || 'result')
    const preview = truncateContent(resultContent, 200)
    
    return (
      <div
        className={cn(
          "rounded-lg border-2 overflow-hidden shadow-sm",
          isError 
            ? "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30"
            : "bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/30",
          className
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isError ? "bg-red-500/20" : "bg-green-500/20"
            )}>
              {isError ? (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base">{message.name}</span>
                <Badge className={cn(
                  "text-[10px] h-5 border",
                  isError 
                    ? "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30"
                    : "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30"
                )}>
                  {isError ? 'ERROR' : 'RESULT'}
                </Badge>
              </div>
              {details?.durationMs !== undefined && (
                <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {details.durationMs}ms
                  {details.exitCode !== undefined && (
                    <span className="ml-2">exit: {details.exitCode}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(resultContent, message.tool_call_id || 'result')}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Copy result"
            >
              {copiedId === (message.tool_call_id || 'result') ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={() => toggleTool(message.tool_call_id || 'result')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isError ? "hover:bg-red-500/20" : "hover:bg-green-500/20"
              )}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
        
        {/* Result content */}
        <div className={cn(
          "px-4 pb-3 border-t",
          isError ? "border-red-500/20" : "border-green-500/20"
        )}>
          <pre className="text-sm font-mono whitespace-pre-wrap break-all mt-3 text-foreground/80 max-h-[400px] overflow-auto">
            {isExpanded ? resultContent : preview}
          </pre>
          {!isExpanded && resultContent.length > 200 && (
            <button 
              onClick={() => toggleTool(message.tool_call_id || 'result')}
              className="text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              Show full result ({resultContent.length} chars)
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex gap-4 rounded-xl p-5 transition-all hover:shadow-sm",
        isUser && "bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20",
        isAssistant && "bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50",
        className
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm ring-2 ring-offset-2 ring-offset-background transition-transform group-hover:scale-105",
          isUser && "bg-gradient-to-br from-blue-500 to-blue-600 text-white ring-blue-500/20",
          isAssistant && "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ring-primary/20",
          isTool && "bg-gradient-to-br from-orange-500 to-orange-600 text-white ring-orange-500/20",
          isSystem && "bg-muted text-muted-foreground ring-muted"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold capitalize text-sm">{message.role}</span>
          {message.name && (
            <Badge variant="outline" className="text-xs">
              {message.name}
            </Badge>
          )}
          {message.timestamp && (
            <span className="text-xs text-muted-foreground font-mono">
              {format(new Date(message.timestamp), "HH:mm:ss")}
            </span>
          )}
        </div>

        {/* Message content - special handling for user messages */}
        {content && isUser ? (
          <UserMessageContent content={content} />
        ) : content ? (
          <div className="prose-sm max-w-none">
            <MarkdownContent content={content} />
          </div>
        ) : null}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <div className="space-y-3">
            {toolCalls.map((tool) => {
              const isExpanded = expandedTools.has(tool.id || "")
              const params = formatToolParams(tool.input)
              return (
                <div
                  key={tool.id}
                  className="rounded-lg border-2 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/30 overflow-hidden shadow-sm"
                >
                  {/* Header - always visible */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/20">
                        <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base">{tool.name}</span>
                          <Badge className="text-[10px] h-5 bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30">
                            TOOL
                          </Badge>
                        </div>
                        {tool.id && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {tool.id.slice(0, 20)}...
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleTool(tool.id || "")}
                      className="p-2 rounded-lg hover:bg-orange-500/20 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  
                  {/* Params preview - always visible */}
                  {params.length > 0 && (
                    <div className="px-4 pb-3 space-y-1">
                      {params.slice(0, isExpanded ? params.length : 3).map(({ key, value, full }) => (
                        <div key={key} className="flex items-start gap-2 text-sm">
                          <span className="font-mono font-medium text-orange-600 dark:text-orange-400 shrink-0">{key}:</span>
                          <span className="font-mono text-muted-foreground break-all">{isExpanded ? full : value}</span>
                          {isExpanded && full.length > 50 && (
                            <button
                              onClick={() => copyToClipboard(full, `${tool.id}-${key}`)}
                              className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                              title="Copy value"
                            >
                              {copiedId === `${tool.id}-${key}` ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                      {!isExpanded && params.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{params.length - 3} more params</span>
                      )}
                    </div>
                  )}
                  
                  {/* Full JSON - only when expanded */}
                  {isExpanded && (
                    <div className="px-4 py-3 border-t border-orange-500/20 bg-orange-500/5">
                      <div className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-2">Full Input:</div>
                      <JsonViewer data={tool.input} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Tool results (from content array) */}
        {toolResults.length > 0 && (
          <div className="space-y-3">
            {toolResults.map((result, idx) => {
              const isExpanded = expandedTools.has(result.id || `result-${idx}`)
              const resultContent = typeof result.content === "string" ? result.content : JSON.stringify(result.content)
              const preview = truncateContent(resultContent, 150)
              return (
                <div
                  key={result.id || idx}
                  className="rounded-lg border-2 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/30 overflow-hidden shadow-sm"
                >
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/20">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <span className="font-mono font-bold text-base">Result</span>
                        {result.id && (
                          <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                            {result.id.slice(0, 12)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleTool(result.id || `result-${idx}`)}
                      className="p-2 rounded-lg hover:bg-green-500/20 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  
                  {/* Preview */}
                  <div className="px-4 pb-3">
                    <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {isExpanded ? resultContent : preview}
                    </pre>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Message metadata */}
        {(message.usage || message.cost !== undefined || message.duration !== undefined) && (
          <div className="flex items-center gap-3 flex-wrap text-xs pt-3 border-t border-border/50">
            {message.usage && totalTokens > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400">
                <Coins className="h-3.5 w-3.5" />
                <span className="font-mono font-medium">
                  {formatTokens(totalTokens)}
                </span>
                {message.usage.input_tokens && message.usage.output_tokens && (
                  <span className="text-[10px] opacity-70">
                    {formatTokens(message.usage.input_tokens)}↓ {formatTokens(message.usage.output_tokens)}↑
                  </span>
                )}
              </div>
            )}
            {message.usage?.cache_read_input_tokens && message.usage.cache_read_input_tokens > 0 && (
              <Badge variant="outline" className="text-[11px] h-6 border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400">
                ⚡ {formatTokens(message.usage.cache_read_input_tokens)} cached
              </Badge>
            )}
            {messageCost > 0 && (
              <Badge variant="secondary" className="text-[11px] h-6 font-mono font-semibold bg-green-500/10 text-green-700 dark:text-green-400">
                💰 {formatCost(messageCost)}
              </Badge>
            )}
            {message.duration !== undefined && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/10 text-orange-700 dark:text-orange-400">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-mono font-medium">{formatDuration(message.duration)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
