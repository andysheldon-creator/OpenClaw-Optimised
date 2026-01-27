#!/usr/bin/env python3
"""
获取飞书多维表格的正确 app_token 和 table_id

飞书多维表格有两种访问方式：
1. 独立的多维表格：https://xxx.feishu.cn/base/{app_token}?table={table_id}
2. 知识库中的多维表格：https://xxx.feishu.cn/wiki/{wiki_token}?table={table_id}

对于知识库中的多维表格，需要通过 API 获取实际的 app_token。

使用方法：
    export FEISHU_APP_ID="cli_xxxxxxxxxxxxxxxx"
    export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    python scripts/feishu/get_bitable_info.py <feishu_url>
"""

import os
import sys
import re
from urllib.parse import urlparse, parse_qs

import requests

FEISHU_API_BASE = "https://open.feishu.cn/open-apis"


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    """获取租户访问令牌"""
    url = f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal"
    payload = {
        "app_id": app_id,
        "app_secret": app_secret,
    }
    
    response = requests.post(url, json=payload, timeout=30)
    response.raise_for_status()
    
    data = response.json()
    if data.get("code") != 0:
        raise RuntimeError(f"获取访问令牌失败: {data.get('msg')}")
    
    return data["tenant_access_token"]


def parse_feishu_url(url: str) -> dict:
    """解析飞书多维表格 URL"""
    parsed = urlparse(url)
    path_parts = parsed.path.strip('/').split('/')
    query_params = parse_qs(parsed.query)
    
    result = {
        "url_type": None,
        "token": None,
        "table_id": query_params.get('table', [None])[0],
        "view_id": query_params.get('view', [None])[0],
    }
    
    if 'wiki' in path_parts:
        result["url_type"] = "wiki"
        wiki_idx = path_parts.index('wiki')
        if len(path_parts) > wiki_idx + 1:
            result["token"] = path_parts[wiki_idx + 1]
    elif 'base' in path_parts:
        result["url_type"] = "base"
        base_idx = path_parts.index('base')
        if len(path_parts) > base_idx + 1:
            result["token"] = path_parts[base_idx + 1]
    
    return result


def get_wiki_node_info(token: str, wiki_token: str) -> dict:
    """获取知识库节点信息"""
    url = f"{FEISHU_API_BASE}/wiki/v2/spaces/get_node"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    params = {"token": wiki_token}
    
    response = requests.get(url, headers=headers, params=params, timeout=30)
    
    try:
        data = response.json()
    except Exception:
        response.raise_for_status()
        raise RuntimeError(f"无法解析飞书 API 响应: {response.text[:200]}")
    
    if data.get("code") != 0:
        error_msg = data.get("msg", "未知错误")
        error_code = data.get("code")
        raise RuntimeError(
            f"获取知识库节点信息失败 (错误码: {error_code}): {error_msg}"
        )
    
    return data.get("data", {}).get("node", {})


