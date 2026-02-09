# Text2SQL: Agent tidak akses data (root cause)

## Phase 1: Root cause

### Evidence from terminal (lines 571–576)

```
tools: exec failed stack:
Error: zsh:1: no matches found: ?w+
zsh:1: command not found: rg
Command exited with code 127
```

- Agent **bukan** menjalankan script text2sql.
- Agent menjalankan perintah yang memakai **ripgrep (`rg`)** dan pola seperti **`?w+`** (zsh menganggap glob), lalu gagal: `rg` tidak ada di PATH, dan `?w+` di-expand zsh jadi "no matches".

### Kesimpulan

**Penyebab:** Agent memilih strategi salah — **mencari di workspace** (pakai `rg`/grep) untuk “nama tabel”, bukan **menjalankan script** `skills/text2sql/scripts/query.ts list_tables`.

**Bukan:** Bukan masalah DATABASE_URL, bukan masalah path script. Script tidak pernah dipanggil.

### Faktor yang mungkin

1. **Skill ada di prompt tapi model memilih “search workspace”** — model menginterpretasi “nama tabel ada apa aja” sebagai “cari file/schema di workspace” dan memanggil `rg` instead of script.
2. **Instruksi skill kurang tegas** — tidak ada kalimat eksplisit: “jangan cari di workspace; wajib jalankan script”.
3. **Workspace agent** — kalau workspace session Telegram **bukan** repo OpenClaw (atau folder yang punya `skills/text2sql/`), path `skills/text2sql/scripts/query.ts` bisa tidak ada. Tapi di log, kegagalan terjadi **sebelum** script dijalankan (karena yang jalan adalah perintah pakai `rg`).

## Phase 2–4: Fix

1. **Ubah SKILL.md** — tambah instruksi wajib: saat user minta daftar tabel / data dari DB, **langsung jalankan script**; jangan pakai rg/grep/search workspace. (Done.)
2. **Cek workspace agent** — pastikan agent (Telegram) pakai workspace yang berisi repo OpenClaw (atau punya `skills/text2sql/`). Di `~/.openclaw/openclaw.json` set `agents.list[].workspace` (atau `agents.defaults.workspace`) ke path **repo OpenClaw** (mis. `/Users/.../openclaw`) supaya path `skills/text2sql/scripts/query.ts` valid.
