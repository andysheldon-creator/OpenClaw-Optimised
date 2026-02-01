import { GraphService } from "./GraphService.js";
import { getRelativeTimeDescription } from "../../utils/time-format.js";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import path from "node:path";
import { buildStoryPrompt, type StoryPromptOptions } from "./story-prompt-builder.js";

export class ConsolidationService {
  private graph: GraphService;
  private debug: boolean;

  constructor(graph: GraphService, debug: boolean = false) {
    this.graph = graph;
    this.debug = debug;
  }

  private log(message: string) {
    if (this.debug) {
      process.stderr.write(`${message}\n`);
    }
  }

  private isHeartbeatMessage(text: string): boolean {
    const isPrompt = text.includes("Read HEARTBEAT.md") && text.includes("HEARTBEAT_OK");
    const isResponse = text.trim() === "HEARTBEAT_OK";
    return isPrompt || isResponse;
  }

  // REMOVED: consolidateMessages() - Graphiti automatically extracts entities and relationships from episodes.
  // No need for manual triplet extraction.

  /**
   * Bootstrap historical episodes into Graphiti if the graph is empty.
   * This should be called BEFORE flashback retrieval to ensure historical context is available.
   */
  async bootstrapHistoricalEpisodes(
    sessionId: string,
    memoryDir: string,
    sessionMessages: any[] = [],
  ): Promise<void> {
    try {
      // Check if bootstrap has already been done using a flag file
      const bootstrapFlagPath = path.join(memoryDir, ".graphiti-bootstrap-done");

      try {
        await fs.access(bootstrapFlagPath);
        return;
      } catch {}

      this.log(`📥 [MIND] No bootstrap flag found. Ingesting memory history into Graphiti...`);

      // 1. Ingest Historical MD Files
      const files = await fs.readdir(memoryDir);
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

      for (const file of mdFiles) {
        const filePath = path.join(memoryDir, file);
        const content = await fs.readFile(filePath, "utf-8");

        let episodeTimestamp: string | undefined;
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const d = new Date(dateMatch[1]);
          if (!isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            episodeTimestamp = d.toISOString();
          }
        }

        const dateString = episodeTimestamp || file.substring(0, 10);
        await this.graph.addEpisode(
          "global-user-memory", // FORCE GLOBAL ID for historical files
          `FECHA: ${dateString} | system: Historical memory from ${file}\n\n${content}`,
          episodeTimestamp,
          { source: "historical-file" },
        );
      }

      // 2. Ingest Active Session Messages as a SINGLE Transcript Episode (Optimization)
      if (sessionMessages.length > 0) {
        this.log(
          `📥 [MIND] Ingesting ${sessionMessages.length} previous turns as a single transcript batch...`,
        );

        const transcriptLines: string[] = [];
        let earliestDate = new Date();

        for (const m of sessionMessages) {
          const role = m.role || "unknown";
          let text = m.text || m.content || "";
          if (Array.isArray(text)) {
            text = text.map((p: any) => (typeof p === "string" ? p : p.text || "")).join(" ");
          }
          if (!text) continue;

          const ts = m.timestamp || m.created_at;
          const date = ts ? new Date(ts) : new Date();
          if (date < earliestDate) earliestDate = date;

          const timeStr = date.toISOString().split("T")[1].substring(0, 5);

          if (this.isHeartbeatMessage(text)) continue;

          transcriptLines.push(`[${timeStr}] ${role}: ${text}`);
        }

        if (transcriptLines.length > 0) {
          const earliestIso = earliestDate.toISOString();
          const transcriptBody = `FECHA: ${earliestIso} | [TRANSCRIPCIÓN DE SESIÓN]\n${transcriptLines.join("\n")}`;

          await this.graph.addEpisode("global-user-memory", transcriptBody, earliestIso, {
            source: "message",
          });
        }
      }

      await fs.writeFile(bootstrapFlagPath, new Date().toISOString());
      this.log(`🏁 [MIND] Bootstrap complete. Episodes queued for Graphiti.`);
    } catch (e: any) {
      process.stderr.write(`⚠️ [MIND] Historical bootstrap failed: ${e.message}\n`);
    }
  }

  /**
   * Updates the lifelong narrative story by merging old messages into the existing story.
   * This implements the "Story" concept from the Mind architecture.
   */
  async updateNarrativeStory(
    sessionId: string,
    oldMessages: any[] | string,
    currentStory: string,
    storyPath: string,
    agent: any,
    identityContext?: string,
    anchorTimestamp?: number,
  ): Promise<string> {
    if (typeof oldMessages !== "string" && oldMessages.length === 0) return currentStory;

    this.log(`📖 [MIND] Updating Narrative Story for ${sessionId}...`);

    const transcript = Array.isArray(oldMessages)
      ? oldMessages
          .map((m: any) => {
            const timestamp = m.timestamp ?? m.created_at ?? Date.now();
            const date = new Date(timestamp);
            // Handle Graphiti raw episode format { body: "..." } or Message { text/content }
            let text = m.body || m.text || m.content || m.episode_body || "";
            if (Array.isArray(text)) {
              text = text
                .map((c: any) => (typeof c === "string" ? c : (c.text ?? c.content ?? "")))
                .join(" ");
            }
            if (this.isHeartbeatMessage(text)) return null;

            return `[${date.toISOString()}] ${m.role || "unknown"}: ${text}`;
          })
          .filter((line): line is string => line !== null)
          .join("\n")
      : oldMessages; // Assume it is already a formatted transcript string

    // Decide strategy based on whether we have existing story
    const isBootstrap = !currentStory || currentStory.trim().length === 0;

    const prompt = buildStoryPrompt({
      identityContext: identityContext || "You are a helpful and soulful AI assistant.",
      transcript,
      currentStory: currentStory || "",
      isBootstrap,
    });

    // DEBUG: Log the COMPLETE prompt being sent to LLM - REMOVED PER USER REQUEST

    try {
      const response = await agent.complete(prompt);
      const rawStory = response?.text || "";

      // DEBUG: Log first 300 chars - REMOVED PER USER REQUEST

      // Use the complete generated story directly
      let newStory = rawStory;

      // COMPRESSION: If story exceeds 4000 words, compress it
      const MAX_STORY_WORDS = 4000;
      const wordCount = newStory.split(/\s+/).length;

      if (wordCount > MAX_STORY_WORDS) {
        this.log(
          `📦 [MIND] Story too long (${wordCount} words). Compressing to ${MAX_STORY_WORDS} words...`,
        );

        const compressionPrompt = `You are a narrative editor. You have a first-person autobiography that has grown too long.
Your task is to compress it to under ${MAX_STORY_WORDS} words while preserving the most transcendental moments.

### CURRENT STORY (${wordCount} words):
${newStory}

### YOUR INSTRUCTIONS:
1. Keep the VOICE and STYLE intact (first person, reflective, personal).
2. Preserve all chapter headers with dates and times.
3. Condense each chapter: keep only the most meaningful reflections and key events.
4. Remove redundant details, but maintain the emotional arc of the relationship.
5. Ensure the compressed story flows naturally and reads as a cohesive autobiography.
6. Target length: under ${MAX_STORY_WORDS} words.

### COMPRESSED STORY:
(Provide the compressed autobiography)`;

        const compressionResponse = await agent.complete(compressionPrompt);
        const compressedStory = compressionResponse?.text || newStory;
        const compressedWordCount = compressedStory.split(/\s+/).length;

        this.log(
          `✅ [MIND] Compressed to ${compressedWordCount} words (saved ${wordCount - compressedWordCount} words)`,
        );

        newStory = compressedStory;
      }

      if (newStory && newStory !== currentStory) {
        // Find the latest timestamp in the processed messages to anchor the file
        let maxTimestamp = anchorTimestamp || 0;
        if (Array.isArray(oldMessages)) {
          for (const m of oldMessages) {
            const t = new Date(m.timestamp ?? m.created_at ?? 0).getTime();
            if (t > maxTimestamp) maxTimestamp = t;
          }
        }

        // If we found a valid timestamp, add the metadata header
        let contentToWrite = newStory;
        if (maxTimestamp > 0) {
          const iso = new Date(maxTimestamp).toISOString();
          // Remove any existing header to avoid accumulation
          contentToWrite = newStory.replace(/<!-- LAST_PROCESSED:.*?-->\n*/g, "");
          contentToWrite = `<!-- LAST_PROCESSED: ${iso} -->\n\n${contentToWrite.trim()}`;
        }

        const tmpPath = `${storyPath}.tmp`;
        await fs.writeFile(tmpPath, contentToWrite, "utf-8");
        await fs.rename(tmpPath, storyPath);
        this.log(
          `📖 [MIND] Narrative Story updated locally at ${storyPath} (${newStory.length} chars)`,
        );
        return newStory;
      }
    } catch (error: any) {
      process.stderr.write(`❌ [MIND] Story update error: ${error.message}\n`);
    }

    return currentStory;
  }

  /**
   * Gets the current pending consolidation status from local file.
   */
  private async getPendingStatus(memoryDir: string): Promise<{ messages: number; tokens: number }> {
    const statusPath = path.join(memoryDir, ".pending-consolidation-status");
    try {
      const content = await fs.readFile(statusPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return { messages: 0, tokens: 0 };
    }
  }

  /**
   * Updates the pending consolidation status by adding a new episode.
   */
  async trackPendingEpisode(memoryDir: string, text: string): Promise<void> {
    if (this.isHeartbeatMessage(text)) return;
    const statusPath = path.join(memoryDir, ".pending-consolidation-status");
    const logPath = path.join(memoryDir, "pending-episodes.log");
    const status = await this.getPendingStatus(memoryDir);

    // Append text to the physical "Pending Diary"
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${text}\n---\n`;
    await fs.appendFile(logPath, entry, "utf-8");

    // Estimate tokens for the new content
    const tokens = estimateTokens({ role: "user", content: text, timestamp: 0 });

    status.messages += 1;
    status.tokens += tokens;

    await fs.writeFile(statusPath, JSON.stringify(status, null, 2), "utf-8");
  }

  /**
   * Resets the pending consolidation status.
   */
  async resetPendingStatus(memoryDir: string): Promise<void> {
    const statusPath = path.join(memoryDir, ".pending-consolidation-status");
    const logPath = path.join(memoryDir, "pending-episodes.log");

    await fs.writeFile(statusPath, JSON.stringify({ messages: 0, tokens: 0 }, null, 2), "utf-8");

    try {
      await fs.unlink(logPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Checks for pending episodes that haven't been narrativized and consolidates them if the batch is large enough.
   * This prevents re-writing the story on every single turn.
   */
  async checkAndConsolidate(
    sessionId: string,
    agent: any,
    storyPath: string,
    chatHistory: any[],
    identityContext?: string,
    safeTokenLimit?: number,
    tokenThreshold: number = 5000,
  ): Promise<void> {
    /* Lock removed as per user request (Simplified) */
    try {
      let currentStory = "";
      let lastUpdate = new Date(0);

      // Check for local story file
      let isNewStory = false;
      try {
        const stats = await fs.stat(storyPath);
        currentStory = await fs.readFile(storyPath, "utf-8");

        // Try to parse explicit metadata header
        const match = currentStory.match(/<!-- LAST_PROCESSED: (.*?) -->/);
        if (match && match[1]) {
          const parsedDate = new Date(match[1]);
          if (!isNaN(parsedDate.getTime())) {
            lastUpdate = parsedDate;
            this.log(`📖 [MIND] Synced story from metadata anchor: ${lastUpdate.toISOString()}`);
          } else {
            lastUpdate = stats.mtime;
          }
        } else {
          // Fallback to file mtime if no header
          if (stats.size < 50) {
            lastUpdate = new Date(0);
            isNewStory = true;
          } else {
            lastUpdate = stats.mtime;
          }
        }
      } catch (e) {
        // File doesn't exist, treat as new
        isNewStory = true;
      }

      // Also treat as "new" if the file exists but has no actual story content
      // (only metadata or empty after stripping metadata)
      if (!isNewStory) {
        const contentWithoutMetadata = currentStory.replace(/<!--.*?-->/gs, "").trim();
        if (contentWithoutMetadata.length === 0) {
          this.log(`📖 [MIND] STORY.md exists but is empty. Treating as new story.`);
          isNewStory = true;
        }
      }

      // 1. BOOTSTRAP: If story is new, process legacy memory files first
      if (isNewStory) {
        // We only do this if explicitly enabled or if it's a small history (TBD)
        // For now, let's respect the configuration.
        const memoryDir = path.join(path.dirname(storyPath), "memory");
        const files = await fs.readdir(memoryDir).catch(() => []);
        const mdFiles = files.filter((f) => f.endsWith(".md"));

        if (mdFiles.length === 0) {
          this.log(`📖 [MIND] No historical memory files found. Starting a fresh story.`);
          // Create empty story to stop being "new"
          const iso = new Date().toISOString();
          const emptyStory = `<!-- LAST_PROCESSED: ${iso} -->\n\n(Tu historia comienza ahora...)`;
          await fs.writeFile(storyPath, emptyStory, "utf-8");
          return;
        }

        // Get the config from the agent (if passed via some bridge) or assume disabled by default
        // In the modular architecture, we might need to pass this explicitly.
        // For the moment, let's check a new parameter 'autoBootstrap'
        const autoBootstrap = (agent as any).autoBootstrapHistory === true;

        if (autoBootstrap) {
          currentStory = await this.bootstrapFromLegacyMemory(
            sessionId,
            storyPath,
            agent,
            identityContext,
            safeTokenLimit || 50000,
          );
          this.log(
            `✅ [MIND] Bootstrap complete. Story initialized from ${currentStory.length} chars of historical data.`,
          );
        } else {
          this.log(
            `🧊 [MIND] Cold Start: Skipping historical autobiography generation (${mdFiles.length} files found). 
   To enable this, set 'narrative.autoBootstrapHistory: true' in moltbot.json or run 'moltbot mind-memory setup --bootstrap'.`,
          );
          // Create a "skeleton" story so we don't keep asking/failing
          const iso = new Date(0).toISOString();
          const skeletonStory = `<!-- LAST_PROCESSED: ${iso} -->\n\n(Historia pendiente de inicialización histórica...)`;
          await fs.writeFile(storyPath, skeletonStory, "utf-8");
        }
        return;
      }

      // 2. Use local status instead of Graphiti (which processes asynchronously)
      const memoryDir = path.dirname(storyPath);
      const status = await this.getPendingStatus(memoryDir);

      if (status.tokens === 0 && status.messages === 0) {
        this.log(`⏳ [MIND] No pending episodes since ${lastUpdate.toISOString()}.`);
        return;
      }

      // BATCH STRATEGY: Update if we have accumulated >= threshold tokens
      if (status.tokens >= tokenThreshold) {
        this.log(
          `📖 [MIND] Batch limit reached (${status.messages} messages, ${status.tokens}/${tokenThreshold} tokens). Updating Narrative Story...`,
        );

        // SOURCE OF TRUTH: Read from the physical pending log
        const logPath = path.join(memoryDir, "pending-episodes.log");
        let pendingTranscript = "";
        try {
          pendingTranscript = await fs.readFile(logPath, "utf-8");
        } catch (e: any) {
          process.stderr.write(`⚠️ [MIND] Could not read pending episodes log: ${e.message}\n`);
          // Fallback to graph if log is missing
          const graphEpisodes = await this.graph.getEpisodesSince(sessionId, lastUpdate);
          pendingTranscript = graphEpisodes
            .filter((ep: any) => !this.isHeartbeatMessage(ep.body || ""))
            .map((ep: any) => `[${ep.timestamp}] ${ep.body}`)
            .join("\n---\n");
        }

        if (pendingTranscript.trim()) {
          await this.updateNarrativeStory(
            sessionId,
            pendingTranscript,
            currentStory,
            storyPath,
            agent,
            identityContext,
            lastUpdate.getTime(),
          );

          // Reset status and DELETE log only after SUCCESSFUL consolidation
          await this.resetPendingStatus(memoryDir);
        } else {
          this.log(`⏳ [MIND] Consolidation deferred: Pending log is empty or missing.`);
        }
      } else {
        this.log(
          `⏳ [MIND] Accumulating Narrative... ${status.messages} messages (${status.tokens} / ${tokenThreshold} tokens) pending`,
        );
      }
    } catch (e: any) {
      process.stderr.write(`❌ [MIND] Batch consolidation check failed: ${e.message}\n`);
    }
  }

  /**
   * Processes legacy memory files (YYYY-MM-DD.md) and integrates them into the story.
   * This now concatenates ALL historical files into ONE transcript to avoid iteration issues.
   */
  private async bootstrapFromLegacyMemory(
    sessionId: string,
    storyPath: string,
    agent: any,
    identityContext: string | undefined,
    safeTokenLimit: number,
  ): Promise<string> {
    const memoryDir = path.join(path.dirname(storyPath), "memory");
    let currentStory = "";

    try {
      const files = await fs.readdir(memoryDir);
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

      if (mdFiles.length === 0) return currentStory;

      this.log(`🧊 [MIND] Cold Start: Bootstrapping from ${mdFiles.length} legacy memory files...`);

      let currentBatch = "";
      let batchStartFile = "";

      // Dynamic SAFE LIMIT (default to 50k tokens if not provided)
      this.log(
        `🧊 [MIND] Bootstrap Strategy: Dynamic Chunking (Limit: ~${safeTokenLimit.toLocaleString()} tokens)`,
      );

      // NOTE: Historical episode ingestion now happens EARLIER in run.ts before user message storage.
      // This method only handles narrative story generation from historical files.

      let latestTimestamp: number | undefined;

      for (const file of mdFiles) {
        const filePath = path.join(memoryDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const fragment = `--- HISTORICAL LOG: ${file} ---\n${content}\n\n`;

        // Check if adding this fragment exceeds safe limit estimate
        const fragmentTokens = estimateTokens({ role: "user", content: fragment, timestamp: 0 });
        const currentBatchTokens = estimateTokens({
          role: "user",
          content: currentBatch,
          timestamp: 0,
        });
        this.log(`   📄 [DEBUG] ${file}: ${fragmentTokens}t | Batch: ${currentBatchTokens}t`);

        // If current batch + new fragment > limit, PROCESS NOW
        if (currentBatchTokens + fragmentTokens > safeTokenLimit) {
          this.log(`📦 [MIND] Processing Chunk: ${currentBatchTokens} tokens (limit reached)...`);

          // 1. Process current batch
          currentStory = await this.updateNarrativeStory(
            sessionId,
            currentBatch,
            currentStory, // Evolve!
            storyPath,
            agent,
            identityContext,
            latestTimestamp,
          );

          // 2. Reset batch with this leftover fragment
          currentBatch = fragment;
          batchStartFile = file;
          this.log(`🔄 [MIND] Starting new chunk with ${file}...`);
        } else {
          // Safe to add
          if (currentBatch.length === 0) batchStartFile = file;
          currentBatch += fragment;
        }

        // track latest timestamp for metadata
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const d = new Date(dateMatch[1]);
          if (!isNaN(d.getTime())) {
            latestTimestamp = d.getTime();
          }
        }
      }

      // Process final pending batch
      if (currentBatch.length > 0) {
        this.log(
          `📦 [MIND] Processing Final Chunk: ${estimateTokens({ role: "user", content: currentBatch, timestamp: 0 })} tokens...`,
        );
        currentStory = await this.updateNarrativeStory(
          sessionId,
          currentBatch,
          currentStory,
          storyPath,
          agent,
          identityContext,
          latestTimestamp,
        );
      }
    } catch (e: any) {
      process.stderr.write(`⚠️ [MIND] Legacy bootstrap failed: ${e.message}\n`);
    }

    return currentStory;
  }

  /**
   * Processes raw search results from Zep into a human-friendly "Flashback" format.
   * Calculates CURRENT relative time based on embedded or metadata timestamps.
   */
  processFlashbacks(results: any[]): string {
    if (!results || results.length === 0) return "";

    const context = results
      .map((m: any) => {
        let content = m.message?.content || m.text || "";
        let finalDate = m.message?.created_at ? new Date(m.message?.created_at) : new Date();

        // Check for embedded timestamp in the content [TIMESTAMP:...]
        const timestampMatch = content.match(/\[TIMESTAMP:([^\]]+)\]/);
        if (timestampMatch) {
          const embeddedDate = new Date(timestampMatch[1]);
          if (!isNaN(embeddedDate.getTime())) {
            finalDate = embeddedDate;
            // Clean the content from the internal tag for cleaner AI reading
            content = content.replace(timestampMatch[0], "").trim();
          }
        }

        const relative = getRelativeTimeDescription(finalDate);
        const exact = finalDate.toLocaleString("en-US");

        return `[${relative} | ${exact}] ${content}`;
      })
      .join("\n");

    return `\n[SUBCONSCIOUS RECOLLECTION]\n${context}\n`;
  }
}
