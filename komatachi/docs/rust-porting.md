# Rust Porting Guide

> **Status**: Reference document from experimental validation
> **Context**: Decision #5 in PROGRESS.md established "TypeScript with Rust portability"

This document captures lessons learned from an experimental Rust implementation of the compaction module. The experiment validated that our TypeScript design translates cleanly to Rust, confirming decision #5. The experimental code was removed after validation—this document preserves the approach and lessons for future porting work.

---

## The Approach: Hybrid Architecture

The experimental implementation used a **hybrid architecture**:

- **Rust**: Pure computation (token estimation, metadata extraction, string formatting)
- **TypeScript**: Async orchestration (calling the summarizer, error handling)

This separation emerged from a key insight: Rust excels at synchronous, CPU-bound work; TypeScript excels at async coordination. Rather than fighting this, the hybrid design leverages each language's strengths.

### Boundary Definition

```
┌─────────────────────────────────────────────────────────┐
│                    TypeScript Layer                      │
│  - Async operations (API calls to summarizer)           │
│  - Error handling and user-facing types                 │
│  - Set<string> ↔ Vec<string> conversions               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ napi-rs bindings
┌─────────────────────────────────────────────────────────┐
│                      Rust Layer                          │
│  - Token estimation                                     │
│  - Tool failure extraction                              │
│  - File list computation                                │
│  - Summary section formatting                           │
│  - Input validation                                     │
└─────────────────────────────────────────────────────────┘
```

### Why This Boundary?

This was a pragmatic choice for the experiment, not a fundamental requirement:

1. **Pure computation separates cleanly**: Token estimation, string manipulation, and data extraction have no I/O dependencies—they're ideal Rust candidates.
2. **I/O strategy is flexible**: The summarizer (which makes LLM calls) was injected as a callback. This lets the caller decide the I/O pattern—the core module doesn't need to know.
3. **Data conversion at boundaries**: TypeScript uses `Set<string>` idiomatically; Rust uses `Vec<String>`. Convert at the boundary, not throughout.

Note: The hybrid split was about separating concerns, not about async complexity. A pure Rust implementation could handle I/O via blocking calls, async/await, or callback injection.

---

## Type Mapping Patterns

### Nullable Fields

TypeScript's `field?: type` maps to Rust's `Option<T>`:

```typescript
// TypeScript
interface Message {
  toolCallId?: string;
  exitCode?: number;
}
```

```rust
// Rust
pub struct Message {
    pub tool_call_id: Option<String>,
    pub exit_code: Option<i32>,
}
```

### Union Types for Results

TypeScript's discriminated unions map to Rust's `Result` or custom structs:

```typescript
// TypeScript
function canCompact(): { ok: true } | { ok: false; reason: string };
```

```rust
// Rust - using a struct with Option fields
pub struct ValidationResult {
    pub ok: bool,
    pub reason: Option<String>,
    pub input_tokens: Option<u32>,
}
```

### Collection Types

TypeScript's `Set<T>` has no direct Rust equivalent via napi-rs. Use `Vec<T>` in Rust and convert at the boundary:

```typescript
// TypeScript wrapper
function fileOpsToNative(fileOps: FileOperations): native.FileOperations {
  return {
    read: [...fileOps.read],     // Set -> Array
    edited: [...fileOps.edited],
    written: [...fileOps.written],
  };
}
```

### Unknown/Dynamic Content

TypeScript's `unknown` maps to `serde_json::Value`:

```typescript
// TypeScript
interface Message {
  content: unknown;
}
```

```rust
// Rust
pub struct Message {
    #[napi(ts_type = "unknown")]
    pub content: serde_json::Value,
}
```

---

## napi-rs Annotations

