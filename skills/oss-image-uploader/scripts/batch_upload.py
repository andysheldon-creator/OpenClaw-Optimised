"""
Batch upload images from a directory to OSS and generate signed URLs
"""
import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from oss_uploader import OSSUploader


def main():
    parser = argparse.ArgumentParser(description="Batch upload images to OSS")
    parser.add_argument("directory", help="Directory containing images")
    parser.add_argument("--prefix", help="OSS path prefix (default: screenshots/YYYY-MM-DD/)")
    parser.add_argument("--expires", type=int, default=6, help="Signed URL expiry in hours (default: 6)")
    parser.add_argument("--output", help="Output JSON file with URL mappings")
    parser.add_argument("--extensions", default=".webp,.png,.jpg,.jpeg,.gif", 
                        help="Comma-separated image extensions (default: .webp,.png,.jpg,.jpeg,.gif)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip files that already exist in OSS")
    
    args = parser.parse_args()
    
    image_dir = Path(args.directory)
    if not image_dir.exists():
        print(f"[ERROR] Directory not found: {image_dir}")
        sys.exit(1)
    
    # Default prefix with today's date
    if args.prefix:
        prefix = args.prefix.rstrip('/')
    else:
        prefix = f"screenshots/{datetime.now().strftime('%Y-%m-%d')}"
    
    # Collect image files
    extensions = [ext.strip().lower() for ext in args.extensions.split(',')]
    image_files = [f for f in image_dir.iterdir() 
                   if f.is_file() and f.suffix.lower() in extensions]
    
    if not image_files:
        print(f"[WARN] No image files found in {image_dir}")
        print(f"[INFO] Looking for extensions: {extensions}")
        sys.exit(0)
    
    print(f"[*] Found {len(image_files)} images in {image_dir}")
    print(f"[*] OSS prefix: {prefix}/")
    print(f"[*] Expires: {args.expires} hours")
    print()
    
    uploader = OSSUploader()
    url_mappings = {}
    uploaded = 0
    skipped = 0
    
    for img_path in sorted(image_files):
        oss_key = f"{prefix}/{img_path.name}"
        
        # Check if exists
        if args.skip_existing and uploader.file_exists(oss_key):
            print(f"   [SKIP] {img_path.name} (exists)")
            # Still generate signed URL
            signed_url = uploader.get_signed_url(oss_key, args.expires)
            url_mappings[img_path.name] = signed_url
            skipped += 1
            continue
        
        try:
            signed_url = uploader.upload_and_sign(str(img_path), oss_key, args.expires)
            url_mappings[img_path.name] = signed_url
            print(f"   [OK] {img_path.name}")
            uploaded += 1
        except Exception as e:
            print(f"   [ERROR] {img_path.name}: {e}")
    
    print()
    print(f"[DONE] Uploaded: {uploaded}, Skipped: {skipped}")
    
    # Save URL mappings if output specified
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(url_mappings, f, indent=2, ensure_ascii=False)
        print(f"[OK] URL mappings saved to: {output_path}")
    
    # Print mappings
    print()
    print("URL Mappings:")
    print("-" * 40)
    for name, url in url_mappings.items():
        print(f"{name}:")
        print(f"  {url[:80]}...")
        print()


if __name__ == "__main__":
    main()
