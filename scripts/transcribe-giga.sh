#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: transcribe-giga.sh <audio-file>

Environment:
  GIGA_SH           Path to giga.sh (default: ~/TOOLS/vtt_giga_sh/giga.sh)
  GIGA_TRANSCODE    Set to 1 to force ffmpeg WAV conversion
EOF
}

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 2
fi

input="$1"
if [[ ! -f "$input" ]]; then
  echo "File not found: $input" >&2
  exit 3
fi

GIGA_SH="${GIGA_SH:-"$HOME/TOOLS/vtt_giga_sh/giga.sh"}"
if [[ ! -x "$GIGA_SH" ]]; then
  echo "giga.sh not found or not executable: $GIGA_SH" >&2
  exit 4
fi

tmp_dir="$(mktemp -d)"
tmp_out="$tmp_dir/transcript.txt"
tmp_log="$tmp_dir/giga.log"
tmp_in="$input"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

if [[ "${GIGA_TRANSCODE:-}" == "1" ]]; then
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg is required for GIGA_TRANSCODE=1" >&2
    exit 5
  fi
  tmp_in="$tmp_dir/input.wav"
  ffmpeg -y -loglevel error -i "$input" -ac 1 -ar 16000 "$tmp_in"
fi

if ! "$GIGA_SH" "$tmp_in" -f text -q -o "$tmp_out" >"$tmp_log" 2>&1; then
  cat "$tmp_log" >&2
  exit 6
fi

if [[ ! -s "$tmp_out" ]]; then
  echo "Empty transcript from giga.sh" >&2
  cat "$tmp_log" >&2
  exit 7
fi

cat "$tmp_out"
