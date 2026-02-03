export type SurfaceSeverity = "High" | "Medium" | "Low";

export type SurfaceCategory =
  | "Prompt Injection"
  | "Remote Tool Execution"
  | "Remote File Ops"
  | "Webhooks & Channels"
  | "Outbound HTTP / SSRF"
  | "Subprocess & Tunnels"
  | "Skills & Supply Chain"
  | "Config & Policy Surprises"
  | "Persistence & Memory";

export type SecuritySurface = {
  id: string;
  title: string;
  category: SurfaceCategory;
  severity: SurfaceSeverity;
  wowTagline: string;
  whatItIs: string;
  howItBites: string[];
  mitigationMoves: string[];
  detectionSignals: string[];
  policyGoal: string;
};

export const SURFACES: SecuritySurface[] = [
  {
    id: "prompt-injection",
    title: "Prompt Injection",
    category: "Prompt Injection",
    severity: "High",
    wowTagline: "When “text” becomes control flow.",
    whatItIs:
      "Adversarial content delivered through any channel that attempts to override intent, expand permissions, or trigger tool use.",
    howItBites: [
      "High-trust wording tricks the operator into enabling dangerous modes.",
      "The agent is manipulated into persisting attacker instructions into future context.",
      "Complex multi-step jailbreaks chain “harmless” actions into side effects.",
    ],
    mitigationMoves: [
      "Define explicit trust boundaries: user text is untrusted data, not policy.",
      "Require explicit confirmations for write/exec/network tools in low-trust contexts.",
      "Treat tool invocation as a privilege—scope per channel, per group, per sender.",
      "Add strong guardrails around any persistence mechanism (skills/memory/context).",
    ],
    detectionSignals: [
      "Unusual tool usage patterns after “persuasive” messages.",
      "Requests to disable safeguards or “just run this quick command”.",
      "Sudden changes in persona/instructions from unrelated context.",
    ],
    policyGoal: "Make injection attempts inert without blocking normal conversation.",
  },
  {
    id: "tools-invoke",
    title: "Remote Tool Invocation",
    category: "Remote Tool Execution",
    severity: "High",
    wowTagline: "A tool API can become a remote control plane.",
    whatItIs:
      "Any HTTP or RPC surface that can execute tools by name/arguments becomes a high-value target if credentials leak or scopes are broad.",
    howItBites: [
      "Token leak turns into remote tool execution without using the model at all.",
      "A single mis-scoped policy exposes write/exec tools to lower-trust clients.",
      "Rate-limit gaps allow brute forcing or repeated “safe” calls that exfiltrate data.",
    ],
    mitigationMoves: [
      "Bind admin endpoints to loopback by default; require explicit opt-in for LAN exposure.",
      "Add strict per-client scopes: separate READ tools, WRITE tools, EXEC tools, NET tools.",
      "Add request logging + redaction + anomaly detection for tool invocations.",
      "Add global allowlists for tools on these endpoints (deny-by-default).",
    ],
    detectionSignals: [
      "Tool calls from unexpected client IDs or origins.",
      "Repeated tool invocations with small argument variations.",
      "Spikes in tool invocations around token rotations.",
    ],
    policyGoal: "Make remote tooling safe-by-default even if tokens leak.",
  },
  {
    id: "worktree-rpc",
    title: "Remote Workspace File Ops",
    category: "Remote File Ops",
    severity: "High",
    wowTagline: "Write access turns prompts into persistence.",
    whatItIs:
      "Remote read/write/delete/move/mkdir APIs for a workspace allow attackers to plant instructions, alter configs, or modify operational logic.",
    howItBites: [
      "Small file edits can create long-lived prompt injection via context files.",
      "Config edits can broaden tool policies silently.",
      "Write paths can be chained with skills/installers to expand capabilities.",
    ],
    mitigationMoves: [
      "Per-client scope separation: read-only vs write; default to read-only.",
      "Path allowlists (e.g., deny edits to skills/config unless operator confirmed).",
      "Write operations should require a second factor (confirmation) in UI flows.",
      "Audit trail: record who wrote what, when, and why.",
    ],
    detectionSignals: [
      "Writes to “high leverage” files (skills, system prompts, config).",
      "Burst edits to multiple files in quick succession.",
      "Writes that match known jailbreak patterns (“ignore previous instructions”).",
    ],
    policyGoal: "Make workspace writes deliberate, attributable, and constrained.",
  },
  {
    id: "webhooks",
    title: "Webhooks & Event Spoofing",
    category: "Webhooks & Channels",
    severity: "High",
    wowTagline: "If an attacker can forge events, they can forge reality.",
    whatItIs:
      "Webhook endpoints and event ingestion points can accept malicious or spoofed payloads unless signatures/secrets are enforced and validated.",
    howItBites: [
      "Forged events inject arbitrary text into the agent (prompt injection).",
      "Replay attacks trigger repeated actions (spam, unexpected sends).",
      "Malformed payloads exploit parser edge cases or log injections.",
    ],
    mitigationMoves: [
      "Enforce signatures/secrets for every webhook path; reject missing/invalid.",
      "Replay protection (timestamps/nonces) when supported by the provider.",
      "Hard rate limits per IP + per account ID on webhook ingress.",
      "Normalize and sanitize logged fields to prevent log-based confusion.",
    ],
    detectionSignals: [
      "Webhook calls from unexpected IP ranges.",
      "Repeated identical event payloads (replay).",
      "Sudden spikes in group messages without corresponding provider activity.",
    ],
    policyGoal: "Make webhook ingress cryptographically verifiable and rate-limited.",
  },
  {
    id: "ssrf",
    title: "Outbound HTTP / SSRF",
    category: "Outbound HTTP / SSRF",
    severity: "High",
    wowTagline: "The bot becomes a network client on your behalf.",
    whatItIs:
      "Any feature that fetches URLs can be coerced into hitting internal services, metadata endpoints, or exfiltrating secrets.",
    howItBites: [
      "Internal IP fetches leak instance metadata or local admin endpoints.",
      "Redirect chains bypass naive allowlists.",
      "URL fetches become data exfil channels via response timing and content.",
    ],
    mitigationMoves: [
      "Single centralized URL policy: block private IP ranges, localhost, metadata.",
      "Enforce max redirects and validate every hop.",
      "Time/size limits; strip sensitive headers; no ambient credentials.",
      "Allowlist approved domains for automation webhooks where possible.",
    ],
    detectionSignals: [
      "Fetches to RFC1918 or link-local ranges.",
      "Repeated fetch attempts with small URL mutations.",
      "Unexpected outbound traffic spikes aligned with chat activity.",
    ],
    policyGoal: "Make outbound fetch safe and predictable across the entire codebase.",
  },
  {
    id: "subprocess",
    title: "Subprocess & Tunnel Runtimes",
    category: "Subprocess & Tunnels",
    severity: "Medium",
    wowTagline: "Local binaries are power tools.",
    whatItIs:
      "Spawning local processes (ssh/tailscale/ngrok/etc.) can create unexpected network exposure or become an injection target if arguments are influenced.",
    howItBites: [
      "Unexpected exposure: tunnels can turn local services into public endpoints.",
      "Argument injection if any user-controlled string reaches spawn/exec.",
      "Credentials leak via process args, logs, or environment propagation.",
    ],
    mitigationMoves: [
      "Keep spawn/exec behind explicit operator confirmation in low-trust contexts.",
      "Strict argument builders (no shell=true; avoid string concatenation).",
      "Document and display tunnel state prominently in UI (on/off, target).",
      "Secret hygiene: never log tokens; avoid passing secrets via argv.",
    ],
    detectionSignals: [
      "Unexpected tunnel processes running.",
      "Long-lived child processes started from chat flows.",
      "Outbound connections to tunnel providers without operator action.",
    ],
    policyGoal: "Make subprocess usage explicit, safe, and observable.",
  },
  {
    id: "skills",
    title: "Skills & Supply Chain",
    category: "Skills & Supply Chain",
    severity: "Medium",
    wowTagline: "Skills are executable policy in markdown form.",
    whatItIs:
      "Skill installation and SKILL.md instructions can act like code: they can drive tool usage and persist behavior changes.",
    howItBites: [
      "A compromised skill is a high-trust prompt injection payload.",
      "Archive extraction may overwrite files or place unexpected content.",
      "Skills can normalize dangerous practices if phrased poorly.",
    ],
    mitigationMoves: [
      "Allowlist skill sources; pin versions/SHAs; verify integrity.",
      "Harden archive extraction (zip-slip/tar traversal defenses).",
      "Treat skills as code review artifacts; require approval before enabling.",
      "Skill runtime permissions: each skill declares required tools and scope.",
    ],
    detectionSignals: [
      "New skills installed/enabled unexpectedly.",
      "Skills requesting broader tools than expected.",
      "Persistent behavior change after an install event.",
    ],
    policyGoal: "Make skills installable, but never silently trust them.",
  },
  {
    id: "policy-surprises",
    title: "Config & Policy Surprises",
    category: "Config & Policy Surprises",
    severity: "Medium",
    wowTagline: "The sharpest edges are the ones you didn’t see.",
    whatItIs:
      "Subtle policy coupling and tool naming aliases can broaden permissions in ways that surprise operators and reviewers.",
    howItBites: [
      "Allowing one tool can implicitly allow another, increasing blast radius.",
      "Complex multi-layer policy composition becomes hard to reason about.",
      "Cross-channel privilege bleed: low-trust channel inherits high-power policy.",
    ],
    mitigationMoves: [
      "Remove implicit tool-coupling; require explicit allowlists.",
      "Provide a computed “effective permissions” view per session/group/sender.",
      "Default-deny for high-risk tools in group contexts.",
      "Add automated policy linting to flag broad rules (e.g., '*', 'exec').",
    ],
    detectionSignals: [
      "Tool usage enabled in contexts where it should be denied.",
      "Policy diffs that expand allowlists without clear justification.",
      "Operator confusion about “why was this tool available?”.",
    ],
    policyGoal: "Make permissions explicit and explainable.",
  },
  {
    id: "persistence",
    title: "Persistence & Memory",
    category: "Persistence & Memory",
    severity: "Low",
    wowTagline: "Memory is power—also risk.",
    whatItIs:
      "Any persistence mechanism (memory stores, logs, artifacts) can store adversarial instructions or sensitive data and surface them later.",
    howItBites: [
      "Stored jailbreak text resurfaces as context and biases outputs.",
      "Secrets accidentally captured and replayed into prompts or outbound requests.",
      "Long-lived artifacts become a covert channel for exfil or sabotage.",
    ],
    mitigationMoves: [
      "Redaction: prevent tokens/secrets from being stored or re-injected.",
      "Quote and delimit untrusted recalled content; never treat as policy.",
      "Retention limits and secure deletion for sensitive stores.",
      "User-visible memory audit: what was stored, why, and how to remove it.",
    ],
    detectionSignals: [
      "Memory entries containing instruction-like patterns.",
      "Unexpected references to internal tokens/paths.",
      "Model behavior changes tied to a memory recall event.",
    ],
    policyGoal: "Keep memory helpful, not a latent injection vector.",
  },
];
