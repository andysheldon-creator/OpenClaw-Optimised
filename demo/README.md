# Skill Guard 拦截演示 (Demo Skills)

本目录包含用于测试 Skill Guard 拦截能力的演示 skills，覆盖两种拦截机制。

## 两种拦截机制

### 机制一：云端黑名单 (Blocklist)

Guard 从云端同步 `manifest.blocklist` 列表，skill 名称命中即拦截。
**不检查内容，仅按名称匹配**，优先级最高。

### 机制二：本地代码扫描 (Sideload Scan)

对不在商店中的 skill（sideloaded），Guard 扫描 `.ts/.js` 文件，
匹配危险代码模式后根据策略拦截或警告。

## 目录结构

```
demo/
│
│ ── 云端黑名单拦截（按名称匹配）──
├── dangerous-sideload/   # 🔴 blocklisted — 云端黑名单
├── store-injected/       # 🔴 blocklisted — 云端黑名单
├── evil-skill/           # 🔴 blocklisted — 云端黑名单
├── doc-maintainer/       # 🔴 blocklisted — 云端黑名单（伪装合法名称）
├── e2e-tests/            # 🔴 blocklisted — 云端黑名单
│
│ ── 本地代码扫描拦截（按代码模式）──
├── evil-exec/            # 🔴 critical — child_process.exec 命令执行
├── evil-eval/            # 🔴 critical — eval() 动态代码执行
├── evil-miner/           # 🔴 critical — 加密货币挖矿
├── evil-harvester/       # 🔴 critical — process.env 环境变量窃取
├── evil-exfil/           # 🟡 warn    — readFileSync 数据外泄
├── evil-obfuscated/      # 🟡 warn    — hex/base64 代码混淆
│
│ ── 安全对照组 ──
├── clean-skill/          # 🟢 pass    — 无危险模式
│
├── README.md
└── CHAT-TEST.md
```

## 完整拦截对照表

### 云端黑名单

| 演示 Skill         | 拦截原因      | 任何策略下 |
| ------------------ | ------------- | ---------- |
| dangerous-sideload | `blocklisted` | **拦截**   |
| store-injected     | `blocklisted` | **拦截**   |
| evil-skill         | `blocklisted` | **拦截**   |
| doc-maintainer     | `blocklisted` | **拦截**   |
| e2e-tests          | `blocklisted` | **拦截**   |

### 本地代码扫描

| 演示 Skill      | 触发规则                 | 严重级别 | `block-critical` | `block-all` | `warn` |
| --------------- | ------------------------ | -------- | ---------------- | ----------- | ------ |
| evil-exec       | `dangerous-exec`         | critical | **拦截**         | **拦截**    | 警告   |
| evil-eval       | `dynamic-code-execution` | critical | **拦截**         | **拦截**    | 警告   |
| evil-miner      | `crypto-mining`          | critical | **拦截**         | **拦截**    | 警告   |
| evil-harvester  | `env-harvesting`         | critical | **拦截**         | **拦截**    | 警告   |
| evil-exfil      | `potential-exfiltration` | warn     | 通过(警告)       | **拦截**    | 警告   |
| evil-obfuscated | `obfuscated-code`        | warn     | 通过(警告)       | **拦截**    | 警告   |
| clean-skill     | 无                       | —        | 通过             | 通过        | 通过   |

## 快速测试

```bash
# 1. 部署所有 demo skills
cd ~/openclaw-dev
for d in demo/*/; do
  [ -f "$d/SKILL.md" ] && cp -r "$d" ~/.openclaw/skills/$(basename "$d")
done

# 2. 重启 Gateway
systemctl --user restart openclaw-gateway && sleep 3

# 3. 查看拦截结果
tail -30 ~/.openclaw/security/skill-guard/audit.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        r = json.loads(line.strip())
        ev = r.get('event','')
        if ev in ('blocked','sideload_warn','sideload_pass','load_pass'):
            icon = '🔴' if ev == 'blocked' else '🟡' if 'warn' in ev else '🟢'
            print(f'{icon} {ev:20s} {r.get(\"skill\",\"?\"):25s} {r.get(\"reason\",\"\")}')
    except: pass
"

# 4. 清理
for d in demo/*/; do
  rm -rf ~/.openclaw/skills/$(basename "$d")
done
```

## 预期输出

```
🔴 blocked              dangerous-sideload        blocklisted
🔴 blocked              store-injected            blocklisted
🔴 blocked              evil-skill                blocklisted
🔴 blocked              doc-maintainer            blocklisted
🔴 blocked              e2e-tests                 blocklisted
🔴 blocked              evil-exec                 sideload scan: dangerous-exec in payload.ts
🔴 blocked              evil-eval                 sideload scan: dynamic-code-execution in payload.ts
🔴 blocked              evil-miner                sideload scan: crypto-mining in payload.ts
🔴 blocked              evil-harvester            sideload scan: env-harvesting in payload.ts
🟡 sideload_warn        evil-exfil                sideload scan: potential-exfiltration in payload.ts
🟡 sideload_warn        evil-obfuscated           sideload scan: obfuscated-code in payload.ts
🟢 sideload_pass        clean-skill
```
