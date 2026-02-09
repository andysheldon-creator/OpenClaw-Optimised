---
name: new-project-scaffold
description: Scaffolds a brand-new project with a clean, best-practice folder structure, pinned latest-stable dependencies, and a Docker Compose–ready layout. Designed to bootstrap production-ready codebases from day one.
---

# Skill: New Project Scaffold

## Purpose

Create a **production-oriented project foundation** before any feature development begins.  
This skill ensures the project starts with:

1. A **clear, layered folder structure**
2. **Latest stable dependencies**, properly pinned
3. A **Docker Compose–ready setup** that runs consistently across environments

The goal is to avoid early technical debt and make the project immediately runnable, testable, and deployable.

---

## When to Run

Run this skill when:

- The user says they are starting a new project
- The user asks to scaffold, bootstrap, or initialize a codebase
- The user wants a clean structure before writing any logic
- The user explicitly wants the project to be Docker-ready from the beginning

---

## Output Expectations

By the end of this skill, the agent should deliver:

- A complete folder and file layout
- Clear dependency choices (language/framework aware)
- Docker and Docker Compose configuration that can run immediately
- A README that explains how to start the project

---

## Step-by-Step Workflow

### Step 1: Determine the Stack

From user input (or defaults if not specified), infer:

- Programming language (e.g. Node.js, Python, Go)
- Framework (if any)
- Runtime expectations (e.g. Node 20 LTS, Python 3.11+)

If unclear, assume **modern defaults** and state them explicitly.

---

### Step 2: Generate a Best-Practice Folder Structure

Use a **layered, intention-revealing layout**.  
Avoid placing application logic in the project root.

#### Generic Scaffold Template (adapt as needed)

project-root/
├── src/ # Application source code
│ └── main.\* # Single entrypoint (framework-specific)
├── tests/ # Unit/integration tests
├── config/ # Non-secret configuration
├── scripts/ # Dev, build, or deployment scripts
├── docs/ # Optional: design docs, ADRs, runbooks
├── docker/ # Optional: Dockerfile(s), overrides
├── .env.example # Environment variable template (no secrets)
├── .gitignore
├── .dockerignore
├── README.md
├── docker-compose.yml
└── [lockfile] # package-lock.json / poetry.lock / go.sum

#### Structural Rules

- Exactly **one application entrypoint**
- Tests live outside `src/`
- No secrets committed (ever)
- Configurable values come from environment variables
- Framework conventions may override naming, but not layering

For **stack-specific layouts** (Node/TypeScript, Python, Go) and Docker Compose with a database, see [reference.md](reference.md).

---

### Step 3: Select and Pin Latest Stable Dependencies

Dependency rules are **strict**:

- Use **latest stable releases only**
- Avoid `alpha`, `beta`, `rc`, `next`, or preview tags
- Pin versions explicitly
- Always include and commit a lockfile

#### Stability Verification

- **Node.js**: Use LTS (e.g. Node 20), confirm `latest` npm tag
- **Python**: Stable PyPI releases only, no `--pre`
- **Go**: Tagged semantic versions only

Document:

- Runtime version
- Package manager version (if relevant)

---

### Step 4: Make It Docker Compose–Ready

Assume the project **will be containerized**.

#### Required Files

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.example`

#### Docker Rules

- No secrets inside images or compose files
- All runtime config via environment variables
- One service initially (the app)
- Additional services (DB, cache) added only when needed
- Prefer official base images and pin tags (e.g. `postgres:16-alpine`)

#### Minimal `docker-compose.yml`

services:
app:
build: .
env_file: .env
ports: - "${APP_PORT:-8080}:8080"

#### Minimal `.env.example`

APP_PORT=8080
NODE_ENV=development

# DATABASE_URL=

---

### Step 5: Create README.md

The README must answer **only what a new developer needs**:

- What the project is
- Required runtime
- How to run locally
- How to run with Docker Compose

Avoid deep architecture explanations (those belong in `/docs`).

---

## Constraints (Do Not Violate)

- Do not introduce secrets
- Do not assume experimental dependencies
- Do not over-engineer (no microservices on day one)
- Do not create unused folders or files
- Do not omit Docker readiness

---

## Quality Checklist

Before finishing, ensure:

- [ ] Folder structure is clean and layered
- [ ] Dependencies are pinned to latest stable versions
- [ ] Lockfile is included
- [ ] Dockerfile and docker-compose.yml work together
- [ ] `.env.example` lists all required env vars
- [ ] `.dockerignore` reduces build context
- [ ] README explains how to start the project

---

## Expected Outcome

After running this skill:

- The project can be started immediately
- Local and Docker environments behave consistently
- The codebase is structured for long-term maintainability
- Future features can be added without restructuring

This skill establishes a **strong technical foundation** before any business logic exists.

---

## Additional Resources

- For language/framework-specific structure and examples, see [reference.md](reference.md).
