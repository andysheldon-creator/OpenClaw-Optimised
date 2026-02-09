## Jira CLI Skill Design (OpenClaw)

### 1. Goal and Scope

**Goal:** Provide an OpenClaw skill that uses `jira-cli` (running inside Docker) to perform Jira actions, starting with a guided **“create issue” flow**. The flow should:

- Let the user describe a task in natural language.
- Dynamically list Jira entities (projects, boards, applications, sprints, assignees) and let the user choose.
- Create a Jira issue in the selected project/board.
- Attach an “application” value (e.g. `ai_language`) in a configurable way.
- Optionally assign the issue to a user.
- Optionally pull the issue into a running sprint by name.

**Non-goals for v1:**

- Managing epics, worklogs, or releases.
- Arbitrary JQL browsing/complex reporting.

The design must remain flexible so that projects, boards, application values, and sprint names can change without code changes (only configuration and/or live discovery).

### 2. High-Level User Flow

Entry: OpenClaw invokes the Jira skill when the user asks to create a Jira ticket or calls a dedicated tool (e.g. `jira_create_issue_flow`).

Steps:

1. **Collect basic details**
   - Ask for summary (required).
   - Ask for description (optional, but encouraged).
   - Optional: type (default `Task`) and priority (default `Medium`), with ability to override.
2. **Select project**
   - Call helper `jira_list_projects()` to fetch available projects (via `jira-cli`).
   - Show a short list (favoring favorites or last-used projects from config).
   - User selects a project key (e.g. `BRLB`).
3. **Select board**
   - Call `jira_list_boards(projectKey)` to fetch boards for the project.
   - Show list by board name (e.g. “AI Vision Language”).
   - Selected board determines backlog and sprint context.
4. **Select application**
   - Call `jira_list_applications(projectKey)`:
     - Implementation depends on how “application” is represented (labels, components, or a custom field).
   - User chooses an application value (e.g. `ai_language`).
5. **Select assignee**
   - Ask whether to:
     - Leave unassigned,
     - Assign to “me”,
     - Assign to another user.
   - For non-trivial choices, use `jira_list_assignees(query)` to help narrow candidates, then let the user pick.
6. **Sprint decision**
   - Ask: “Should this go into a sprint now, or stay in backlog?”
   - If backlog: stop here (issue will live in the board’s backlog).
   - If sprint:
     - Call `jira_list_sprints(boardId)` to fetch sprints.
     - Show active/future sprints (by name) for the selected board.
     - User chooses a sprint by name.
7. **Execute**
   - Create the issue via `jira-cli` in the Docker container.
   - Encode the application value via label/component/custom field.
   - Set assignee if requested.
   - If sprint selected, add issue to sprint.
8. **Summarize result**
   - Return structured result to OpenClaw:
     - Issue key, URL, project, board, application, assignee, sprint (if any).
   - Provide a short natural-language confirmation for the user.

### 3. Components and Responsibilities

#### 3.1 Skill Module

Location (conceptual): `skills/jira-cli-bridge.ts`.

Exports:

- `jira_create_issue_flow` (primary conversational tool).
- Helper tools:
  - `jira_list_projects()`
  - `jira_list_boards(projectKey: string)`
  - `jira_list_applications(projectKey: string)`
  - `jira_list_sprints(boardId: string)`
  - `jira_list_assignees(query: string)`

All of these use a shared internal helper:

- `runJiraCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>`
  - Executes `docker exec <containerName> jira ...`.
  - Container name is read from config (see below).

#### 3.2 Configuration

Config file (example): `config/jira-cli.json`

Shape:

```json
{
  "containerName": "jira-cli-brlb",
  "defaultIssueType": "Task",
  "defaultPriority": "Medium",
  "applicationFieldType": "label",
  "applicationFieldKey": "application",
  "favoriteProjects": ["BRLB"],
  "defaultBoards": {
    "BRLB": "AI Vision Language"
  }
}
```

Semantics:

- **containerName**: Docker container name/ID that has `jira-cli` installed and configured via `jira init`.
- **defaultIssueType / defaultPriority**: Defaults when user omits these.
- **applicationFieldType**:
  - `"label"`: application is represented as a label.
  - `"component"`: application is represented as a Jira component.
  - `"customField"`: application is represented via a specific Jira custom field.
- **applicationFieldKey**:
  - For `"label"`/`"component"`: a generic key; actual value is the chosen application (e.g. `ai_language`).
  - For `"customField"`: Jira custom field ID (e.g. `"customfield_12345"`).
- **favoriteProjects / defaultBoards**:
  - Used by the flow to preselect or prioritize certain projects/boards, but never hardcode them in logic.

This design allows future changes (different projects, boards, application encodings) to be handled by updating config, not flow logic.

### 4. Helper Tools → jira-cli Command Mapping

#### 4.1 `jira_list_projects`

- Command:
  - `jira project list --plain --no-headers --delimiter '|'`
- Parsing:
  - Each line → `{ key, name }`.
  - Use a simple delimiter-based split with trimming.
- Output (for the tool):
  - Array of `{ key: string; name: string }`.

#### 4.2 `jira_list_boards(projectKey)`

- Command (depending on jira-cli capabilities):
  - `jira board list --project <projectKey> --plain --no-headers --delimiter '|'`
- Parsing:
  - Each line → `{ id, name, type }` (type may be `Scrum`, `Kanban`, etc.).
- Output:
  - Array of `{ id: string; name: string; type?: string }`.

#### 4.3 `jira_list_applications(projectKey)`

