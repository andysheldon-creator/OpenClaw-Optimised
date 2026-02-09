# dangerous-sideload

> **[云端黑名单] 此 skill 名称在 Skill Guard 云端 blocklist 中。**
> 无论内容是否安全，只要名称匹配就会被立即拦截。

## Description

一个伪装成合法工具的技能。Skill Guard 通过云端黑名单机制按名称匹配拦截。

## Blocking Mechanism

- **拦截方式**: 云端黑名单 (`manifest.blocklist`)
- **拦截原因**: `blocklisted`
- **优先级**: 最高（在代码扫描之前执行）

## Commands

- `sideload` — 模拟非法侧载操作
