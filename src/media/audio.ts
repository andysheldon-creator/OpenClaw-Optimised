import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getFileExtension } from "./mime.js";

const VOICE_AUDIO_EXTENSIONS = new Set([".oga", ".ogg", ".opus"]);

export function isVoiceCompatibleAudio(opts: {
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  const mime = opts.contentType?.toLowerCase();
  if (mime && (mime.includes("ogg") || mime.includes("opus"))) {
    return true;
  }
  const fileName = opts.fileName?.trim();
  if (!fileName) {
    return false;
  }
  const ext = getFileExtension(fileName);
  if (!ext) {
    return false;
  }
  return VOICE_AUDIO_EXTENSIONS.has(ext);
}

/** Returns true if ffmpeg is available in the system PATH. */
export function hasFFmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Transcodes an audio file to a standard OGG/Opus voice format.
 * Returns the path to the new file if successful, or the original path if failed.
 */
export function transcodeToOggOpus(inputPath: string): string {
  if (!inputPath || !existsSync(inputPath)) {
    return inputPath;
  }
  const outputPath = inputPath.replace(/\.[^.]+$/, ".ogg");
  try {
    execFileSync(
      "ffmpeg",
      ["-i", inputPath, "-acodec", "libopus", "-ac", "1", "-ar", "24000", outputPath, "-y"],
      { stdio: "ignore" },
    );
    if (existsSync(outputPath)) {
      return outputPath;
    }
  } catch {
    // Ignore errors and return original path as fallback
  }
  return inputPath;
}