The experimental implementation used [napi-rs](https://napi.rs/) for Node.js bindings.

### Key Annotations

```rust
use napi_derive::napi;

// Export a function
#[napi]
pub fn estimate_tokens(message: Message) -> u32 { ... }

// Export a struct with JS-compatible field names
#[napi(object)]
pub struct Message {
    #[napi(js_name = "toolCallId")]  // camelCase in JS
    pub tool_call_id: Option<String>, // snake_case in Rust
}
```

### Error Handling

Rust errors map to JavaScript exceptions via `napi::Result`:

```rust
#[napi]
pub fn prepare_compaction(...) -> napi::Result<PreparedCompaction> {
    if input_too_large {
        return Err(napi::Error::new(
            napi::Status::GenericFailure,
            "Input too large to compact".to_string(),
        ));
    }
    Ok(result)
}
```

TypeScript catches these as regular exceptions:

```typescript
try {
  prepared = native.prepareCompaction(messages, fileOps, maxTokens);
} catch (error) {
  if (error.message.includes("Input too large")) {
    throw new InputTooLargeError(...);
  }
  throw error;
}
```

---

## Lessons Learned

### 1. Design TypeScript for Portability

The TypeScript code should avoid patterns that don't translate to Rust:

| Avoid in TypeScript | Use Instead | Rust Equivalent |
|---------------------|-------------|-----------------|
| `any` | Explicit types | Strong typing |
| Implicit type coercion | Explicit conversions | `From`/`Into` traits |
| Prototype manipulation | Pure functions | Functions |
| Closures capturing mutable state | Explicit state passing | Owned data |
| Dynamic property access | Defined interfaces | Structs |

### 2. Pure Functions Port Cleanly

Functions that take inputs and return outputs without side effects port 1:1:

```typescript
// TypeScript
export function estimateTokens(message: Message): number {
  const text = extractText(message.content);
  return Math.ceil(text.length / 4);
}
```

```rust
// Rust - nearly identical
pub fn estimate_tokens(message: Message) -> u32 {
    let text = extract_text(&message.content);
    (text.len() as f64 / 4.0).ceil() as u32
}
```

### 3. I/O Patterns for External Calls

When a module needs to make external calls (like LLM API requests), there are several patterns:

**Callback injection** - The module stays pure; the caller provides the I/O mechanism:

```rust
fn compact<F>(messages: Vec<Message>, summarize: F) -> Result<Summary>
where
    F: FnOnce(&[Message]) -> Result<String>
{
    // Module doesn't care how summarize is implemented
    let summary = summarize(&messages)?;
    // ...
}
```

**Blocking I/O** - Simple and correct for sequential operations:

```rust
// Using ureq for synchronous HTTP
let response = ureq::post(url)
    .send_json(&request)?
    .into_string()?;
```

**Thread + channel** - When you need concurrency without async:

```rust
let (tx, rx) = mpsc::channel();
thread::spawn(move || {
    let result = make_llm_call();
    tx.send(result).unwrap();
});
let response = rx.recv()?;
```

**Async/await** - When handling many concurrent operations (e.g., a server):

```rust
async fn summarize(messages: &[Message]) -> Result<String> {
    let response = reqwest::Client::new()
        .post(url)
        .json(&request)
        .send()
        .await?;
    // ...
}
```

The experimental implementation used callback injection, keeping the core module I/O-agnostic. This is often the cleanest pattern—it separates the "what" (computation) from the "how" (I/O strategy).

### 4. Validation Works Identically

Input validation logic ports directly. The same checks, same error messages:

```typescript
// TypeScript
if (inputTokens > effectiveMax) {
  throw new InputTooLargeError(inputTokens, maxTokens);
}
```

```rust
// Rust
if input_tokens > effective_max {
    return Err(napi::Error::new(
        napi::Status::GenericFailure,
        format!("Input too large: {} > {}", input_tokens, max_tokens),
    ));
}
```

### 5. Build Infrastructure Complexity

The experimental Rust implementation required:

- `Cargo.toml` with napi-rs dependencies
- `build.rs` for napi build hooks
- `package.json` in the crate directory for npm packaging
- `.gitignore` for build artifacts

This infrastructure cost is non-trivial. It's worth it for:
- Performance-critical paths
- CPU-bound computation
- Memory-sensitive operations

It's not worth it for:
- Thin wrappers
- Primarily async code
- Rapidly changing interfaces

---

## When to Port to Rust

Port a module to Rust when:

1. **Performance matters**: The module is on a hot path and profiling shows it's a bottleneck
2. **Computation dominates**: The module does significant CPU work (parsing, transformation, computation)
3. **Interface is stable**: The module's API is unlikely to change frequently
4. **Dependencies exist**: Rust equivalents for required functionality exist (or aren't needed)

Keep in TypeScript when:

1. **Interface is unstable**: The API is still being designed
2. **Integration is complex**: Heavy interop with Node.js APIs or npm packages
3. **Iteration speed matters**: You need to change and test rapidly
4. **Node ecosystem dependency**: The module relies heavily on npm packages without Rust equivalents

---

## Validation Results

The experimental implementation validated:

1. **Type mapping works**: All types mapped cleanly between TypeScript and Rust
2. **Behavior is identical**: 44 tests passed with both implementations
3. **Hybrid architecture is viable**: The TypeScript/Rust boundary was clean
4. **Performance would improve**: Rust computation would be faster (not measured, as performance wasn't a concern)

The experiment confirmed decision #5: writing "Rust-portable TypeScript" is achievable. The actual porting can happen when/if performance requirements demand it.

---

## References

- [napi-rs documentation](https://napi.rs/)
- [serde_json for dynamic JSON](https://docs.rs/serde_json/)
- Decision #5 in [PROGRESS.md](../PROGRESS.md)
