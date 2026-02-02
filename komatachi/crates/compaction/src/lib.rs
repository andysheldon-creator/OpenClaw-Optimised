//! Compaction Module - Rust implementation
//!
//! Summarizes conversation history to fit within token limits while
//! preserving important metadata (tool failures, file operations).
//!
//! Design: Pure computation in Rust, async orchestration in TypeScript.

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/// Safety margin for token estimation (20% buffer)
pub const TOKEN_SAFETY_MARGIN: f64 = 1.2;

/// Maximum portion of context window that input can occupy
const MAX_INPUT_RATIO: f64 = 0.75;

/// Maximum tool failures to include in summary
const MAX_TOOL_FAILURES: usize = 8;

/// Maximum characters per tool failure message
const MAX_FAILURE_CHARS: usize = 240;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/// Message details for tool results
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[napi(object)]
pub struct MessageDetails {
    pub status: Option<String>,
    #[napi(js_name = "exitCode")]
    pub exit_code: Option<i32>,
}

/// A conversation message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct Message {
    pub role: String,
    #[napi(ts_type = "unknown")]
    pub content: serde_json::Value,
    pub timestamp: Option<f64>,
    #[napi(js_name = "toolCallId")]
    pub tool_call_id: Option<String>,
    #[napi(js_name = "toolName")]
    pub tool_name: Option<String>,
    #[napi(js_name = "isError")]
    pub is_error: Option<bool>,
    pub details: Option<MessageDetails>,
}

/// A tool invocation that failed
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ToolFailure {
    #[napi(js_name = "toolCallId")]
    pub tool_call_id: String,
    #[napi(js_name = "toolName")]
    pub tool_name: String,
    #[napi(js_name = "errorSummary")]
    pub error_summary: String,
    #[napi(js_name = "exitCode")]
    pub exit_code: Option<i32>,
}

/// File operations tracked during a session (using arrays for JS interop)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct FileOperations {
    pub read: Vec<String>,
    pub edited: Vec<String>,
    pub written: Vec<String>,
}

/// Result of computing file lists
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct FileListsResult {
    #[napi(js_name = "filesRead")]
    pub files_read: Vec<String>,
    #[napi(js_name = "filesModified")]
    pub files_modified: Vec<String>,
}

/// Metadata extracted from messages during compaction
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct CompactionMetadata {
    #[napi(js_name = "toolFailures")]
    pub tool_failures: Vec<ToolFailure>,
    #[napi(js_name = "filesRead")]
    pub files_read: Vec<String>,
    #[napi(js_name = "filesModified")]
    pub files_modified: Vec<String>,
}

/// Result of input validation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ValidationResult {
    pub ok: bool,
    pub reason: Option<String>,
    #[napi(js_name = "inputTokens")]
    pub input_tokens: Option<u32>,
}

/// Prepared data for compaction (before summarization)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct PreparedCompaction {
    #[napi(js_name = "inputTokens")]
    pub input_tokens: u32,
    pub metadata: CompactionMetadata,
    #[napi(js_name = "failuresSection")]
    pub failures_section: String,
    #[napi(js_name = "filesSection")]
    pub files_section: String,
}

// -----------------------------------------------------------------------------
// Token Estimation
// -----------------------------------------------------------------------------

/// Extract text from message content
fn extract_text_from_content(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|block| {
                if let serde_json::Value::Object(obj) = block {
                    if obj.get("type").and_then(|t| t.as_str()) == Some("text") {
                        return obj.get("text").and_then(|t| t.as_str()).map(String::from);
                    }
                }
                None
            })
            .collect::<Vec<_>>()
            .join("\n"),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

/// Estimate token count for a single message (~4 chars per token)
fn estimate_tokens_internal(message: &Message) -> u32 {
    let text = extract_text_from_content(&message.content);
    ((text.len() as f64 / 4.0).ceil()) as u32
}

/// Estimate token count for a message (~4 chars per token)
#[napi]
pub fn estimate_tokens(message: Message) -> u32 {
    estimate_tokens_internal(&message)
}

/// Estimate total tokens across multiple messages
#[napi]
pub fn estimate_messages_tokens(messages: Vec<Message>) -> u32 {
    messages.iter().map(|m| estimate_tokens_internal(m)).sum()
}

// -----------------------------------------------------------------------------
// Input Validation
// -----------------------------------------------------------------------------

/// Calculate the maximum input tokens for a given context window
#[napi]
pub fn calculate_max_input_tokens(context_window: u32) -> u32 {
    ((context_window as f64 / TOKEN_SAFETY_MARGIN) * MAX_INPUT_RATIO).floor() as u32
}

/// Check if messages can be compacted within the given context window
#[napi]
pub fn can_compact(messages: Vec<Message>, max_input_tokens: u32) -> ValidationResult {
    let raw_tokens = estimate_messages_tokens(messages);
    let input_tokens = ((raw_tokens as f64) * TOKEN_SAFETY_MARGIN).ceil() as u32;
    let effective_max = ((max_input_tokens as f64) * MAX_INPUT_RATIO).floor() as u32;

    if input_tokens > effective_max {
        ValidationResult {
            ok: false,
            reason: Some(format!(
                "Input ({} tokens) exceeds limit ({} tokens)",
                input_tokens, effective_max
            )),
            input_tokens: Some(input_tokens),
        }
    } else {
        ValidationResult {
            ok: true,
            reason: None,
            input_tokens: None,
        }
    }
}

