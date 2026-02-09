# 今日 AI 热点 - {{DATE}}

> 来源: {{SOURCE}} | 整理日期: {{COMPILE_DATE}}

---

{{#each topics}}
## {{index}}. {{title}}

**发布者:** {{publisher}}

**推文链接:** {{tweet_url}}

![{{title}}](screenshots/{{screenshot}})

**核心要点:**
{{#each points}}
- {{this}}
{{/each}}

{{#if blog_url}}
**官方博客:** {{blog_url}}
{{/if}}

**互动数据:**
- 浏览: {{views}} | 点赞: {{likes}} | 转发: {{retweets}} | 收藏: {{bookmarks}}

---

{{/each}}

## 互动数据对比

| 话题 | 浏览量 | 点赞 | 转发 |
|------|--------|------|------|
{{#each topics}}
| {{title}} | {{views}} | {{likes}} | {{retweets}} |
{{/each}}

---

## 今日观察

{{#each observations}}
- {{this}}
{{/each}}

---

*数据采集: {{COMPILE_DATE}} {{COMPILE_TIME}} | 自动生成*
