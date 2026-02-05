# OpenClaw Security Runbook

Incident response procedures for OpenClaw security events.

## Immediate Response Checklist

When a security incident is suspected:

1. **Isolate** - Disconnect affected systems from the network if possible
2. **Preserve** - Capture logs, memory dumps, and network traffic before any remediation
3. **Assess** - Determine scope and severity using the guides below
4. **Remediate** - Follow the specific incident procedures
5. **Review** - Post-incident analysis and improvements

---

## Incident: Supabase Key Leak

### Detection Signals

- Alert from gitleaks/trufflehog CI
- Unexpected database queries in Supabase logs
- User reports of unauthorized access
- Anomaly detector triggers on unusual DB activity

### Immediate Actions (within 15 minutes)

1. **Rotate the compromised key immediately**

   ```bash
   # In Supabase Dashboard:
   # Settings → API → Generate new service_role key
   # Update all legitimate consumers with new key
   ```

2. **Revoke old key** - Supabase automatically invalidates old keys when new ones are generated

3. **Check for misuse**

   ```sql
   -- In Supabase SQL Editor, check recent admin operations
   SELECT * FROM auth.audit_log_entries
   WHERE created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```

4. **Scan for exposed key in code**

   ```bash
   # Check if key is in any tracked files
   git log -p --all -S '<leaked_key_pattern>' | head -100

   # Check recent commits
   git diff HEAD~50..HEAD | grep -i 'service_role\|supabase'
   ```

### Recovery Actions

1. **Audit database for unauthorized changes**
   - Review all tables for unexpected modifications
   - Check auth.users for new/modified accounts
   - Verify RLS policies are intact

2. **Notify affected users** if data breach occurred

3. **Update deployment secrets**
   - Kubernetes secrets
   - Environment variables
   - CI/CD variables

### Prevention

- Enable commit hooks blocking service_role patterns
- Use environment-specific keys (dev/staging/prod)
- Implement key rotation schedule (quarterly minimum)

---

## Incident: Gateway Public Exposure

### Detection Signals

- Security audit finding: `gateway.bind_no_auth`
- External scan detecting open port
- Unexpected connections in gateway logs
- Anomaly detector: request spike from unknown IPs

### Immediate Actions

1. **Stop the gateway**

   ```bash
   pkill -f openclaw-gateway
   # Or via systemd: systemctl stop openclaw-gateway
   ```

2. **Firewall the port** (if stopping isn't immediate)

   ```bash
   # Linux
   sudo iptables -A INPUT -p tcp --dport 18789 -j DROP

   # macOS
   sudo pfctl -e
   echo "block in on en0 proto tcp from any to any port 18789" | sudo pfctl -f -
   ```

3. **Check for unauthorized access**

   ```bash
   # Review gateway logs
   tail -n 1000 /tmp/openclaw/openclaw-*.log | grep -E 'auth|connect|unauthorized'

   # Check for config changes
   diff ~/.openclaw/config.yaml ~/.openclaw/config.yaml.bak
   ```

### Recovery Actions

1. **Reconfigure to loopback**

   ```yaml
   # In ~/.openclaw/config.yaml
   gateway:
     bind: loopback
     auth:
       token: "<generate-new-strong-token>"
   ```

2. **Regenerate auth token**

   ```bash
   openssl rand -hex 32  # Generate new token
   ```

3. **Review session/command history** for unauthorized actions

4. **If using Tailscale**, ensure proper mode:
   ```yaml
   gateway:
     tailscale:
       mode: serve # NOT funnel unless intentional
   ```

### Prevention

- Always use `bind: loopback` (default)
- For remote access, use SSH tunnel or Tailscale
- Enable and configure IP allowlists for any non-loopback binding

---

## Incident: Skills Supply-Chain Attack

### Detection Signals

- Unknown skill executing unexpected commands
- Network connections to suspicious hosts
- File system modifications outside workspace
- Anomaly detector: unusual skill execution patterns

### Immediate Actions

1. **Disable the suspicious skill**

   ```bash
   # Remove from allowlist
   openclaw config set plugins.<skill_id>.enabled false

   # Or remove skill files entirely
   rm -rf ~/.openclaw/skills_local/<skill_id>/
   ```

2. **Kill any running skill processes**

   ```bash
   # Find and kill skill-related processes
   pgrep -f 'openclaw.*skill' | xargs kill -9
   ```

3. **Block network egress** if skill might be exfiltrating
   ```bash
   # Temporary block all outbound from skill sandbox
   # (implementation depends on sandbox configuration)
   ```

### Recovery Actions

1. **Audit skill execution history**

   ```bash
   grep -r 'skill.*execute' /tmp/openclaw/openclaw-*.log
   ```

2. **Check for persistence mechanisms**
   - Cron jobs: `crontab -l`
   - Startup items: `systemctl list-unit-files --state=enabled`
   - SSH keys: `cat ~/.ssh/authorized_keys`

3. **Verify workspace integrity**

   ```bash
   # Check for unexpected files
   find ~/.openclaw -mtime -1 -type f

   # Check file hashes if baseline exists
   find ~/.openclaw -type f -exec sha256sum {} \; | diff - baseline.txt
   ```

4. **Rebuild from clean state** if compromise is confirmed

### Prevention

- Enable skills allowlist (`OPENCLAW_SKILLS_ALLOWLIST`)
- Disable remote skill installation
- Review skill code before adding to allowlist
- Use skill sandbox with restricted permissions

---

## Incident: Identity Impersonation

### Detection Signals

- Messages appearing from unexpected users
- Actions attributed to wrong accounts
- User reports of messages they didn't send
- Anomaly detector: identity field manipulation attempts

### Immediate Actions

1. **Review recent messages** for impersonated content

   ```bash
   # Check for impersonation attempts in logs
   grep -E 'impersonate|post_as|actor.*override' /tmp/openclaw/openclaw-*.log
   ```

2. **Verify identity stripping is active**
   - Check that `identity_guard.ts` is loaded
   - Verify no bypass conditions exist

### Recovery Actions

1. **Notify affected users** about potential impersonated messages

2. **Mark or delete impersonated content** if possible

3. **Review and strengthen identity validation**

---

## Security Event Monitoring

### Log Patterns to Monitor

```bash
# Authentication failures
grep 'SECURITY_EVENT.*auth.*fail' /tmp/openclaw/*.log

# Rate limit triggers
grep 'SECURITY_EVENT.*rate.*limit' /tmp/openclaw/*.log

# Blocked dangerous patterns
grep 'SECURITY_EVENT.*blocked' /tmp/openclaw/*.log

# Anomaly detections
grep 'SECURITY_EVENT.*anomaly' /tmp/openclaw/*.log
```

### Webhook Integration

Configure security event webhook for real-time alerts:

```bash
export OPENCLAW_SECURITY_WEBHOOK_URL="https://your-alerting-service.com/webhook"
```

Webhook payload format:

```json
{
  "event": "SECURITY_EVENT",
  "type": "auth_failure_burst",
  "timestamp": "2024-01-15T10:30:00Z",
  "details": {
    "source_ip": "192.168.1.100",
    "failure_count": 10,
    "window_seconds": 60
  }
}
```

---

## Contacts and Escalation

- **Security Issues**: security@openclaw.ai
- **Critical Incidents**: [escalation process]
- **Bug Reports**: https://github.com/openclaw/openclaw/issues
