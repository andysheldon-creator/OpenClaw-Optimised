# Evolution Queue

> Liam: Propose improvements here. Simon reviews and implements approved items.

## How to Submit

**REQUIRED: Verify before submitting.** Run verification command, paste output as evidence.

```
### [YYYY-MM-DD-NNN] Short title
- **Proposed by:** Liam
- **Date:** YYYY-MM-DD
- **Category:** behavior | identity | rules | tools | memory | showcase-idea
- **Target file:** (which file would change, or "new skill")
- **Verified:** [YES - ran grep/command] or [N/A - new feature]
- **Evidence:** `[paste command output showing issue exists]`
- **Description:** What to change and why
- **Status:** pending
```

**Verification commands:**
- "Missing from file X": `grep -n "[feature]" ~/clawd/[file].md`
- "Tool broken": `which [tool] && [tool] --help`
- "Cron failing": `clawdbot cron list | grep [job]`

**RULE:** If grep FINDS the feature, DO NOT create the entry (it's a ghost bug).

**IMPORTANT:** ALL entries (including external reports from Simon/Telegram) should be verified before implementation. Don't assume external reports are accurate - always verify with commands first.

## Pending

### [2026-01-27-045] [RESOLVED] Install ngrok for Phone Dashboard Access
- **Proposed by:** Simon
- **Date:** 2026-01-27
- **Category:** tools
- **Target file:** ~/.local/bin/ngrok
- **Verified:** YES - ngrok installed
- **Description:** Install ngrok to create temporary HTTPS tunnel for dashboard access from phone. Allows accessing http://localhost:8080 from anywhere.
- **Usage:** `ngrok http 8080` - creates HTTPS URL accessible from phone
- **Resolution:** Installed ngrok v3.35.0 to ~/.local/bin/ngrok (2026-01-28)
- **Status:** RESOLVED

### [2026-01-27-044] Message Metadata Mashed Into User Text - CORE Issue [RESOLVED]
- **Proposed by:** Simon
- **Date:** 2026-01-27
- **Category:** tools
- **Target file:** Core message handling (NOT channel-specific)
- **Verified:** YES - confirmed on BOTH Discord AND Telegram
- **Description:** Message metadata (user ID, message_id, timestamp, channel info) was being mashed into the user text field across ALL channels. The model treated the entire string as user input.
- **Resolution (2026-01-28):**
  - Removed metadata from body in 6 files: Discord (reply-context.ts, message-handler.process.ts), Telegram (bot-message-context.ts), Signal (event-handler.ts), Slack (prepare.ts), iMessage (monitor-provider.ts)
  - Simplified `buildDirectLabel()` and `buildGuildLabel()` to not include IDs
  - Added regression test in `envelope.test.ts`
  - Added documentation in `envelope.ts`, SOUL.md, AGENTS.md
  - Updated test in `queue.collect-routing.test.ts`
- **Resolution Part 2 (2026-01-28):**
  - **Issue:** Original fix was INCOMPLETE. The `[message_id: ...]` hint added by `get-reply-run.ts` was still being passed to the model for Discord/Telegram. The model would interpret this as shared message data.
  - **Root cause:** `stripEnvelopeFromMessages()` only ran for Web UI chat API, not embedded agent runner.
  - **Fix:** Added `stripMessageIdHints()` function in `src/agents/pi-embedded-runner/run.ts` to sanitize prompts before they reach the model.
  - **Test:** Added regression test in `run.strip-message-id.test.ts`
- **Prevention:** Regression test guards against reintroduction; AGENTS.md has rule; SOUL.md teaches Liam to detect regressions
- **Status:** RESOLVED

### [2026-02-10-042] Debug Mode Frequency Reversion (SCHEDULED)
- **Proposed by:** Cursor
- **Date:** 2026-01-28
- **Scheduled for:** 2026-02-10
- **Description:** Revert debug mode frequencies to normal after 2-week dev period. Actions: disable Evening-Self-Audit + Model-Health-Check cron jobs, revert self-evaluation/Queue-Cleanup to Sunday only.
- **Status:** SCHEDULED

### [2026-01-27-038] Telegram Multi-Message Split Formatting [INVESTIGATED]
- **Date:** 2026-01-27
- **Description:** Long responses split into multiple Telegram messages may have weird spacing.
- **Investigation (2026-01-28):**
  - **Config:** No `chunkMode` or `textChunkLimit` set - defaults: `chunkMode="length"`, `textChunkLimit=4000`
  - **Session logs:** Found 5 sessions with responses >4000 chars that would trigger chunking
  - **Chunking code analysis:**
    - `chunkText()` applies `trimEnd()` to each chunk (line 297) and `trimStart()` to remainder (line 305)
    - `chunkByParagraph()` applies `replace(/\s+$/g, "")` to strip trailing whitespace (line 220)
    - This is expected behavior - chunks should be self-contained without trailing whitespace
  - **Discord comparison:** No sessions with responses >2000 chars, so chunking hasn't been triggered there
  - **Test on 2026-01-27:** Showed perfect formatting
- **Root cause candidates:**
  1. Whitespace trimming is intentional and correct
  2. Issue may be Telegram client rendering (adds visual spacing between messages)
  3. Issue may be content-specific (certain markdown patterns)
- **Status:** CANNOT REPRODUCE - needs screenshot showing actual "weird spacing" to identify specific pattern
- **Action required:** If issue recurs, capture screenshot showing the problematic spacing and the original message content

### [2026-01-25-016] PuenteWorks Documentation Import
- **Proposed by:** Simon (via email)
- **Date:** 2026-01-25
- **Category:** memory
- **Description:** Import PuenteWorks documentation from Simon's Mac/Claude account into Liam's memory.
- **Impact:** High - Critical business context
- **Status:** WAITING ON SIMON (needs to provide files)

### [2026-01-25-007] Low-Friction Capture Methods
- **Proposed by:** Liam
- **Date:** 2026-01-25
- **Category:** tools
- **Description:** NeuroSecond <2 second capture via natural language (Telegram) and email (clawdbot@puenteworks.com).
- **Impact:** High - Critical for NeuroSecond methodology
- **Status:** IN PROGRESS (natural-capture skill)

### [2026-01-27-046] Dashboard Chat Window
- **Proposed by:** Simon (via Telegram)
- **Date:** 2026-01-27
- **Category:** tools
- **Target file:** ~/clawd/dashboard/
- **Description:** Add a chat window to the dashboard that allows chatting with Liam directly from the web interface.
- **Impact:** High - Direct interaction without switching to Telegram/Discord
- **Status:** PENDING

### [2026-01-27-047] Dashboard Session Visibility
- **Proposed by:** Simon (via Telegram)
- **Date:** 2026-01-27
- **Category:** tools
- **Target file:** ~/clawd/dashboard/
- **Description:** Show what all Liam sessions are doing in the dashboard. Display active sessions across all agents (Telegram, Discord, etc.) with their current state.
- **Impact:** Medium - Visibility into agent activity
- **Status:** PENDING

### [2026-01-27-048] Dashboard Subagent Visibility
- **Proposed by:** Simon (via Telegram)
- **Date:** 2026-01-27
- **Category:** tools
- **Target file:** ~/clawd/dashboard/
- **Description:** Show subagent activity in the dashboard. Display spawned subagents, their tasks, and status.
- **Impact:** Medium - Visibility into subagent orchestration
- **Status:** PENDING

### [2026-01-27-049] Dashboard Systemd Service Installation
- **Proposed by:** Cursor
- **Date:** 2026-01-28
- **Category:** tools
- **Target file:** /etc/systemd/system/liam-dashboard.service
- **Description:** Install systemd service so dashboard auto-starts on boot and auto-restarts on crash. Service file exists at ~/clawd/dashboard/liam-dashboard.service but requires sudo to install.
- **Note:** Requires: `sudo cp ~/clawd/dashboard/liam-dashboard.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable liam-dashboard`
- **Status:** PENDING (needs sudo access)

### [2026-01-27-050] WhatsApp Response Loop - 55 Notifications from Simple Message [CRITICAL]
- **Proposed by:** Simon (via screenshot)
- **Date:** 2026-01-27
- **Category:** tools
- **Target file:** WhatsApp channel handler (response throttling/deduplication)
- **Verified:** YES - 55 notification badge visible in screenshot
- **Evidence:** Screenshot shows "Liam" chat header with 55 notification badge after Simon sent "11"
- **Description:** Liam is responding excessively to simple messages. 55 notifications from a single "11" message indicates response loop or spam. User reports "Discord Liam is cray" suggesting similar behavior across channels. This is a CRITICAL bug affecting usability.
- **Investigation needed:**
  - Check WhatsApp session logs for response loop pattern
  - Check Discord session for similar behavior
  - Verify response throttling/deduplication logic
  - Check if heartbeat is triggering duplicate responses
- **Status:** CRITICAL - INVESTIGATING

## Paused

### [2026-01-28-043] GLM-4.7-Flash vs Kimi K2.5 Model Comparison [TESTED]
- **Date:** 2026-01-28
- **Description:** Compare models for Discord Liam.
- **Testing Results (2026-01-28):**
  - Kimi K2.5 Cloud successfully integrated and tested on Discord
  - **Pros:** Advanced reasoning with visible "thinking", 256K context, multimodal (vision)
  - **Cons:** Has baked-in "Your name is Kimi" identity that conflicts with SOUL.md
  - Model correctly applies file precedence (SOUL.md > system prompt) but wastes tokens resolving conflict
  - Free Ollama Cloud tier has undocumented rate limits
- **Current config:** Discord uses `ollama/kimi-k2.5:cloud` with GLM fallbacks
- **Recommendation:** Monitor for rate limit issues; consider switching to local GLM-4.7-Flash if identity conflict is problematic
- **Status:** TESTED - monitoring

### [2026-01-25-019] Digital Download Business Research
- **Date:** 2026-01-25
- **Description:** Research digital download business ideas as secondary income. Full analysis delivered with 7+ ideas.
- **Status:** PAUSED per Simon

### [2026-01-25-018] Edison Learning Operations Job
- **Date:** 2026-01-25
- **Description:** Track Edison Learning Operations Senior Specialist opportunity (interviewed 2026-01-23).
- **Status:** PAUSED per Simon

## Approved

*(No approved items pending implementation)*

---

*Implemented and rejected items moved to EVOLUTION-QUEUE-ARCHIVE.md*
