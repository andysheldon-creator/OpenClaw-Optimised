---
name: claude-code
description: "Claude Code CLI integration for all coding tasks. Auto-detects coding requests, provides templates, Ralph Loop integration, and enforcement mechanisms to ensure Claude Code usage."
metadata: 
  {
    "openclaw": {
      "emoji": "🤖",
      "requires": { "bins": ["claude"] },
      "install": [
        {
          "id": "manual",
          "kind": "manual",
          "label": "Install Claude Code CLI",
          "url": "https://docs.anthropic.com/en/docs/claude-code/getting-started"
        }
      ]
    }
  }
---

# Claude Code CLI Integration

**🚨 CRITICAL RULE: For ANY coding task, use Claude Code CLI — NEVER write code manually!**

This skill provides comprehensive Claude Code CLI integration with auto-detection, templates, and enforcement mechanisms to ensure proper coding workflow.

## 🎯 Core Features

- **Auto-detection** of coding requests with automatic redirection to Claude Code
- **Ralph Loop integration** for autonomous development workflows  
- **Templates** for common coding scenarios (TDA, skills, debugging)
- **Enforcement mechanisms** to prevent manual coding
- **Validation tools** for compliance checking

---

## 🔍 Auto-Detection Patterns

The following request patterns automatically trigger Claude Code usage:

### Coding Actions
- **File operations**: "create file", "edit code", "update script"  
- **Development tasks**: "implement", "build", "develop", "code"
- **Bug fixes**: "fix bug", "debug", "resolve error", "troubleshoot"
- **Features**: "add feature", "create function", "build component"

### File Extensions
- **Source code**: `.py`, `.js`, `.ts`, `.java`, `.go`, `.rs`, `.cpp`
- **Web**: `.html`, `.css`, `.scss`, `.vue`, `.react`
- **Config**: `.json`, `.yaml`, `.toml`, `.xml`, `.env`
- **Scripts**: `.sh`, `.ps1`, `.bat`

### Keywords
- "refactor", "optimize", "review code", "test", "deploy"
- "API", "database", "frontend", "backend", "full-stack"
- "git", "commit", "PR", "pull request", "merge"

---

## 📚 Usage Templates

### Basic Claude Code Usage

```bash
# Navigate to project directory
cd /path/to/project

# Simple task
claude "Add error handling to the user authentication function"

# Complex feature  
claude "Build a REST API endpoint for user management with proper validation"

# Code review
claude "Review this PR for security issues and best practices"
```

### Ralph Loop Integration

```bash
# Initialize Ralph Loop project
mkdir my-project && cd my-project
cat > .ralph/PROMPT.md << 'EOF'
# Project: My Application

## Requirements
- Build user authentication system
- Implement CRUD operations
- Add comprehensive testing

## Success Criteria  
- All tests pass
- Security best practices followed
- Documentation complete
EOF

# Start autonomous development
ralph --monitor
```

### TDA Development Template

```bash
# TDA-specific development workflow
gh auth switch --user oksana-siniaieva
cd /path/to/tdamonorepo

claude "TDA Development Task: [DESCRIPTION]

CONTEXT:
- Java 21, Maven, Jersey, JOOQ stack
- Microservices architecture (70+ services)  
- ConfigData pattern for configuration
- DiModule for dependency injection
- Follow TDA coding standards

DELIVERABLES:
1. Implement feature with proper error handling
2. Add comprehensive unit tests
3. Update API documentation  
4. Ensure monitoring integration

Start by analyzing existing patterns in this codebase."
```

### Skill Development Template

```bash
# OpenClaw skill creation
cd ~/projects/openclaw
claude "Create OpenClaw Skill: [SKILL-NAME]

PURPOSE: [DESCRIPTION]

REQUIREMENTS:
1. Follow OpenClaw skill patterns from existing skills
2. Include proper frontmatter with metadata
3. Clear usage instructions and examples  
4. Integration documentation
5. Error handling guidance

STRUCTURE:
- SKILL.md with complete documentation
- Supporting files if needed
- Follow naming conventions

Analyze existing skills first, then create comprehensive documentation."
```

