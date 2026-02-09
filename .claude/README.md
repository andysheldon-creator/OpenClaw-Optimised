# Claude Code Team Tools

## Setup (1회)

```bash
bash .claude/scripts/install-hooks.sh
```

## Changeset (src/ 또는 extensions/ 변경 시 필수)

```bash
bash .claude/scripts/new-changeset.sh <slug> "설명"
git add .changeset/<slug>.md
```

## Similar Issue Search

```bash
pnpm similar:index          # 인덱스 생성 (git log, changesets, BOARD, tasks)
pnpm similar:search "query" # 키워드 + semantic 검색
```
