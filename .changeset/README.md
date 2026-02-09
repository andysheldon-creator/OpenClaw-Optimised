# Changesets

`src/**` 또는 `extensions/**` 변경 시 changeset 파일 필수.

## 작성법

```bash
bash .claude/scripts/new-changeset.sh <slug> "설명"
# 또는: npx changeset
```

## 최소 예시

```md
---
"openclaw": patch
---

Fix unknown channel routing in sessions_send
```

## 면제 조건

- `src/` `extensions/` 외 변경 (docs, scripts, config 등)
- 긴급 시: `CHANGESET_SKIP=1 git commit ...`

## 버전 타입

- `patch`: 버그 수정, 소규모 변경
- `minor`: 새 기능, 하위 호환
- `major`: 브레이킹 체인지
