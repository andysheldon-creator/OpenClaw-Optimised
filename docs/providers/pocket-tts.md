---
summary: "Local CPU-based TTS with Pocket TTS"
read_when:
  - You want local text-to-speech without cloud APIs
  - You need free, offline TTS
  - You want voice cloning capabilities
---

# Pocket TTS

[Pocket TTS](https://github.com/kyutai-labs/pocket-tts) is a local, CPU-only text-to-speech engine from Kyutai Labs. It runs entirely on your machine with no API keys required.

**Highlights:**
- ~100M parameter model, runs on CPU
- ~200ms latency to first audio chunk
- 6× realtime on MacBook Air M4
- Voice cloning via reference audio file
- 8 built-in voices
- Fully offline after initial model download (~400MB)

## Quick start

1. Install Pocket TTS:

```bash
# Using pip
pip install pocket-tts

# Or using uv (faster)
uv pip install pocket-tts
```

2. Start the server:

```bash
pocket-tts serve --voice alba
```

3. Configure Clawdbot:

```json5
{
  messages: {
    tts: {
      provider: "pocket",
      pocket: {
        baseUrl: "http://localhost:8000",  // default
        voice: "alba"                       // default
      }
    }
  }
}
```

4. Enable TTS:

```
/tts always
```

## Built-in voices

Pocket TTS includes 8 built-in voices (Les Misérables characters):

| Voice | Description |
|-------|-------------|
| `alba` | Default voice |
| `marius` | Male voice |
| `javert` | Male voice |
| `jean` | Male voice |
| `fantine` | Female voice |
| `cosette` | Female voice |
| `eponine` | Female voice |
| `azelma` | Female voice |

## Voice cloning

Clone any voice by providing a reference audio file:

```bash
# Start server with custom voice
pocket-tts serve --voice /path/to/your-voice.wav
```

Or use a HuggingFace voice:

```json5
{
  messages: {
    tts: {
      pocket: {
        voice: "hf://kyutai/tts-voices/custom-voice.wav"
      }
    }
  }
}
```

## Configuration

### Full config options

```json5
{
  messages: {
    tts: {
      provider: "pocket",      // Use pocket as primary provider
      pocket: {
        enabled: true,         // Enable/disable pocket (default: true)
        baseUrl: "http://localhost:8000",  // Server URL (also used for auto-start binding)
        voice: "alba",         // Voice name or URL
        autoStart: false       // Auto-start server if not running (default: false)
      }
    }
  }
}
```

### Auto-start mode

Clawdbot can automatically start `pocket-tts serve` when it's not running:

```json5
{
  messages: {
    tts: {
      provider: "pocket",
      pocket: {
        baseUrl: "http://localhost:8000",  // Host/port derived from this URL
        autoStart: true,                    // Spawn server automatically
        voice: "alba"                       // Voice to use when starting
      }
    }
  }
}
```

**How it works:**
1. Clawdbot checks `/health` endpoint
2. If server is down and `autoStart: true`, spawns `pocket-tts serve`
3. Host and port are derived from `baseUrl` (e.g., `http://localhost:9000` → `--host localhost --port 9000`)
4. Waits up to 30s for server to become healthy (model loading)
5. Server is stopped automatically when Clawdbot exits

**Note:** First request may be slow (~10-30s) while the model loads. Subsequent requests are fast (~200ms).

### Environment variables

Pocket TTS doesn't require API keys:

```bash
# Manual start (recommended for production)
pocket-tts serve --voice alba

# Or let Clawdbot auto-start via config
```

## Provider fallback

Clawdbot tries providers in order: **OpenAI → ElevenLabs → Edge → Pocket**

When Pocket TTS is configured but the server isn't running:
1. If `autoStart: true`, Clawdbot tries to start the server
2. If that fails (or `autoStart: false`), falls back to next provider

To check if the server is running:

```bash
curl http://localhost:8000/health
# Returns: {"status": "healthy"}
```

### Using Pocket as primary

To use Pocket first (before cloud providers):

```json5
{
  messages: {
    tts: {
      provider: "pocket"  // Try pocket first, fall back to others
    }
  }
}
```

## Comparison with other providers

| Provider | API Key | Latency | Cost | Offline | Output |
|----------|---------|---------|------|---------|--------|
| Pocket TTS | No | ~200ms | Free | Yes | WAV |
| Edge TTS | No | ~500ms | Free | No | MP3 |
| OpenAI | Yes | ~300ms | $0.015/1K chars | No | MP3/WAV |
| ElevenLabs | Yes | ~400ms | $0.30/1K chars | No | MP3 |

**Note:** Pocket TTS outputs WAV format (uncompressed). File sizes are ~5-10x larger than MP3 (~100KB vs ~15KB for short phrases). Most messaging platforms handle this fine.

**First run:** Downloads ~400MB model from HuggingFace on first use. After that, it's fully offline.

## Troubleshooting

### Server not running

If you see "pocket: server not running", start the server:

```bash
pocket-tts serve --voice alba
```

Or enable auto-start in config:

```json5
{ messages: { tts: { pocket: { autoStart: true } } } }
```

### pocket-tts not installed

If auto-start fails with "ENOENT" or "command not found":

```bash
# Install pocket-tts
pip install pocket-tts

# Verify installation
pocket-tts --help
```

### Wrong Python version

Pocket TTS requires Python 3.10+:

```bash
python3 --version
# Should be 3.10 or higher
```

### Model loading slow

First request takes 10-30s to load the model. This is normal.
Subsequent requests are fast (~200ms).

### Invalid voice error

Valid voices are:
- Built-in: `alba`, `marius`, `javert`, `jean`, `fantine`, `cosette`, `eponine`, `azelma`
- HuggingFace: `hf://kyutai/tts-voices/...`
- HTTP/HTTPS URLs

Local file paths are **not** supported via the API. Use `pocket-tts serve --voice /path/to/file.wav` instead.

### Missing dependencies

```bash
# Reinstall with all dependencies
pip install pocket-tts[audio]
```

## Links

- [Pocket TTS GitHub](https://github.com/kyutai-labs/pocket-tts)
- [Kyutai Labs](https://kyutai.org)
- [HuggingFace Model](https://huggingface.co/kyutai/pocket-tts-v1)
