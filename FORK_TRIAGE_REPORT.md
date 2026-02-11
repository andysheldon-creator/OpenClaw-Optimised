# Tinker Fork Triage Report

**Generated**: 2026-02-09
**Fork**: globalcaos/clawdbot-moltbot-openclaw (Tinker Fork)
**Upstream**: openclaw/openclaw
**Status**: 0 behind, 90 ahead
**Goal**: Reduce merge friction, isolate upgrades, plan upstream contributions

---

## Executive Summary

The Tinker Fork has 90 commits ahead of upstream across ~420 modified files. Analysis reveals:

- **7 features WORKING** (exec security, token tracker, budget awareness, WhatsApp history, WhatsApp extensions, secrets proxy, jarvis voice CSS)
- **1 feature BROKEN** (Smart Router — orphaned code, never imported)
- **1 feature POSSIBLY REDUNDANT** (LanceDB extension — our extension still exists, but upstream now has native LanceDB support, and we switched to Gemini/SQLite)
- **1 feature ORPHANED** (Provider Usage Panel webchat sidebar — file exists but not imported; replaced by budget-panel extension + Tampermonkey widget)
- **Multiple UI customizations LOST** — components.css, markdown.ts, tool-cards.ts, chat controllers all show **zero diff from upstream**, meaning previous merge operations (`accept theirs`) overwrote our UI changes

The biggest merge pain comes from files shared with upstream. The strategy should be:

1. **Extract fork logic into separate files** that are imported by minimal patches to upstream files
2. **Create an install/patch script** that applies fork modifications after each upstream merge
3. **PR universal improvements** to eliminate them from the fork entirely
4. **Drop dead code** (Smart Router, LanceDB)

---

## CRITICAL FINDING: Lost UI Changes

During previous upstream merges (commits e5ecd4110 and 73b388dd2 used `accept theirs for all conflicts`), several fork UI customizations were **silently overwritten**:

| File                            | Expected fork changes                                                         | Current diff vs upstream                   |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| `ui/src/styles/components.css`  | ~300 lines of custom styling (usage panel, jarvis-voice, exec badges, tables) | **0 lines** — identical to upstream        |
| `ui/src/ui/markdown.ts`         | exec display parsing, jarvis-voice span, img tags                             | **0 lines** — identical to upstream        |
| `ui/src/ui/chat/tool-cards.ts`  | Security-classified tool display with color badges                            | **0 lines** — identical to upstream        |
| `ui/src/ui/controllers/chat.ts` | Exec security level pass-through, resetSession                                | **0 lines** — identical to upstream        |
| `ui/src/ui/app-render.ts`       | Usage panel, thinking indicator, budget badge                                 | **1 line** — only runId parameter survives |

**This means the minimal webchat design, security-classified tool cards, provider usage sidebar, and most UI customizations are GONE from the current build.**

### QUESTIONS — Lost UI Changes

> **Q1**: Do you want to restore ALL the lost UI customizations, or is this an opportunity to start fresh with a cleaner approach?
>
> Options:
>
> - (a) Restore everything from the original commits (git cherry-pick the UI changes back)
> - (b) Start fresh — redesign the UI customizations as a single cohesive CSS overlay + minimal patches
> - (c) Only restore specific features (list which ones matter most)
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q2**: The "accept theirs for all conflicts" merge strategy is what caused this loss. Going forward, should we:
>
> - (a) Always resolve conflicts manually (slower but safe)
> - (b) Use a patch-based system where fork changes live in separate files and get applied post-merge
> - (c) Accept that UI changes will break on merge and maintain a restoration script
>
> **YOUR ANSWER**: ******\_\_\_******

---

## CATEGORY 1: DEAD CODE (remove immediately)

### 1A. Smart Router (BROKEN — orphaned)

**Files**: `src/agents/smart-router.ts` (181 lines), `src/agents/model-experience.ts` (204 lines)
**Status**: Code exists but is **never imported** by anything. Zero references in the codebase.
**History**: Was part of the "Smart Router V2" effort (commits c67f49e49, 2a578cc20, bc896b595, etc. — 10 commits total)
**What happened**: Upstream likely refactored the routing mechanism, making our integration points disappear.

