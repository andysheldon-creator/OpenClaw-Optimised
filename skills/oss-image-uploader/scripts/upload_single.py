"""
Upload a single image to OSS and print signed URL
"""
import argparse
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from oss_uploader import OSSUploader


def main():
    parser = argparse.ArgumentParser(description="Upload single image to OSS")
    parser.add_argument("file", help="Local file path to upload")
    parser.add_argument("--key", help="OSS key (default: auto-generate from filename)")
    parser.add_argument("--prefix", default="uploads/", help="OSS path prefix (default: uploads/)")
    parser.add_argument("--expires", type=int, default=6, help="Signed URL expiry in hours (default: 6)")
    parser.add_argument("--no-sign", action="store_true", help="Return direct URL instead of signed")
    
    args = parser.parse_args()
    
    local_path = Path(args.file)
    if not local_path.exists():
        print(f"[ERROR] File not found: {local_path}")
        sys.exit(1)
    
    # Determine OSS key
    if args.key:
        oss_key = args.key
    else:
        oss_key = f"{args.prefix.rstrip('/')}/{local_path.name}"
    
    print(f"[*] Uploading: {local_path}")
    print(f"[*] OSS Key: {oss_key}")
    print(f"[*] Expires: {args.expires} hours")
    print()
    
    try:
        uploader = OSSUploader()
        
        if args.no_sign:
            url = uploader.upload_file(str(local_path), oss_key)
            print(f"[OK] Direct URL (will 403 if bucket is private):")
        else:
            url = uploader.upload_and_sign(str(local_path), oss_key, args.expires)
            print(f"[OK] Signed URL (valid for {args.expires} hours):")
        
        print(url)
        
    except Exception as e:
        print(f"[ERROR] {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
