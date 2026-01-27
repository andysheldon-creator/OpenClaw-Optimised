#!/usr/bin/env python3
"""
测试飞书 API 连接

这个脚本用于测试飞书 API 配置是否正确，包括：
1. 验证 App ID 和 App Secret
2. 获取访问令牌
3. 访问目标多维表格
4. 列出表格字段

使用方法：
    export FEISHU_APP_ID="cli_xxxxxxxxxxxxxxxx"
    export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    python scripts/admin/test_feishu_connection.py
"""

import os
import sys
from pathlib import Path

import requests

# 飞书多维表格配置
FEISHU_APP_TOKEN = "YVlHbrgeYa2JxgsUFfAcytzunwf"
FEISHU_TABLE_ID = "tblqCBVS51CyfRyZ"
FEISHU_API_BASE = "https://open.feishu.cn/open-apis"


def print_separator(char="=", length=80):
    """打印分隔符"""
    print(char * length)


def print_step(step_num, total_steps, description):
    """打印步骤信息"""
    print(f"\n[{step_num}/{total_steps}] {description}")


def print_success(message):
    """打印成功信息"""
    print(f"✓ {message}")


def print_error(message):
    """打印错误信息"""
    print(f"✗ {message}")


def print_info(message, indent=0):
    """打印信息"""
    prefix = "  " * indent
    print(f"{prefix}{message}")


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


def get_table_info(token: str, app_token: str, table_id: str):
    """获取表格信息"""
    url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    
    data = response.json()
    if data.get("code") != 0:
        raise RuntimeError(f"获取表格信息失败: {data.get('msg')}")
    
    return data.get("data", {})


