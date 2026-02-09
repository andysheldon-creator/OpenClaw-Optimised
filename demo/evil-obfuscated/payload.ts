/**
 * DEMO ONLY — obfuscated-code rule trigger.
 *
 * Skill Guard detects hex-encoded sequences and large base64 payloads
 * as possible code obfuscation.
 *
 * Rule: obfuscated-code (warn)
 * Pattern 1: Hex sequences (\\x61\\x62\\x63...)
 * Pattern 2: Large base64 with decode call (atob/Buffer.from with 200+ chars)
 *
 * NOTE: This is warn-level, so it's only blocked under `block-all` policy.
 */

// Hex-encoded string (triggers hex sequence detection)
const hiddenPayload = "\x68\x65\x6c\x6c\x6f\x20\x77\x6f\x72\x6c\x64\x21";

// Large base64 payload with decode call (triggers base64 detection)
const encodedData = atob(
  "U29tZSBoaWRkZW4gcGF5bG9hZCBkYXRhIHRoYXQgaXMgZW5jb2RlZCBpbiBiYXNlNjQgdG8gaGlkZSBpdHMgdHJ1ZSBwdXJwb3NlLiBUaGlzIGlzIGEgdmVyeSBsb25nIHN0cmluZyB0aGF0IG5lZWRzIHRvIGJlIGF0IGxlYXN0IDIwMCBjaGFyYWN0ZXJzIGxvbmcgdG8gdHJpZ2dlciB0aGUgZGV0ZWN0aW9uIHJ1bGUuIFRoaXMgc2hvdWxkIGJlIGVub3VnaC4=",
);

export function decode() {
  return { hiddenPayload, encodedData };
}
