# Magic MCP Dashboard Inspiration

## Tool Used

`21st_magic_component_inspiration`

## Prompt

```
I need inspiration for a modern, warm, playful dashboard home page for a "Second Brain" AI agent management platform. Looking for card-based layouts with agent avatars, status indicators, progress bars, and a quick chat input. Think Notion/Linear style - clean but with personality.
```

## Search Query

```
dashboard home cards agents status
```

## Note

The response was very large (90,000+ characters) and was saved to a tool-results file.
Key components likely include:

- Dashboard layouts with card grids
- Stat/metric cards
- Progress indicators
- Status badges
- User/agent avatar groups
- Action cards with CTAs
- Quick action inputs

## Recommended Approach

For the dashboard, we should:

1. Use Shadcn's Card component as the base
2. Create EntityCard for agents/workstreams (see VIEW-COMPONENTS.md)
3. Use MetricCard for stats (see VIEW-COMPONENTS.md)
4. Build a QuickChatInput component for the inline chat starter
5. Use StatusBadge with pulse animation for live status

## Design Principles from Magic

- Generous whitespace
- Soft shadows (shadow-sm to shadow-md)
- Rounded corners (rounded-lg, rounded-xl)
- Subtle borders (border-border/50)
- Hover states with smooth transitions
- Card hover: slight lift or glow effect
