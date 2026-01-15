/**
 * Session memory hook handler (JavaScript version)
 *
 * Saves session context to memory when /new command is triggered
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Save session context to memory when /new command is triggered
 */
async function saveSessionToMemory(event) {
  // Only trigger on 'new' command
  if (event.type !== 'command' || event.action !== 'new') {
    return;
  }

  try {
    // Create memory directory
    const memoryDir = path.join(os.homedir(), '.clawdbot', 'memory', 'sessions');
    await fs.mkdir(memoryDir, { recursive: true });

    // Create timestamped memory file
    const timestamp = event.timestamp.toISOString().replace(/[:.]/g, '-');
    const sessionSlug = event.sessionKey.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown';
    const memoryFile = path.join(
      memoryDir,
      `${sessionSlug}_${timestamp}.json`
    );

    // Save session context
    const memoryData = {
      sessionKey: event.sessionKey,
      timestamp: event.timestamp.toISOString(),
      action: event.action,
      context: event.context,
    };

    await fs.writeFile(
      memoryFile,
      JSON.stringify(memoryData, null, 2),
      'utf-8'
    );

    console.log(`[session-memory] Saved session context to ${memoryFile}`);
  } catch (err) {
    console.error(
      '[session-memory] Failed to save session context:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

export default saveSessionToMemory;
