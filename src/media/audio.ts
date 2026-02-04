import { getFileExtension } from "./mime.js";

const VOICE_AUDIO_EXTENSIONS = new Set([".oga", ".ogg", ".opus", ".mp3", ".m4a"]);

export function isVoiceCompatibleAudio(opts: {
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  const mime = opts.contentType?.toLowerCase();
  if (
    mime &&
    (mime.includes("ogg") ||
      mime.includes("opus") ||
      mime.includes("mp3") ||
      mime.includes("mpeg") ||
      mime.includes("m4a") ||
      mime.includes("mp4"))
  ) {
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
