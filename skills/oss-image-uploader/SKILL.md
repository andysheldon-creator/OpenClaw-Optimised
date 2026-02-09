---
name: oss-image-uploader
description: Upload images to Aliyun OSS and generate signed URLs. Activate when user needs to upload images to cloud storage, generate signed URLs, or replace local image paths with OSS URLs.
---

# OSS Image Uploader Skill

上传图片到阿里云 OSS 并生成签名 URL（用于私有 bucket）。

## 快速使用

### 1. 上传单张图片并获取签名 URL

```python
# 使用 scripts/upload_single.py
python scripts/upload_single.py <local_image_path> [--expires 6]
```

### 2. 批量上传目录并获取签名 URL

```python
# 使用 scripts/batch_upload.py
python scripts/batch_upload.py <image_dir> --prefix screenshots/YYYY-MM-DD [--expires 6]
```

### 3. 替换 HTML 中的图片路径为签名 URL

```python
# 使用 scripts/replace_urls.py
python scripts/replace_urls.py <html_file> --image-dir <dir> [--expires 6]
```

## 配置

环境变量（从 `C:\Users\taoli1\ai-daily-uploader\.env` 加载）：

| 变量 | 说明 |
|------|------|
| `ALIYUN_ACCESS_KEY_ID` | 阿里云 AccessKey ID |
| `ALIYUN_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| `ALIYUN_OSS_BUCKET` | Bucket 名称（默认 `ai-daily`） |
| `ALIYUN_OSS_ENDPOINT` | 端点（默认 `oss-cn-beijing.aliyuncs.com`） |

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--expires` | 签名 URL 有效期（小时） | 6 |
| `--prefix` | OSS 路径前缀 | `screenshots/` |
| `--output` | 输出文件路径 | 原地替换 |

## Python API

```python
from oss_uploader import OSSUploader

uploader = OSSUploader()  # 自动从 .env 加载配置

# 上传单个文件
url = uploader.upload_file("local/1.webp", "screenshots/2026-01-29/1.webp")

# 获取签名 URL
signed_url = uploader.get_signed_url("screenshots/2026-01-29/1.webp", expires_hours=6)

# 上传并返回签名 URL
signed_url = uploader.upload_and_sign("local/1.webp", "screenshots/2026-01-29/1.webp", expires_hours=6)
```

## 输出格式

签名 URL 格式：
```
https://ai-daily.oss-cn-beijing.aliyuncs.com/screenshots%2F2026-01-29%2F1.webp?OSSAccessKeyId=XXX&Expires=1234567890&Signature=XXX
```

## 注意事项

1. **签名 URL 有时效性** - 默认 6 小时后失效
2. **不要泄露签名 URL** - 任何人拿到 URL 都可以访问
3. **Bucket 保持私有** - 签名 URL 是安全访问私有资源的方式

## 文件结构

```
oss-image-uploader/
├── SKILL.md
├── scripts/
│   ├── oss_uploader.py      # 核心上传类
│   ├── upload_single.py     # 单文件上传
│   ├── batch_upload.py      # 批量上传
│   └── replace_urls.py      # 替换 HTML 中的 URL
└── requirements.txt
```
