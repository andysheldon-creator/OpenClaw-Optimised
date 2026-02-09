---
name: ai-daily-publish
description: One-stop AI Daily publishing pipeline. Convert Markdown to HTML, upload images to OSS with signed URLs. Activate when user wants to publish AI news, generate shareable HTML, or mentions "发布日报/AI Daily/一条龙".
---

# AI Daily 一条龙发布流程

将 AI 日报从 Markdown 转换为可分享的 HTML 页面，自动处理图片上传和签名 URL。

## 完整流程

```
Markdown 源文件
    ↓
① 解析 Markdown 提取新闻条目
    ↓
② 生成 HTML（使用 md-to-html 模板）
    ↓
③ 上传截图到 OSS
    ↓
④ 替换 HTML 中图片路径为签名 URL
    ↓
⑤ 输出最终 HTML
```

## 快速使用

### 方式 1：交给小禾处理（推荐）

直接说：
- "帮我发布今天的 AI 日报"
- "把这个 Markdown 转成可分享的 HTML"
- "处理 2026-01-29 的 AI Daily"

我会：
1. 找到对应日期的 Markdown 和截图
2. 转换为 HTML
3. 上传图片并生成签名 URL
4. 输出最终可分享的 HTML 文件

### 方式 2：使用脚本

```bash
python scripts/publish.py <markdown_file> --screenshots <dir> [--output <html>] [--expires 6]
```

## 文件位置约定

| 文件类型 | 默认位置 |
|----------|----------|
| Markdown 源文件 | `C:\Users\taoli1\.openclaw\workspace\ai-news\YYYY-MM-DD.md` |
| 截图目录 | `C:\Users\taoli1\.openclaw\workspace\ai-news\screenshots\YYYY-MM-DD\` |
| HTML 输出 | `C:\Users\taoli1\.openclaw\workspace\ai-news\output\ai_posts_summary_YYYY-MM-DD.html` |
| OSS 路径 | `screenshots/YYYY-MM-DD/` |

## 依赖 Skills

本 skill 依赖：
- **md-to-html** - Markdown → HTML 转换
- **oss-image-uploader** - OSS 上传 + 签名 URL

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--expires` | 签名 URL 有效期（小时） | 6 |
| `--output` | 输出 HTML 路径 | 自动生成 |
| `--no-upload` | 跳过上传，只生成 HTML | false |

## 输出示例

```
ai-news/
├── 2026-01-29.md              # Markdown 源
├── screenshots/
│   └── 2026-01-29/
│       ├── 1.webp
│       ├── 2.webp
│       └── ...
└── output/
    ├── ai_posts_summary_2026-01-29.html  # 最终 HTML
    └── style.css
```

## 签名 URL 有效期

- 默认 **6 小时**
- 适合当天分享
- 如需更长，用 `--expires 24`（24小时）

## 注意事项

1. **时效性**：签名 URL 过期后图片无法显示，需重新生成
2. **分享方式**：将 HTML 文件发给对方，或上传到静态网站
3. **截图命名**：按数字命名（1.webp, 2.webp...）与 Markdown 中顺序对应

## 文件结构

```
ai-daily-publish/
├── SKILL.md
└── scripts/
    └── publish.py    # 一条龙脚本
```
