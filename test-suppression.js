#!/usr/bin/env node
/**
 * Simple test script to verify suppressSubsystemDebugLogs configuration works.
 *
 * To test:
 * 1. Create openclaw.json with:
 *    {
 *      "logging": {
 *        "consoleLevel": "debug",
 *        "suppressSubsystemDebugLogs": ["memory", "runtime-factory"]
 *      }
 *    }
 * 2. Run this script
 * 3. Verify that:
 *    - info/warn/error logs from all subsystems appear
 *    - debug/trace logs from "memory" and "runtime-factory" do NOT appear
 *    - debug/trace logs from other subsystems DO appear
 */

import { createSubsystemLogger } from "./dist/logging/subsystem.js";

const memoryLogger = createSubsystemLogger("memory");
const runtimeLogger = createSubsystemLogger("runtime-factory");
const agentLogger = createSubsystemLogger("agent");

console.log("\n=== Testing suppressSubsystemDebugLogs ===\n");

// These should NOT appear on console (suppressed)
memoryLogger.debug("This debug log from memory should be suppressed");
memoryLogger.trace("This trace log from memory should be suppressed");
runtimeLogger.debug("This debug log from runtime-factory should be suppressed");
runtimeLogger.trace("This trace log from runtime-factory should be suppressed");

// These SHOULD appear on console (not suppressed)
memoryLogger.info("This info log from memory should appear");
memoryLogger.warn("This warn log from memory should appear");
runtimeLogger.info("This info log from runtime-factory should appear");
agentLogger.debug("This debug log from agent should appear");
agentLogger.trace("This trace log from agent should appear");

console.log("\n=== Test complete ===\n");
console.log("Expected behavior:");
console.log("- Suppressed debug logs should NOT appear above");
console.log("- Info/warn logs should appear from all subsystems");
console.log("- Debug logs from non-suppressed subsystems should appear");
console.log("- All logs (including suppressed) should still be in the log file\n");