This is intentionally flexible; actual implementation depends on how “application” is modeled in Jira.

Options:

- **Label-based (recommended v1)**:
  - Sample issues in the project via:
    - `jira issue list -p<projectKey> --plain --columns LABELS --no-headers`
  - Parse labels, extract unique values, filter by naming convention (e.g. labels starting with `app_`).
- **Component-based**:
  - Use a project view command or sample issues to discover components.
- **Custom-field based**:
  - Treat possible applications as configured options; no discovery needed.

Output:

- Array of `{ value: string; label: string }` for user-facing choices.
- The create flow uses `value` to encode the final issue.

#### 4.4 `jira_list_sprints(boardId)`

- Command (subject to exact jira-cli syntax):
  - `jira sprint list --table --plain --no-headers --delimiter '|'`
  - Optionally filter by board if supported by jira-cli.
- Parsing:
  - Each line → `{ id, name, state, startDate?, endDate? }`.
- Output:
  - Array of `{ id: string; name: string; state: 'active' | 'future' | 'closed' | string }`.
- The flow usually shows only `active` and `future` sprints when asking the user.

#### 4.5 `jira_list_assignees(query)`

Simplest v1 (approximate, JQL-based approach):

- Command:
  - `jira issue list -q "assignee ~ \"${query}\"" --plain --columns ASSIGNEE --no-headers`
- Parsing:
  - Deduplicate assignee names/emails from results.
- Output:
  - Array of `{ displayName: string; accountId?: string; email?: string }`.

This can later be replaced with a dedicated user search command if available in jira-cli.

### 5. Create-Issue Flow → jira-cli Commands

#### 5.1 Issue Creation

Given:

- `projectKey`
- `summary`
- `description`
- `type` (e.g. `Task`)
- `priority`
- `application` (e.g. `ai_language`)

Build a `jira issue create` command:

- Base:
  - `jira issue create -p<projectKey> -t<TYPE> -s"<SUMMARY>" -y<PRIORITY> --no-input`
- Description:
  - Pass via stdin template:
    - `jira issue create ... --template -`
    - Pipe the description content from the skill into stdin.
- Application encoding:
  - **If `applicationFieldType = "label"`**:
    - Add `-l<application>` (label name).
  - **If `component`**:
    - Add `-C<application>`.
  - **If `customField`**:
    - Use `--custom <fieldId>=<application>` (exact syntax to be confirmed against jira-cli docs).

Parse stdout for the created issue key (jira-cli usually prints the key or URL). If parsing fails, surface a clear error to the user.

#### 5.2 Assign Issue

If the user chose an assignee:

- **Assign to self**:
  - `jira issue assign <KEY> $(jira me)`
- **Assign to specific user**:
  - `jira issue assign <KEY> "<DISPLAY_NAME_OR_EMAIL>"`

If assignment fails (unknown user, permission issues), return the issue key but include an explicit warning that it is unassigned.

#### 5.3 Add Issue to Sprint

If the user chose to add the issue to a sprint:

1. Use `jira_list_sprints(boardId)` to fetch list.
2. Find sprint whose `name` matches the user’s choice (exact or case-insensitive).
3. Call:
   - `jira sprint add <SPRINT_ID> <KEY>`

If no matching sprint is found, ask the user to re-select from the updated list or skip sprint step.

### 6. Error Handling and Resilience

Classes of errors and handling:

- **Docker / CLI not available**:
  - If `docker exec` fails: return a high-level error (“Jira CLI container not reachable”) with stderr for debugging, and advise checking that the container is running and `jira init` is configured.

- **Authentication / 4xx from Jira**:
  - Parse stderr for hints like `404`, `401`, or “Received unexpected response”.
  - Surface a concise message and recommend re-running `jira init` inside the container.

- **Validation errors**:
  - Missing summary, invalid project/board/application/sprint selection:
    - Enforce validation before invoking CLI.
    - Re-prompt user to correct inputs.

- **Partial success**:
  - If issue creation succeeds but sprint add or assign fails:
    - Return success for issue creation plus an explicit note about which follow-up step failed, including raw stderr for debugging.

- **Parsing failures**:
  - If parsing `--plain` output fails due to format change:
    - Fail fast with a clear message: “Could not parse jira-cli output; CLI version may have changed.”

### 7. Testing Strategy

**Unit tests:**

- Mock `runJiraCli` to:
  - Return canned outputs for projects, boards, applications, sprints, assignees.
  - Simulate successful and failing `issue create`, `assign`, and `sprint add`.
- Validate:
  - Parsing correctness for all helpers.
  - State transitions and branching in `jira_create_issue_flow`.
  - Error handling for common failure cases (no sprint match, bad assignee, CLI error).

**Integration tests (optional, local-only):**

- Run against a sandbox Jira project in the existing Docker+jira-cli setup:
  - Create issue in sandbox project.
  - Add to sandbox sprint.
  - Assign to a test user.
- Ensure tests are clearly marked and not run by default in CI unless environment permits.

### 8. Extensibility Notes

Future enhancements that this design supports:

- Adding read-only flows (e.g. “list my issues”, “show details for KEY-123”) using the same execution bridge.
- Adding epic/sprint/release management via additional tools mapped to `jira epic ...`, `jira sprint ...`, `jira release ...`.
- Supporting multiple Jira instances by:
  - Using multiple configs (separate `containerName`s and/or config files).
  - Letting the user select which instance to use at the start of the flow.

The core principle is to keep **conversation and choice logic in OpenClaw**, and **Jira behavior in jira-cli + Jira configuration**, with a thin, well-typed bridge between them.
