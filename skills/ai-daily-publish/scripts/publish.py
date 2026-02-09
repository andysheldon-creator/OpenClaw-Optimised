"""
AI Daily One-Stop Publishing Pipeline

Combines:
1. Markdown parsing
2. HTML generation (from md-to-html templates)
3. OSS upload with signed URLs
4. URL replacement in final HTML
"""
import argparse
import re
import sys
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Tuple

# Add oss-image-uploader to path
OSS_SKILL_PATH = Path(__file__).parent.parent.parent / "oss-image-uploader" / "scripts"
sys.path.insert(0, str(OSS_SKILL_PATH))

# Templates from md-to-html skill
MD_TO_HTML_PATH = Path(__file__).parent.parent.parent / "md-to-html" / "templates"


class AINewsParser:
    """Parse AI news Markdown file - supports multiple formats"""
    
    def __init__(self, content: str):
        self.content = content
        self.entries = []
        self.overview_text = ""
        self.date_title = ""
    
    def parse(self) -> List[Dict]:
        """Parse markdown and extract news entries"""
        lines = self.content.split('\n')
        
        # Extract date from first heading
        for line in lines:
            if line.startswith('# '):
                self.date_title = line[2:].strip()
                break
        
        # Extract overview/summary section
        in_overview = False
        overview_lines = []
        for line in lines:
            if '## ' in line and ('总览' in line or 'Overview' in line or '头条' in line):
                in_overview = True
                # Extract from heading itself if it contains content after colon
                match = re.search(r'[:：]\s*(.+)$', line)
                if match:
                    overview_lines.append(match.group(1).strip())
                continue
            if in_overview and line.startswith('## '):
                break
            if in_overview and line.startswith('### '):
                break
            if in_overview and line.strip() and not line.startswith('>'):
                overview_lines.append(line.strip())
        self.overview_text = ' '.join(overview_lines) if overview_lines else self.date_title
        
        # Extract news entries (### sections)
        current_entry = None
        
        for i, line in enumerate(lines):
            if line.startswith('### '):
                if current_entry:
                    self.entries.append(current_entry)
                
                title = line[4:].strip()
                # Parse "N. Title" format
                match = re.match(r'^(\d+)\.\s*(.+)$', title)
                if match:
                    num, title_text = match.groups()
                else:
                    num = str(len(self.entries) + 1)
                    title_text = title
                
                current_entry = {
                    'number': num,
                    'title': title_text,
                    'author': '',
                    'time': '',
                    'content': [],
                    'screenshots': []
                }
            
            elif current_entry:
                # Parse author - Chinese and English formats
                # **发布者:** @OpenAI, @sama (Sam Altman)
                # **Author**: xxx
                if '**' in line and ('发布者' in line or 'Author' in line or 'author' in line):
                    match = re.search(r'\*\*[^*]+\*\*:?\s*(.+)$', line)
                    if match:
                        current_entry['author'] = self._clean_author(match.group(1))
                
                # Parse time - Chinese and English
                # **时间:** 2026-01-29 14:42
                # Must start with **时间** or **Time** pattern
                elif line.strip().startswith('**时间') or line.strip().startswith('**Time'):
                    match = re.search(r'\*\*[^*]+\*\*:?\s*(.+)$', line)
                    if match:
                        current_entry['time'] = self._convert_time(match.group(1))
                
                # Parse image - ![alt](path) format
                elif line.strip().startswith('!['):
                    match = re.search(r'\!\[([^\]]*)\]\(([^)]+)\)', line)
                    if match:
                        img_path = match.group(2)
                        # Extract just the filename
                        filename = Path(img_path).name
                        current_entry['screenshots'].append(filename)
                
                # Parse content bullets - skip metadata lines
                elif line.startswith('- '):
                    text = line[2:].strip()
                    # Skip metadata and empty lines
                    skip_keywords = ['screenshot', 'author', 'time', '发布者', '时间', '截图', 
                                     '原始推文', '官方博客', 'http', '在线 Demo']
                    if text and len(text) > 5:
                        if not any(kw.lower() in text.lower() for kw in skip_keywords):
                            # Convert markdown bold to HTML
                            text = self._convert_markdown_to_html(text)
                            current_entry['content'].append(text)
        
        if current_entry:
            self.entries.append(current_entry)
        
        return self.entries
    
    def _clean_author(self, author: str) -> str:
        """Clean author name - keep identity info but clean up @ handles"""
        cleaned = author.strip()
        # Remove @ at the very start
        if cleaned.startswith('@'):
            cleaned = cleaned[1:]
        # Convert @handle to just the name, but keep parenthetical info
        # "@OpenAI, @sama (Sam Altman)" -> "OpenAI / Sam Altman"
        parts = re.split(r',\s*', cleaned)
        result_parts = []
        for part in parts:
            part = part.strip()
            if part.startswith('@'):
                part = part[1:]
            # Extract name from parentheses if present: "@sama (Sam Altman)" -> "Sam Altman"
            paren_match = re.search(r'\(([^)]+)\)', part)
            if paren_match:
                # Use the parenthetical as the display name
                result_parts.append(paren_match.group(1))
            else:
                result_parts.append(part)
        return ' / '.join(result_parts)
    
    def _convert_time(self, time_str: str) -> str:
        """Convert UTC to Beijing time notation"""
        result = time_str.strip()
        if 'UTC' in result:
            result = result.replace('UTC', '北京时间')
        return result
    
    def _convert_markdown_to_html(self, text: str) -> str:
        """Convert markdown bold/italic to HTML"""
        # **text** -> <strong>text</strong>
        text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
        # Remove leading emoji (keep for display but normalize spacing)
        text = re.sub(r'^[\U0001F300-\U0001F9FF\U0001FA00-\U0001FAFF\U00002600-\U000027BF]\s*', '', text)
        return text


