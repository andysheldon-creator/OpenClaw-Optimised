# Runtime Context Resolver

## Summary

The runtime context resolver is a dedicated component that decides which runtime to use and assembles the runtime specific context in a consistent way. It is the single place where runtime kind, tool policy, sandbox configuration, and runtime metadata are resolved.

## Problem Statement

Runtime selection and context assembly are currently duplicated across entry points. Each caller decides if it should run Pi, Claude SDK, or CLI paths and then builds context fields on its own. This creates subtle differences and makes it hard to introduce new runtime behaviors safely.

## Current State and Pain Points

The following patterns appear across the codebase:

- `resolveSessionRuntimeKind` is called directly in multiple entry points with minor variations.
- `createSdkMainAgentRuntime` is created in some paths but not others, even when the runtime kind is the same.
- CLI providers use `runCliAgent` directly, which bypasses most AgentRuntime logic.
- `src/agents/agent-runtime-dispatch.ts` exists as a general helper but is not widely used.

Consequences:

- It is unclear which parameters are required for a runtime and which are optional.
- Tool policy resolution is scattered and may not be identical across call sites.
- Sandbox configuration and safety flags are not uniformly applied.

## Goals

- A single function that resolves runtime kind and runtime context.
- A standard runtime metadata record that can be reused by the Session Kernel.
- Consistent tool policy and sandbox decisions.
- Clear extension points for future runtimes.

## Non Goals

- Replacing the Pi runtime or SDK runtime implementations.
- Changing how CLI providers are configured.

## Proposed Architecture

Introduce a Runtime Context Resolver with a single public entry point:

- `resolveRuntimeContext(input): RuntimeContext`

The resolver is called only by the Session Kernel. All entry points get runtime context by going through the kernel.

## RuntimeContext Shape

```ts
export type RuntimeContext = {
  kind: "pi" | "claude" | "cli";
  runtime: AgentRuntime | CliRuntimeAdapter;
  toolPolicy: ToolPolicy;
  sandbox: SandboxContext | null;
  runtimeMeta: {
    agentId: string;
    sessionKey?: string;
    supportsTools: boolean;
    supportsStreaming: boolean;
  };
};
```

The `CliRuntimeAdapter` is a thin wrapper over `runCliAgent` that conforms to a minimal runtime shape but always disables tools.

## Resolution Order

1. Resolve session agentId and normalize agentId aliases.
2. Resolve runtime kind using session key inheritance.
3. Resolve sandbox context if the runtime supports tools.
4. Resolve tool policy and tool allowlists based on config and channel context.
5. Instantiate the runtime with its required context and return `RuntimeContext`.

## Tool Policy and Sandbox Notes

Tool policy should be resolved once and shared with runtime creation. The policy should include:

- Allowed tool groups and explicit allowlist overrides.
- Required safety boundaries derived from config and channel.
- Tool invocation mode for readonly versus write actions.

Sandbox selection should align with gateway sandboxing rules. See [Gateway Sandboxing](/gateway/sandboxing).

## SDK Runtime Context Assembly

The resolver should be the only place that calls `createSdkMainAgentRuntime`. It should also decide whether SDK hooks are enabled and pass a consistent `replyToMode` and `hasRepliedRef` configuration.

## CLI Runtime Context Assembly

CLI runtimes should be treated as a normal runtime kind with `supportsTools` set to false. This allows a single pipeline to branch for CLI without special cases in every entry point.

## Impact and Complexity Reduction

- One source of truth for runtime decisions.
- Fewer inconsistencies when adding new runtime features.
- Easier to reason about tool policy and sandboxing.

## Migration Plan

1. Introduce `RuntimeContextResolver` and unit tests for runtime selection.
2. Update the Session Kernel to call the resolver.
3. Remove direct calls to `createSdkMainAgentRuntime` and `runCliAgent` from entry points.

## Testing and Validation

- Runtime selection tests for main agent, subagents, and inheritance.
- Tool policy resolution tests for different channels and session types.
- CLI adapter tests to ensure tools stay disabled.

## Forward Looking Use Cases

- Adding a local model runtime while reusing tool policy logic.
- Enabling runtime specific diagnostics without changing entry points.
- Runtime specific feature flags for beta rollouts.
- Consistent runtime behavior in sandboxed and remote gateways.
- Cross channel runtime selection with one code path.

## Related Docs

- [Agent Session Kernel](/refactor/agent-session-kernel)
- [Turn Execution Pipeline](/refactor/turn-execution-pipeline)
- [Gateway Configuration](/gateway/configuration)
- [Gateway Sandboxing](/gateway/sandboxing)
- [Tools Overview](/tools)
