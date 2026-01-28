---
name: "Review: Branch"
description: Review code changes on current branch against main for errors and quality
category: Review
tags: [review, code-quality, git]
---

Perform a comprehensive code review of changes made on the current branch compared to the main branch.

**Input**: Optional flags after `/review:branch`:
- `--strict`: Treat all warnings as errors
- `--focus <area>`: Focus on specific area (security, performance, style, tests)

**Steps**

1. **Gather Branch Context**

   ```bash
   git rev-parse --abbrev-ref HEAD
   git merge-base main HEAD
   ```

   Identify the current branch and the merge-base with main to understand the scope of changes.

2. **Get Changed Files**

   ```bash
   git diff --name-status main...HEAD
   ```

   Parse the diff to identify:
   - **A**: Added files (new code to review thoroughly)
   - **M**: Modified files (review changes in context)
   - **D**: Deleted files (verify safe removal)
   - **R**: Renamed files (check for breaking changes)

3. **Get Full Diff**

   ```bash
   git diff main...HEAD
   ```

   Retrieve the complete diff for detailed analysis.

4. **Initialize Review Report**

   Create a report structure with categories:
   - **CRITICAL**: Bugs, security issues, breaking changes (must fix)
   - **ERROR**: Logic errors, missing error handling, test failures (should fix)
   - **WARNING**: Code smells, potential issues, missing tests (consider fixing)
   - **SUGGESTION**: Style improvements, refactoring opportunities (nice to have)
   - **PRAISE**: Well-written code, good patterns (acknowledge good work)

5. **Review Each Changed File**

   For each file in the diff:

   **5a. Read the full file** (not just the diff) to understand context:
   ```
   Read the complete file to understand surrounding code
   ```

   **5b. Code Quality Checks**:
   - Syntax errors or obvious bugs
   - Unhandled edge cases
   - Missing null/undefined checks where needed
   - Hardcoded values that should be constants/config
   - Dead code or unreachable branches
   - Console.log/debug statements left in
   - TODO/FIXME comments without issue references

   **5c. Security Checks**:
   - Command injection vulnerabilities
   - SQL injection risks
   - XSS vulnerabilities
   - Hardcoded secrets or credentials
   - Insecure randomness
   - Path traversal risks
   - Unsafe deserialization

   **5d. Error Handling**:
   - Uncaught promise rejections
   - Missing try/catch where needed
   - Generic catch blocks swallowing errors
   - Missing error propagation
   - Inconsistent error types

   **5e. Performance Considerations**:
   - N+1 query patterns
   - Unnecessary re-renders (React)
   - Memory leaks (event listeners not cleaned up)
   - Inefficient algorithms
   - Missing caching opportunities
   - Synchronous operations that should be async

   **5f. Test Coverage**:
   - New code without corresponding tests
   - Modified behavior without test updates
   - Edge cases not covered
   - Missing error case tests

6. **Compare Against Codebase Patterns**

   For each changed file, find similar files in the codebase:

   **6a. Pattern Discovery**:
   - Use Glob to find files with similar names/extensions
   - Read 2-3 similar files to understand existing patterns

   **6b. Consistency Checks**:
   - File naming conventions
   - Directory structure adherence
   - Import ordering and style
   - Error handling patterns
   - Logging conventions
   - Type definitions style
   - Function/method organization
   - Comment style and documentation

   **6c. Flag Deviations**:
   - If new code deviates significantly from existing patterns, add WARNING
   - Include examples from existing code showing the expected pattern

7. **Check Commit Quality**

   ```bash
   git log main..HEAD --oneline
   ```

   Review commit messages for:
   - Clear, descriptive messages
   - Conventional commit format if used in project
   - Atomic commits (one change per commit)
   - No WIP or fixup commits that should be squashed

8. **Verify Build and Lint**

   If applicable, note whether:
   - Code passes type checking
   - Code passes linting
   - Tests pass

   Do NOT run these commands automatically - just note if they should be run.

9. **Generate Review Report**

   **Summary Header**:
   ```
   ## Code Review: <branch-name>

   **Branch**: <current-branch> -> main
   **Commits**: <count> commits
   **Files Changed**: <count> (+<added> -<removed> ~<modified>)
   **Lines Changed**: +<additions> -<deletions>
   ```

   **Overview**:
   ```
   ### Overview
   | Category   | Count |
   |------------|-------|
   | Critical   | X     |
   | Error      | X     |
   | Warning    | X     |
   | Suggestion | X     |
   | Praise     | X     |
   ```

   **File-by-File Review**:
   For each file with issues:
   ```
   ### `path/to/file.ts`

   **CRITICAL**: <issue description>
   - Location: `file.ts:123-125`
   - Problem: <detailed explanation>
   - Fix: <specific recommendation>

   **WARNING**: <issue description>
   - Location: `file.ts:45`
   - Concern: <explanation>
   - Suggestion: <how to improve>
   ```

   **Positive Highlights**:
   ```
   ### What's Good
   - <praise item with file reference>
   - <praise item with file reference>
   ```

   **Checklist Before Merge**:
   ```
   ### Pre-Merge Checklist
   - [ ] All CRITICAL issues resolved
   - [ ] All ERROR issues resolved
   - [ ] Tests added/updated for new behavior
   - [ ] Run `pnpm build` - passes
   - [ ] Run `pnpm check` - passes
   - [ ] Run `pnpm test` - passes
   ```

   **Final Verdict**:
   - If CRITICAL issues: "**BLOCKED**: X critical issue(s) must be fixed before merge"
   - If ERROR issues: "**NEEDS WORK**: Y error(s) should be addressed"
   - If only warnings: "**APPROVED WITH SUGGESTIONS**: Ready to merge, Z suggestion(s) to consider"
   - If clean: "**APPROVED**: Clean code, ready to merge"

**Review Principles**

- **Be Specific**: Every issue must reference exact file:line locations
- **Be Actionable**: Every issue must include how to fix it
- **Be Fair**: Acknowledge good code, not just problems
- **Be Consistent**: Apply the same standards the codebase already follows
- **Prioritize**: Focus on correctness > security > maintainability > style
- **Context Matters**: Consider the scope and urgency of the change

**False Positive Avoidance**

- Don't flag intentional deviations that are improvements
- Don't nitpick formatting if linter handles it
- Don't require tests for trivial changes
- Don't flag patterns that the codebase consistently uses (even if non-standard)
- When uncertain, use SUGGESTION not ERROR

**Output Format**

Use clear markdown with:
- Tables for summaries
- Code blocks for examples
- `file.ts:123` format for locations
- Grouped issues by severity within each file
- Diff snippets where helpful to show context
