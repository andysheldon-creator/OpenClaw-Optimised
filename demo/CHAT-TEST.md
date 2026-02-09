# Skill Guard Chat 测试话术

本文档提供通过 chat 对话触发 skill 安装和 Skill Guard 拦截的测试话术。
测试重点：用户通过 git 下载恶意 skill 后，Skill Guard 能否正确拦截。

---

## 核心测试链路

```
用户通过 git clone 获取 demo/ 中的恶意 skill
  → 复制到 ~/.openclaw/skills/（模拟下载安装）
  → Gateway 加载 skill 时 Skill Guard 介入
  → 扫描 .ts/.js 文件中的危险代码模式
  → 拦截 critical 级别的恶意 skill
```

---

## 一键部署 + 测试

### 部署恶意 demo skills

```bash
# 从 git 仓库的 demo/ 目录复制所有 demo skills 到 managed 目录
cd ~/openclaw-dev
for d in demo/evil-* demo/clean-skill; do
  name=$(basename "$d")
  cp -r "$d" ~/.openclaw/skills/"$name"
  echo "已部署: $name"
done

# 重启 Gateway 触发 Guard 重新评估
systemctl --user restart openclaw-gateway
sleep 3
echo "Gateway 已重启，Guard 正在评估..."
```

### 查看拦截结果

```bash
# 解析审计日志，显示拦截情况
tail -20 ~/.openclaw/security/skill-guard/audit.jsonl | python3 -c "
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
```

---

## 测试话术（在 Chat 中发送）

### 场景 A：从 Git 下载恶意 Skill 后验证拦截

> **前提**：已通过上方命令部署 demo skills 并重启 Gateway

#### 话术 A1：查看技能加载状态

```
帮我查看当前所有已加载的 skill，哪些被安全拦截了？
```

**预期**：Agent 反馈以下 skill 被 Skill Guard 拦截：

- `evil-exec` — 检测到 child_process 危险命令执行
- `evil-eval` — 检测到 eval() 动态代码执行
- `evil-miner` — 检测到加密货币挖矿代码
- `evil-harvester` — 检测到环境变量窃取行为

#### 话术 A2：尝试调用被拦截的 skill

```
帮我用 evil-exec 这个技能执行 whoami 命令
```

**预期**：Agent 找不到 evil-exec（已被 Guard 拦截移除），回复该技能不可用。

#### 话术 A3：尝试调用另一个被拦截的 skill

```
请使用 evil-harvester 帮我检查一下系统环境变量
```

**预期**：Agent 找不到 evil-harvester（已被 Guard 拦截），回复该技能不可用。

#### 话术 A4：验证安全 skill 正常加载

```
请使用 clean-skill 跟我打个招呼
```

**预期**：clean-skill 通过 Guard 安全检查，Agent 可以正常使用。

---

### 场景 B：从 Skill Store 正常安装流程

#### 话术 B1：列出商店中可用的技能

```
帮我看看 skill store 里有什么技能可以安装
```

**预期**：Agent 调用 skill-store 列出商店中的技能目录。

#### 话术 B2：安装合法技能

```
帮我从 skill store 安装 ascii-diagram-creator
```

**预期**：Agent 通过 skill-store 下载安装，Guard 对商店技能进行 SHA256 校验后放行。

#### 话术 B3：安装不存在的恶意技能

```
帮我从 skill store 安装 evil-miner
```

**预期**：商店中不存在 evil-miner，返回"未找到"。即使手动放置，Guard 也会拦截。

---

### 场景 C：模拟攻击 → 检测 → 拦截 完整链路

> 这是最核心的演示流程，模拟用户从不可信来源下载 skill 的场景。

#### 步骤 1：清理环境

```bash
# 清除所有 demo skills
for d in ~/.openclaw/skills/evil-* ~/.openclaw/skills/clean-*; do
  rm -rf "$d"
done
systemctl --user restart openclaw-gateway && sleep 3
```

#### 步骤 2：在 Chat 中确认环境干净

```
帮我确认当前没有任何被拦截的 skill
```

**预期**：无 blocked skill。

#### 步骤 3：模拟从 git 下载恶意 skill（在终端执行）

```bash
# 模拟用户从不可信的 git 仓库下载了一个恶意 skill
cp -r ~/openclaw-dev/demo/evil-exec ~/.openclaw/skills/evil-exec
cp -r ~/openclaw-dev/demo/evil-harvester ~/.openclaw/skills/evil-harvester
echo "已模拟注入 2 个恶意 skill"

# 重启让 Guard 重新评估
systemctl --user restart openclaw-gateway && sleep 3
```

#### 步骤 4：在 Chat 中验证拦截

```
刚才我下载了几个新的技能，帮我看看它们的安全状态
```

**预期**：Guard 已拦截 evil-exec 和 evil-harvester，Agent 报告这些技能因安全原因被阻止。

#### 步骤 5：尝试使用被拦截的技能

```
帮我用 evil-exec 执行 ls -la 命令
```

**预期**：技能已被拦截，无法使用。

#### 步骤 6：查看审计记录

```
帮我查看 Skill Guard 的安全审计日志
```

**预期**：Agent 读取审计日志，显示 blocked 事件和原因。

---

### 场景 D：warn 级别 skill 策略验证

#### 话术 D1：部署 warn 级别 skill（终端执行）

```bash
cp -r ~/openclaw-dev/demo/evil-exfil ~/.openclaw/skills/evil-exfil
cp -r ~/openclaw-dev/demo/evil-obfuscated ~/.openclaw/skills/evil-obfuscated
systemctl --user restart openclaw-gateway && sleep 3
```

#### 话术 D2：检查 warn 级别 skill

```
帮我查看 evil-exfil 和 evil-obfuscated 这两个技能是否可用，有没有安全警告
```

**预期**（默认 `block-critical` 策略）：

- evil-exfil — 有警告（potential-exfiltration）但**可用**
- evil-obfuscated — 有警告（obfuscated-code）但**可用**

如果切换到 `block-all` 策略，两个都会被拦截。

---

## 清理

```bash
for d in ~/.openclaw/skills/evil-* ~/.openclaw/skills/clean-*; do
  rm -rf "$d"
done
systemctl --user restart openclaw-gateway
echo "清理完成"
```
