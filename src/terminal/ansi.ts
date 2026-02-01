const ANSI_SGR_PATTERN = "\\x1b\\[[0-9;]*m";
// OSC-8 hyperlinks: ESC ] 8 ; ; url ST ... ESC ] 8 ; ; ST
// ST can be either: ESC \ (0x1B 0x5C) or BEL (0x07)
// Handle malformed OSC-8 with BEL terminator (no URL)
const OSC8_PATTERN = "\\x1b\\]8;;[^\\x1b\\x07]*(?:\\x1b\\\\|\\x07)";

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
