# Jira CLI Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement an OpenClaw Jira skill that talks to `jira-cli` running in Docker to create issues with a guided flow (project, board, application, assignee, optional sprint).

**Architecture:** A TypeScript skill module (`jira-cli` bridge) exposes a high-level `jira_create_issue_flow` tool plus low-level helper tools. All tools shell out to a configured Docker container that runs `jira` with `--plain` output; configuration (container name, defaults, application modeling) is read from a JSON config file. The flow logic stays in OpenClaw; Jira details live in jira-cli + Jira configuration.

**Tech Stack:** TypeScript (ESM), OpenClaw skill/tool system, Node child_process or equivalent shell abstraction, Docker, `jira-cli`.

---

### Task 1: Create Jira CLI config file

**Files:**

- Create: `config/jira-cli.json` (or the repo’s canonical config location for skills, e.g. `src/config/jira-cli.json` if that pattern exists)

**Step 1: Add config file**

Create a JSON config with at least:

```json
{
  "containerName": "jira-cli",
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

Adjust the default `containerName` and favorites as appropriate for your environment.

**Step 2: No tests yet**

No code yet, so nothing to run here.

---

### Task 2: Implement `runJiraCli` Docker helper

**Files:**

- Create or modify: `src/infra/jira-cli/docker.ts` (or similar infra/tooling area agreed for external CLIs)
- Test: `src/infra/jira-cli/docker.test.ts`

**Step 1: Write failing test**

Add tests that:

- Load config (mocked) to get `containerName`.
- Call `runJiraCli(['project', 'list', '--help'])`.
- Assert:
  - It constructs and invokes `docker exec <containerName> jira project list --help`.
  - It returns `{ stdout, stderr, exitCode }` from the underlying process.

Use your project’s standard test runner (Vitest) and mocking for child_process or shell abstraction.

**Step 2: Run tests to see failure**

Run:

```bash
pnpm test src/infra/jira-cli/docker.test.ts
```

Expect: tests fail because `runJiraCli` does not exist.

**Step 3: Implement `runJiraCli`**

Implement:

```ts
export interface JiraCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runJiraCli(args: string[]): Promise<JiraCliResult> {
  // 1. Read config.jiraCli.containerName
  // 2. Build: ["exec", containerName, "jira", ...args]
  // 3. Use existing process/command helper (preferred) or child_process.spawn
  // 4. Collect stdout/stderr, resolve with exitCode
}
```

Ensure:

- Arguments are passed without shell interpolation issues.
- Newlines are preserved in stdout for parsing.

**Step 4: Re-run tests**

Run:

```bash
pnpm test src/infra/jira-cli/docker.test.ts
```

Expect: tests pass.

**Step 5: Commit**

```bash
git add config/jira-cli.json src/infra/jira-cli/docker.ts src/infra/jira-cli/docker.test.ts
git commit -m "infra: add jira-cli docker bridge"
```

---

### Task 3: Implement list helper: projects

**Files:**

- Create: `src/infra/jira-cli/projects.ts`
- Test: `src/infra/jira-cli/projects.test.ts`

**Step 1: Write failing tests**

Add tests for `jira_list_projects()` that:

- Mock `runJiraCli` to return sample `--plain --no-headers --delimiter '|'` output, e.g.:

```text
BRLB|BRI Lab Board
ABC|Another Project
```

- Expect the function to return:

```ts
[
  { key: "BRLB", name: "BRI Lab Board" },
  { key: "ABC", name: "Another Project" },
];
```

Add a test for empty stdout returning an empty array.

**Step 2: Run tests**

```bash
pnpm test src/infra/jira-cli/projects.test.ts
```

Expect failures: function not implemented.

**Step 3: Implement `jira_list_projects`**

Implement:

```ts
export interface JiraProject {
  key: string;
  name: string;
}

