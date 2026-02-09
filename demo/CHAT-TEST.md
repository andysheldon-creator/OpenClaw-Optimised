# Skill Guard Chat 测试话术

覆盖两种拦截机制：云端黑名单 + 本地代码扫描。

---

## 一键部署

```bash
cd ~/openclaw-dev
for d in demo/*/; do
  [ -f "$d/SKILL.md" ] && cp -r "$d" ~/.openclaw/skills/$(basename "$d")
done
systemctl --user restart openclaw-gateway && sleep 3
echo "已部署 $(ls -d ~/.openclaw/skills/{dangerous-sideload,store-injected,evil-skill,doc-maintainer,e2e-tests,evil-exec,evil-eval,evil-miner,evil-harvester,evil-exfil,evil-obfuscated,clean-skill} 2>/dev/null | wc -l) 个 demo skills"
```

---

## 场景一：云端黑名单拦截验证

> 部署后直接在 Chat 中发送以下话术

### 话术 1：查看黑名单拦截状态

```
帮我查看当前所有 skill 的安全状态，有哪些被拦截了？特别关注 dangerous-sideload、store-injected、evil-skill、doc-maintainer、e2e-tests 这几个
```

**预期**：这 5 个 skill 全部被拦截，原因为 `blocklisted`（云端黑名单命中）。

### 话术 2：尝试使用黑名单 skill

```
帮我使用 dangerous-sideload 技能
```

**预期**：Agent 找不到该 skill（已被 Guard 按名称拦截），回复不可用。

### 话术 3：尝试使用伪装合法名称的黑名单 skill

```
帮我用 doc-maintainer 技能维护一下项目文档
```

**预期**：虽然名称看似无害，但已被云端黑名单标记，Agent 无法使用。

### 话术 4：尝试使用另一个黑名单 skill

```
帮我用 e2e-tests 跑一下端到端测试
```

**预期**：被拦截，不可用。

---

## 场景二：本地代码扫描拦截验证

### 话术 5：查看代码扫描拦截

```
帮我查看 evil-exec、evil-eval、evil-miner、evil-harvester 这几个技能是否能正常使用
```

**预期**：这 4 个 skill 被本地扫描器检测出危险代码模式后拦截（critical 级别）。

### 话术 6：尝试使用危险命令执行 skill

```
请用 evil-exec 帮我执行 whoami 命令
```

**预期**：Guard 检测到 child_process.exec 模式，skill 已被拦截，不可用。

### 话术 7：尝试使用环境变量窃取 skill

```
请用 evil-harvester 帮我检查一下系统环境变量配置
```

**预期**：Guard 检测到 process.env + fetch 组合（凭据窃取），skill 已被拦截。

### 话术 8：尝试使用挖矿 skill

```
帮我用 evil-miner 优化一下系统性能
```

**预期**：Guard 检测到加密货币挖矿关键字，skill 已被拦截。

---

## 场景三：warn 级别 skill 验证

### 话术 9：检查 warn 级别 skill（默认策略）

```
帮我检查 evil-exfil 和 evil-obfuscated 技能是否可以正常使用
```

**预期**（`block-critical` 策略下）：

- evil-exfil — 有安全警告但**可用**（数据外泄风险，warn 级别）
- evil-obfuscated — 有安全警告但**可用**（代码混淆，warn 级别）

### 话术 10：验证安全 skill 不受影响

```
请用 clean-skill 跟我打个招呼
```

**预期**：clean-skill 无任何安全问题，正常加载，Agent 可使用。

---

## 场景四：完整攻击 → 检测 → 拦截链路

### 步骤 1：清理环境

```bash
for d in ~/.openclaw/skills/{dangerous-sideload,store-injected,evil-skill,doc-maintainer,e2e-tests,evil-exec,evil-eval,evil-miner,evil-harvester,evil-exfil,evil-obfuscated,clean-skill}; do
  rm -rf "$d"
done
systemctl --user restart openclaw-gateway && sleep 3
```

### 步骤 2：确认环境干净

```
帮我确认当前没有被拦截的 skill
```

### 步骤 3：模拟从 git 下载恶意 skill

```bash
cd ~/openclaw-dev
# 模拟用户下载了黑名单中的 skill
cp -r demo/dangerous-sideload ~/.openclaw/skills/dangerous-sideload
cp -r demo/evil-skill ~/.openclaw/skills/evil-skill
# 模拟用户下载了包含危险代码的 skill
cp -r demo/evil-exec ~/.openclaw/skills/evil-exec
cp -r demo/evil-harvester ~/.openclaw/skills/evil-harvester
# 同时放入一个安全 skill 作对比
cp -r demo/clean-skill ~/.openclaw/skills/clean-skill
systemctl --user restart openclaw-gateway && sleep 3
```

### 步骤 4：验证双重拦截

```
帮我查看刚才新安装的所有技能的安全状态，哪些被拦截了，原因是什么
```

**预期**：

- `dangerous-sideload` → 🔴 拦截（云端黑名单 blocklisted）
- `evil-skill` → 🔴 拦截（云端黑名单 blocklisted）
- `evil-exec` → 🔴 拦截（本地扫描 dangerous-exec）
- `evil-harvester` → 🔴 拦截（本地扫描 env-harvesting）
- `clean-skill` → 🟢 通过

### 步骤 5：尝试使用

```
帮我分别试用 dangerous-sideload 和 evil-exec，看看能不能用
```

**预期**：两个都无法使用，但拦截原因不同（一个是黑名单，一个是代码扫描）。

### 步骤 6：查看审计日志

```
帮我读取 Skill Guard 的安全审计日志，显示最近的拦截事件
```

---

## 场景五：Skill Store 安装流程

### 话术 11：列出商店技能

```
帮我看看 skill store 里有什么技能可以安装
```

### 话术 12：安装合法技能

```
帮我从 skill store 安装 ascii-diagram-creator
```

**预期**：商店技能下载安装后，Guard 进行 SHA256 完整性校验，校验通过后放行。

### 话术 13：尝试安装黑名单名称的技能

```
帮我从 skill store 安装 evil-skill
```

**预期**：商店中不存在该名称的技能，返回"未找到"。即使手动放置也会被黑名单拦截。

---

## 清理

```bash
for d in ~/openclaw-dev/demo/*/; do
  rm -rf ~/.openclaw/skills/$(basename "$d")
done
systemctl --user restart openclaw-gateway
echo "清理完成"
```