def list_tables_in_base(token: str, app_token: str) -> list:
    """列出多维表格中的所有数据表"""
    url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    
    response = requests.get(url, headers=headers, timeout=30)
    
    try:
        data = response.json()
    except Exception:
        response.raise_for_status()
        raise RuntimeError(f"无法解析飞书 API 响应: {response.text[:200]}")
    
    if data.get("code") != 0:
        error_msg = data.get("msg", "未知错误")
        error_code = data.get("code")
        raise RuntimeError(
            f"获取数据表列表失败 (错误码: {error_code}): {error_msg}"
        )
    
    return data.get("data", {}).get("items", [])


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("错误: 缺少飞书多维表格 URL 参数")
        print("\n使用方法:")
        print("    python scripts/feishu/get_bitable_info.py <feishu_url>")
        print("\n示例:")
        print("    python scripts/feishu/get_bitable_info.py 'https://xxx.feishu.cn/wiki/xxx?table=xxx'")
        sys.exit(1)
    
    feishu_url = sys.argv[1]
    
    # 检查环境变量
    app_id = os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET")
    
    if not app_id or not app_secret:
        print("错误: 缺少飞书 API 凭证")
        print("\n请设置环境变量:")
        print("    export FEISHU_APP_ID='your_app_id'")
        print("    export FEISHU_APP_SECRET='your_app_secret'")
        sys.exit(1)
    
    print("=" * 80)
    print("飞书多维表格信息获取工具")
    print("=" * 80)
    print(f"\n输入 URL: {feishu_url}\n")
    
    # 解析 URL
    print("[1/4] 解析 URL...")
    parsed = parse_feishu_url(feishu_url)
    
    print(f"  URL 类型: {parsed['url_type']}")
    print(f"  Token: {parsed['token']}")
    print(f"  Table ID: {parsed['table_id']}")
    print(f"  View ID: {parsed['view_id']}")
    
    if not parsed['token']:
        print("\n错误: 无法从 URL 中解析出 token")
        print("请确保 URL 格式正确")
        sys.exit(1)
    
    # 获取访问令牌
    print("\n[2/4] 获取访问令牌...")
    try:
        token = get_tenant_access_token(app_id, app_secret)
        print("✓ 成功获取访问令牌")
    except Exception as e:
        print(f"✗ 获取访问令牌失败: {e}")
        sys.exit(1)
    
    # 获取实际的 app_token
    app_token = None
    
    if parsed['url_type'] == 'wiki':
        print("\n[3/4] 从知识库节点获取多维表格信息...")
        try:
            node_info = get_wiki_node_info(token, parsed['token'])
            obj_type = node_info.get('obj_type')
            
            if obj_type == 'bitable':
                # 知识库中的多维表格
                app_token = node_info.get('obj_token')
                print(f"✓ 找到多维表格")
                print(f"  节点类型: {obj_type}")
                print(f"  App Token: {app_token}")
            else:
                print(f"✗ 该节点不是多维表格，类型为: {obj_type}")
                sys.exit(1)
                
        except Exception as e:
            print(f"✗ 获取节点信息失败: {e}")
            print("\n提示: 如果是独立的多维表格，请直接访问多维表格页面并复制 URL")
            sys.exit(1)
    
    elif parsed['url_type'] == 'base':
        print("\n[3/4] 使用独立多维表格的 app_token...")
        app_token = parsed['token']
        print(f"✓ App Token: {app_token}")
    
    else:
        print(f"\n错误: 不支持的 URL 类型: {parsed['url_type']}")
        sys.exit(1)
    
    if not app_token:
        print("\n错误: 无法获取 app_token")
        sys.exit(1)
    
    # 列出数据表
    print("\n[4/4] 列出多维表格中的数据表...")
    try:
        tables = list_tables_in_base(token, app_token)
        print(f"✓ 找到 {len(tables)} 个数据表:\n")
        
        for i, table in enumerate(tables, 1):
            table_id = table.get('table_id')
            table_name = table.get('name')
            is_target = table_id == parsed['table_id']
            marker = " ← 目标表格" if is_target else ""
            print(f"  {i}. {table_name}")
            print(f"     Table ID: {table_id}{marker}")
        
    except Exception as e:
        print(f"✗ 获取数据表列表失败: {e}")
        sys.exit(1)
    
    # 输出配置信息
    print("\n" + "=" * 80)
    print("配置信息")
    print("=" * 80)
    print("\n请将以下配置更新到脚本中:\n")
    print(f"FEISHU_APP_TOKEN = \"{app_token}\"")
    
    if parsed['table_id']:
        print(f"FEISHU_TABLE_ID = \"{parsed['table_id']}\"")
    else:
        print(f"# 请从上面的列表中选择一个 table_id")
        print(f"FEISHU_TABLE_ID = \"<table_id>\"")
    
    if parsed['view_id']:
        print(f"FEISHU_VIEW_ID = \"{parsed['view_id']}\"  # 可选，建议不使用")
    
    print("\n" + "=" * 80)
    print("完成！")
    print("=" * 80)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n用户中断操作")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n未预期的错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
