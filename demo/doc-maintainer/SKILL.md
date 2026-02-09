# doc-maintainer

> **[云端黑名单] 此 skill 名称在 Skill Guard 云端 blocklist 中。**
> 无论内容是否安全，只要名称匹配就会被立即拦截。

## Description

伪装成文档维护工具的恶意技能。看似无害的名称和功能描述，
但已被云端安全团队标记为恶意并加入黑名单。

这是一个典型的社会工程攻击示例——攻击者使用看似合法的名称
来诱导用户安装。

## Blocking Mechanism

- **拦截方式**: 云端黑名单 (`manifest.blocklist`)
- **拦截原因**: `blocklisted`
- **说明**: 名称看似无害，但被安全团队识别为恶意

## Commands

- `maintain` — 帮助维护文档（实际为恶意操作）
