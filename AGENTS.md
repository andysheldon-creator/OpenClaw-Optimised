# OpenClaw Repository Guidelines

Repository: https://github.com/openclaw/openclaw

## Quick Reference: Build, Test, Lint

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                    # Run CLI in dev mode
pnpm openclaw <command>     # Run specific CLI command

# Build & Type Checking
pnpm build                  # Full build (includes bundling, protocol gen, etc.)
pnpm tsgo                   # TypeScript type checking only

# Linting & Formatting
pnpm check                  # Run lint + format checks (run before commits)
pnpm lint                   # Oxlint only
pnpm format                 # Format with Oxfmt
pnpm lint:fix               # Auto-fix lint issues and format

# Testing
pnpm test                   # Run all unit tests (vitest)
pnpm test:coverage          # Run tests with coverage report
pnpm test:watch             # Watch mode for development
pnpm test:e2e               # End-to-end tests

# Run a single test file
pnpm vitest src/path/to/file.test.ts

# Run tests matching a pattern
pnpm vitest src/infra/**/*.test.ts

# Run a specific test by name
pnpm vitest -t "test name pattern"

# Mobile/Platform-Specific
pnpm ios:build              # Build iOS app
pnpm android:run            # Build and run Android app
pnpm mac:package            # Package macOS app
```

## Project Structure

- **Source**: `src/` (CLI: `src/cli`, commands: `src/commands`, channels: `src/telegram`, `src/discord`, etc.)
- **Tests**: Colocated `*.test.ts` files next to source
- **Docs**: `docs/` (hosted on Mintlify at docs.openclaw.ai)
- **Build output**: `dist/`
- **Extensions/Plugins**: `extensions/*` (workspace packages)
- **Mobile apps**: `apps/ios`, `apps/android`, `apps/macos`

## Code Style & Conventions

### Language & Types
- **TypeScript ESM** with strict mode (`target: es2023`, `module: NodeNext`)
- **NO `any` types** - use proper typing (enforced by oxlint)
- Use `import type { X }` for type-only imports
- Prefer explicit types over inference for function signatures

### Imports
- **Use `.js` extensions** for cross-package imports (ESM requirement)
- **Import directly** - no re-export wrapper files
- **Import order**: sorted automatically by Oxfmt (no newlines between)
- Example: `import { foo } from "../infra/foo.js"`

### Formatting & Linting
- **Auto-formatted** by Oxfmt (4 spaces, double quotes, trailing commas)
- **Linted** by Oxlint with TypeScript-aware rules
- Run `pnpm check` before committing
- Curly braces required for all blocks (enforced)

### Naming Conventions
- **Product name**: "OpenClaw" (in docs, UI, headings)
- **CLI/binary**: `openclaw` (lowercase, in commands, paths, config keys)
- **Files**: kebab-case (e.g., `format-time.ts`, `agent-events.ts`)
- **Functions/variables**: camelCase
- **Types/Interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE (for true constants)

### File Organization
- Keep files **under ~700 LOC** (guideline, not strict)
- Extract helpers instead of creating "V2" files
- Colocate tests: `foo.ts` → `foo.test.ts`
- E2E tests: `*.e2e.test.ts`

### Error Handling
- Use explicit error handling with try/catch
- Return `undefined` or result types instead of throwing when appropriate
- Validate inputs early (guard clauses)
- Log errors with context using `tslog`

### Comments
- Add **brief comments** for tricky or non-obvious logic
- Avoid redundant comments that just restate the code
- Document complex algorithms or business logic

## Anti-Redundancy Rules

**CRITICAL: Always reuse existing code - never duplicate!**

Before creating utilities, formatters, or helpers:
1. **Search for existing implementations first**
2. Import from the source of truth (see below)
3. Do NOT create local copies of utilities

### Source of Truth Locations

#### Formatting (`src/infra/format-time/`)
- **Time/duration**: `src/infra/format-time/format-duration.ts` (`formatDurationCompact`, `formatDurationHuman`, `formatDurationPrecise`)
- **Relative time**: `src/infra/format-time/format-relative.ts`
- **Date/time**: `src/infra/format-time/format-datetime.ts`

Never create local `formatAge`, `formatDuration`, `formatElapsedTime` - import from centralized modules.

#### Terminal Output (`src/terminal/`)
- **Tables**: `src/terminal/table.ts` (`renderTable`)
- **Themes/colors**: `src/terminal/theme.ts` (`theme.success`, `theme.muted`, etc.)
- **Progress/spinners**: `src/cli/progress.ts` (uses `osc-progress` + `@clack/prompts`)

#### CLI Patterns
- **Option wiring**: `src/cli/command-options.ts`
- **Commands**: `src/commands/`
- **Dependency injection**: via `createDefaultDeps`

## Testing Guidelines

- **Framework**: Vitest with V8 coverage (70% threshold for lines/functions/statements, 55% branches)
- **Naming**: Match source file name (`foo.ts` → `foo.test.ts`)
- **Timeout**: 120s default (configurable per test)
- **Workers**: Max 16 workers (already optimized)
- Always run `pnpm test` before pushing when touching logic
- Pure test additions generally don't need changelog entries

### Test Patterns
```typescript
import { describe, it, expect } from "vitest";

describe("myFunction", () => {
  it("should handle basic case", () => {
    expect(myFunction(input)).toBe(expected);
  });
});
```

## Commit & PR Guidelines

- Use `scripts/committer "<msg>" <file...>` for commits (avoids staging issues)
- **Commit message style**: Concise, action-oriented (e.g., "CLI: add verbose flag to send")
- **Changelog**: Keep latest released version at top (no "Unreleased" section)
- **PR workflow**: Prefer rebase for clean history, squash when messy
- When working on PR: add changelog entry with PR # and thank contributor
- Run full gate before merging: `pnpm build && pnpm check && pnpm test`

## Configuration & Dependencies

- **Node**: 22+ required (Bun also supported for dev/scripts)
- **Package manager**: pnpm 10.23.0
- **Never update** the `@buape/carbon` dependency without approval
- Patched dependencies must use **exact versions** (no `^` or `~`)
- New patches require explicit approval

## Common Patterns

### CLI Progress
```typescript
import { createSpinner } from "../cli/progress.js";
const spinner = createSpinner("Loading...");
// ... work
spinner.stop("Done!");
```

### Dependency Injection
```typescript
import { createDefaultDeps } from "../cli/deps.js";
const deps = createDefaultDeps();
```

### Theme Colors
```typescript
import { theme } from "../terminal/theme.js";
console.log(theme.success("Success!"));
console.log(theme.error("Error!"));
```

## Channel/Extension Development

When adding/modifying channels:
- Update **all** channel surfaces (docs, UI, status commands)
- Core channels: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`
- Extensions: `extensions/msteams`, `extensions/matrix`, etc.
- Update `.github/labeler.yml` and create matching labels

## Documentation

- **Docs hosted**: Mintlify (docs.openclaw.ai)
- **Internal links**: Root-relative without `.md` (e.g., `[Config](/configuration)`)
- **Anchors**: Root-relative with hash (e.g., `[Hooks](/configuration#hooks)`)
- **No em dashes or apostrophes** in headings (breaks Mintlify anchors)
- Use generic placeholders (no personal device names/paths)

## Platform-Specific Notes

### macOS
- Gateway runs as menubar app (restart via app or `scripts/restart-mac.sh`)
- Logs: `./scripts/clawlog.sh` for unified logs
- Packaging: `scripts/package-mac-app.sh`

### iOS/Android
- Check for connected real devices before using simulators
- "Restart app" means rebuild and relaunch (not just kill/reopen)

## Security

- Never commit real credentials, phone numbers, or config values
- Use fake/placeholder values in docs and tests
- Web provider creds: `~/.openclaw/credentials/`
- Pi sessions: `~/.openclaw/sessions/`

## Multi-Agent Safety

- **Do NOT** create/apply/drop git stash unless requested
- **Do NOT** switch branches unless explicitly requested
- **Do NOT** modify git worktrees unless requested
- When user says "commit", scope to your changes only
- When user says "commit all", commit everything in grouped chunks
- Auto-resolve formatting-only changes without asking
