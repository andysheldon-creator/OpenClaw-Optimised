const ANSI_SGR_PATTERN = "\\x1b\\[[0-9;]*m";
// OSC-8 hyperlinks: ESC ] 8 ; params ST text ESC ] 8 ; ST
// Format: \x1b]8;;<params><ST>text\x1b]8;;<ST>
// where params is typically "id=<id>;url=<url>" and ST is either ESC \ (0x1B 0x5C) or BEL (0x07)
//
// Match both opening (with params) and closing (without params) sequences:
// - Opening: \x1b]8;;<params><ST>
// - Closing: \x1b]8;;<ST>
//
// Multiple passes handle both sequences and strip them properly.
const OSC8_PATTERN =
  "\\x1b\\]8;;(?:[^\\x1b\\x07]|\\x1b(?!\\x5c))*(?:\\x1b\\x5c|\\x07)|\\x1b\\]8;;(?:\\x1b\\x5c|\\x07)";

const ANSI_REGEX = new RegExp(ANSI_SGR_PATTERN, "g");
const OSC8_REGEX = new RegExp(OSC8_PATTERN, "g");

export function stripAnsi(input: string): string {
  let result = input;
  let prev: string;
  let count = 0;
  // Multiple passes to handle nested/adjacent ANSI codes
  do {
    prev = result;
    result = result.replace(OSC8_REGEX, "").replace(ANSI_REGEX, "");
    count++;
  } while (result !== prev && count < 100);
  return result;
}

export function visibleWidth(input: string): number {
  return Array.from(stripAnsi(input)).length;
}
