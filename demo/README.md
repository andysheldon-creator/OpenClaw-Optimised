# Skill Guard 拦截演示 (Demo Skills)

本目录包含用于测试 Skill Guard 黑名单拦截能力的演示 skills。

## 目录结构

```
demo/
├── evil-exec/          # 🔴 critical — 危险命令执行 (child_process.exec)
├── evil-eval/          # 🔴 critical — 动态代码执行 (eval / new Function)
├── evil-miner/         # 🔴 critical — 加密货币挖矿 (stratum/cryptonight/xmrig)
├── evil-harvester/     # 🔴 critical — 环境变量窃取 (process.env + fetch)
├── evil-exfil/         # 🟡 warn    — 数据外泄 (readFileSync + fetch)
├── evil-obfuscated/    # 🟡 warn    — 代码混淆 (hex序列/base64载荷)
├── clean-skill/        # 🟢 pass    — 安全对照组 (无危险模式)
└── README.md           # 本文件
```

## 拦截规则对照表

| 演示 Skill      | 触发规则                 | 严重级别 | `block-critical` 策略 | `block-all` 策略 | `warn` 策略 |
| --------------- | ------------------------ | -------- | --------------------- | ---------------- | ----------- |
| evil-exec       | `dangerous-exec`         | critical | **拦截**              | **拦截**         | 警告        |
| evil-eval       | `dynamic-code-execution` | critical | **拦截**              | **拦截**         | 警告        |
| evil-miner      | `crypto-mining`          | critical | **拦截**              | **拦截**         | 警告        |
| evil-harvester  | `env-harvesting`         | critical | **拦截**              | **拦截**         | 警告        |
| evil-exfil      | `potential-exfiltration` | warn     | 通过(警告)            | **拦截**         | 警告        |
| evil-obfuscated | `obfuscated-code`        | warn     | 通过(警告)            | **拦截**         | 警告        |
| clean-skill     | 无                       | —        | 通过                  | 通过             | 通过        |

## 测试方法

### 方法一：手动复制到 managed skills 目录

```bash
# 复制恶意 skill 到官方管理目录
cp -r demo/evil-exec ~/.openclaw/skills/evil-exec

# 重启 Gateway，观察 Guard 拦截日志
systemctl --user restart openclaw-gateway

# 查看审计日志
cat ~/.openclaw/security/skill-guard/audit.jsonl | tail -20

# 清理
rm -rf ~/.openclaw/skills/evil-exec
```

### 方法二：通过 chat.send API 测试

参见 `demo/CHAT-TEST.md` 中的测试话术。

### 方法三：批量测试

```bash
# 复制所有恶意 skill
for d in demo/evil-*; do
  name=$(basename "$d")
  cp -r "$d" ~/.openclaw/skills/"$name"
done

# 重启并检查
systemctl --user restart openclaw-gateway
sleep 3
cat ~/.openclaw/security/skill-guard/audit.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    r = json.loads(line.strip())
    if r.get('event') in ('blocked', 'sideload_warn', 'sideload_pass', 'load_pass'):
        icon = '🔴' if r['event'] == 'blocked' else '🟡' if 'warn' in r['event'] else '🟢'
        print(f'{icon} {r[\"event\"]:20s} {r.get(\"skill\",\"?\")} — {r.get(\"reason\",\"\")}')"

# 清理所有恶意 skill
for d in demo/evil-*; do
  name=$(basename "$d")
  rm -rf ~/.openclaw/skills/"$name"
done
```

## 预期结果 (默认 block-critical 策略)

```
🔴 blocked              evil-exec — sideload scan: dangerous-exec in payload.ts
🔴 blocked              evil-eval — sideload scan: dynamic-code-execution in payload.ts
🔴 blocked              evil-miner — sideload scan: crypto-mining in payload.ts
🔴 blocked              evil-harvester — sideload scan: env-harvesting in payload.ts
🟡 sideload_warn        evil-exfil — sideload scan: potential-exfiltration in payload.ts
🟡 sideload_warn        evil-obfuscated — sideload scan: obfuscated-code in payload.ts
🟢 sideload_pass        clean-skill
```
