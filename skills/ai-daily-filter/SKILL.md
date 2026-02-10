---
name: ai-daily-filter
description: |
  筛选和排序 AI 日报推文。从 X/Twitter 推文链接中，筛选出适合 AI 日报的内容并按优先级排序。
  触发条件：用户提到"AI日报"、"X版日报"、"筛选推文"、"推文排序"、"日报筛选"，或给出包含推文链接的飞书文档。
---

# AI 日报推文筛选与排序

## 判断优先级（按重要性排序）

**第一优先级：发布者/公司**
→ OpenAI 的一句话 > 小公司的详细长文

**第二优先级：内容类型**
→ 新模型 > 新产品 > 新功能 > 观点

**第三优先级：同等条件下的加分项**
→ 正式发布 > 预览 | 附带视频 > 纯文字 | 首创 > 跟进

⚠️ 综合判断，不要一刀切

---

## 公司梯队

| 梯队 | 公司 |
|------|------|
| 第一 | OpenAI ≥ Google = Anthropic |
| 第二 | Microsoft, Meta, Amazon, Apple |
| 特例 | OpenClaw（近期较火，放第二梯队第1位）|
| 第二偏后 | NVIDIA（芯片公司，模型优先级较低）|
| 第三 | Cursor > Perplexity > Langchain = Mistral = Midjourney = HuggingFace |

---

## 入选条件

- 新模型/新产品/新功能发布
- 新技术/重大突破
- 重要行业数据
- 真金白银的投资/并购
- 头部大佬观点或公开访谈
- 纯转发但内容本身有价值

## 不入选条件

- 老新闻/前几天已写过
- 私人互怼/与网友交锋
- 纯社交互动
- 看不出具体内容的幕后故事
- 快速变动的排名截图
- 中国公司（放中国板块）
- 敏感政治内容

---

## 弹性机制

**消息少时放宽**：平时略过的边缘内容可补选
**消息多时收紧**：只选最重要的

---

## 工作流程

1. **先筛选**：确定最终 ≤10 条入选
   - 同一事件合并：不同公司视角均保留链接；同公司低职位仅在有增量信息时保留
2. **链接补全**（仅对入选推文）
   - **外部链接**：推文附带的官网/博客/GitHub 链接要一起附上
   - **线程补全**：同一账号在同线程下的相关推文链接也要收集

```bash
& "C:\Users\taoli1\openclaw\skills\playwright-screenshot\scripts\ensure-edge.ps1"
python scripts/get_tweet_links.py "https://x.com/账号/status/xxx"
python scripts/resolve_url.py "https://t.co/xxx"
```

---

## 详细参考

- 判断原则详解：[references/principles.md](references/principles.md)
- 具体案例：[references/examples.md](references/examples.md)