---

## 🛡️ Enforcement System

### Compliance Checker Script

```bash
#!/bin/bash
# claude-code-compliance.sh
# Run this before any coding work

check_coding_compliance() {
    local action="$1"
    local file="$2"
    
    # Detect coding activities
    if [[ "$action" =~ (edit|create|modify|update) ]] && [[ "$file" =~ \.(py|js|java|ts|go|rs)$ ]]; then
        echo "❌ CODING VIOLATION DETECTED!"
        echo "📝 Task: $action $file"  
        echo "✅ SOLUTION: Use Claude Code instead"
        echo "   cd $(dirname $file) && claude 'Edit $(basename $file) to [describe changes]'"
        return 1
    fi
    
    return 0
}

# Usage: check_coding_compliance "edit" "src/main.py"
```

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit
# Ensure Claude Code compliance

echo "🔍 Checking Claude Code compliance..."

# Check for .claude_history or similar markers
if [[ ! -f ".claude_history" ]] && git diff --cached --name-only | grep -E '\.(py|js|java|ts|go|rs)$' > /dev/null; then
    echo "❌ MANUAL CODING DETECTED!"
    echo "ℹ️  No Claude Code session found for code changes"
    echo "✅ Use: claude 'Your development task' before committing"
    exit 1
fi

echo "✅ Compliance check passed"
```

---

## 🔄 Workflow Integration

### Daily Coding Workflow

```bash
# Morning setup
function setup_coding_session() {
    local project_dir="$1"
    local task="$2"
    
    echo "🚀 Starting Claude Code session: $task"
    
    # Validate environment
    if ! command -v claude &> /dev/null; then
        echo "❌ Claude Code not installed"
        return 1
    fi
    
    # Navigate to project
    cd "$project_dir" || return 1
    
    # Start session
    claude "$task"
}

# Usage: setup_coding_session ~/projects/myapp "Add user authentication"
```

### Overnight Autonomous Development

```bash
#!/bin/bash
# overnight-development.sh
# Set up Ralph Loop for autonomous coding

setup_overnight_coding() {
    local project_name="$1"
    local requirements="$2"
    
    # Create project structure
    mkdir -p "$project_name"/{src,tests,docs,.ralph}
    cd "$project_name"
    
    # Initialize git
    git init
    echo "*.log" > .gitignore
    
    # Set up Ralph Loop
    cat > .ralph/PROMPT.md << EOF
# $project_name - Autonomous Development

## Requirements
$requirements

## Development Standards
- Write comprehensive tests
- Follow best practices
- Document all APIs
- Ensure security compliance

## Success Criteria
- All functionality implemented
- Tests achieve >90% coverage
- Code passes security scan
- Documentation complete
EOF
    
    cat > .ralph/config.yaml << EOF
project: $project_name
max_iterations: 50
checkpoint_interval: 10
auto_commit: true
validation:
  run_tests: true
  check_style: true
monitoring:
  progress_file: .ralph/progress.json
  log_file: .ralph/execution.log
EOF
    
    # Start autonomous development
    ralph --monitor --config .ralph/config.yaml &
    echo "🤖 Autonomous development started for $project_name"
}
```

---

## 📊 Progress Monitoring  

### Ralph Loop Dashboard

```bash
#!/bin/bash
# ralph-dashboard.sh
# Monitor autonomous development progress

show_ralph_dashboard() {
    local project_path="$1"
    
    echo "📊 Ralph Loop Dashboard - $(basename $project_path)"
    echo "================================================"
    
    # Check Ralph status
    if pgrep -f "ralph.*$project_path" > /dev/null; then
        echo "🟢 Status: ACTIVE"
    else
        echo "🔴 Status: INACTIVE"  
    fi
    
    # Show progress
    if [[ -f "$project_path/.ralph/progress.json" ]]; then
        echo "📈 Progress:"
        jq -r '"Iteration: " + (.iteration|tostring) + "/" + (.max_iterations|tostring)' \
            "$project_path/.ralph/progress.json"
        jq -r '"Tasks: " + (.completed_tasks|tostring) + " completed, " + (.remaining_tasks|tostring) + " remaining"' \
            "$project_path/.ralph/progress.json"
    fi
    
    # Show recent activity
    if [[ -f "$project_path/.ralph/execution.log" ]]; then
        echo "📝 Recent Activity:"
        tail -5 "$project_path/.ralph/execution.log"
    fi
}
```

### Notion Integration

```bash
#!/bin/bash
# Update Notion task progress

