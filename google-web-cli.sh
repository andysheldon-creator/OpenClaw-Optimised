#!/bin/bash
# google_web - Simple AI-friendly CLI wrapper for web searches
# Uses Gemini search backend only

set -e

# Default configuration
BACKEND="gemini"
DEFAULT_GEMINI_PATH="/home/almaz/TOOLS/web_search_by_gemini/web-search-by-Gemini.sh"

# Show help
show_help() {
    cat << 'EOF'
🔍 Google Web Search CLI

Search the web using Gemini AI.

USAGE:
    google_web [OPTIONS] "<search query>"
    google_web --help
    google_web -h

OPTIONS:
    --timeout <seconds>         Set timeout (default: 30)
    --format <json|text>        Output format (default: json)
    --dry-run                   Show what would be executed without calling API
    --help, -h                  Show this help message

EXAMPLES:
    google_web "погода в Москве"
    google_web --dry-run "python tutorial"
    google_web --format text "capital of Japan"
    google_web -h

ENVIRONMENT VARIABLES:
    GEMINI_CLI_PATH      Path to Gemini CLI tool
    WEB_SEARCH_TIMEOUT   Default timeout in seconds

BACKEND:
    gemini    Uses Gemini CLI with web search capability

EXIT CODES:
    0    Success
    1    Generic error
    2    Backend not found
    3    Invalid query
    124  Timeout

OUTPUT FORMAT:
    Gemini backend returns JSON:
    {
      "session_id": "uuid",
      "response": "Search results in Russian",
      "stats": { "models": { ... } }
    }

    Text format returns plain text summary.

AI AGENT BEST PRACTICES:
    • Use for current information (weather, news, events)
    • Results always in Russian
    • 5-10 second typical response time
    • No caching (always fresh results)
    • Visual distinction: 🌐 Результат поиска:
    • On error, retry once with modified query

SEE ALSO:
    • SDD: docs/sdd/web-search-via-gemini-cli/
    • Tool: /home/almaz/TOOLS/web_search_by_gemini/README.md
EOF
    exit 0
}

# Error handler
error_exit() {
    echo "❌ ERROR: $1" >&2
    exit ${2:-1}
}

# Parse arguments
TIMEOUT="${WEB_SEARCH_TIMEOUT:-30}"
FORMAT="json"
DRY_RUN="false"
QUERY=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --help|-h)
            show_help
            ;;
        *)
            # Remaining arguments as query
            QUERY="$*"
            break
            ;;
    esac
done

# Validate query
if [[ -z "$QUERY" ]]; then
    error_exit "No search query provided. Use --help for usage information." 3
fi

if [[ ${#QUERY} -lt 3 ]]; then
    error_exit "Query too short. Minimum 3 characters required." 3
fi

# Determine CLI path
CLI_PATH="${GEMINI_CLI_PATH:-$DEFAULT_GEMINI_PATH}"

# Validate CLI exists
if [[ ! -f "$CLI_PATH" ]]; then
    error_exit "CLI not found at: $CLI_PATH\nSet GEMINI_CLI_PATH environment variable." 2
fi

# Build command
CMD="\"$CLI_PATH\" --request \"$QUERY\""


# Add timeout if supported
if [[ -n "$TIMEOUT" ]]; then
    CMD="timeout ${TIMEOUT}s $CMD"
fi

# Execute
if [[ "$DRY_RUN" == "true" ]]; then
    echo "📝 DRY RUN MODE"
    echo "🐛 DEBUG: CLI=$CLI_PATH"
    echo "🐛 DEBUG: Timeout=${TIMEOUT}s"
    echo "🐛 DEBUG: Query=$QUERY"
    echo "🐛 DEBUG: Command=$CMD"
    echo "✓ Would execute: $CMD"
    echo "✓ Query: $QUERY"
    exit 0
fi

# Set format for backend
export WEB_SEARCH_OUTPUT_FORMAT="$FORMAT"

# Execute and capture output
if [[ "$FORMAT" == "text" ]]; then
    # For text format, extract just the response
    eval "$CMD" 2>/dev/null | grep -o '"response":"[^"]*"' | sed 's/"response":"//' | sed 's/"$//' | sed 's/\\n/\n/g'
else
    # Default JSON output
    eval "$CMD"
fi

exit_code=$?

# Handle specific exit codes
case $exit_code in
    124)
        error_exit "Search timed out after ${TIMEOUT} seconds" 124
        ;;
    127)
        error_exit "Command not found: $CLI_PATH" 2
        ;;
esac

exit $exit_code