class HTMLGenerator:
    """Generate HTML from parsed news entries"""
    
    def __init__(self, template_dir: Path):
        self.template_dir = template_dir
        self.layout_path = template_dir / "layout.html"
        self.style_path = template_dir / "style.css"
    
    def generate(self, parser: AINewsParser, url_mappings: Dict[str, str] = None) -> str:
        """Generate complete HTML"""
        if not self.layout_path.exists():
            # Use fallback template
            return self._generate_fallback(parser, url_mappings)
        
        with open(self.layout_path, 'r', encoding='utf-8') as f:
            template = f.read()
        
        # Replace placeholders
        html = template
        html = html.replace('{{TITLE}}', parser.date_title or 'AI Daily')
        html = html.replace('{{DATE_TITLE}}', parser.date_title or 'AI News')
        html = html.replace('{{OVERVIEW_TEXT}}', parser.overview_text)
        
        # Generate overview rows
        overview_rows = self._generate_overview_rows(parser.entries)
        html = html.replace('<!-- OVERVIEW_ROWS_PLACEHOLDER -->', overview_rows)
        
        # Generate detail cards
        detail_cards = self._generate_detail_cards(parser.entries, url_mappings)
        html = html.replace('<!-- DETAIL_CARDS_PLACEHOLDER -->', detail_cards)
        
        return html
    
    def _generate_fallback(self, parser: AINewsParser, url_mappings: Dict[str, str] = None) -> str:
        """Generate HTML without template"""
        cards = self._generate_detail_cards(parser.entries, url_mappings)
        overview_rows = self._generate_overview_rows(parser.entries)
        
        return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{parser.date_title}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="logo-container">
                <span class="main-title-inline">{parser.date_title}</span>
            </div>
            <p class="subtitle">过去24小时，硅谷AI大佬在讨论什么</p>
            <p class="data-source">数据来源：X(twitter)平台实时推文</p>
            <div class="divider"></div>
        </header>
        
        <section class="overview-card">
            <h2 class="overview-title">📊 总览</h2>
            <p class="overview-text">{parser.overview_text}</p>
            <table class="event-table">
                <thead>
                    <tr>
                        <th>主题</th>
                        <th>关键事件</th>
                    </tr>
                </thead>
                <tbody>
                    {overview_rows}
                </tbody>
            </table>
        </section>
        
        {cards}
        
        <footer class="footer">
            <p class="copyright">© 2026 小禾说AI · AI Today Daily · All Rights Reserved</p>
        </footer>
    </div>
