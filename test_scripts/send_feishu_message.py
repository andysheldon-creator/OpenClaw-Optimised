#!/usr/bin/env python3
"""
飞书群消息发送测试脚本

支持两种方式：
1. Webhook 方式（推荐，简单）
2. 飞书开放平台 API 方式

使用方法：
    方式1 - Webhook:
        python send_feishu_message.py --webhook "YOUR_WEBHOOK_URL" --text "测试消息"
    
    方式2 - 开放平台 API:
        python send_feishu_message.py --app-id "YOUR_APP_ID" --app-secret "YOUR_APP_SECRET" --chat-id "YOUR_CHAT_ID" --text "测试消息"
"""

import argparse
import base64
import hashlib
import hmac
import json
import sys
import time
from typing import Optional

import requests


def gen_sign(timestamp: int, secret: str) -> str:
    """
    生成飞书 Webhook 签名
    
    Args:
        timestamp: 时间戳（秒）
        secret: 签名密钥
    
    Returns:
        str: 生成的签名
    """
    # 拼接 timestamp 和 secret
    string_to_sign = '{}\n{}'.format(timestamp, secret)
    hmac_code = hmac.new(string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    
    # 对结果进行 base64 处理
    sign = base64.b64encode(hmac_code).decode('utf-8')
    
    return sign


def send_webhook_message(
    webhook_url: str,
    message: str,
    msg_type: str = "text",
    secret: Optional[str] = None
) -> bool:
    """
    通过 Webhook 发送消息到飞书群
    
    Args:
        webhook_url: 飞书群机器人的 Webhook URL
        message: 要发送的消息内容
        msg_type: 消息类型，支持 "text", "post", "interactive"
        secret: 可选的签名密钥，如果提供则会添加签名验证
    
    Returns:
        bool: 发送是否成功
    """
    if msg_type == "text":
        payload = {
            "msg_type": "text",
            "content": {
                "text": message
            }
        }
    elif msg_type == "post":
        # 富文本消息
        payload = {
            "msg_type": "post",
            "content": {
                "post": {
                    "zh_cn": {
                        "title": "通知",
                        "content": [
                            [
                                {
                                    "tag": "text",
                                    "text": message
                                }
                            ]
                        ]
                    }
                }
            }
        }
    else:
        print(f"不支持的消息类型: {msg_type}")
        return False
    
    # 如果提供了 secret，添加签名
    if secret:
        timestamp = int(time.time())
        sign = gen_sign(timestamp, secret)
        payload["timestamp"] = str(timestamp)
        payload["sign"] = sign
        print(f"已添加签名验证 (timestamp: {timestamp})")
    
    try:
        response = requests.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get("code") == 0:
            print("✓ 消息发送成功！")
            return True
        else:
            print(f"✗ 消息发送失败: {result}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ 请求失败: {e}")
        return False
    except Exception as e:
        print(f"✗ 发生错误: {e}")
        return False


def get_tenant_access_token(app_id: str, app_secret: str) -> Optional[str]:
    """
    获取飞书开放平台的 tenant_access_token
    
    Args:
        app_id: 应用的 App ID
        app_secret: 应用的 App Secret
    
    Returns:
        str: tenant_access_token，失败返回 None
    """
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    payload = {
        "app_id": app_id,
        "app_secret": app_secret
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        result = response.json()
        
        if result.get("code") == 0:
            return result.get("tenant_access_token")
        else:
            print(f"✗ 获取 token 失败: {result}")
            return None
    except Exception as e:
        print(f"✗ 获取 token 时发生错误: {e}")
        return None


def send_api_message(
    app_id: str,
    app_secret: str,
    chat_id: str,
    message: str,
    msg_type: str = "text"
) -> bool:
    """
    通过飞书开放平台 API 发送消息
    
    Args:
        app_id: 应用的 App ID
        app_secret: 应用的 App Secret
        chat_id: 群聊的 chat_id
        message: 要发送的消息内容
        msg_type: 消息类型，支持 "text", "post"
    
    Returns:
        bool: 发送是否成功
    """
    # 获取 access token
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        return False
    
    # 发送消息
    url = "https://open.feishu.cn/open-apis/im/v1/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    if msg_type == "text":
        content = {"text": message}
    elif msg_type == "post":
        content = {
            "zh_cn": {
                "title": "通知",
                "content": [
                    [
                        {
                            "tag": "text",
                            "text": message
                        }
                    ]
                ]
            }
        }
    else:
        print(f"不支持的消息类型: {msg_type}")
        return False
    
    payload = {
        "receive_id": chat_id,
        "msg_type": msg_type,
        "content": json.dumps(content)
    }
    
    params = {"receive_id_type": "chat_id"}
    
    try:
        response = requests.post(
            url,
            headers=headers,
            params=params,
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get("code") == 0:
            print("✓ 消息发送成功！")
            return True
        else:
            print(f"✗ 消息发送失败: {result}")
            return False
    except Exception as e:
        print(f"✗ 发送消息时发生错误: {e}")
        return False


def list_chats(app_id: str, app_secret: str) -> bool:
    """
    列出机器人加入的所有群聊
    
    Args:
        app_id: 应用的 App ID
        app_secret: 应用的 App Secret
    
    Returns:
        bool: 是否成功获取列表
    """
    # 获取 access token
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        return False
    
    # 获取群列表
    url = "https://open.feishu.cn/open-apis/im/v1/chats"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        result = response.json()
        
        if result.get("code") == 0:
            chats = result.get("data", {}).get("items", [])
            if not chats:
                print("未找到任何群聊")
                return True
            
            print(f"\n找到 {len(chats)} 个群聊：\n")
            for i, chat in enumerate(chats, 1):
                chat_id = chat.get("chat_id", "N/A")
                name = chat.get("name", "未命名")
                description = chat.get("description", "")
                print(f"{i}. 群名称: {name}")
                print(f"   Chat ID: {chat_id}")
                if description:
                    print(f"   描述: {description}")
                print()
            
            return True
        else:
            print(f"✗ 获取群列表失败: {result}")
            return False
    except Exception as e:
        print(f"✗ 获取群列表时发生错误: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="飞书群消息发送测试脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 方式1: 使用 Webhook（推荐）
  python send_feishu_message.py --webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" --text "测试消息"
  
  # 使用 Webhook + 签名验证
  python send_feishu_message.py --webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" --secret "YOUR_SECRET" --text "测试消息"
  
  # 方式2: 使用开放平台 API
  python send_feishu_message.py --app-id "cli_xxx" --app-secret "xxx" --chat-id "oc_xxx" --text "测试消息"
  
  # 发送富文本消息
  python send_feishu_message.py --webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" --text "测试消息" --type post
  
  # 列出所有群聊（获取 Chat ID）
  python send_feishu_message.py --app-id "cli_xxx" --app-secret "xxx" --list-chats
        """
    )
    
    # Webhook 方式参数
    parser.add_argument(
        "--webhook",
        help="飞书群机器人的 Webhook URL"
    )
    parser.add_argument(
        "--secret",
        help="Webhook 签名密钥（如果机器人配置了签名验证）"
    )
    
    # 开放平台 API 方式参数
    parser.add_argument(
        "--app-id",
        help="飞书应用的 App ID"
    )
    parser.add_argument(
        "--app-secret",
        help="飞书应用的 App Secret"
    )
    parser.add_argument(
        "--chat-id",
        help="群聊的 chat_id"
    )
    
    # 通用参数
    parser.add_argument(
        "--text",
        help="要发送的消息内容"
    )
    parser.add_argument(
        "--type",
        choices=["text", "post"],
        default="text",
        help="消息类型：text(纯文本) 或 post(富文本)，默认 text"
    )
    
    # 辅助功能
    parser.add_argument(
        "--list-chats",
        action="store_true",
        help="列出机器人加入的所有群聊（需要 --app-id 和 --app-secret）"
    )
    
    args = parser.parse_args()
    
    # 处理列出群聊功能
    if args.list_chats:
        if not (args.app_id and args.app_secret):
            print("✗ 错误：使用 --list-chats 需要提供 --app-id 和 --app-secret")
            sys.exit(1)
        
        print("正在获取群聊列表...")
        success = list_chats(args.app_id, args.app_secret)
        sys.exit(0 if success else 1)
    
    # 验证发送消息的参数
    if not args.text:
        print("✗ 错误：发送消息需要提供 --text 参数")
        parser.print_help()
        sys.exit(1)
    
    # 验证参数
    if args.webhook:
        # Webhook 方式
        print(f"使用 Webhook 方式发送消息...")
        print(f"消息内容: {args.text}")
        print(f"消息类型: {args.type}")
        success = send_webhook_message(args.webhook, args.text, args.type, args.secret)
    elif args.app_id and args.app_secret and args.chat_id:
        # 开放平台 API 方式
        print(f"使用开放平台 API 方式发送消息...")
        print(f"消息内容: {args.text}")
        print(f"消息类型: {args.type}")
        success = send_api_message(
            args.app_id,
            args.app_secret,
            args.chat_id,
            args.text,
            args.type
        )
    else:
        print("✗ 错误：必须提供以下参数之一：")
        print("  1. --webhook (Webhook URL)")
        print("  2. --app-id, --app-secret, --chat-id (开放平台 API)")
        parser.print_help()
        sys.exit(1)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
