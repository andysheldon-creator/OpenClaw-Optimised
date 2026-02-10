import { Container, Markdown, Spacer } from "@mariozechner/pi-tui";
import { markdownTheme, theme } from "../theme/theme.js";

/**
 * Convert single newlines into CommonMark hard line-breaks (`  \n`) so that
 * the `marked` lexer (used by pi-tui's Markdown component) preserves them
 * instead of collapsing them into spaces (CommonMark "soft break" behaviour).
 *
 * Double-newlines (`\n\n`) are left untouched as they already denote paragraph
 * breaks. Lines that already end with two trailing spaces are also left alone.
 */
export function preserveNewlines(text: string): string {
  return text.replace(/([^\n])(?<! {2})\n(?!\n)/g, "$1  \n");
}

export class AssistantMessageComponent extends Container {
  private body: Markdown;

  constructor(text: string) {
    super();
    this.body = new Markdown(preserveNewlines(text), 1, 0, markdownTheme, {
      color: (line) => theme.fg(line),
    });
    this.addChild(new Spacer(1));
    this.addChild(this.body);
  }

  setText(text: string) {
    this.body.setText(preserveNewlines(text));
  }
}
