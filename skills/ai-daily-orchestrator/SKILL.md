# AI Daily Orchestrator

一条龙编排 AI 日报发布流程。

## 完整流程

```
原始 Markdown → 截图采集 → AI 总结 → HTML + JSON 发布
     ↓              ↓           ↓            ↓
  urls.txt     screenshots/   final.md    output/
```

## 快速使用

```bash
# 完整流程（从原始 Markdown 开始）
python scripts/orchestrate.py full --input raw_news.md --date 2026-02-08

# 只截图（从 URL 列表）
python scripts/orchestrate.py screenshot --input urls.txt --output screenshots/

# 只总结（从原始 MD + 截图生成结构化 MD）
python scripts/orchestrate.py summarize --input raw_news.md --screenshots screenshots/

# 只发布（从结构化 MD 生成 HTML + JSON）
python scripts/orchestrate.py publish --input final.md --screenshots screenshots/final/
```

## 子命令说明

### `full` - 完整流程
从原始 Markdown 一路处理到最终发布。

**参数:**
- `--input`: 原始 Markdown 文件（包含 Twitter URL）
- `--date`: 日期 (YYYY-MM-DD)，默认今天
- `--output-dir`: 输出目录，默认 `./output`
- `--skip-screenshot`: 跳过截图步骤（如果已有截图）
- `--skip-summarize`: 跳过总结步骤（如果已有结构化 MD）

### `screenshot` - 截图采集
使用 `playwright-screenshot` skill 采集 Twitter 截图。

**参数:**
- `--input`: Markdown 文件或 URL 列表
- `--output`: 截图输出目录
- `--format`: 图片格式 (png/webp)，默认 png

### `summarize` - AI 总结
使用 AI 将原始新闻总结为结构化 Markdown。

**参数:**
- `--input`: 原始 Markdown
- `--screenshots`: 截图目录
- `--output`: 输出的结构化 Markdown

### `publish` - 发布
使用 `ai-daily-publish` skill 生成 HTML + JSON。

**参数:**
- `--input`: 结构化 Markdown
- `--screenshots`: 截图目录
- `--output-dir`: 输出目录
- `--expires`: 签名 URL 有效期（小时），默认 6
- `--skip-existing`: 跳过已存在的 OSS 文件
- `--no-json`: 不生成 JSON

## 依赖的 Skills

| Skill | 用途 |
|-------|------|
| `playwright-screenshot` | Twitter 截图 |
| `ai-news-digest` | 新闻总结（可选，也可手动） |
| `oss-image-uploader` | OSS 上传 |
| `ai-daily-publish` | HTML + JSON 生成 |

## 目录结构

```
workspace/ai-news/
├── raw/                    # 原始输入
│   └── 2026-02-08.md
├── screenshots/            # 截图
│   ├── raw/               # 原始截图
│   └── final/             # 处理后的截图
├── processed/              # 结构化 Markdown
│   └── 硅谷AI圈动态-2026-02-08.md
└── output/                 # 最终输出
    ├── ai_posts_summary_2026-02-08.html
    ├── 2026-02-08.json
    └── style.css
```

## 配置

创建 `config.yaml` 自定义行为：

```yaml
# 默认设置
defaults:
  date_format: "%Y-%m-%d"
  screenshot_format: png
  oss_expires_hours: 6

# 路径模板
paths:
  raw: "raw/{date}.md"
  screenshots: "screenshots/{date}"
  processed: "processed/硅谷AI圈动态-{date}.md"
  output: "output"

# 总结 prompt（AI 总结用）
summarize:
  model: "claude-sonnet-4"
  prompt_file: "prompts/summarize.txt"
```
