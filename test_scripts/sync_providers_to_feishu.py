#!/usr/bin/env python3
"""
同步Provider数据到飞书多维表格

功能说明：
1. 从数据库读取所有 provider 数据
2. 将数据同步到飞书多维表格
3. 如果数据表不存在则创建默认表
4. 删除数据库中不存在的 provider

飞书多维表格地址：
https://zxoriiwxds4.feishu.cn/wiki/YhxAwdtCJi9Pe6kTTtEcEFO4nkd?table=tblqCBVS51CyfRyZ&view=vewRlroil6

使用方法：
1. 设置环境变量：
   export FEISHU_APP_ID="your_app_id"
   export FEISHU_APP_SECRET="your_app_secret"
   
2. 运行脚本：
   python scripts/admin/sync_providers_to_feishu.py
   
3. 选项：
   --dry-run: 仅查看将要同步的数据，不实际执行
   --create-table: 如果表不存在则创建
   --db-config: 数据库配置名称（默认: search_engine）
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import requests
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from shared.database import get_async_session
from shared.database.models.core import Provider

# 飞书多维表格配置
FEISHU_APP_TOKEN = "YVlHbrgeYa2JxgsUFfAcytzunwf"  # 从URL解析出来
FEISHU_TABLE_ID = "tblqCBVS51CyfRyZ"  # 从URL解析出来
FEISHU_VIEW_ID = "vewRlroil6"  # 从URL解析出来（暂未使用，以避免权限问题）
FEISHU_API_BASE = "https://open.feishu.cn/open-apis"

# 表格字段映射配置（字段名同名，不需要转换）
FIELD_MAPPINGS = {
    "provider_id": "provider_id",
    "name": "name",
    "description": "description",
    "website_url": "website_url",
    "docs_url": "docs_url",
    "categories": "categories",  # 特殊处理：从 tags.categories 读取
    "tools": "tools",  # 特殊处理：显示 tool 数量
    "created_at": "created_at",
    "updated_at": "updated_at",
}


class FeishuClient:
    """飞书API客户端"""
    
    def __init__(self, app_id: str, app_secret: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.tenant_access_token: Optional[str] = None
        self.token_expire_time: Optional[datetime] = None
    
    def _ensure_token(self) -> None:
        """确保访问令牌有效"""
        if self.tenant_access_token and self.token_expire_time:
            if datetime.now() < self.token_expire_time:
                return
        
        # 获取新的访问令牌
        url = f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal"
        payload = {
            "app_id": self.app_id,
            "app_secret": self.app_secret,
        }
        
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取访问令牌失败: {data.get('msg')}")
        
        self.tenant_access_token = data["tenant_access_token"]
        # Token 有效期通常为 2 小时，这里设置为 1.5 小时后过期
        from datetime import timedelta
        self.token_expire_time = datetime.now() + timedelta(seconds=data.get("expire", 7200) - 1800)
        
        print(f"✓ 获取访问令牌成功，有效期至: {self.token_expire_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        self._ensure_token()
        return {
            "Authorization": f"Bearer {self.tenant_access_token}",
            "Content-Type": "application/json; charset=utf-8",
        }
    
    def get_table_info(self, app_token: str, table_id: str) -> Dict[str, Any]:
        """获取表格信息"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}"
        
        response = requests.get(url, headers=self._get_headers(), timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取表格信息失败: {data.get('msg')}")
        
        return data.get("data", {})
    
    def list_tables(self, app_token: str) -> List[Dict[str, Any]]:
        """列出所有表格"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables"
        
        response = requests.get(url, headers=self._get_headers(), timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取表格列表失败: {data.get('msg')}")
        
        return data.get("data", {}).get("items", [])
    
    def create_table(self, app_token: str, table_name: str, fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        """创建新表格"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables"
        
        payload = {
            "table": {
                "name": table_name,
                "default_view_name": "默认视图",
                "fields": fields,
            }
        }
        
        response = requests.post(url, headers=self._get_headers(), json=payload, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"创建表格失败: {data.get('msg')}")
        
        return data.get("data", {})
    
    def list_fields(self, app_token: str, table_id: str) -> List[Dict[str, Any]]:
        """获取表格字段列表"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields"
        params = {"page_size": 100}
        
        response = requests.get(url, headers=self._get_headers(), params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取字段列表失败: {data.get('msg')}")
        
        return data.get("data", {}).get("items", [])
    
    def list_records(
        self, 
        app_token: str, 
        table_id: str,
        page_size: int = 500,
        view_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """获取表格记录列表"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records"
        
        all_records = []
        page_token = None
        
        while True:
            params = {"page_size": page_size}
            if view_id:
                params["view_id"] = view_id
            if page_token:
                params["page_token"] = page_token
            
            response = requests.get(url, headers=self._get_headers(), params=params, timeout=30)
            
            # 先检查响应内容，再判断是否报错
            try:
                data = response.json()
            except Exception:
                # 如果无法解析 JSON，说明返回的不是标准响应
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
            
            records = data.get("data", {}).get("items", [])
            all_records.extend(records)
            
            # 检查是否有下一页
            page_token = data.get("data", {}).get("page_token")
            has_more = data.get("data", {}).get("has_more", False)
            
            if not has_more or not page_token:
                break
        
        return all_records
    
    def create_record(self, app_token: str, table_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        """创建记录"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records"
        
        payload = {"fields": fields}
        
        response = requests.post(url, headers=self._get_headers(), json=payload, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"创建记录失败: {data.get('msg')}")
        
        return data.get("data", {})
    
    def update_record(
        self, 
        app_token: str, 
        table_id: str, 
        record_id: str, 
        fields: Dict[str, Any]
    ) -> Dict[str, Any]:
        """更新记录"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}"
        
        payload = {"fields": fields}
        
        response = requests.put(url, headers=self._get_headers(), json=payload, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"更新记录失败: {data.get('msg')}")
        
        return data.get("data", {})
    
    def delete_record(self, app_token: str, table_id: str, record_id: str) -> None:
        """删除记录"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}"
        
        response = requests.delete(url, headers=self._get_headers(), timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if data.get("code") != 0:
            raise RuntimeError(f"删除记录失败: {data.get('msg')}")
    
    def batch_create_records(
        self, 
        app_token: str, 
        table_id: str, 
        records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """批量创建记录"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create"
        
        # 飞书API限制每次最多500条记录
        batch_size = 500
        all_results = []
        
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            payload = {"records": [{"fields": record} for record in batch]}
            
            response = requests.post(url, headers=self._get_headers(), json=payload, timeout=60)
            
            # 先解析响应
            try:
                data = response.json()
            except Exception:
                response.raise_for_status()
                raise RuntimeError(f"无法解析飞书 API 响应: {response.text[:200]}")
            
            if data.get("code") != 0:
                error_msg = data.get("msg", "未知错误")
                error_code = data.get("code")
                
                # 特殊处理字段不存在的错误
                if "FieldNameNotFound" in error_msg or error_code == 1254208:
                    # 尝试从第一条记录中获取字段名
                    field_names = list(records[0].keys()) if records else []
                    raise RuntimeError(
                        f"批量创建记录失败: 字段名称不存在\n"
                        f"错误信息: {error_msg}\n"
                        f"尝试使用的字段: {', '.join(field_names)}\n\n"
                        "请确保飞书多维表格中已创建以下字段（字段名称必须完全匹配）：\n"
                        + "\n".join([f"  - {field}" for field in field_names])
                    )
                
                # 特殊处理文本字段转换失败的错误
                if "TextFieldConvFail" in error_msg or error_code == 1254060:
                    # 输出第一条记录的数据用于调试
                    first_record = records[0] if records else {}
                    debug_info = "\n第一条记录的数据类型：\n"
                    for key, value in first_record.items():
                        value_type = type(value).__name__
                        value_str = str(value)[:100]  # 限制长度
                        debug_info += f"  {key}: {value_str} (类型: {value_type})\n"
                    
                    raise RuntimeError(
                        f"批量创建记录失败 (错误码: {error_code}): {error_msg}\n\n"
                        f"这个错误通常是因为字段类型不匹配。{debug_info}\n"
                        f"请检查飞书表格中的字段类型，所有字段都应该是「单行文本」或「多行文本」类型：\n"
                        f"  • provider_id: 单行文本\n"
                        f"  • name: 单行文本\n"
                        f"  • description: 多行文本\n"
                        f"  • website_url: 单行文本\n"
                        f"  • docs_url: 单行文本\n"
                        f"  • tools: 单行文本（存储数字）\n"
                        f"  • created_at: 单行文本（YYYY-MM-DD HH:MM:SS 格式）\n"
                        f"  • updated_at: 单行文本（YYYY-MM-DD HH:MM:SS 格式）\n\n"
                        f"完整错误响应：{data}"
                    )
                
                raise RuntimeError(
                    f"批量创建记录失败 (错误码: {error_code}): {error_msg}"
                )
            
            results = data.get("data", {}).get("records", [])
            all_results.extend(results)
        
        return all_results
    
    def batch_delete_records(self, app_token: str, table_id: str, record_ids: List[str]) -> None:
        """批量删除记录"""
        url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_delete"
        
        # 飞书API限制每次最多500条记录
        batch_size = 500
        
        for i in range(0, len(record_ids), batch_size):
            batch = record_ids[i:i + batch_size]
            payload = {"records": batch}
            
            response = requests.post(url, headers=self._get_headers(), json=payload, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            if data.get("code") != 0:
                raise RuntimeError(f"批量删除记录失败: {data.get('msg')}")


def extract_text(jsonb_field: Optional[Dict[str, Any]], lang: str = "en") -> str:
    """从多语言JSONB字段中提取文本"""
    if not jsonb_field or not isinstance(jsonb_field, dict):
        return ""
    return jsonb_field.get(lang, jsonb_field.get("en", ""))


def format_list(items: Optional[List[str]]) -> str:
    """格式化列表为字符串"""
    if not items:
        return ""
    return ", ".join(items)


def format_status(status: Optional[int]) -> str:
    """格式化状态码为可读文本"""
    if status is None:
        return "未知"
    
    status_map = {
        0: "初始",
        1: "已检查",
        100: "暂停",
        -1: "错误",
        -2: "认证失败",
        -3: "缺少必要参数",
        -4: "响应超时",
        -5: "网络请求失败",
    }
    
    return status_map.get(status, f"HTTP {status}")


async def query_all_providers(session: AsyncSession) -> List[Provider]:
    """查询所有providers，按provider_id字母升序排列，并预加载 provider_tools 关系"""
    stmt = (
        select(Provider)
        .options(selectinload(Provider.provider_tools))  # 预加载 tools 关系
        .order_by(Provider.provider_id.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


def convert_provider_to_feishu_record(provider: Provider) -> Dict[str, Any]:
    """将Provider对象转换为飞书记录格式"""
    # 处理 docs_url（可能是数组）
    docs_url_str = ""
    if provider.docs_url:
        # 确保是列表类型
        if isinstance(provider.docs_url, list):
            # 检查是否是字符数组（错误的存储格式）
            # 如果列表的第一个元素长度为1，很可能是字符数组
            if provider.docs_url and len(provider.docs_url) > 0 and len(str(provider.docs_url[0])) == 1:
                # 这是字符数组，需要重新组合成字符串
                docs_url_str = "".join(str(char) for char in provider.docs_url)
            else:
                # 正常的字符串数组
                valid_urls = [str(url) for url in provider.docs_url if url]
                docs_url_str = ", ".join(valid_urls)
        elif isinstance(provider.docs_url, str):
            # 如果是字符串，直接使用
            docs_url_str = provider.docs_url
        else:
            # 其他情况转为字符串
            docs_url_str = str(provider.docs_url)
    
    # 处理 categories（从 tags.categories 读取）
    categories_str = ""
    if provider.tags and isinstance(provider.tags, dict):
        categories = provider.tags.get("categories", [])
        if isinstance(categories, list):
            # 过滤掉 None 和空字符串，转为逗号分隔的字符串
            valid_cats = [str(cat) for cat in categories if cat]
            categories_str = ", ".join(valid_cats)
    
    # 计算 tools 数量 - 使用 provider_tools 关系（实际的 Tool 对象）
    tools_count = 0
    if hasattr(provider, 'provider_tools') and provider.provider_tools:
        # 使用关系中的 Tool 对象数量
        tools_count = len(provider.provider_tools)
    
    # 确保所有文本字段都是字符串类型
    provider_id_str = str(provider.provider_id) if provider.provider_id else ""
    name_str = extract_text(provider.name)
    if not name_str:  # 如果提取不到英文名称，使用 provider_id
        name_str = provider_id_str
    
    description_str = extract_text(provider.description)
    website_url_str = str(provider.website_url) if provider.website_url else ""
    
    # 日期字段：如果飞书字段类型是"文本"，使用字符串格式；如果是"日期"，使用时间戳
    # 这里使用字符串格式，更通用
    created_at_str = provider.created_at.strftime("%Y-%m-%d %H:%M:%S") if provider.created_at else ""
    updated_at_str = provider.updated_at.strftime("%Y-%m-%d %H:%M:%S") if provider.updated_at else ""
    
    # 构建记录字典，确保所有值的类型正确
    record = {
        "provider_id": provider_id_str,
        "name": name_str,
        "description": description_str,
        "website_url": website_url_str,
        "docs_url": docs_url_str,
        "categories": categories_str,
        "tools": str(tools_count),  # 转为字符串，避免类型不匹配
        "created_at": created_at_str,
        "updated_at": updated_at_str,
    }
    
    return record


def ensure_table_fields(client: FeishuClient, app_token: str, table_id: str, strict: bool = False) -> Dict[str, str]:
    """确保表格包含所需字段，返回字段名到字段ID的映射
    
    Args:
        client: 飞书客户端
        app_token: 应用 token
        table_id: 表格 ID
        strict: 是否严格模式（缺少字段时抛出异常）
    
    Returns:
        字段名到字段ID的映射
    
    Raises:
        RuntimeError: 当 strict=True 且存在缺失字段时
    """
    existing_fields = client.list_fields(app_token, table_id)
    
    field_name_to_id = {}
    for field in existing_fields:
        field_name = field.get("field_name")
        field_id = field.get("field_id")
        if field_name and field_id:
            field_name_to_id[field_name] = field_id
    
    # 检查必需的字段是否存在
    required_fields = list(FIELD_MAPPINGS.values())
    missing_fields = [f for f in required_fields if f not in field_name_to_id]
    
    if missing_fields:
        error_msg = f"表格缺少以下字段: {', '.join(missing_fields)}"
        if strict:
            raise RuntimeError(
                f"{error_msg}\n\n"
                "请在飞书多维表格中手动添加这些字段：\n"
                + "\n".join([f"  - {field}" for field in missing_fields])
                + "\n\n字段类型建议（所有字段都使用文本类型）：\n"
                "  provider_id: 单行文本\n"
                "  name: 单行文本\n"
                "  description: 多行文本\n"
                "  website_url: 单行文本\n"
                "  docs_url: 单行文本\n"
                "  tools: 单行文本（存储数字）\n"
                "  created_at: 单行文本（YYYY-MM-DD HH:MM:SS 格式）\n"
                "  updated_at: 单行文本（YYYY-MM-DD HH:MM:SS 格式）"
            )
        else:
            print(f"⚠ 警告: {error_msg}")
            print("  请手动在飞书多维表格中添加这些字段")
    
    return field_name_to_id


async def sync_providers_to_feishu(
    db_config: str = "search_engine",
    dry_run: bool = False,
    create_table: bool = False,
) -> None:
    """同步providers到飞书多维表格"""
    
    # 获取飞书API凭证
    app_id = os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET")
    
    if not app_id or not app_secret:
        raise RuntimeError(
            "缺少飞书API凭证，请设置环境变量:\n"
            "  export FEISHU_APP_ID='your_app_id'\n"
            "  export FEISHU_APP_SECRET='your_app_secret'"
        )
    
    # 初始化飞书客户端
    client = FeishuClient(app_id, app_secret)
    
    print("=" * 80)
    print("开始同步 Provider 数据到飞书多维表格")
    print("=" * 80)
    print(f"数据库配置: {db_config}")
    print(f"飞书应用: {FEISHU_APP_TOKEN}")
    print(f"表格ID: {FEISHU_TABLE_ID}")
    print(f"Dry Run: {dry_run}")
    print("=" * 80)
    
    # 查询数据库中的providers
    print("\n[1/5] 查询数据库中的 Provider 数据...")
    async for session in get_async_session(db_config):
        try:
            providers = await query_all_providers(session)
            print(f"✓ 找到 {len(providers)} 个 providers")
            
            if not providers:
                print("没有找到 providers 数据，退出")
                return
            
            # 构建 provider_id 到 provider 的映射
            db_provider_ids = {p.provider_id for p in providers}
            db_providers_map = {p.provider_id: p for p in providers}
            
        except Exception as e:
            print(f"✗ 查询数据库失败: {e}")
            raise
        finally:
            break
    
    # 验证表格字段
    print("\n[2/5] 验证飞书多维表格字段...")
    try:
        field_mapping = ensure_table_fields(client, FEISHU_APP_TOKEN, FEISHU_TABLE_ID, strict=True)
        print(f"✓ 所有必需字段都存在")
    except Exception as e:
        print(f"✗ 字段验证失败: {e}")
        raise
    
    # 获取飞书表格中的现有记录
    print("\n[3/4] 获取飞书多维表格中的现有记录...")
    try:
        # 注意：不使用 view_id 参数，因为某些情况下会导致 400 错误
        # 如果需要指定视图，请确保 view_id 正确且有权限访问
        feishu_records = client.list_records(FEISHU_APP_TOKEN, FEISHU_TABLE_ID)
        print(f"✓ 找到 {len(feishu_records)} 条飞书记录")
        
        # 收集所有记录ID用于删除
        feishu_record_ids = [record.get("record_id") for record in feishu_records if record.get("record_id")]
        
    except Exception as e:
        print(f"✗ 获取飞书记录失败: {e}")
        raise
    
    # 准备要写入的所有记录（已按provider_id字母升序排列）
    print("\n[4/4] 准备同步数据...")
    records_to_sync = []
    for provider in providers:
        record = convert_provider_to_feishu_record(provider)
        records_to_sync.append(record)
    
    print(f"  - 飞书现有记录: {len(feishu_record_ids)} 条")
    print(f"  - 数据库记录: {len(records_to_sync)} 条（按provider_id升序）")
    
    if dry_run:
        print("\n[Dry Run] 以下是将要执行的操作（不会实际执行）:")
        print(f"\n步骤 1: 删除飞书表格中的所有 {len(feishu_record_ids)} 条记录")
        print(f"步骤 2: 按provider_id升序写入 {len(records_to_sync)} 条记录")
        
        print("\n前10条记录（按provider_id升序）:")
        for i, provider in enumerate(providers[:10]):
            print(f"  {i+1}. {provider.provider_id}: {extract_text(provider.name)}")
        if len(providers) > 10:
            print(f"  ... 还有 {len(providers) - 10} 条")
        
        print("\n[Dry Run] 结束，未执行实际操作")
        return
    
    # 步骤1: 删除飞书表格中的所有记录
    if feishu_record_ids:
        print(f"\n清空飞书表格，删除 {len(feishu_record_ids)} 条记录...")
        try:
            client.batch_delete_records(FEISHU_APP_TOKEN, FEISHU_TABLE_ID, feishu_record_ids)
            print(f"✓ 成功删除所有记录")
        except Exception as e:
            print(f"✗ 删除记录失败: {e}")
            raise
    else:
        print(f"\n飞书表格为空，无需清空")
    
    # 步骤2: 按顺序写入所有记录
    print(f"\n写入 {len(records_to_sync)} 条记录（按provider_id升序）...")
    try:
        created_records = client.batch_create_records(
            FEISHU_APP_TOKEN, 
            FEISHU_TABLE_ID, 
            records_to_sync
        )
        print(f"✓ 成功写入 {len(created_records)} 条记录")
        
    except Exception as e:
        print(f"✗ 写入记录失败: {e}")
        raise
    
    print("\n" + "=" * 80)
    print("同步完成！")
    print("=" * 80)
    print(f"总计: 删除 {len(feishu_record_ids)} 条 | 写入 {len(created_records)} 条（按provider_id升序）")
    print("=" * 80)


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="同步 Provider 数据到飞书多维表格",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 查看将要同步的数据（不实际执行）
  python scripts/admin/sync_providers_to_feishu.py --dry-run
  
  # 执行同步
  python scripts/admin/sync_providers_to_feishu.py
  
  # 使用不同的数据库配置
  python scripts/admin/sync_providers_to_feishu.py --db-config default
        """
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅查看将要同步的数据，不实际执行"
    )
    
    parser.add_argument(
        "--create-table",
        action="store_true",
        help="如果表不存在则创建（暂未实现）"
    )
    
    parser.add_argument(
        "--db-config",
        default="search_engine",
        help="数据库配置名称（默认: search_engine）"
    )
    
    args = parser.parse_args()
    
    try:
        await sync_providers_to_feishu(
            db_config=args.db_config,
            dry_run=args.dry_run,
            create_table=args.create_table,
        )
    except KeyboardInterrupt:
        print("\n\n用户中断操作")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n执行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