export async function jira_list_projects(): Promise<JiraProject[]> {
  const { stdout, exitCode, stderr } = await runJiraCli([
    "project",
    "list",
    "--plain",
    "--no-headers",
    "--delimiter",
    "|",
  ]);
  if (exitCode !== 0) {
    throw new Error(`jira project list failed: ${stderr || stdout}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, name] = line.split("|");
      return { key: key.trim(), name: (name ?? "").trim() };
    });
}
```

**Step 4: Re-run tests**

```bash
pnpm test src/infra/jira-cli/projects.test.ts
```

Expect: passing.

**Step 5: Commit**

```bash
git add src/infra/jira-cli/projects.ts src/infra/jira-cli/projects.test.ts
git commit -m "infra: add jira-cli projects listing"
```

---

### Task 4: Implement list helpers: boards, sprints, applications, assignees

**Files:**

- Create:
  - `src/infra/jira-cli/boards.ts`
  - `src/infra/jira-cli/sprints.ts`
  - `src/infra/jira-cli/applications.ts`
  - `src/infra/jira-cli/assignees.ts`
- Tests:
  - `src/infra/jira-cli/boards.test.ts`
  - `src/infra/jira-cli/sprints.test.ts`
  - `src/infra/jira-cli/applications.test.ts`
  - `src/infra/jira-cli/assignees.test.ts`

**Step 1: Write failing tests**

For each helper, add tests that:

- Mock `runJiraCli` with representative `--plain` outputs.
- Assert that returned arrays of typed objects are parsed correctly.
- Cover empty outputs and malformed lines (ignored or error, as you decide).

Examples:

- `jira_list_boards(projectKey)` calls `jira board list --project <projectKey> --plain --no-headers --delimiter '|'`.
- `jira_list_sprints(boardId)` calls `jira sprint list --table --plain --no-headers --delimiter '|'`.
- `jira_list_applications(projectKey)` for v1:
  - Can call `jira issue list -p<projectKey> --plain --columns LABELS --no-headers`.
  - Parse labels and extract unique application values.
- `jira_list_assignees(query)`:
  - `jira issue list -q "assignee ~ \"${query}\"" --plain --columns ASSIGNEE --no-headers`.

**Step 2: Run tests**

```bash
pnpm test src/infra/jira-cli/boards.test.ts src/infra/jira-cli/sprints.test.ts src/infra/jira-cli/applications.test.ts src/infra/jira-cli/assignees.test.ts
```

Expect failures due to missing implementations.

**Step 3: Implement helpers**

Implement each helper by:

- Building the appropriate arg array for `runJiraCli`.
- Checking `exitCode` and throwing on non-zero.
- Parsing stdout lines with `|` delimiter and trimming.
- Returning strongly typed arrays.

**Step 4: Re-run tests**

```bash
pnpm test src/infra/jira-cli/boards.test.ts src/infra/jira-cli/sprints.test.ts src/infra/jira-cli/applications.test.ts src/infra/jira-cli/assignees.test.ts
```

Expect: passing.

**Step 5: Commit**

```bash
git add src/infra/jira-cli/*.ts src/infra/jira-cli/*.test.ts
git commit -m "infra: add jira-cli list helpers"
```

---

### Task 5: Implement issue creation + assign + sprint add primitives

**Files:**

- Create: `src/infra/jira-cli/issues.ts`
- Test: `src/infra/jira-cli/issues.test.ts`

**Step 1: Write failing tests**

Write tests for:

- `createIssue(options)`:
  - Builds correct `jira issue create` args using config defaults.
  - On success, parses stdout to extract issue key (mocked).
- `assignIssue(key, assignee)`:
  - Calls `jira issue assign` with correct arguments.
- `addIssueToSprint(issueKey, sprintId)`:
  - Calls `jira sprint add <SPRINT_ID> <KEY>`.

Mock `runJiraCli` and assert calls + behavior.

**Step 2: Run tests**

```bash
pnpm test src/infra/jira-cli/issues.test.ts
```

Expect failures.

**Step 3: Implement primitives**

Implement:

- `createIssue` that:
  - Uses config defaults for type/priority when missing.
  - Encodes application according to `applicationFieldType`.
  - Supports description via stdin + `--template -` (at least in v1, structure tests to allow this).
- `assignIssue` that wraps `jira issue assign`.
- `addIssueToSprint` that wraps `jira sprint add`.

**Step 4: Re-run tests**

```bash
pnpm test src/infra/jira-cli/issues.test.ts
```

Expect: passing.

**Step 5: Commit**

```bash
git add src/infra/jira-cli/issues.ts src/infra/jira-cli/issues.test.ts
git commit -m "infra: add jira-cli issue primitives"
```

---

### Task 6: Implement `jira_create_issue_flow` skill

**Files:**

- Create: `src/skills/jira-create-issue.ts` (or the repo’s canonical skill location, e.g. `src/agents/jira.ts`)
- Test: `src/skills/jira-create-issue.test.ts`

**Step 1: Design tool schema and write failing tests**

Define a tool input/output schema along the lines of:

```ts
interface JiraCreateIssueInput {
  summary?: string;
  description?: string;
  type?: string;
  priority?: string;
  projectKey?: string;
  boardName?: string;
  application?: string;
  assignee?: "me" | "unassigned" | string;
  sprintName?: string | null;
}

interface JiraCreateIssueOutput {
  key: string;
  url?: string;
  projectKey: string;
  boardName: string;
  application: string;
  assignee?: string;
  sprintName?: string;
}
```

Tests should:

- Mock all infra helpers (`jira_list_projects`, `jira_list_boards`, etc., plus `createIssue`, `assignIssue`, `addIssueToSprint`).
- Cover:
  - Happy path: user provides summary/description, selects project/board/app, chooses assignee and sprint, issue created and added to sprint.
  - Backlog-only path: sprint omitted.
  - Errors from infra bubbling up with clear messages.

**Step 2: Run tests**

```bash
pnpm test src/skills/jira-create-issue.test.ts
```

Expect failures.

**Step 3: Implement `jira_create_issue_flow`**

Implement the flow to:

- Fill in missing info by calling helper tools (or by prompting, depending on how tools are wired).
- Use config favorites/defaults when values are absent.
- Call:
  - `createIssue` first,
  - Then `assignIssue` if needed,
  - Then `addIssueToSprint` if a sprint was selected.
- Return a structured `JiraCreateIssueOutput`.

**Step 4: Re-run tests**

```bash
pnpm test src/skills/jira-create-issue.test.ts
```

Expect: passing.

**Step 5: Commit**

```bash
git add src/skills/jira-create-issue.ts src/skills/jira-create-issue.test.ts
git commit -m "feat: add jira create issue skill"
```

---

### Task 7: Wire skill into OpenClaw agent configuration

**Files:**

- Modify: the file that registers tools/skills (e.g. `src/agents/index.ts` or `src/cli/tools.ts`)
- Test: corresponding registration test file if present

**Step 1: Register tool**

Import `jira_create_issue_flow` and register it in the agent/tool registry with a descriptive name and description, so it can be invoked by the model when Jira tasks are requested.

**Step 2: Add/Update tests**

If there is a tools/registry test suite, add assertions that:

- The Jira tool is exported/registered.
- The schema matches expectations (input/output).

**Step 3: Run relevant tests**

```bash
pnpm test
```

Or a narrower subset if available for the registry.

**Step 4: Commit**

```bash
git add <updated files>
git commit -m "feat: register jira create issue skill"
```

---

### Task 8: End-to-end sanity check (manual)

**Files:**

- None (runtime only).

**Step 1: Ensure Docker jira-cli works**

From your host:

```bash
docker exec -it <jira-cli-container> jira issue list --plain --paginate 5
```

Confirm it returns issues for your Jira instance.

**Step 2: Invoke skill via OpenClaw**

In a development environment (CLI or agent test harness), trigger:

- A call to the `jira_create_issue_flow` tool with minimal inputs (e.g. just summary/description).
- Follow the prompts/choices so that:
  - Project = BRLB
  - Board = AI Vision Language
  - Application = ai_language
  - Assignee = you
  - Sprint = current active sprint

Verify:

- Issue appears in Jira with correct fields.
- It’s in the correct sprint or backlog per your choices.

**Step 3: No commit needed**

This is a runtime validation step; no code changes expected.

---

### Task 9: Final cleanup and documentation

**Files:**

- Modify: `AGENTS.md` or local tooling docs if needed, to briefly mention the new Jira skill and how it works.

**Step 1: Document skill behavior**

Add a short section:

- Name of the Jira skill.
- What it does (guided issue creation + project/board/application/assignee/sprint selection).
- Requirements (running Docker container with configured jira-cli).

**Step 2: Run full checks**

```bash
pnpm build
pnpm check
pnpm test
```

Ensure all pass.

**Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: describe jira-cli issue creation skill"
```

---

### Execution Handoff

Plan complete and saved to `.cursor/plans/2026-02-06-jira-cli-skill-implementation.md`.

Two execution options:

1. **Subagent-Driven (this session)** – I execute tasks one-by-one here using superpowers:subagent-driven-development, with checkpoints between tasks.
2. **Parallel Session (separate)** – You open a new session (still on `feature/jira-cli-skill`), load this plan, and use superpowers:executing-plans there for batched execution.

**Which approach do you prefer for implementing this plan?**
