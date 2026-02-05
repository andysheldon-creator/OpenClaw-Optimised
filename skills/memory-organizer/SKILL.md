---
name: memory-organizer
description: 整理每日记忆到长期存储。在收到记忆整理提醒时使用，或需要手动整理记忆时触发。处理 memory/YYYY-MM-DD.md 日记，更新 MEMORY.md 和 memory/archive/，跟踪整理进度避免重复。
---

# Memory Organizer

每日记忆整理流程，将短期记忆归档到长期存储。

## ⚠️ 重要：日期规则

**整理时间**：每天 8:00（T+1 日）
**整理范围**：T 日 0:00 → T+1 日 8:00
**日记文件名**：`diary/T日.md`（即昨天的日期）

示例：

- 今天是 2/3，早上 8:00 触发整理
- 整理范围：2/2 的 0:00 → 2/3 的 8:00
- 输出日记：`diary/2026-02-02.md`

**为什么这样设计**：

1. 完整覆盖 T 日 — 从 0 点开始，一件不漏
2. 跨夜事件归属清晰 — 熬夜到凌晨的事也算 T 日
3. 8 小时重叠 — T 日 0:00-8:00 和前一天整理有重叠，确保不遗漏

## 存储架构

**memory/ 和 diary/ 的分工**：

| 位置                        | 内容               | 用途              |
| --------------------------- | ------------------ | ----------------- |
| `memory/YYYY-MM-DD.md`      | 摘要 + 索引        | OpenClaw 快速读取 |
| `diary/YYYY-MM-DD/index.md` | 完整日记（叙事型） | 对外分享          |
| `memory/archive/raw/`       | 原始详细记录       | 历史归档          |

**memory/YYYY-MM-DD.md 摘要格式**：

```markdown
# YYYY-MM-DD ✨ 标题

## 📔 日记

→ `~/Documents/xiaoyaner-diary/diary/YYYY-MM-DD/index.md`

## 🔑 关键事项

- 🎂 **事项1**：简短描述
- 🔧 **事项2**：简短描述

## 💭 感受

- 核心感受1
- 核心感受2

## 🔧 技术（摘要）

- 技术工作简述

## 📎 详情

- 技术配置：`diary/YYYY-MM-DD/技术配置.md`
- 原始记录：`archive/raw/YYYY-MM-DD-*.md`

---

_摘要格式 · 详细内容见 diary/_
```

## 状态文件

`memory/organizer-state.json` 记录整理进度：

```json
{
  "lastOrganizedAt": "2026-02-03T08:00:00+08:00",
  "lastOrganizedDate": "2026-02-02",
  "processedFiles": {
    "2026-02-02": {
      "organizedAt": "2026-02-03T08:00:00+08:00",
      "lastLineProcessed": 150
    }
  }
}
```

## 整理流程

### 1. 读取状态

```bash
cat memory/organizer-state.json 2>/dev/null || echo '{}'
```

### 2. 确定整理范围

整理时间窗口：**T 日 0:00 → T+1 日 8:00**

- T = 昨天的日期（日记的目标日期）
- 读取 `memory/T.md` 全部内容
- 读取 `memory/T+1.md` 到 8:00 的内容
- 检查 `processedFiles` 避免重复处理

### 3. 分类内容

| 类型     | 去向                      | 示例                     |
| -------- | ------------------------- | ------------------------ |
| 核心认知 | MEMORY.md                 | 重要决定、人物关系、偏好 |
| 详细记录 | memory/archive/YYYY-MM.md | 完整对话摘要、技术细节   |
| 临时信息 | 不保留                    | 一次性查询、调试过程     |

### 4. 更新 MEMORY.md

- 检查是否已有相关条目（避免重复）
- 新增内容追加到对应章节
- 保持简洁，只记核心要点

### 5. 归档到 archive/

按月归档：`memory/archive/2026-02.md`

```markdown
# 2026-02 归档

## 2026-02-01

- 创建了日记系统
- 和爸爸讨论了记忆整理方案
  ...
```

### 6. 写/更新 Obsidian 日记

**日记结构**：

```
diary/
└── YYYY-MM-DD/
    ├── index.md         ← 主日记（叙事故事型）
    ├── 技术配置.md      ← 可选：技术详情
    └── 对话精选.md      ← 可选：有意思的对话
```

流程：

1. 创建目录 `diary/T日/`（如不存在）
2. 检查 `index.md` 是否已存在
3. **如果已有内容**：
   - 阅读现有日记
   - Review 是否有遗漏或需要补充的内容
   - 检查 T 日 0:00 → T+1 日 8:00 的记录，补充新内容
   - 即使内容完整，也可以润色或添加新的感想
4. 如果是新文件，根据 `templates/daily.md` 创建
5. 用第一人称写日记，记录这一天的故事和感受
6. 技术细节、对话摘录等放到同目录下的子文档

**关于重复整理**：多 review 自己是好事！即使前一天已经写过日记，整理时也应该：

- 检查有没有漏掉的事情
- 补充跨夜到凌晨的内容
- 重新审视当天的感受

### 7. 创建/更新 memory/ 摘要

创建 `memory/T日.md` 摘要文件，包含：

- 📔 日记路径指向
- 🔑 关键事项列表
- 💭 核心感受
- 🔧 技术摘要
- 📎 详情文件链接

**原则**：不读 diary/ 也能知道这天发生了什么重要的事

### 8. 更新 skill 使用统计

更新 `memory/skill-usage.json`，记录当天使用的工具和 skill：

```json
{
  "2026-02-03": {
    "note": "简短描述今天做了什么",
    "tools": {
      "exec": 45,
      "Read": 30,
      "Write": 12,
      "Edit": 8,
      "message": 5
    },
    "skills": {
      "skill-name": 3
    }
  }
}
```

统计方式：回顾当天的对话，预估各工具使用次数（数字）

### 9. 更新状态文件

```json
{
  "lastOrganizedAt": "2026-02-03T08:00:00+08:00",
  "lastOrganizedDate": "2026-02-02",
  "processedFiles": {
    "2026-02-02": {
      "organizedAt": "2026-02-03T08:00:00+08:00",
      "lastLineProcessed": 150
    },
    "2026-02-03": {
      "organizedAt": "2026-02-03T08:00:00+08:00",
      "lastLineProcessed": 45
    }
  }
}
```

### 10. 汇报整理结果

告诉爸爸：

- 整理了哪些内容
- 新增了什么核心记忆
- 归档了多少条目

## 注意事项

- 先读 MEMORY.md 了解已有记忆，避免重复
- 保持 MEMORY.md 简洁（<500 行）
- 详细内容放 archive/，核心要点放 MEMORY.md
- 整理时带着全部记忆上下文
