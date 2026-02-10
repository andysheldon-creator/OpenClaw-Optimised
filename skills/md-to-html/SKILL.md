---
name: md-to-html
description: Convert AI Today Markdown summaries into a styled HTML page with light purple theme, responsive design, and watermark protection.
---

# Markdown → HTML 转换技能

将 AI 日报的 Markdown 内容转换为**日系/清新/明亮**的紫色主题 HTML 页面。

## 快速使用

1. 读取 Markdown 源文件
2. 解析新闻条目（标题、发布者、时间、内容、截图）
3. 加载 `templates/layout.html` 模板
4. 替换占位符生成最终 HTML
5. 复制 `templates/style.css` 到输出目录

## 模板占位符

| 占位符 | 替换内容 |
|--------|----------|
| `{{TITLE}}` | 页面 title（如 "2026/01/29 硅谷AI圈动态"） |
| `{{DATE_TITLE}}` | 头部大标题 |
| `{{OVERVIEW_TEXT}}` | 总览文案（从 MD 的 `## 📊 总览` 提取） |
| `<!-- OVERVIEW_ROWS_PLACEHOLDER -->` | 总览表格行 |
| `<!-- DETAIL_CARDS_PLACEHOLDER -->` | 详情卡片区域 |

## 内容处理规则

### 发布者身份

1. **删除 @ 账号**：`Elon Musk (@elonmusk)` → `Elon Musk`
2. **个人需补充身份**：`Elon Musk` → `Elon Musk (X CEO)`
3. **公司/产品不需要**：`OpenAI` → `OpenAI`

### 标点符号

中文标点**必须全角**（括号除外）：
- `,` → `，`
- `:` → `：`
- `;` → `；`

### 时间格式

UTC → 北京时间：
- `2026-01-27 17:59 UTC` → `2026-01-28 01:59 北京时间`

### 链接

生成 HTML 时删除所有链接。

## 详情卡片结构

```html
<section class="detail-card">
    <div class="detail-header">
        <div class="detail-number">N</div>
        <div class="detail-title-group">
            <h3 class="detail-title">主体 - 标题</h3>
        </div>
    </div>
    <div class="detail-meta">
        <span><strong>发布者</strong>：Author</span>
        <span><strong>时间</strong>：Time</span>
    </div>
    <div class="detail-content">
        <div class="content-section">
            <h4>🚀 核心内容</h4>
            <ul class="content-list">
                <li>内容...</li>
            </ul>
        </div>
        <div class="content-section">
            <h4>📸 原帖截图</h4>
            <div class="screenshots">
                <div class="screenshot-item">
                    <img src="N.png" alt="Screenshot">
                </div>
            </div>
        </div>
    </div>
</section>
```

## 截图布局

| 数量 | CSS 类 |
|------|--------|
| 1张 | `.screenshots` |
| 2张 | `.screenshots-grid-2` |
| 3张 | `.screenshots-grid-3` |
| 4张 | `.screenshots-grid-4` |
| 1大+3小 | `.screenshots-layout-1-3` |

## 水印

页面自动包含透明水印：
- 文字：`清华小禾说AI`
- 透明度：6%
- 颜色：紫色 `#9333ea`

修改水印请编辑 `style.css` 中的 `body::after` SVG。

## 输出命名

```
ai_posts_summary_YYYY-MM-DD.html
```

## 图片路径注意事项

根据输出目录位置计算正确的相对路径：
- 如果 HTML 在 `processed/output/`，截图在 `screenshots/2026-02-09/`
- 相对路径应为 `../../screenshots/2026-02-09/xx.png`（向上两级）
- assets 同理：`../../assets/logo.png`

**常见错误**：只用一级 `../` 会导致找不到图片

## 文件结构

```
output-folder/
├── ai_posts_summary_YYYY-MM-DD.html
├── style.css
├── 1.png  (截图)
├── 2.png
└── ...
```