update_notion_coding_task() {
    local task_id="$1"
    local status="$2"
    local progress="$3"
    
    curl -X PATCH "https://api.notion.com/v1/pages/$task_id" \
        -H "Authorization: Bearer $NOTION_API_KEY" \
        -H "Notion-Version: 2022-06-28" \
        -H "Content-Type: application/json" \
        -d "{
            \"properties\": {
                \"Status\": {\"status\": {\"name\": \"$status\"}},
                \"Progress\": {\"rich_text\": [{\"text\": {\"content\": \"$progress\"}}]}
            }
        }"
}
```

---

## 🔧 Advanced Patterns

### Multi-Repository Management

```bash
# Work across multiple repos with Claude Code
function multi_repo_coding() {
    local repos=("$@")
    
    for repo in "${repos[@]}"; do
        echo "🔄 Processing $repo..."
        cd "$repo" || continue
        
        # Check if Claude Code session needed
        if git status --porcelain | grep -E '\.(py|js|java|ts)$' > /dev/null; then
            echo "📝 Code changes detected in $repo"
            claude "Review and improve the recent changes in this repository"
        fi
    done
}

# Usage: multi_repo_coding ~/projects/app1 ~/projects/app2
```

### Continuous Integration Integration  

```yaml
# .github/workflows/claude-code-quality.yml
name: Claude Code Quality Check

on: [push, pull_request]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check for Claude Code markers
        run: |
          if [ ! -f ".claude_history" ] && git diff --name-only HEAD~1 | grep -E '\.(py|js|java|ts)$' > /dev/null; then
            echo "❌ Manual coding detected - Claude Code required"
            exit 1
          fi
          echo "✅ Claude Code compliance verified"
      
      - name: Validate code quality  
        run: |
          # Run additional quality checks here
          echo "🔍 Code quality validation passed"
```

---

## 📝 Best Practices

### DO's ✅
- **Always start with Claude Code** for any coding task
- **Use templates** for common scenarios (TDA, skills, debugging)  
- **Set up Ralph Loop** for overnight autonomous development
- **Monitor progress** with dashboard tools
- **Update Notion** with task progress
- **Follow established patterns** from existing projects

### DON'Ts ❌
- **Never write code manually** - always use Claude Code
- **Don't start Claude Code in ~/clawd/** (reads soul docs)
- **Don't work in live OpenClaw directory** for PRs
- **Don't skip validation** checks before committing
- **Don't ignore enforcement** warnings

### Error Recovery
```bash
# When Claude Code isn't available
if ! command -v claude &> /dev/null; then
    echo "⚠️ EMERGENCY: Claude Code unavailable"
    echo "📝 Document manual work: echo 'Manual work: [task]' >> emergency.log"
    echo "🔄 Review with Claude Code when restored"
fi
```

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Simple feature | `claude "Add user login validation"` |
| Complex project | `ralph --monitor` |
| TDA development | Use TDA template with work account |
| Skill creation | Use OpenClaw skill template |
| Bug fix | `claude "Debug and fix [issue description]"` |
| Code review | `claude "Review this PR for security and best practices"` |
| Multi-file refactor | `claude "Refactor authentication system across all files"` |

**Remember: Claude Code orchestrates. You validate and deploy. Never break this pattern!**

---

## 🔗 Related Resources

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code/getting-started)
- [Ralph Loop Repository](https://github.com/ralphloop/ralph)  
- [OpenClaw Skills Documentation](/docs/skills)
- [TDA Development Guidelines](internal)

---

*This skill ensures 100% compliance with proper Claude Code usage for all coding activities.*