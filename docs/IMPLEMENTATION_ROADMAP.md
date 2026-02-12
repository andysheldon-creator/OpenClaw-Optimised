# Implementation Roadmap: Week 1 Quick Start

## 🚨 URGENT: Stop Cost Bleeding NOW

**Current Status**: £200-500+/month and growing exponentially  
**Target**: <£60/month  
**Timeline**: 8 weeks total, Week 1 is CRITICAL

---

## Week 1: Emergency Cost Control (Days 1-7)

### Goal: 50-70% immediate cost reduction

### Day 1-2: Conversation Windowing (4 hours)

**What**: Limit conversation history sent to Claude API

**Action**:
```bash
# Find message handler in codebase
grep -r "anthropic.messages.create" src/

# Modify to send only last 10 messages instead of full history
const recentMessages = conversationHistory.slice(-10);
```

**Expected Impact**: 60-70% cost reduction immediately

---

### Day 3-4: Install & Test Ollama (3 hours)

**What**: Set up local LLM for free processing

**Actions**:
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models
ollama pull llama3.1:8b          # For simple queries
ollama pull nomic-embed-text     # For embeddings
ollama pull llava:7b             # For vision

# Test
ollama run llama3.1:8b "What is 2+2?"
```

**Expected Impact**: Ready for 40% free query handling

---

### Day 5: Basic Ollama Integration (4 hours)

**What**: Route simple queries to Ollama instead of Claude

**Action**:
Create `src/services/ollama-router.ts`:
```typescript
import { Ollama } from 'ollama';

export class SimpleRouter {
  private ollama = new Ollama();

  async handle(message: string): Promise<string | null> {
    // Handle greetings
    if (/^(hi|hello|hey)/i.test(message)) {
      return "Hello! How can I help?";
    }

    // Handle simple math
    if (/\d+\s*[\+\-]\s*\d+/.test(message)) {
      return await this.ollama.generate({
        model: 'llama3.1:8b',
        prompt: message
      }).then(r => r.response);
    }

    return null; // Falls through to Claude
  }
}
```

**Expected Impact**: 30-40% queries now FREE

---

### Day 6: Cost Monitoring (2 hours)

**What**: Track spending to prevent overruns

**Action**:
Create `src/services/cost-tracker.ts`:
```typescript
export class CostTracker {
  private dailyCost = 0;
  private limit = 2; // £2 per day = £60/month

  track(tokens: number): void {
    const cost = tokens * 0.000003;
    this.dailyCost += cost;

    if (this.dailyCost > this.limit) {
      console.error(`🚨 BUDGET EXCEEDED: £${this.dailyCost.toFixed(2)}`);
      // Send alert email/Slack
    }

    console.log(`💰 Today: £${this.dailyCost.toFixed(2)} / £${this.limit}`);
  }
}
```

---

### Day 7: Deploy & Monitor

**Actions**:
```bash
# Test changes locally
pnpm test

# Deploy
pnpm build
git add .
git commit -m "feat: Add conversation windowing and Ollama integration"
git push

# Monitor for 24 hours
tail -f logs/cost-tracker.log
```

**Verify**:
- [ ] Daily cost reduced from £6 to £2
- [ ] - [ ] Response quality maintained
- [ ] - [ ] No errors in logs

- [ ] ---

- [ ] ## Week 1 Expected Results

- [ ] **Before**:
- [ ] - Daily cost: £6
- [ ] - Monthly projection: £180
- [ ] - Status: ❌ Over budget

- [ ] **After Week 1**:
- [ ] - Daily cost: £2
- [ ] - Monthly projection: £60
- [ ] - Status: ✅ ON BUDGET!

- [ ] **Savings**: 66% reduction (£120/month saved)

- [ ] ---

- [ ] ## Quick Reference: Key Files to Modify

- [ ] ### 1. Message Handler
- [ ] **Location**: `src/agents/` or `apps/gateway/`
- [ ] **Change**: Add `.slice(-10)` to history before API call

- [ ] ### 2. Dependencies
- [ ] ```bash
- [ ] pnpm add ollama chromadb
- [ ] ```

- [ ] ### 3. Environment Variables
- [ ] ```bash
- [ ] # .env
- [ ] ANTHROPIC_API_KEY=your_key_here
- [ ] OLLAMA_HOST=http://localhost:11434
- [ ] ENABLE_OLLAMA=true
- [ ] COST_ALERT_EMAIL=your@email.com
- [ ] ```

- [ ] ---

- [ ] ## Troubleshooting

- [ ] ### Issue: Ollama not running
- [ ] ```bash
- [ ] # Check status
- [ ] ollama list

- [ ] # Start service
- [ ] ollama serve
- [ ] ```

- [ ] ### Issue: Still high costs
- [ ] ```bash
- [ ] # Check message sizes
- [ ] node scripts/analyze-token-usage.js

- [ ] # Reduce window further
- [ ] const recentMessages = conversationHistory.slice(-5); // Try 5 instead of 10
- [ ] ```

- [ ] ### Issue: Quality degradation
- [ ] ```bash
- [ ] # Increase window slightly
- [ ] const recentMessages = conversationHistory.slice(-15);

- [ ] # Or disable Ollama temporarily
- [ ] export ENABLE_OLLAMA=false
- [ ] ```

- [ ] ---

- [ ] ## Next Steps (Week 2+)

- [ ] After Week 1 success:
- [ ] 1. **Week 2**: Implement RAG (80% total reduction)
- [ ] 2. **Week 3**: Tiered memory system
- [ ] 3. **Week 4**: Full hybrid routing
- [ ] 4. **Week 5-8**: Multi-bot architecture

- [ ] **Full roadmap available in complete IMPLEMENTATION_ROADMAP.md**

- [ ] ---

- [ ] ## Support & Questions

- [ ] - Check other docs: `COST_CRISIS.md`, `RAG_IMPLEMENTATION.md`
- [ ] - Review architecture: `CURRENT_STATE_ANALYSIS.md`
- [ ] - Security concerns: `SECURITY_AUDIT.md`

- [ ] ---

- [ ] *Created: 2025-02-12*
- [ ] *Status: Week 1 Ready to Execute*
- [ ] *Priority: CRITICAL - Start immediately*