**Recommendation**: Delete both files. The 10 commits are wasted fork surface.

### 1B. LanceDB Memory (POSSIBLY REDUNDANT)

**Our extension**: `extensions/memory-lancedb/` — 5 files (index.ts, config.ts, test, package.json, plugin manifest) — STILL EXISTS
**Upstream native**: `src/memory/storage/lancedb-store.ts`, `compare-stores.ts`, `test-lancedb.ts` — upstream now has its own LanceDB storage backend
**npm dependency**: `@lancedb/lancedb@^0.23.0` in package.json — used by both our extension AND upstream's native implementation
**Related commits**: 3904df329, a300246ae, c63c926e7, c498794a2
**Current state**: We switched to Gemini-based memorySearch today (SQLite + sqlite-vec), so neither LanceDB backend is actively being used for embeddings.

**Recommendation**: Our custom extension MAY be redundant now that upstream has native LanceDB support. Need to compare what our extension does vs upstream's `lancedb-store.ts`.

### 1C. Version Bump Artifacts (noise)

**Commits**: 06a0be577, 78c85f5ad, 5c52be967
**Status**: Version bumps and forced push artifacts from early development. No functional purpose.

**Recommendation**: These will naturally disappear if we ever rebase, otherwise ignore.

### QUESTIONS — Dead Code