def list_fields(token: str, app_token: str, table_id: str):
    """列出表格字段"""
    url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    params = {"page_size": 100}
    
    response = requests.get(url, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    
    data = response.json()
    if data.get("code") != 0:
        raise RuntimeError(f"获取字段列表失败: {data.get('msg')}")
    
    return data.get("data", {}).get("items", [])


def list_records(token: str, app_token: str, table_id: str, page_size: int = 10):
    """列出表格记录（只获取前几条用于测试）"""
    url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    params = {"page_size": page_size}
    
    response = requests.get(url, headers=headers, params=params, timeout=30)
    
    # 先检查响应内容
    try:
        data = response.json()
    except Exception:
        response.raise_for_status()
        raise RuntimeError(f"无法解析飞书 API 响应: {response.text[:200]}")
    
    # 检查飞书 API 返回的错误码
    if data.get("code") != 0:
        error_msg = data.get("msg", "未知错误")
        error_code = data.get("code")
        raise RuntimeError(
            f"获取记录列表失败 (错误码: {error_code}): {error_msg}\n"
            f"请求 URL: {url}\n"
            f"请求参数: {params}"
        )
    
    # HTTP 状态码检查
    if response.status_code != 200:
        raise RuntimeError(
            f"HTTP 请求失败 (状态码: {response.status_code}): {response.text[:200]}\n"
            f"请求 URL: {url}\n"
            f"请求参数: {params}"
        )
    
    return data.get("data", {}).get("items", [])


def main():
    """主函数"""
    print_separator()
    print("飞书 API 连接测试")
    print_separator()
    
    # 检查环境变量
    print_step(1, 5, "检查环境变量配置")
    
    app_id = os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET")
    
    if not app_id:
        print_error("缺少环境变量 FEISHU_APP_ID")
        print_info("请设置: export FEISHU_APP_ID='your_app_id'", indent=1)
        sys.exit(1)
    
    if not app_secret:
        print_error("缺少环境变量 FEISHU_APP_SECRET")
        print_info("请设置: export FEISHU_APP_SECRET='your_app_secret'", indent=1)
        sys.exit(1)
    
    print_success("环境变量配置正确")
    print_info(f"App ID: {app_id[:20]}...", indent=1)
    print_info(f"App Secret: {'*' * 20}...", indent=1)
    
    # 获取访问令牌
    print_step(2, 5, "获取访问令牌")
    
    try:
        token = get_tenant_access_token(app_id, app_secret)
        print_success("成功获取访问令牌")
        print_info(f"Token: {token[:20]}...", indent=1)
    except Exception as e:
        print_error(f"获取访问令牌失败: {e}")
        print_info("可能的原因:", indent=1)
        print_info("1. App ID 或 App Secret 错误", indent=2)
        print_info("2. 应用未发布", indent=2)
        print_info("3. 网络连接问题", indent=2)
        sys.exit(1)
    
    # 获取表格信息
    print_step(3, 5, "获取表格信息")
    
    try:
        table_info = get_table_info(token, FEISHU_APP_TOKEN, FEISHU_TABLE_ID)
        print_success("成功获取表格信息")
        print_info(f"表格名称: {table_info.get('name', 'N/A')}", indent=1)
        print_info(f"表格ID: {table_info.get('table_id', 'N/A')}", indent=1)
        print_info(f"修订版本: {table_info.get('revision', 'N/A')}", indent=1)
    except Exception as e:
        print_error(f"获取表格信息失败: {e}")
        print_info("可能的原因:", indent=1)
        print_info("1. 应用未添加到多维表格", indent=2)
        print_info("2. 缺少 bitable:app 权限", indent=2)
        print_info("3. 表格ID或应用Token错误", indent=2)
        sys.exit(1)
    
    # 列出表格字段
    print_step(4, 5, "列出表格字段并验证")
    
    try:
        fields = list_fields(token, FEISHU_APP_TOKEN, FEISHU_TABLE_ID)
        print_success(f"成功获取 {len(fields)} 个字段")
        
        # 期望的字段
        expected_fields = [
            "provider_id",
            "name",
            "description",
            "website_url",
            "docs_url",
            "categories",
            "tools",
            "created_at",
            "updated_at",
        ]
        
        # 检查字段是否存在
        existing_field_names = [f.get("field_name") for f in fields]
        
        print_info("当前字段列表:", indent=1)
        for field in fields:
            field_name = field.get("field_name")
            field_type = field.get("type")
            is_required = field_name in expected_fields
            marker = " ← 必需" if is_required else ""
            print_info(f"- {field_name} ({field_type}){marker}", indent=2)
        
        print_info("\n检查必需字段:", indent=1)
        missing_fields = []
        for expected_field in expected_fields:
            if expected_field in existing_field_names:
                print_info(f"✓ {expected_field}", indent=2)
            else:
                print_info(f"✗ {expected_field} (缺失)", indent=2)
                missing_fields.append(expected_field)
        
        if missing_fields:
            print_error(f"\n缺少 {len(missing_fields)} 个必需字段！")
            print_info("\n需要添加的字段：", indent=1)
            for field in missing_fields:
                print_info(f"- {field}", indent=2)
            
            print_info("\n建议的字段类型：", indent=1)
            print_info("provider_id: 单行文本", indent=2)
            print_info("name: 单行文本", indent=2)
            print_info("description: 多行文本", indent=2)
            print_info("website_url: 单行文本或URL", indent=2)
            print_info("docs_url: 单行文本", indent=2)
            print_info("categories: 单行文本", indent=2)
            print_info("tools: 单行文本（显示数字）", indent=2)
            print_info("created_at: 单行文本（格式: YYYY-MM-DD HH:MM:SS）", indent=2)
            print_info("updated_at: 单行文本（格式: YYYY-MM-DD HH:MM:SS）", indent=2)
            
            print_info("\n⚠ 请在飞书多维表格中手动添加缺失的字段后再运行同步脚本", indent=1)
        else:
            print_success("所有必需字段都存在！")
            
    except Exception as e:
        print_error(f"获取字段列表失败: {e}")
        sys.exit(1)
    
    # 获取记录样例
    print_step(5, 5, "获取记录样例（前10条）")
    
    try:
        records = list_records(token, FEISHU_APP_TOKEN, FEISHU_TABLE_ID, page_size=10)
        print_success(f"成功获取 {len(records)} 条记录")
        
        if records:
            print_info("记录样例:", indent=1)
            for i, record in enumerate(records[:3], 1):
                fields = record.get("fields", {})
                provider_id = fields.get("Provider ID", "N/A")
                provider_name = fields.get("Provider Name", "N/A")
                print_info(f"{i}. {provider_id}: {provider_name}", indent=2)
            
            if len(records) > 3:
                print_info(f"... 还有 {len(records) - 3} 条记录", indent=2)
        else:
            print_info("表格中暂无记录", indent=1)
            
    except Exception as e:
        print_error(f"获取记录列表失败: {e}")
        sys.exit(1)
    
    # 测试完成
    print("\n")
    print_separator()
    print("✓ 所有测试通过！")
    print_separator()
    print("\n下一步:")
    print("  1. 如果有缺失的字段，请在飞书多维表格中添加")
    print("  2. 运行同步脚本进行 Dry Run:")
    print("     python scripts/admin/sync_providers_to_feishu.py --dry-run")
    print("  3. 确认无误后执行实际同步:")
    print("     python scripts/admin/sync_providers_to_feishu.py")
    print_separator()


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
