#!/usr/bin/env node
/**
 * Quick test to verify the Discord output sanitizer
 */

function sanitizeModelOutput(text) {
  if (!text) {
    return "";
  }

  let out = text;

  // 1. Remove <think>...</think> (Gemini 3 Pro, DeepSeek, Kimi)
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // 2. Remove "Thought:" blocks (Grok, older reasoning models)
  out = out.replace(/(^|\n)\s*Thoughts?:[\s\S]*?(?=\n\s*\n|$)/gi, "$1");

  // 3. Remove "Thinking..." markers - fixed to handle space before ellipsis
  out = out.replace(/Thinking(?:\s*\.{3})?\s*/gi, "");

  // 4. Remove bracketed reasoning like [Thinking...], [thinking], etc.
  // Match with surrounding spaces but replace with single space
  out = out.replace(/\[\s*(?:thinking|thoughts?)(?:\s*\.{3})?\s*\]/gi, "");

  // 5. Remove parenthesized reasoning like (thinking), (thoughts), etc.
  // Match with surrounding spaces but replace with single space
  out = out.replace(/\(\s*(?:thinking|thoughts?)(?:\s*\.{3})?\s*\)/gi, "");

  // 6. Collapse multiple blank lines only (preserve single newlines)
  out = out.replace(/\n{3,}/g, "\n\n");
  // Clean up spaces around bracketed/parenthesized removals
  out = out.replace(/\s*\[\s*\]\s*/g, " ");
  out = out.replace(/\s*\(\s*\)\s*/g, " ");
  // Collapse multiple consecutive spaces (but not newlines)
  out = out.replace(/ {2,}/g, " ").trim();

  return out;
}

const tests = [
  {
    name: "Gemini <think> block",
    input: "Hello\n<think>Let me calculate this...</think>\nThe answer is 42",
    expected: "Hello\n\nThe answer is 42",
  },
  {
    name: "Thought: block (Grok style)",
    input: "Here's my response:\n\nThought: I need to check the docs\n\nThe docs say...",
    expected: "Here's my response:\n\nThe docs say...",
  },
  {
    name: "Thinking... marker",
    input: "Thinking... Let me figure this out. Yes, it works.",
    expected: "Let me figure this out. Yes, it works.",
  },
  {
    name: "[thinking] brackets",
    input: "My response: [thinking] Processing... The result is X",
    expected: "My response: Processing... The result is X",
  },
  {
    name: "(thinking) parentheses",
    input: "Answer: (thinking) hmm yes The solution is Y",
    expected: "Answer: hmm yes The solution is Y",
  },
  {
    name: "Multiple blank lines",
    input: "Line 1\n\n\n\nLine 2",
    expected: "Line 1\n\nLine 2",
  },
  {
    name: "Only reasoning content (should be empty)",
    input: "<think>Just thinking...</think>",
    expected: "",
  },
  {
    name: "Complex real-world example",
    input: `<think>
The user is asking about Discord integration. Let me think about this:
1. The API endpoint is /api/v10/channels/{id}/messages
2. The limit is 2000 characters
3. I need to handle embeds

Actually, let me reconsider...
</think>

To send a Discord message:
1. Create a REST client
2. Use the API endpoint
3. Send the message`,
    expected:
      "To send a Discord message:\n1. Create a REST client\n2. Use the API endpoint\n3. Send the message",
  },
];

let passed = 0;
let failed = 0;

console.log("🧪 Testing Discord output sanitizer\n");

for (const test of tests) {
  const result = sanitizeModelOutput(test.input);
  const matches = result === test.expected;

  if (matches) {
    console.log(`✅ ${test.name}`);
    passed++;
  } else {
    console.log(`❌ ${test.name}`);
    console.log(`   Input:    ${JSON.stringify(test.input.substring(0, 60))}`);
    console.log(`   Expected: ${JSON.stringify(test.expected)}`);
    console.log(`   Got:      ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