> **Q3**: The Smart Router V2 concept (intelligent model selection based on task complexity) — is this worth reviving as a standalone plugin, or was it fully replaced by the upstream fallback chain you configured?
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q4**: Our `extensions/memory-lancedb/` still exists AND upstream now has native LanceDB support in `src/memory/storage/lancedb-store.ts`. Since we switched to Gemini memorySearch (SQLite-based), neither LanceDB backend is active. Should we:
>
> - (a) Remove our extension entirely (upstream's native support is sufficient if we ever switch back)
> - (b) Keep our extension (it may have features upstream doesn't, like hybrid search config)
> - (c) Remove BOTH and stick with Gemini/SQLite memorySearch permanently
>
> **YOUR ANSWER**: ******\_\_\_******

---

## CATEGORY 2: WORKING FEATURES — Skill-Backing Code

These features back the 8 ClawHub skills and must be preserved. The question is HOW to isolate them from upstream.

### 2A. Shell Security Ultimate — Exec Security System

**ClawHub skill**: shell-security-ultimate (teaches agent command risk classification)
**Status**: WORKING
**Core files modified**:

| File                                           | Fork additions                               | Isolation                                            |
| ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `src/infra/exec-security-level.ts`             | **326 lines (NEW file)**                     | Fully isolated                                       |
| `src/agents/bash-tools.exec.ts`                | +21 lines (import + type + validation block) | Cleanly separable — 14-line block at execution point |
| `src/auto-reply/reply/dispatch-from-config.ts` | +57 lines (trigger prefix helpers)           | 2 helper functions at top of file                    |
| `src/auto-reply/reply/get-reply-run.ts`        | +7 lines (type extension + prompt string)    | Minimal                                              |

**UI files** (LOST in merge):

| File                           | Was                                  | Now                          |
| ------------------------------ | ------------------------------------ | ---------------------------- |
| `ui/src/ui/app-render.ts`      | Security level dropdown, usage panel | Only `runId` line survives   |
| `ui/src/ui/markdown.ts`        | Exec display badge parsing           | Gone — identical to upstream |
| `ui/src/ui/chat/tool-cards.ts` | Color-coded security badges          | Gone — identical to upstream |
| `ui/src/styles/components.css` | Badge styling, colors                | Gone — identical to upstream |

**Isolation strategy**:

- `exec-security-level.ts` is already a separate file (good)
- The 21 lines in `bash-tools.exec.ts` could be wrapped in a conditional: `if (execSecurityEnabled) { ... }`
- The UI parts need to be re-applied after merge OR converted to a CSS overlay + small patch

**Merge conflict risk**: MEDIUM — bash-tools.exec.ts changes fairly often upstream

### QUESTIONS — Exec Security

> **Q5**: The exec security UI (dropdown, color-coded badges) was lost in the merge. The BACKEND enforcement still works (commands are still classified and blocked). Do you want to:
>
> - (a) Restore the full UI (dropdown + badges + colors) — requires re-patching 4 UI files
> - (b) Keep backend-only enforcement (the skill still teaches agents, `cmd_display.py` still works) and skip the UI
> - (c) Build a simpler UI that's easier to maintain (e.g., just a CSS file + 1 small patch to tool-cards.ts)
>
> **YOUR ANSWER**: ******\_\_\_******

---

### 2B. Token Panel Ultimate — Budget/Usage Tracking

**ClawHub skill**: token-control-panel-ultimate
**Status**: Backend WORKING. Webchat sidebar UI orphaned (not imported). Working UI = budget-panel extension (`/budget`) + Tampermonkey widget (v3.0).
**Core files modified**:

| File                                               | Fork additions                        | Isolation                      |
| -------------------------------------------------- | ------------------------------------- | ------------------------------ |
| `src/infra/token-usage-tracker.ts`                 | **738 lines (NEW file)**              | Fully isolated                 |
| `src/infra/provider-usage.cache.ts`                | **57 lines (NEW file)**               | Fully isolated                 |
| `src/infra/provider-usage.fetch.claude-browser.ts` | **122 lines (NEW file)**              | Fully isolated                 |
| `src/agents/system-prompt.ts`                      | +27 lines (budget awareness section)  | Clean block at end of function |
| `src/gateway/server-methods/usage.ts`              | +37 lines (imports + init + endpoint) | Start/end of file              |

**Plugin files** (conflict-free):

- `extensions/budget-panel/` — ALREADY a plugin, registers HTTP dashboard at `/budget`
- `extensions/manus/` — ALREADY a plugin, tracks Manus credits

**UI files** (webchat sidebar — ORPHANED, replaced by extension + Tampermonkey widget):

| File                                      | Status                                    | Notes                                |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------ |
| `ui/src/ui/controllers/provider-usage.ts` | **493 lines, NOT IMPORTED by anything**   | Orphaned — no file references it     |
| `ui/src/ui/types.ts`                      | Types exist (ProviderUsageSnapshot, etc.) | Used by orphaned controller only     |
| `ui/src/ui/app-render.ts`                 | No usage panel wiring                     | Only `runId` line survives from fork |
| `ui/src/styles/components.css`            | No usage bar styling                      | Identical to upstream                |

**Working alternative**: `extensions/budget-panel/` (HTTP dashboard at `/budget`) + Tampermonkey widget (v3.0, browser overlay)

**Isolation strategy**:

- NEW files (tracker, cache, browser-fetch) are already isolated — zero conflict risk
- The 27 lines in system-prompt.ts could be extracted to `src/agents/budget-prompt-section.ts` and imported conditionally
- The 37 lines in usage.ts could use a plugin hook instead of direct modification
- Budget-panel and manus extensions are already perfect plugins

**Merge conflict risk**: MEDIUM — system-prompt.ts and usage.ts change occasionally

### QUESTIONS — Token Panel

> **Q6**: The webchat sidebar panel (`provider-usage.ts`, 493 lines) exists but is NOT imported by anything — it's orphaned dead code. Your working solution is the budget-panel extension + Tampermonkey widget. Should we:
>
> - (a) Delete the orphaned `provider-usage.ts` — the extension + widget is the real solution
> - (b) Keep it as code reference in case we want to reconnect the sidebar later
> - (c) Reconnect it to app-render.ts to have BOTH sidebar + external widget
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q7**: The budget self-awareness injection into system-prompt.ts adds context like "Status: healthy (45% of budget used)". This helps the agent self-regulate. Should we:
>
> - (a) Keep it in system-prompt.ts (small patch, worth maintaining)
> - (b) Move it to a hook that appends to the system prompt (if upstream supports this)
> - (c) Drop it — the agent doesn't need to know its budget
>
> **YOUR ANSWER**: ******\_\_\_******

---

### 2C. WhatsApp Ultimate — Channel Enhancements

**ClawHub skill**: whatsapp-ultimate (196 downloads, 1 star — your most popular skill)
**Status**: WORKING
**Core files modified**:

| File                                         | Fork additions                   | Isolation                       |
| -------------------------------------------- | -------------------------------- | ------------------------------- |
| `src/whatsapp-history/db.ts`                 | **334 lines (NEW)**              | Fully isolated                  |
| `src/whatsapp-history/live-capture.ts`       | **253 lines (NEW)**              | Fully isolated                  |
| `src/whatsapp-history/import-export.ts`      | **268 lines (NEW)**              | Fully isolated                  |
| `src/whatsapp-history/migrate-json-store.ts` | **180 lines (NEW)**              | Fully isolated                  |
| `src/whatsapp-history/index.ts`              | **8 lines (NEW)**                | Fully isolated                  |
| `src/agents/tools/whatsapp-history-tool.ts`  | **152 lines (NEW)**              | Fully isolated                  |
| `src/agents/openclaw-tools.ts`               | +2 lines (import + register)     | Tiny patch                      |
| `src/web/session.ts`                         | +4 lines (live capture hook)     | Tiny patch                      |
| `extensions/whatsapp/src/channel.ts`         | **+391 lines** (action handlers) | DEEPLY interleaved              |
| `src/web/auto-reply/monitor.ts`              | +53 lines (senderE164)           | Middle of file                  |
| `src/web/login-qr.ts`                        | +80 lines (515 error handling)   | Additions to existing functions |
| `src/web/inbound/access-control.ts`          | +39 lines (sender attribution)   | Middle of file                  |
| `src/agents/tools/message-tool.ts`           | +14 lines (participants schema)  | Middle of file                  |

**Merge conflict risk**: VERY HIGH — `extensions/whatsapp/src/channel.ts` (+391 lines in handleAction) and `src/web/` files are actively developed upstream

**Isolation strategy**:

- `src/whatsapp-history/` is already a self-contained module — could become `extensions/whatsapp-history/` plugin
- The 391 lines in channel.ts are the hardest problem. Each action handler is self-contained but they're all in one switch statement. Could be extracted to an action registry pattern.
- Bug fixes (515, senderE164) should be PRed upstream to eliminate them from fork

**Plugin potential for whatsapp-history**:

```
extensions/whatsapp-history/
├── openclaw.plugin.json
├── index.ts              # registers tool + event listeners
├── db.ts                 # SQLite + FTS5
├── live-capture.ts       # event listener for incoming messages
├── import-export.ts      # WhatsApp export importer
└── migrate-json-store.ts # migration from JSON store
```

This would require the WhatsApp channel plugin to emit events that our history plugin can listen to.

### QUESTIONS — WhatsApp

> **Q8**: The 515 error fix and senderE164 attribution fix are universal bug fixes. Should we submit them as PRs to upstream? If accepted, that removes 2 commits (7 files) from our fork maintenance.
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q9**: The WhatsApp history module is currently in `src/whatsapp-history/` (core code). Would you like to refactor it into `extensions/whatsapp-history/` (plugin)? This would:
>
> - Eliminate merge conflicts (plugins live in their own directory)
> - Require ~2 hours of work to convert
> - Need to verify that the WhatsApp channel emits the right events for live capture
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q10**: The channel.ts modifications (+391 lines of action handlers) are the single biggest merge risk. These add: group-create, edit, unsend, reply, sticker, renameGroup, setGroupIcon, setGroupDescription, addParticipant, removeParticipant, etc. Options:
>
> - (a) Keep as-is and accept merge conflicts every sync
> - (b) PR the action handlers upstream (they benefit all WhatsApp users)
> - (c) Extract action handlers into a separate `whatsapp-actions.ts` file that the channel imports
> - (d) Some combination (PR the universal ones, keep personal ones in separate file)
>
> **YOUR ANSWER**: ******\_\_\_******

---

### 2D. Jarvis Voice

**ClawHub skill**: jarvis-voice (114 downloads)
**Status**: PARTIALLY WORKING — CSS was lost in merge, but the skill's TTS functionality doesn't depend on CSS
**Code**: 1 commit, 2 files, 10 lines

- `ui/src/styles/components.css` — `.jarvis-voice` class (purple #9B59B6, italic) — **LOST**
- `ui/src/ui/markdown.ts` — `span` in allowed tags — **LOST**

**Isolation strategy**: This is trivially fixable. The CSS could go in a `fork-overrides.css` file that's loaded after upstream CSS.

### QUESTIONS — Jarvis Voice

> **Q11**: The jarvis-voice CSS is 10 lines. Should it be part of a broader "fork UI overrides" CSS file, or restored individually?
>
> **YOUR ANSWER**: ******\_\_\_******

---

### 2E. Agent Memory Ultimate

**ClawHub skill**: agent-memory-ultimate (10 downloads)
**Status**: Skill works fine — it's a pure teaching document about MEMORY.md, daily logs, and consolidation. The backing code lives in `extensions/memory-lancedb/` (our extension) but upstream also now has `src/memory/storage/lancedb-store.ts`. We currently use Gemini-based memorySearch (SQLite + sqlite-vec), so neither LanceDB backend is active.
**Action**: Skill is self-sufficient (teaches file organization, not backend). Extension fate depends on Q4 answer above.

### 2F. ChatGPT Exporter / YouTube / Agent Boundaries

**Status**: Pure skills, no fork code dependencies.
**Action**: None needed.

---

## CATEGORY 3: UNIVERSAL IMPROVEMENTS (PR upstream)

These changes benefit everyone and aren't tied to any skill. Once merged upstream, we can drop them from the fork.

### 3A. Security Fixes (5 commits, all clean)

| #   | Commit    | Title                                        | Files | Lines | Conflict Risk |
| --- | --------- | -------------------------------------------- | ----- | ----- | ------------- |
| 1   | a9aa7748d | Harden zip extraction against path traversal | 2     | +17   | Trivial       |
| 2   | 45e7832fd | Host header validation vs DNS rebinding      | 1     | +29   | Trivial       |
| 3   | d632d35f4 | Rate limit gateway authentication            | 7     | +155  | Low           |
| 4   | dd7324964 | WebSocket media stream authentication        | 3     | +54   | Low           |
| 5   | 15f36e77a | Secrets injection proxy for secure mode      | 11    | +545  | Low (new dir) |

**These are the easiest PRs to submit.** Security fixes get prioritized by maintainers.

### 3B. Bug Fixes (4 commits)

| #   | Commit                | Title                                  | Files | Lines | Conflict Risk |
| --- | --------------------- | -------------------------------------- | ----- | ----- | ------------- |
| 6   | 1c7f56078             | WhatsApp 515 stream error auto-restart | 2     | +113  | Low           |
| 7   | 54b732b1c             | WhatsApp senderE164 DM attribution     | 5     | +105  | Medium        |
| 8   | d5a51b091             | Always stream tool events to webchat   | 1     | +6    | Trivial       |
| 9   | ceb8c9a8b + 08f0627e0 | Anthropic rate limit failover patterns | 2     | +28   | Low           |

### 3C. Small Enhancements (2 commits)

| #   | Commit    | Title                                    | Files | Lines | Conflict Risk |
| --- | --------- | ---------------------------------------- | ----- | ----- | ------------- |
| 10  | 14f58f508 | Allow img tags and data URIs in markdown | 1     | +3    | Trivial       |
| 11  | 363ef4c30 | Responsive message width + table styling | 4     | +49   | Low           |

### 3D. Existing Open PRs (4 — need follow-up)

| PR    | Title                                        | Status |
| ----- | -------------------------------------------- | ------ |
| #6753 | Session key canonicalization for /new button | OPEN   |
| #6747 | SVG callout icon sizing                      | OPEN   |
| #6735 | Model 404 failover classification            | OPEN   |
| #6500 | Chrome extension auto-reattach debugger      | OPEN   |

### QUESTIONS — Upstream PRs

> **Q12**: Submitting 11 new PRs will take time (cherry-pick to clean branch, write description, submit). Should we:
>
> - (a) Do them all at once in a batch (1-2 hours, maximum impact)
> - (b) Start with the trivial security fixes (items 1-2, takes 10 minutes) and do the rest gradually
> - (c) Skip PRing for now and focus on isolation/install script first
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q13**: Some of these fixes (515 error, senderE164) also back the WhatsApp Ultimate skill. If upstream merges them, the skill still works but we lose "exclusive" functionality. Is that acceptable?
>
> **YOUR ANSWER**: ******\_\_\_******

---

## CATEGORY 4: NEW SESSION BUTTON FIX

**Commits**: 5 (partially PRed)

- `63f17a049` → PR #6753 OPEN (canonicalize session key)
- `01e87b2a3` → via PR #6747 (chatRunId / stuck thinking indicator)
- `c20864a76` → via PR #6747 (SVG callout sizing)
- `19a53b759` — /new button reset (resetSession method) — NOT PRed yet
- `7d5cccf16` — session reset prompt with file reading instructions — fork-specific (references SOUL.md/USER.md)

**Status**: The canonicalization fix (PR #6753) is the essential one. The reset prompt (7d5cccf16) is fork-specific because it tells the agent to read our workspace files.

### QUESTIONS — New Session

> **Q14**: The reset prompt in `get-reply-run.ts` says "Read SOUL.md, USER.md, and today's memory log before greeting." This is specific to our workspace layout. Should we:
>
> - (a) Keep it as fork-specific (it's 1 line in 1 file)
> - (b) Make it configurable (read from HEARTBEAT.md or a config key)
> - (c) Move this instruction into the workspace's AGENTS.md instead of hardcoding it
>
> **YOUR ANSWER**: ******\_\_\_******

---

## CATEGORY 5: FORK IDENTITY (permanent, accept cost)

These commits define the Tinker Fork and shouldn't be upstreamed:

| Commit    | What                        | Conflict Risk |
| --------- | --------------------------- | ------------- |
| 37270f488 | Tinker Fork rebranding      | NONE          |
| 411f502e6 | Fork docs + setup guide     | NONE          |
| e61b59c5c | Fork-sync skill docs        | NONE          |
| 92e85b343 | CI: disable Docker builds   | LOW           |
| f10e81de2 | Docker: add jq, ffmpeg      | LOW           |
| 2c7914523 | Browser cookies action      | LOW           |
| 6155234a3 | Browser service eager start | LOW           |
| 39bcc52f2 | Zero-latency hot-reload     | LOW           |

**Total**: ~8 commits, all low or no conflict risk. These are fine to maintain.

---

## PROPOSED ISOLATION ARCHITECTURE

### The Patch-and-Overlay System

Instead of modifying upstream files directly, create a `fork/` directory with:

```
fork/
├── patches/                    # Minimal patches to upstream files
│   ├── bash-tools.exec.patch   # 21 lines: import + security check
│   ├── system-prompt.patch     # 27 lines: budget awareness block
│   ├── usage.patch             # 37 lines: tracker init + endpoint
│   ├── openclaw-tools.patch    # 2 lines: register whatsapp-history tool
│   ├── session.patch           # 4 lines: live capture hook
│   └── get-reply-run.patch     # 7 lines: reset prompt
│
├── css/                        # UI style overrides (loaded after upstream CSS)
│   └── tinker-overrides.css    # jarvis-voice, exec badges, usage panel, tables
│
├── modules/                    # Self-contained fork modules
│   ├── exec-security-level.ts  # Command classifier (326 lines)
│   ├── token-usage-tracker.ts  # Budget tracking (738 lines)
│   ├── provider-usage.cache.ts # Cache layer (57 lines)
│   └── trigger-prefix.ts       # Trigger prefix helpers (57 lines)
│
└── install.sh                  # Post-merge script
    # 1. Copies fork/modules/ to src/infra/ and src/auto-reply/
    # 2. Applies patches from fork/patches/
    # 3. Appends fork/css/ to UI build
    # 4. Runs pnpm install && pnpm build
```

**After each upstream merge**:

1. `git merge upstream/main` — may have conflicts in patched files
2. `bash fork/install.sh` — re-applies patches if needed
3. Patches that fail = upstream changed the file, review manually

### QUESTIONS — Isolation Architecture

> **Q15**: The patch-and-overlay system above would fundamentally change how the fork works. Instead of direct commits to upstream files, changes live in `fork/patches/` and get applied via script. This means:
>
> - **Pro**: Upstream merges become `git merge upstream/main && bash fork/install.sh`
> - **Pro**: Clear separation of "ours" vs "theirs"
> - **Pro**: Patches that fail tell you exactly what upstream changed
> - **Con**: More complex development workflow (edit patch files, not source directly)
> - **Con**: Initial migration effort to move existing changes into patch format
>
> Do you want to pursue this approach?
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q16**: An alternative to patches is using **git hooks** — a post-merge hook that automatically applies fork modifications. This would be transparent but less explicit. Preference?
>
> - (a) Explicit patch files in fork/ directory (version controlled, visible)
> - (b) Post-merge git hook (automatic, invisible)
> - (c) Neither — just keep modifying upstream files and accept merge conflicts
>
> **YOUR ANSWER**: ******\_\_\_******

> **Q17**: The extensions/ plugins (budget-panel, manus) are already perfectly isolated. Should we invest time converting more features to plugins?
>
> Priority candidates for plugin conversion:
>
> - WhatsApp history (src/whatsapp-history/ → extensions/whatsapp-history/) — Medium effort
> - Token usage tracker (src/infra/token-usage-tracker.ts → extensions/usage-tracker/) — Low effort
> - Exec security (src/infra/exec-security-level.ts → extensions/exec-security/) — Medium effort
>
> **YOUR ANSWER**: ******\_\_\_******

---

## SUMMARY TABLE: All 90 Commits Categorized

| Category                               | Commits | Status                                                      | Action                                             |
| -------------------------------------- | ------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Dead code (Smart Router, artifacts)    | ~8      | BROKEN                                                      | Delete                                             |
| Possibly redundant (LanceDB extension) | 4       | REDUNDANT?                                                  | Compare ours vs upstream native LanceDB            |
| Skill-backing: Shell Security Ultimate | 3       | Backend WORKING, UI LOST                                    | Restore UI or go backend-only                      |
| Skill-backing: Token Panel Ultimate    | 12+     | Backend WORKING, sidebar ORPHANED, extension+widget WORKING | Delete orphaned sidebar or reconnect               |
| Skill-backing: WhatsApp Ultimate       | 6       | WORKING                                                     | PR bug fixes, keep features                        |
| Skill-backing: Jarvis Voice            | 1       | CSS LOST                                                    | Restore 10 lines                                   |
| Skill-backing: Agent Memory Ultimate   | 4       | POSSIBLY REDUNDANT                                          | Compare our extension vs upstream's native LanceDB |
| Skill-backing: Pure skills (3 skills)  | 0       | N/A                                                         | No fork code                                       |
| Universal improvements (PR upstream)   | 11      | WORKING                                                     | Submit PRs                                         |
| New Session button fix                 | 5       | PARTIALLY PREED                                             | Follow up on PRs                                   |
| Fork identity (branding, CI, docs)     | 8       | Fine                                                        | Keep                                               |
| Merge commits                          | 6       | Structural                                                  | Ignore                                             |
| Open PRs upstream                      | 4       | OPEN                                                        | Follow up                                          |

---

## NEXT STEPS (proposed priority order)

1. **Immediate**: Delete dead code (Smart Router files, version bump artifacts). Evaluate LanceDB extension vs upstream native.
2. **This session**: Answer the 17 questions above to define strategy
3. **Short-term**: Submit the 5 trivial security PRs (items 1-5 from Category 3)
4. **Short-term**: Decide on UI restoration vs. fresh approach
5. **Medium-term**: Implement isolation strategy (patches, plugins, or accept conflicts)
6. **Medium-term**: Submit remaining PRs (bug fixes, enhancements)
7. **Long-term**: Convert whatsapp-history and token-tracker to plugins

---

_This document is designed to be edited. Answer the questions inline, delete sections that aren't relevant, and add your own notes. Save and we'll implement based on your answers._
