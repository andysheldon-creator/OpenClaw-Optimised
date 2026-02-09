"""
AI Daily Orchestrator - 一条龙编排发布流程

子命令:
- full: 完整流程
- screenshot: 截图采集
- summarize: AI 总结
- publish: 发布 HTML + JSON
"""
import argparse
import subprocess
import sys
import re
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List

# Skill paths
SKILLS_DIR = Path(__file__).parent.parent.parent
PLAYWRIGHT_SKILL = SKILLS_DIR / "playwright-screenshot"
AI_DIGEST_SKILL = SKILLS_DIR / "ai-news-digest"
PUBLISH_SKILL = SKILLS_DIR / "ai-daily-publish"

# Python interpreter (use the one with dependencies)
PYTHON = r"C:\Users\taoli1\ai-daily-uploader\.venv\Scripts\python.exe"


class Orchestrator:
    """Orchestrate AI Daily publishing workflow"""
    
    def __init__(self, workdir: Path = None, date: str = None):
        self.workdir = workdir or Path.cwd()
        self.date = date or datetime.now().strftime("%Y-%m-%d")
        
        # Standard directory structure
        self.raw_dir = self.workdir / "raw"
        self.screenshots_dir = self.workdir / "screenshots"
        self.processed_dir = self.workdir / "processed"
        self.output_dir = self.workdir / "output"
    
    def run_full(self, input_file: Path, skip_screenshot: bool = False, 
                 skip_summarize: bool = False, **kwargs) -> bool:
        """Run complete pipeline"""
        print("=" * 60)
        print(f"AI Daily Full Pipeline - {self.date}")
        print("=" * 60)
        
        # Step 1: Screenshot
        if not skip_screenshot:
            print("\n[Step 1/3] Capturing screenshots...")
            screenshots_out = self.screenshots_dir / self.date
            success = self.run_screenshot(input_file, screenshots_out)
            if not success:
                print("[WARN] Screenshot step had issues, continuing...")
        else:
            print("\n[Step 1/3] Skipping screenshots (--skip-screenshot)")
            screenshots_out = self.screenshots_dir / "final"
        
        # Step 2: Summarize
        if not skip_summarize:
            print("\n[Step 2/3] Summarizing with AI...")
            processed_file = self.processed_dir / f"硅谷AI圈动态-{self.date}.md"
            success = self.run_summarize(input_file, screenshots_out, processed_file)
            if not success:
                print("[ERROR] Summarize step failed")
                return False
        else:
            print("\n[Step 2/3] Skipping summarize (--skip-summarize)")
            # Look for existing processed file
            processed_file = self._find_processed_file()
            if not processed_file:
                processed_file = input_file  # Use input as-is
        
        # Step 3: Publish
        print("\n[Step 3/3] Publishing HTML + JSON...")
        success = self.run_publish(processed_file, screenshots_out, **kwargs)
        
        if success:
            print("\n" + "=" * 60)
            print("[DONE] Full pipeline complete!")
            print(f"       Output: {self.output_dir}")
            print("=" * 60)
        
        return success
    
    def run_screenshot(self, input_file: Path, output_dir: Path) -> bool:
        """Extract URLs from markdown and capture screenshots"""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Read input and extract Twitter URLs
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find Twitter/X URLs
        url_pattern = r'https?://(?:twitter\.com|x\.com)/\w+/status/\d+'
        urls = re.findall(url_pattern, content)
        
        if not urls:
            print(f"      No Twitter URLs found in {input_file.name}")
            return True
        
        print(f"      Found {len(urls)} Twitter URLs")
        
        # Use playwright-screenshot skill
        screenshot_script = PLAYWRIGHT_SKILL / "scripts" / "screenshot.py"
        if not screenshot_script.exists():
            print(f"      [WARN] playwright-screenshot skill not found")
            return False
        
        success_count = 0
        for i, url in enumerate(urls, 1):
            output_file = output_dir / f"{i:02d}.png"
            print(f"      [{i}/{len(urls)}] Capturing {url[:50]}...")
            
            try:
                result = subprocess.run(
                    [PYTHON, str(screenshot_script), url, "--output", str(output_file)],
                    capture_output=True,
                    text=True,
                    timeout=60,
                    env={**os.environ, "PYTHONIOENCODING": "utf-8"}
                )
                if result.returncode == 0:
                    success_count += 1
                else:
                    print(f"            [FAIL] {result.stderr[:100] if result.stderr else 'Unknown error'}")
            except subprocess.TimeoutExpired:
                print(f"            [TIMEOUT]")
            except Exception as e:
                print(f"            [ERROR] {e}")
        
        print(f"      Captured {success_count}/{len(urls)} screenshots")
        return success_count > 0
    
    def run_summarize(self, input_file: Path, screenshots_dir: Path, 
                      output_file: Path) -> bool:
        """Use AI to summarize raw news into structured markdown"""
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Check for ai-news-digest skill
        digest_script = AI_DIGEST_SKILL / "scripts" / "digest.py"
        
        if digest_script.exists():
            # Use the skill
            try:
                result = subprocess.run(
                    [PYTHON, str(digest_script), str(input_file), 
                     "--screenshots", str(screenshots_dir),
                     "--output", str(output_file)],
                    capture_output=True,
                    text=True,
                    timeout=300,
                    env={**os.environ, "PYTHONIOENCODING": "utf-8"}
                )
                return result.returncode == 0
            except Exception as e:
                print(f"      [ERROR] {e}")
                return False
        else:
            # Manual mode - just copy input with a note
            print("      [INFO] ai-news-digest skill not found")
            print("      [INFO] Please manually create structured markdown")
            print(f"      [INFO] Expected output: {output_file}")
            return False
    
    def run_publish(self, input_file: Path, screenshots_dir: Path,
                    expires: int = 6, skip_existing: bool = True, 
                    no_json: bool = False, **kwargs) -> bool:
        """Run ai-daily-publish to generate HTML + JSON"""
        publish_script = PUBLISH_SKILL / "scripts" / "publish.py"
        
        if not publish_script.exists():
            print(f"      [ERROR] ai-daily-publish skill not found")
            return False
        
        cmd = [
            PYTHON, str(publish_script),
            str(input_file),
            "--screenshots", str(screenshots_dir),
            "--output", str(self.output_dir / f"ai_posts_summary_{self.date}.html"),
            "--expires", str(expires)
        ]
        
        if skip_existing:
            cmd.append("--skip-existing")
        
        if no_json:
            cmd.append("--no-json")
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=False,  # Show output directly
                text=True,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"}
            )
            return result.returncode == 0
        except Exception as e:
            print(f"      [ERROR] {e}")
            return False
    
    def _find_processed_file(self) -> Optional[Path]:
        """Find existing processed markdown file"""
        patterns = [
            self.processed_dir / f"硅谷AI圈动态-{self.date}.md",
            self.workdir / f"硅谷AI圈动态-{self.date}.md",
        ]
        for p in patterns:
            if p.exists():
                return p
        return None


