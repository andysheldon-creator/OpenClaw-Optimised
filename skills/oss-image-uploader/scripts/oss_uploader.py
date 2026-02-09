"""
OSS Uploader - Core class for Aliyun OSS operations
"""
import os
from pathlib import Path
from typing import Optional
import oss2
from dotenv import load_dotenv


class OSSUploader:
    """Aliyun OSS uploader with signed URL support"""
    
    # Default .env location
    DEFAULT_ENV_PATH = Path(r"C:\Users\taoli1\ai-daily-uploader\.env")
    
    def __init__(self, env_path: Optional[Path] = None):
        """Initialize OSS uploader with credentials from .env"""
        env_file = env_path or self.DEFAULT_ENV_PATH
        load_dotenv(env_file)
        
        self.access_key_id = os.getenv("ALIYUN_ACCESS_KEY_ID")
        self.access_key_secret = os.getenv("ALIYUN_ACCESS_KEY_SECRET")
        self.bucket_name = os.getenv("ALIYUN_OSS_BUCKET", "ai-daily")
        self.endpoint = os.getenv("ALIYUN_OSS_ENDPOINT", "oss-cn-beijing.aliyuncs.com")
        
        if not self.access_key_id or not self.access_key_secret:
            raise ValueError("Missing ALIYUN_ACCESS_KEY_ID or ALIYUN_ACCESS_KEY_SECRET")
        
        # Initialize OSS bucket
        auth = oss2.Auth(self.access_key_id, self.access_key_secret)
        self.bucket = oss2.Bucket(auth, f"https://{self.endpoint}", self.bucket_name)
    
    def upload_file(self, local_path: str, oss_key: str) -> str:
        """
        Upload a local file to OSS.
        
        Args:
            local_path: Local file path
            oss_key: Target path in OSS (e.g., "screenshots/2026-01-29/1.webp")
        
        Returns:
            Direct URL (not signed, will 403 if bucket is private)
        """
        local_file = Path(local_path)
        if not local_file.exists():
            raise FileNotFoundError(f"File not found: {local_path}")
        
        with open(local_file, "rb") as f:
            self.bucket.put_object(oss_key, f.read())
        
        return f"https://{self.bucket_name}.{self.endpoint}/{oss_key}"
    
    def get_signed_url(self, oss_key: str, expires_hours: int = 6) -> str:
        """
        Generate a signed URL for accessing a private object.
        
        Args:
            oss_key: Object key in OSS
            expires_hours: URL validity period in hours (default: 6)
        
        Returns:
            Signed URL that can be accessed publicly until expiration
        """
        expires_seconds = expires_hours * 60 * 60
        return self.bucket.sign_url('GET', oss_key, expires_seconds)
    
    def upload_and_sign(self, local_path: str, oss_key: str, expires_hours: int = 6) -> str:
        """
        Upload a file and return a signed URL.
        
        Args:
            local_path: Local file path
            oss_key: Target path in OSS
            expires_hours: URL validity period in hours (default: 6)
        
        Returns:
            Signed URL for the uploaded file
        """
        self.upload_file(local_path, oss_key)
        return self.get_signed_url(oss_key, expires_hours)
    
    def file_exists(self, oss_key: str) -> bool:
        """Check if a file exists in OSS"""
        try:
            self.bucket.head_object(oss_key)
            return True
        except oss2.exceptions.NoSuchKey:
            return False
    
    def list_files(self, prefix: str = "", max_keys: int = 100) -> list:
        """List files in OSS with given prefix"""
        files = []
        for obj in oss2.ObjectIterator(self.bucket, prefix=prefix, max_keys=max_keys):
            files.append(obj.key)
        return files


if __name__ == "__main__":
    # Quick test
    uploader = OSSUploader()
    print(f"[OK] Connected to bucket: {uploader.bucket_name}")
    print(f"[OK] Endpoint: {uploader.endpoint}")
    
    # Test signed URL for existing file
    test_key = "screenshots/2026-01-29/1.webp"
    if uploader.file_exists(test_key):
        signed = uploader.get_signed_url(test_key, expires_hours=6)
        print(f"[OK] Signed URL: {signed[:80]}...")
    else:
        print(f"[WARN] Test file not found: {test_key}")
