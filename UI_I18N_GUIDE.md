# OpenClaw UI 国际化（i18n）功能说明

## 概述

OpenClaw UI 现在支持多语言功能，目前已实现英文和中文两种语言的界面翻译。

## 支持的语言

- 英文 (en) - 默认语言
- 中文 (zh) - 简体中文

## 如何使用

### 1. 语言切换

- 在UI的顶部导航栏，点击语言选择下拉菜单
- 选择所需的语言（English 或 中文）
- 界面文本将立即更新为所选语言

### 2. 系统自动检测

- 系统会自动检测浏览器的默认语言设置
- 如果检测到支持的语言，则会默认使用该语言
- 用户的选择会被保存在本地存储中，下次访问时会记住之前的选择

### 3. 开发者集成

对于希望添加新的翻译文本的开发者：

```typescript
// 在组件中使用翻译
import { t } from "./i18n/i18n-manager";

// 使用示例
const buttonText = t("common.save"); // "Save" 或 "保存"
const pageTitle = t("pageTitles.overview"); // "Overview" 或 "概览"
```

## 添加新语言

要添加新语言，需要在以下文件中进行修改：

1. `ui/src/ui/i18n/locales.ts` - 添加新语言的翻译对象
2. `ui/src/ui/app-render.ts` - 在语言选择器中添加新语言选项

## 文件结构

- `ui/src/ui/i18n/locales.ts` - 存放所有语言的翻译文本
- `ui/src/ui/i18n/i18n-manager.ts` - 国际化管理器和核心逻辑
- `ui/src/ui/i18n/lit-i18n.ts` - Lit模板的国际化工具
- `ui/src/ui/styles/i18n.css` - 国际化相关的样式

## 翻译键值结构

翻译键按功能模块组织：

- `navigation` - 导航栏相关文本
- `pageTitles` - 页面标题
- `pageSubtitles` - 页面副标题
- `topbar` - 顶部工具栏文本
- `common` - 通用UI元素文本
- `chat` - 聊天界面文本
- `settings` - 设置相关文本

## 测试验证

您可以使用以下命令来测试国际化功能：

```bash
cd ui
npm install
npm run dev
```

然后在浏览器中访问UI，并使用顶部的语言选择器进行切换测试。

## 问题反馈

如果您发现翻译错误或缺失的文本，请在项目仓库中提交Issue。
