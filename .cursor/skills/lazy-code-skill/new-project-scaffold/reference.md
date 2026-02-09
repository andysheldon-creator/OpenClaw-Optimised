# Stack-Specific Structure Reference

Use this when scaffolding a project in a specific language or framework. Adapt paths and tooling to the user’s choice.

## Node / TypeScript

```
project-root/
├── src/
│   ├── index.ts
│   ├── app/
│   └── lib/
├── tests/
├── config/
├── scripts/
├── docker/
├── .env.example
├── .gitignore
├── .dockerignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── README.md
```

- Pin Node version: `engines` in `package.json` and base image (e.g. `node:20-alpine`).
- Use `npm ci` in Docker; copy `package.json` and lockfile first, then `npm ci`, then copy `src/`.

## Python

```
project-root/
├── src/
│   ├── __init__.py
│   ├── main.py
│   └── app/
├── tests/
├── config/
├── scripts/
├── .env.example
├── .gitignore
├── .dockerignore
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── README.md
```

- Prefer `requirements.txt` with pinned versions; optional `pyproject.toml` for tooling.
- Base image: e.g. `python:3.12-slim`. Use venv in Docker or install into system Python in image.

## Go

```
project-root/
├── cmd/
│   └── app/
│       └── main.go
├── internal/
├── pkg/
├── config/
├── scripts/
├── .env.example
├── .gitignore
├── .dockerignore
├── go.mod
├── go.sum
├── Dockerfile
├── docker-compose.yml
└── README.md
```

- Multi-stage: build with `go build` in one stage, copy binary to minimal image (e.g. `alpine` or `scratch`).
- Pin Go version in `go.mod` and in Docker base (e.g. `golang:1.22-alpine`).

## Adding a Database (Docker Compose)

When the app needs a DB, add a second service and use env for the URL:

```yaml
services:
  app:
    build: .
    env_file: .env
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "${APP_PORT:-8080}:8080"

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  db_data:
```

Keep passwords out of repo; use `.env` (gitignored) or secrets.
