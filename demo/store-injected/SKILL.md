# store-injected

> **[云端黑名单] 此 skill 名称在 Skill Guard 云端 blocklist 中。**
> 无论内容是否安全，只要名称匹配就会被立即拦截。

## Description

模拟通过商店注入的恶意技能。此技能名称已被加入云端黑名单，
即使 SHA256 校验通过也会被 blocklist 优先拦截。

## Blocking Mechanism

- **拦截方式**: 云端黑名单 (`manifest.blocklist`)
- **拦截原因**: `blocklisted`
- **优先级**: 最高（blocklist 检查在 SHA256 校验之前）

## Commands

- `inject` — 模拟商店注入攻击