def main():
    parser = argparse.ArgumentParser(
        description="AI Daily Orchestrator - 一条龙发布流程",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Complete pipeline
  python orchestrate.py full --input raw_news.md
  
  # Just screenshots
  python orchestrate.py screenshot --input news.md --output screenshots/
  
  # Just publish (most common)
  python orchestrate.py publish --input 硅谷AI圈动态-2026-02-08.md
"""
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Sub-commands")
    
    # Full pipeline
    full_parser = subparsers.add_parser("full", help="Run complete pipeline")
    full_parser.add_argument("--input", "-i", required=True, help="Input markdown file")
    full_parser.add_argument("--date", "-d", help="Date (YYYY-MM-DD), default today")
    full_parser.add_argument("--workdir", "-w", help="Working directory")
    full_parser.add_argument("--skip-screenshot", action="store_true", help="Skip screenshot step")
    full_parser.add_argument("--skip-summarize", action="store_true", help="Skip summarize step")
    full_parser.add_argument("--expires", type=int, default=6, help="Signed URL expiry hours")
    
    # Screenshot only
    ss_parser = subparsers.add_parser("screenshot", help="Capture screenshots only")
    ss_parser.add_argument("--input", "-i", required=True, help="Markdown with URLs or URL list")
    ss_parser.add_argument("--output", "-o", required=True, help="Output directory")
    
    # Summarize only
    sum_parser = subparsers.add_parser("summarize", help="AI summarize only")
    sum_parser.add_argument("--input", "-i", required=True, help="Raw markdown")
    sum_parser.add_argument("--screenshots", "-s", required=True, help="Screenshots directory")
    sum_parser.add_argument("--output", "-o", required=True, help="Output markdown")
    
    # Publish only
    pub_parser = subparsers.add_parser("publish", help="Publish HTML + JSON only")
    pub_parser.add_argument("--input", "-i", required=True, help="Structured markdown")
    pub_parser.add_argument("--screenshots", "-s", help="Screenshots directory")
    pub_parser.add_argument("--output-dir", "-o", help="Output directory")
    pub_parser.add_argument("--date", "-d", help="Date (YYYY-MM-DD)")
    pub_parser.add_argument("--expires", type=int, default=6, help="Signed URL expiry hours")
    pub_parser.add_argument("--skip-existing", action="store_true", default=True, 
                           help="Skip existing OSS files")
    pub_parser.add_argument("--no-json", action="store_true", help="Skip JSON output")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Determine working directory and date
    if hasattr(args, 'workdir') and args.workdir:
        workdir = Path(args.workdir)
    elif hasattr(args, 'input'):
        workdir = Path(args.input).parent
    else:
        workdir = Path.cwd()
    
    date = getattr(args, 'date', None)
    if not date and hasattr(args, 'input'):
        # Try to extract date from filename
        match = re.search(r'(\d{4}-\d{2}-\d{2})', args.input)
        if match:
            date = match.group(1)
    
    orchestrator = Orchestrator(workdir=workdir, date=date)
    
    # Execute command
    if args.command == "full":
        success = orchestrator.run_full(
            Path(args.input),
            skip_screenshot=args.skip_screenshot,
            skip_summarize=args.skip_summarize,
            expires=args.expires
        )
    
    elif args.command == "screenshot":
        success = orchestrator.run_screenshot(
            Path(args.input),
            Path(args.output)
        )
    
    elif args.command == "summarize":
        success = orchestrator.run_summarize(
            Path(args.input),
            Path(args.screenshots),
            Path(args.output)
        )
    
    elif args.command == "publish":
        input_path = Path(args.input)
        
        # Find screenshots directory
        if args.screenshots:
            screenshots_dir = Path(args.screenshots)
        else:
            # Try common locations
            for candidate in [
                input_path.parent / "screenshots" / "final",
                input_path.parent / "screenshots" / orchestrator.date,
                input_path.parent / "screenshots",
            ]:
                if candidate.exists():
                    screenshots_dir = candidate
                    break
            else:
                screenshots_dir = input_path.parent / "screenshots"
        
        # Set output directory
        if args.output_dir:
            orchestrator.output_dir = Path(args.output_dir)
        else:
            orchestrator.output_dir = input_path.parent / "output"
        
        success = orchestrator.run_publish(
            input_path,
            screenshots_dir,
            expires=args.expires,
            skip_existing=args.skip_existing,
            no_json=args.no_json
        )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