</body>
</html>'''
    
    def _generate_overview_rows(self, entries: List[Dict]) -> str:
        """Generate overview table rows with topic tags"""
        rows = []
        for entry in entries:
            # Extract main topic from title - the subject/company name
            # "OpenAI 发布 GPT-5.3" -> "OpenAI"
            # "Anthropic 发布 Claude" -> "Anthropic"
            title = entry['title']
            # Try to extract subject before action verbs
            topic_match = re.match(r'^([^发布推出公布宣布]+?)(?:发布|推出|公布|宣布|:|-)', title)
            if topic_match:
                topic = topic_match.group(1).strip()
            else:
                # Fallback: first word or phrase before space
                words = title.split()
                topic = words[0] if words else title[:15]
            
            row = f'''<tr>
                <td><span class="topic-tag">{topic}</span></td>
                <td>{entry['title']}</td>
            </tr>'''
            rows.append(row)
        return '\n'.join(rows)
    
    def _generate_detail_cards(self, entries: List[Dict], url_mappings: Dict[str, str] = None) -> str:
        """Generate detail card sections"""
        cards = []
        
        for entry in entries:
            # Content list - limit to 6 items
            content_items = '\n'.join(f'<li>{item}</li>' for item in entry['content'][:6])
            
            # Screenshots
            screenshots_html = self._generate_screenshots(entry['screenshots'], url_mappings)
            
            # Build meta section
            meta_parts = []
            if entry['author']:
                meta_parts.append(f"<span><strong>发布者</strong>：{entry['author']}</span>")
            if entry['time']:
                meta_parts.append(f"<span><strong>时间</strong>：{entry['time']}</span>")
            meta_html = '\n'.join(meta_parts) if meta_parts else ''
            
            card = f'''<section class="detail-card">
    <div class="detail-header">
        <div class="detail-number">{entry['number']}</div>
        <div class="detail-title-group">
            <h3 class="detail-title">{entry['title']}</h3>
        </div>
    </div>
    <div class="detail-meta">
        {meta_html}
    </div>
    <div class="detail-content">
        <div class="content-section">
            <h4>🚀 核心内容</h4>
            <ul class="content-list">
                {content_items}
            </ul>
        </div>
        {screenshots_html}
    </div>
</section>'''
            cards.append(card)
        
        return '\n\n'.join(cards)
    
    def _generate_screenshots(self, screenshots: List[str], url_mappings: Dict[str, str] = None) -> str:
        """Generate screenshots HTML"""
        if not screenshots:
            return ''
        
        # Determine grid class
        count = len(screenshots)
        if count == 1:
            grid_class = 'screenshots'
        elif count == 2:
            grid_class = 'screenshots-grid-2'
        elif count == 3:
            grid_class = 'screenshots-grid-3'
        else:
            grid_class = 'screenshots-grid-4'
        
        items = []
        for filename in screenshots:
            # Use signed URL if available
            if url_mappings and filename in url_mappings:
                src = url_mappings[filename]
            else:
                src = filename
            
            items.append(f'<div class="screenshot-item"><img src="{src}" alt="Screenshot"></div>')
        
        return f'''<div class="content-section">
    <h4>📸 原帖截图</h4>
    <div class="{grid_class}">
        {chr(10).join(items)}
    </div>
