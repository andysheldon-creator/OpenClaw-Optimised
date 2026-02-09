"""
Replace image URLs in HTML file with signed OSS URLs
"""
import argparse
import re
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from oss_uploader import OSSUploader


def replace_image_urls(html_content: str, url_mappings: dict) -> str:
    """
    Replace local image paths with signed URLs in HTML content.
    
    Handles patterns like:
    - src="1.webp"
    - src="./1.webp"
    - src="images/1.webp"
    """
    result = html_content
    
    for local_name, signed_url in url_mappings.items():
        # Match various src patterns
        patterns = [
            rf'src="\.?/?{re.escape(local_name)}"',  # src="1.webp" or src="./1.webp"
            rf'src="[^"]*/{re.escape(local_name)}"',  # src="path/to/1.webp"
        ]
        
        replacement = f'src="{signed_url}"'
        
        for pattern in patterns:
            result = re.sub(pattern, replacement, result)
    
    return result


def main():
    parser = argparse.ArgumentParser(description="Replace image URLs in HTML with signed OSS URLs")
    parser.add_argument("html_file", help="HTML file to process")
    parser.add_argument("--image-dir", required=True, help="Directory containing images")
    parser.add_argument("--prefix", help="OSS path prefix (default: auto from date)")
    parser.add_argument("--expires", type=int, default=6, help="Signed URL expiry in hours (default: 6)")
    parser.add_argument("--output", help="Output HTML file (default: overwrite input)")
    parser.add_argument("--mappings", help="Use existing URL mappings JSON instead of uploading")
    parser.add_argument("--upload", action="store_true", help="Upload images first (default: assume already uploaded)")
    
    args = parser.parse_args()
    
    html_path = Path(args.html_file)
    if not html_path.exists():
        print(f"[ERROR] HTML file not found: {html_path}")
        sys.exit(1)
    
    image_dir = Path(args.image_dir)
    if not image_dir.exists():
        print(f"[ERROR] Image directory not found: {image_dir}")
        sys.exit(1)
    
    print(f"[*] Processing: {html_path}")
    print(f"[*] Image dir: {image_dir}")
    print()
    
    # Get URL mappings
    if args.mappings:
        # Load from JSON
        with open(args.mappings, 'r', encoding='utf-8') as f:
            url_mappings = json.load(f)
        print(f"[OK] Loaded {len(url_mappings)} URL mappings from {args.mappings}")
    else:
        # Generate from OSS
        uploader = OSSUploader()
        
        # Determine prefix
        if args.prefix:
            prefix = args.prefix.rstrip('/')
        else:
            # Try to extract date from filename like ai_posts_summary_2026-01-29.html
            match = re.search(r'(\d{4}-\d{2}-\d{2})', html_path.name)
            if match:
                prefix = f"screenshots/{match.group(1)}"
            else:
                from datetime import datetime
                prefix = f"screenshots/{datetime.now().strftime('%Y-%m-%d')}"
        
        print(f"[*] OSS prefix: {prefix}/")
        
        # Find images in directory
        extensions = ['.webp', '.png', '.jpg', '.jpeg', '.gif']
        image_files = [f for f in image_dir.iterdir() 
                       if f.is_file() and f.suffix.lower() in extensions]
        
        url_mappings = {}
        
        for img_path in image_files:
            oss_key = f"{prefix}/{img_path.name}"
            
            if args.upload:
                # Upload and sign
                signed_url = uploader.upload_and_sign(str(img_path), oss_key, args.expires)
                print(f"   [UPLOAD] {img_path.name}")
            else:
                # Just generate signed URL (assume already uploaded)
                if uploader.file_exists(oss_key):
                    signed_url = uploader.get_signed_url(oss_key, args.expires)
                    print(f"   [SIGN] {img_path.name}")
                else:
                    print(f"   [SKIP] {img_path.name} (not in OSS)")
                    continue
            
            url_mappings[img_path.name] = signed_url
    
    print()
    
    # Read HTML
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Replace URLs
    new_html = replace_image_urls(html_content, url_mappings)
    
    # Count replacements
    replaced = sum(1 for name in url_mappings if name in html_content or f"/{name}" in html_content)
    print(f"[OK] Replaced ~{replaced} image references")
    
    # Write output
    output_path = Path(args.output) if args.output else html_path
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    
    print(f"[OK] Saved to: {output_path}")


if __name__ == "__main__":
    main()