// -----------------------------------------------------------------------------
// Metadata Extraction
// -----------------------------------------------------------------------------

/// Extract tool failures from messages
#[napi]
pub fn extract_tool_failures(messages: Vec<Message>) -> Vec<ToolFailure> {
    let mut failures = Vec::new();
    let mut seen = HashSet::new();

    for message in messages {
        if message.role != "toolResult" {
            continue;
        }
        if message.is_error != Some(true) {
            continue;
        }

        let tool_call_id = match &message.tool_call_id {
            Some(id) => id.clone(),
            None => continue,
        };

        if seen.contains(&tool_call_id) {
            continue;
        }
        seen.insert(tool_call_id.clone());

        let error_text = extract_text_from_content(&message.content);
        // Normalize whitespace
        let normalized: String = error_text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        let truncated = if normalized.is_empty() {
            "failed (no output)".to_string()
        } else if normalized.len() > MAX_FAILURE_CHARS {
            format!("{}...", &normalized[..MAX_FAILURE_CHARS - 3])
        } else {
            normalized
        };

        failures.push(ToolFailure {
            tool_call_id,
            tool_name: message.tool_name.unwrap_or_else(|| "tool".to_string()),
            error_summary: truncated,
            exit_code: message.details.as_ref().and_then(|d| d.exit_code),
        });
    }

    failures
}

/// Compute file lists from file operations
#[napi]
pub fn compute_file_lists(file_ops: FileOperations) -> FileListsResult {
    let modified: HashSet<_> = file_ops
        .edited
        .iter()
        .chain(file_ops.written.iter())
        .cloned()
        .collect();

    let mut files_read: Vec<_> = file_ops
        .read
        .into_iter()
        .filter(|f| !modified.contains(f))
        .collect();
    files_read.sort();

    let mut files_modified: Vec<_> = modified.into_iter().collect();
    files_modified.sort();

    FileListsResult {
        files_read,
        files_modified,
    }
}

// -----------------------------------------------------------------------------
// Summary Formatting
// -----------------------------------------------------------------------------

/// Format tool failures as a section to append to the summary
#[napi]
pub fn format_tool_failures_section(failures: Vec<ToolFailure>) -> String {
    if failures.is_empty() {
        return String::new();
    }

    let mut lines: Vec<String> = failures
        .iter()
        .take(MAX_TOOL_FAILURES)
        .map(|f| {
            let exit = f
                .exit_code
                .map(|c| format!(" (exit {})", c))
                .unwrap_or_default();
            format!("- {}{}: {}", f.tool_name, exit, f.error_summary)
        })
        .collect();

    if failures.len() > MAX_TOOL_FAILURES {
        lines.push(format!(
            "- ...and {} more",
            failures.len() - MAX_TOOL_FAILURES
        ));
    }

    format!("\n\n## Tool Failures\n{}", lines.join("\n"))
}

/// Format file operations as a section to append to the summary
#[napi]
pub fn format_file_operations_section(
    files_read: Vec<String>,
    files_modified: Vec<String>,
) -> String {
    let mut sections = Vec::new();

    if !files_read.is_empty() {
        sections.push(format!(
            "<read-files>\n{}\n</read-files>",
            files_read.join("\n")
        ));
    }
    if !files_modified.is_empty() {
        sections.push(format!(
            "<modified-files>\n{}\n</modified-files>",
            files_modified.join("\n")
        ));
    }

    if sections.is_empty() {
        String::new()
    } else {
        format!("\n\n{}", sections.join("\n\n"))
    }
}

// -----------------------------------------------------------------------------
// Compaction Preparation
// -----------------------------------------------------------------------------

/// Prepare compaction: validate input, extract metadata, format sections.
/// Returns data needed for the TypeScript layer to call the summarizer
/// and assemble the final result.
#[napi]
pub fn prepare_compaction(
    messages: Vec<Message>,
    file_ops: FileOperations,
    max_input_tokens: u32,
) -> napi::Result<PreparedCompaction> {
    // Calculate input tokens with safety margin
    let raw_tokens = estimate_messages_tokens(messages.clone());
    let input_tokens = ((raw_tokens as f64) * TOKEN_SAFETY_MARGIN).ceil() as u32;
    let effective_max = ((max_input_tokens as f64) * MAX_INPUT_RATIO).floor() as u32;

    // Validate input size
    if input_tokens > effective_max {
        return Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!(
                "Input too large to compact: {} tokens exceeds maximum {} tokens. Caller should reduce input size before attempting compaction.",
                input_tokens, max_input_tokens
            ),
        ));
    }

    // Extract metadata
    let tool_failures = extract_tool_failures(messages);
    let file_lists = compute_file_lists(file_ops);

    // Format sections
    let failures_section = format_tool_failures_section(tool_failures.clone());
    let files_section =
        format_file_operations_section(file_lists.files_read.clone(), file_lists.files_modified.clone());

    Ok(PreparedCompaction {
        input_tokens,
        metadata: CompactionMetadata {
            tool_failures,
            files_read: file_lists.files_read,
            files_modified: file_lists.files_modified,
        },
        failures_section,
        files_section,
    })
}

/// Assemble the final summary from the summarizer output and prepared sections
#[napi]
pub fn assemble_summary(
    summary: String,
    failures_section: String,
    files_section: String,
) -> String {
    format!("{}{}{}", summary, failures_section, files_section)
}

/// Get the token safety margin constant
#[napi]
pub fn get_token_safety_margin() -> f64 {
    TOKEN_SAFETY_MARGIN
}