</div>'''
    
    def copy_style(self, output_dir: Path):
        """Copy style.css to output directory"""
        if self.style_path.exists():
            shutil.copy(self.style_path, output_dir / "style.css")


class JSONGenerator:
    """Generate JSON for mini-program consumption"""
    
    # OSS base URL for direct (non-signed) URLs
    OSS_BASE_URL = "https://ai-daily.oss-cn-beijing.aliyuncs.com"
    LOGO_URL = f"{OSS_BASE_URL}/assets/%E5%B0%8F%E7%A6%BE%E8%AF%B4AI%20logo.png"
    QR_URL = f"{OSS_BASE_URL}/assets/0116_1.JPG"
    
    def generate(self, parser: 'AINewsParser', date_str: str, oss_prefix: str = None) -> Dict:
        """
        Generate JSON structure for mini-program.
        
        Args:
            parser: Parsed news data
            date_str: Date string in YYYY-MM-DD format
            oss_prefix: OSS path prefix for screenshots (e.g., "screenshots/2026-02-06")
        """
        # Format date for title: YYYY-MM-DD -> YYYY/MM/DD
        date_display = date_str.replace('-', '/')
        
        # Build the complete JSON structure
        result = {
            "version": "1.0",
            "generatedAt": datetime.now().isoformat(),
            "date": date_str,
            "header": self._generate_header(date_str, date_display),
            "overview": self._generate_overview(parser),
            "details": self._generate_details(parser, date_str, oss_prefix),
            "footer": self._generate_footer()
        }
        
        return result
    
    def _generate_header(self, date_str: str, date_display: str) -> Dict:
        """Generate header section"""
        return {
            "date": date_str,
            "title": f"{date_display} 硅谷AI圈动态",
            "subtitle": "过去24小时，硅谷AI大佬在讨论什么",
            "dataSource": "数据来源：X(twitter)平台实时推文",
            "creators": [
                {
                    "name": "小禾说AI (公众号)",
                    "logo": self.LOGO_URL
                },
                {
                    "name": "清华小禾说AI (视频号)",
                    "logo": self.LOGO_URL
                }
            ]
        }
    
    def _generate_overview(self, parser: 'AINewsParser') -> Dict:
        """Generate overview section"""
        events = []
        for entry in parser.entries:
            # Extract topic from title
            title = entry['title']
            topic_match = re.match(r'^([^发布推出公布宣布\-:]+?)(?:发布|推出|公布|宣布|:|-|$)', title)
            if topic_match:
                topic = topic_match.group(1).strip()
            else:
                words = title.split()
                topic = words[0] if words else title[:15]
            
            # Event is the full title or a summary
            events.append({
                "topic": topic,
                "event": entry['title']
            })
        
        return {
            "intro": parser.overview_text or parser.date_title,
            "events": events
        }
    
    def _generate_details(self, parser: 'AINewsParser', date_str: str, oss_prefix: str = None) -> List[Dict]:
        """Generate details section with proper structure"""
        details = []
        
        for entry in parser.entries:
            # Build content items with highlights
            items = []
            for content_text in entry['content']:
                item = self._parse_content_item(content_text)
                items.append(item)
            
            # Build screenshots with direct OSS URLs
            screenshots = []
            for filename in entry['screenshots']:
                if oss_prefix:
                    url = f"{self.OSS_BASE_URL}/{oss_prefix}/{filename}"
                else:
                    url = f"{self.OSS_BASE_URL}/screenshots/{date_str}/{filename}"
                screenshots.append({
                    "url": url,
                    "alt": "Screenshot"
                })
            
            # Build sections
            sections = []
            
            # Add list section if there are items
            if items:
                sections.append({
                    "type": "list",
                    "title": "🚀 核心内容",
                    "items": items
                })
            
            # Add screenshots section if there are screenshots
            if screenshots:
                sections.append({
                    "type": "screenshots",
                    "title": "📸 原帖截图",
                    "screenshots": screenshots
                })
            
            detail = {
                "number": int(entry['number']),
                "title": entry['title'],
                "publisher": entry['author'] or "",
                "time": entry['time'] or "",
                "sections": sections
            }
            details.append(detail)
        
        return details
    
    def _parse_content_item(self, text: str) -> Dict:
        """
        Parse content text and extract highlights.
        
        Input formats:
        - "<strong>高亮词</strong>: 描述"
        - "高亮词： 描述"
        - "普通描述"
        """
        # First handle HTML strong tags anywhere in text (may have leading chars/emoji)
        strong_match = re.search(r'<strong>([^<]+)</strong>:?\s*(.*)', text)
        if strong_match:
            highlight = strong_match.group(1).strip()
            rest = strong_match.group(2).strip()
            full_text = f"{highlight}： {rest}" if rest else highlight
            return {
                "text": full_text,
                "highlights": [highlight],
                "nested": None
            }
        
        # Try Chinese colon format: "高亮词：描述"
        colon_match = re.match(r'^([^：:]+)[：:]\s*(.+)$', text)
        if colon_match:
            highlight = colon_match.group(1).strip()
            rest = colon_match.group(2).strip()
            # Only treat as highlight if the first part is short enough
            if len(highlight) <= 20:
                return {
                    "text": f"{highlight}： {rest}",
                    "highlights": [highlight],
                    "nested": None
                }
        
        # No highlight found
        return {
            "text": text,
            "highlights": [],
            "nested": None
        }
    
    def _generate_footer(self) -> Dict:
        """Generate footer section"""
        return {
            "qr": {
                "title": "✨ 加入「小禾AI交流群」",
                "subtitle": "不错过 <硅谷AI圈动态> 每日更新",
                "images": [
                    {
                        "url": self.QR_URL,
                        "alt": "扫码加群"
                    }
                ]
            },
            "copyright": "© 2026 小禾说AI · AI Today Daily · All Rights Reserved"
        }


def main():
    import json
    
    parser = argparse.ArgumentParser(description="AI Daily One-Stop Publishing")
    parser.add_argument("markdown", help="Markdown source file")
    parser.add_argument("--screenshots", help="Screenshots directory")
    parser.add_argument("--output", help="Output HTML file path")
    parser.add_argument("--json-output", help="Output JSON file path (for mini-program)")
    parser.add_argument("--expires", type=int, default=6, help="Signed URL expiry in hours (default: 6)")
    parser.add_argument("--no-upload", action="store_true", help="Skip OSS upload, use local paths")
    parser.add_argument("--skip-existing", action="store_true", help="Skip uploading files that exist in OSS")
    parser.add_argument("--no-json", action="store_true", help="Skip JSON output")
    
    args = parser.parse_args()
    
    md_path = Path(args.markdown)
    if not md_path.exists():
        print(f"[ERROR] Markdown file not found: {md_path}")
        sys.exit(1)
    
    print("=" * 60)
    print("AI Daily Publishing Pipeline")
    print("=" * 60)
    print(f"[*] Source: {md_path.name}")
    
    # Extract date from filename
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', md_path.name)
    date_str = date_match.group(1) if date_match else datetime.now().strftime('%Y-%m-%d')
    
    # Determine screenshots directory
    if args.screenshots:
        screenshots_dir = Path(args.screenshots)
    else:
        # Try common locations
        possible_dirs = [
            md_path.parent / "screenshots" / "final",
            md_path.parent / "screenshots",
        ]
        # Also try date-based
        match = re.search(r'(\d{4}-\d{2}-\d{2})', md_path.name)
        if match:
            date_str = match.group(1)
            possible_dirs.insert(0, md_path.parent / "screenshots" / date_str)
        
        screenshots_dir = None
        for d in possible_dirs:
            if d.exists():
                screenshots_dir = d
                break
        
        if not screenshots_dir:
            screenshots_dir = md_path.parent / "screenshots"
    
    print(f"[*] Screenshots: {screenshots_dir.name if screenshots_dir else 'None'}")
    
    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = md_path.parent / "output" / f"ai_posts_summary_{date_str}.html"
    
    # Determine JSON output path
    if args.json_output:
        json_output_path = Path(args.json_output)
    elif not args.no_json:
        json_output_path = md_path.parent / "output" / f"{date_str}.json"
    else:
        json_output_path = None
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"[*] Output: {output_path.name}")
    print()
    
    # Step 1: Parse Markdown
    print("[1/4] Parsing Markdown...")
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    news_parser = AINewsParser(content)
    entries = news_parser.parse()
    print(f"      Found {len(entries)} news entries")
    
    # Show what was parsed
    for e in entries[:3]:
        author_preview = e['author'][:20] + '...' if len(e['author']) > 20 else e['author']
        print(f"      - [{e['number']}] {e['title'][:30]}... | {author_preview or '(no author)'}")
    if len(entries) > 3:
        print(f"      ... and {len(entries) - 3} more")
    
    # Step 2: Upload screenshots to OSS
    url_mappings = {}
    oss_prefix = None  # Track OSS prefix for JSON generation
    
    if not args.no_upload and screenshots_dir and screenshots_dir.exists():
        print("[2/5] Uploading screenshots to OSS...")
        
        try:
            from oss_uploader import OSSUploader
            uploader = OSSUploader()
            
            # Determine OSS prefix
            oss_prefix = f"screenshots/{date_str}"
            
            print(f"      OSS prefix: {oss_prefix}/")
            
            # Find and upload images
            extensions = ['.webp', '.png', '.jpg', '.jpeg', '.gif']
            for img_path in sorted(screenshots_dir.iterdir()):
                if img_path.is_file() and img_path.suffix.lower() in extensions:
                    oss_key = f"{oss_prefix}/{img_path.name}"
                    
                    if args.skip_existing and uploader.file_exists(oss_key):
                        signed_url = uploader.get_signed_url(oss_key, args.expires)
                        print(f"      [SKIP] {img_path.name}")
                    else:
                        signed_url = uploader.upload_and_sign(str(img_path), oss_key, args.expires)
                        print(f"      [OK] {img_path.name}")
                    
                    url_mappings[img_path.name] = signed_url
            
            print(f"      Total: {len(url_mappings)} images")
        
        except ImportError:
            print("      [WARN] oss_uploader not available, using local paths")
        except Exception as e:
            print(f"      [ERROR] OSS upload failed: {e}")
            print("      Continuing with local paths...")
    else:
        print("[2/5] Skipping OSS upload")
    
    # Step 3: Generate HTML
    print("[3/5] Generating HTML...")
    html_gen = HTMLGenerator(MD_TO_HTML_PATH)
    html_content = html_gen.generate(news_parser, url_mappings)
    
    # Step 4: Generate JSON (for mini-program)
    json_data = None
    if json_output_path:
        print("[4/5] Generating JSON...")
        json_gen = JSONGenerator()
        json_data = json_gen.generate(news_parser, date_str, oss_prefix)
    else:
        print("[4/5] Skipping JSON generation")
    
    # Step 5: Write output
    print("[5/5] Writing output...")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    # Write JSON if generated
    if json_data and json_output_path:
        json_output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(json_output_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
    
    # Copy style.css
    html_gen.copy_style(output_path.parent)
    
    print()
    print("=" * 60)
    print("[DONE] Publishing complete!")
    print(f"       HTML: {output_path}")
    if json_output_path:
        print(f"       JSON: {json_output_path}")
    if url_mappings:
        print(f"       Signed URLs valid for {args.expires} hours")
    print("=" * 60)


if __name__ == "__main__":
    main()
