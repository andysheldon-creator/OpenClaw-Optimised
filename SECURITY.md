# OpenClaw Security Guide

## Gateway Security (Issue #1971)

### The Problem
~900+ OpenClaw instances were found exposed on Shodan (port 18789) without authentication, allowing anyone to:
- Execute shell commands on the host
- Access API keys and credentials
- Read emails and calendar data
- Send messages on behalf of the user
- Control the browser

### Immediate Protection

OpenClaw now enforces **mandatory authentication** when binding to external interfaces (0.0.0.0, LAN IP).

#### Auto-Generated Secure Tokens
When you start the gateway on an external interface without auth configured, OpenClaw will:
1. **Auto-generate** a 256-bit cryptographically secure token
2. **Save it to your config** for persistence
3. **Log instructions** for connecting clients

The token is a 64-character hex string (e.g., `a3f7b2d8...`) providing strong protection against brute force attacks.

### Best Practices

#### 1. Use Loopback Binding (Safest)
```json
{
  "gateway": {
    "bind": "loopback"
  }
}
```
This binds to `127.0.0.1` only — no external access.

#### 2. Use Cloudflare Tunnel (Recommended for Remote)
Instead of exposing port 18789 directly:

```bash
# Install cloudflared
brew install cloudflared  # macOS
# or download from https://github.com/cloudflare/cloudflared

# Create tunnel
cloudflared tunnel create openclaw

# Route tunnel
cloudflared tunnel route dns openclaw openclaw.yourdomain.com

# Run tunnel (keeps 18789 private)
cloudflared tunnel run openclaw
```

#### 3. Use Tailscale (Zero-Config VPN)
```json
{
  "gateway": {
    "bind": "loopback",
    "tailscale": {
      "mode": "serve"
    }
  }
}
```
Only Tailscale network members can access your gateway.

#### 4. Firewall Protection
If you must expose directly, firewall the port:

```bash
# Linux (ufw)
sudo ufw deny 18789  # Block all
sudo ufw allow from 192.168.1.0/24 to any port 18789  # Allow LAN only

# macOS (pfctl)
echo "block drop quick on en0 proto tcp from any to any port 18789" | sudo pfctl -ef -
```

### Token Security Requirements

When binding externally, OpenClaw enforces:
- **Tokens**: Minimum 32 characters (256+ bits entropy)
- **Passwords**: Minimum 12 characters
- **Auto-generation**: 64-character hex (256 bits) if none provided

Weak tokens will be rejected with:
```
SECURITY: Gateway binding requires strong auth.
Token must be >=32 chars, password >=12 chars.
```

### Verifying Your Setup

Check if your gateway is exposed:
```bash
# Check public IP
shodan host $(curl -s ifconfig.me)

# Check local binding
sudo lsof -i :18789

# Should show 127.0.0.1:18789 (safe) or *:18789 (exposed)
```

### Incident Response

If you discover your gateway was exposed:
1. **Stop the gateway**: `openclaw gateway stop`
2. **Rotate tokens**: Generate new token in config
3. **Check logs**: Review `/tmp/openclaw/*.log` for unauthorized access
4. **Audit actions**: Check shell history, browser history, sent messages
5. **Revoke credentials**: Rotate any exposed API keys (OpenAI, etc.)

### Reporting Security Issues

Contact: security@openclaw.io  
PGP Key: [security@openclaw.io.asc](./security@openclaw.io.asc)

See [SECURITY.md in main repo](https://github.com/openclaw/openclaw/security) for disclosure policy.

---

**Remember**: OpenClaw with external binding + no auth = anyone can control your computer. Don't be one of the ~900+ exposed instances on Shodan.
