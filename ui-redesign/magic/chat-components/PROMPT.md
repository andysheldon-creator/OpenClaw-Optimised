# Magic MCP Chat Components Inspiration

## Tool Used

`21st_magic_component_inspiration`

## Prompt

```
I need inspiration for a chat interface component with message bubbles, tool call displays, streaming indicators, and attachment support. Should be warm and friendly like ChatGPT but with more visual personality for a Second Brain platform.
```

## Search Query

```
chat message bubbles conversation
```

## Components Retrieved

### 1. Chat Message List

- Auto-scrolling chat container with messages
- Uses `useAutoScroll` hook for smart scroll behavior
- Bottom scroll-to-bottom button when not at bottom
- Components: ChatBubble, ChatBubbleAvatar, ChatBubbleMessage, ChatInput

### 2. Chat Bubble

- Variants: `sent` and `received`
- Loading state with animated dots (MessageLoading)
- Avatar support with fallback
- Action buttons (copy, regenerate)
- Clean rounded corners with proper alignment

### 3. Chat Interface (Advanced)

- Full chat simulation with animation
- Left/right person configuration
- Message types: text, image, text-with-links
- Loader configuration per message
- Link badges for inline links
- Auto-restart functionality
- Customizable colors for all elements

## Key Patterns

### Chat Container

```tsx
<div className="h-[400px] border bg-background rounded-lg flex flex-col">
  <div className="flex-1 overflow-hidden">
    <ChatMessageList>
      {messages.map(msg => <ChatBubble ... />)}
    </ChatMessageList>
  </div>
  <div className="p-4 border-t">
    <ChatInput ... />
  </div>
</div>
```

### Chat Bubble Structure

```tsx
<ChatBubble variant="sent|received">
  <ChatBubbleAvatar src="..." fallback="AI" />
  <ChatBubbleMessage variant="sent|received">{content}</ChatBubbleMessage>
</ChatBubble>
```

### Loading Animation

Bouncing dots with staggered animation using framer-motion/motion

### Auto-scroll Hook

```tsx
const { scrollRef, isAtBottom, scrollToBottom } = useAutoScroll({
  smooth: true,
  content: messages,
});
```

## Dependencies

- @radix-ui/react-avatar
- @radix-ui/react-slot
- class-variance-authority
- lucide-react
- framer-motion (for advanced version)
