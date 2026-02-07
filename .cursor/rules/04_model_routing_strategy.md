# Model Routing Strategy

## Current State: Static Selection

Model routing is currently **static and deterministic**:
- User configures `agents.defaults.model.primary`
- Fallbacks are tried in order on failure
- No task-based routing exists yet

This document defines the **planned** task-based routing for SIOE.

## Design Principle: Deterministic, Not Agentic

Model routing must be:
- **Predictable**: Same input → same model selection
- **Debuggable**: Operator can trace why a model was chosen
- **Explicit**: No hidden "AI decides which AI to use"

We do NOT want:
- A routing LLM that picks models
- Dynamic routing based on content classification
- Behavior that changes based on load or cost

## Task Lanes (Planned)

Task lanes define which model handles which type of work.

| Lane | Priority | Default Model | Escalation | Use Case |
|------|----------|---------------|------------|----------|
| **Extraction** | 1 | Local (Ollama) | Kimi | Parse documents, extract data |
| **Planning** | 2 | Kimi | Opus | Multi-step workflows, deal analysis |
| **Summarization** | 3 | Local (Ollama) | Kimi | Condense documents, reports |
| **Coding** | 4 | Kimi | Opus | Generate code, scripts |
| **General** | 5 | Local (Ollama) | Kimi | Chat, simple questions |

### Why This Order for CRE

1. **Extraction is high-volume, low-stakes**
   - Rent rolls have thousands of rows
   - Local models handle structured extraction well
   - Errors are caught by validation, not model quality

2. **Planning requires reasoning**
   - Deal analysis needs to weigh tradeoffs
   - Hosted models (Kimi) have better reasoning
   - Cost is acceptable for high-value decisions

3. **Summarization is local-safe**
   - Condensing text is well-understood
   - Privacy matters (deal terms)
   - Speed matters (waiting for summaries is annoying)

4. **Coding needs capability**
   - Kimi is strong at code generation
   - Scripts and automations are valuable
   - Opus is fallback for complex cases

## Escalation Rules (Planned)

**IMPORTANT: Escalation must be deterministic, not vibes-based.**

Escalation happens when:
- Local model returns an error (API failure, timeout)
- Local model exceeds retry limit
- Explicit user request ("use Kimi for this")
- Tool/workflow specifies a lane that maps to a hosted model

Escalation does NOT happen:
- Based on "confidence" (undefined, not computed)
- Based on "complexity" (subjective, not measurable)
- Automatically based on content classification
- Based on token count alone
- Without operator awareness

**Why no confidence-based escalation:**
- "Confidence" requires either:
  - Model self-reporting (unreliable, not deterministic)
  - A classifier LLM (violates "no AI picks the AI")
- If you can't define it in code without an LLM, don't use it for routing

## Current Implementation

Until task lanes are implemented:

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "ollama/llama3:chat",
        fallbacks: ["moonshot/kimi-k2-0905-preview", "anthropic/claude-opus-4-5"]
      }
    }
  }
}
```

This provides:
- Local-first with Ollama
- Fallback to Kimi on failure
- Final fallback to Opus

## Simplest Deterministic Implementation (Recommended)

**The simplest way to get task-based routing without any AI classification:**

1. Add a required `lane` field to each tool/workflow entrypoint
2. Map lane → model in config
3. Client (TUI / CLI / tool invoker) sets the lane explicitly
4. No inference, no "smart routing"

**Implementation (can do in a day):**

```typescript
// Tool definition includes lane
type Tool = {
  name: string;
  lane: "extraction" | "summarization" | "planning" | "coding" | "general";
  // ...
};

// Config maps lane → model
type LaneRouting = {
  extraction: { primary: string; fallback: string };
  summarization: { primary: string; fallback: string };
  planning: { primary: string; fallback: string };
  coding: { primary: string; fallback: string };
  general: { primary: string; fallback: string };
};

// At runtime: look up lane, get model, done
function getModelForTool(tool: Tool, routing: LaneRouting): string {
  return routing[tool.lane].primary;
}
```

**Configuration for Task Lanes (Future)**

When implemented, configuration will look like:

```json5
{
  agents: {
    defaults: {
      routing: {
        extraction: {
          primary: "ollama/llama3:chat",
          fallback: "moonshot/kimi-k2-0905-preview"
        },
        planning: {
          primary: "moonshot/kimi-k2-0905-preview",
          fallback: "anthropic/claude-opus-4-5"
        },
        summarization: {
          primary: "ollama/llama3:chat",
          fallback: "moonshot/kimi-k2-0905-preview"
        },
        coding: {
          primary: "moonshot/kimi-k2-0905-preview",
          fallback: "anthropic/claude-opus-4-5"
        },
        general: {
          primary: "ollama/llama3:chat",
          fallback: "moonshot/kimi-k2-0905-preview"
        }
      }
    }
  }
}
```

**What this achieves:**
- Switch models by task, deterministically
- No "AI picks the AI" violation
- Operator controls the mapping
- Fallback remains failure-based
- Implementable in a day

## Model Capabilities Matrix

| Model | Extraction | Planning | Summarization | Coding | Context |
|-------|------------|----------|---------------|--------|---------|
| Ollama/llama3 | Good | Limited | Good | Limited | 32K |
| Kimi K2.5 | Good | Strong | Good | Strong | 128K |
| Claude Opus | Excellent | Excellent | Excellent | Excellent | 200K |

## Invariants (Do Not Break)

1. **Routing must be deterministic**
   - Given the same task type, always select the same model
   - No randomness, no "smart" decisions

2. **Local preference is explicit**
   - The config says "use local" not "prefer local"
   - Escalation is a conscious choice, not automatic

3. **Operator controls routing**
   - Task lanes are configured, not discovered
   - Changes require config changes, not magic

4. **Fallback is failure-based**
   - Fallback happens on error, not on content
   - A successful local response is never escalated
