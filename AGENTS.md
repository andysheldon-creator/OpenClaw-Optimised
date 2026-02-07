# 仓库指南

- 仓库地址：https://github.com/openclaw/openclaw
- GitHub issues/comments/PR 评论：使用字面多行字符串或 `-F - <<'EOF'`（或 `$'...'`）来换行；不要嵌入 "\\n"。

## 项目结构与模块组织

- 源代码：`src/`（CLI 连接在 `src/cli`，命令在 `src/commands`，Web 提供者在 `src/provider-web.ts`，基础设施在 `src/infra`，媒体管道在 `src/media`）。
- 测试：与源码同目录 `*.test.ts`。
- 文档：`docs/`（图片、队列、Pi 配置）。构建产物在 `dist/`。
- 插件/扩展：位于 `extensions/*`（工作区包）。插件专属依赖放在扩展的 `package.json` 中；除非核心使用，否则不要添加到根 `package.json`。
- 插件：安装时在插件目录运行 `npm install --omit=dev`；运行时依赖必须放在 `dependencies` 中。避免在 `dependencies` 中使用 `workspace:*`（npm install 会失败）；将 `openclaw` 放在 `devDependencies` 或 `peerDependencies` 中（运行时通过 jiti 别名解析 `openclaw/plugin-sdk`）。
- 安装脚本由 `https://openclaw.ai/*` 提供：位于同级仓库 `../openclaw.ai`（`public/install.sh`、`public/install-cli.sh`、`public/install.ps1`）。
- 消息渠道：重构共享逻辑（路由、白名单、配对、命令控制、引导、文档）时，必须考虑**所有**内置 + 扩展渠道。
  - 核心渠道文档：`docs/channels/`
  - 核心渠道代码：`src/telegram`、`src/discord`、`src/slack`、`src/signal`、`src/imessage`、`src/web`（WhatsApp web）、`src/channels`、`src/routing`
  - 扩展（渠道插件）：`extensions/*`（例如 `extensions/msteams`、`extensions/matrix`、`extensions/zalo`、`extensions/zalouser`、`extensions/voice-call`）
- 添加渠道/扩展/应用/文档时，检查 `.github/labeler.yml` 的标签覆盖。

## 文档链接（Mintlify）

- 文档托管在 Mintlify（docs.openclaw.ai）。
- `docs/**/*.md` 中的内部文档链接：使用根相对路径，不带 `.md`/`.mdx`（示例：`[Config](/configuration)`）。
- 章节交叉引用：在根相对路径上使用锚点（示例：`[Hooks](/configuration#hooks)`）。
- 文档标题和锚点：标题中避免使用破折号和撇号，因为会破坏 Mintlify 锚点链接。
- 当 Peter 要求链接时，回复完整的 `https://docs.openclaw.ai/...` URL（不是根相对路径）。
- 修改文档时，在回复末尾附上引用的 `https://docs.openclaw.ai/...` URL。
- README（GitHub）：保持绝对文档 URL（`https://docs.openclaw.ai/...`）以确保链接在 GitHub 上正常工作。
- 文档内容必须通用化：不要出现个人设备名/主机名/路径；使用占位符如 `user@gateway-host` 和"网关主机"。

## 文档国际化（zh-CN）

- `docs/zh-CN/**` 是生成的；除非用户明确要求，否则不要编辑。
- 流程：更新英文文档 → 调整词汇表（`docs/.i18n/glossary.zh-CN.json`）→ 运行 `scripts/docs-i18n` → 仅在收到指示时进行定向修复。
- 翻译记忆：`docs/.i18n/zh-CN.tm.jsonl`（生成的）。
- 参见 `docs/.i18n/README.md`。
- 该流程可能较慢/低效；如果拖延太久，在 Discord 上联系 @jospalmbier，而不是自己想办法绕过。

## exe.dev 虚拟机操作（通用）

- 访问：稳定路径是 `ssh exe.dev` 然后 `ssh vm-name`（假设 SSH 密钥已配置）。
- SSH 不稳定：使用 exe.dev Web 终端或 Shelley（Web 代理）；为长时间操作保持 tmux 会话。
- 更新：`sudo npm i -g openclaw@latest`（全局安装需要 `/usr/lib/node_modules` 的 root 权限）。
- 配置：使用 `openclaw config set ...`；确保设置了 `gateway.mode=local`。
- Discord：仅存储原始 token（不要加 `DISCORD_BOT_TOKEN=` 前缀）。
- 重启：停止旧网关并运行：
  `pkill -9 -f openclaw-gateway || true; nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &`
- 验证：`openclaw channels status --probe`、`ss -ltnp | rg 18789`、`tail -n 120 /tmp/openclaw-gateway.log`。

## 构建、测试和开发命令

- 运行时基线：Node **22+**（保持 Node + Bun 路径正常工作）。
- 安装依赖：`pnpm install`
- 预提交钩子：`prek install`（运行与 CI 相同的检查）
- 也支持：`bun install`（修改依赖/补丁时保持 `pnpm-lock.yaml` + Bun 补丁同步）。
- TypeScript 执行（脚本、开发、测试）优先使用 Bun：`bun <file.ts>` / `bunx <tool>`。
- 开发模式运行 CLI：`pnpm openclaw ...`（bun）或 `pnpm dev`。
- Node 仍然支持运行构建产物（`dist/*`）和生产安装。
- Mac 打包（开发）：`scripts/package-mac-app.sh` 默认使用当前架构。发布检查清单：`docs/platforms/mac/release.md`。
- 类型检查/构建：`pnpm build`
- TypeScript 检查：`pnpm tsgo`
- 代码检查/格式化：`pnpm check`
- 测试：`pnpm test`（vitest）；覆盖率：`pnpm test:coverage`

## 代码风格与命名规范

- 语言：TypeScript（ESM）。优先使用严格类型；避免 `any`。
- 格式化/代码检查通过 Oxlint 和 Oxfmt；提交前运行 `pnpm check`。
- 为复杂或不易理解的逻辑添加简要代码注释。
- 保持文件简洁；提取辅助函数而不是创建"V2"副本。使用现有模式处理 CLI 选项和通过 `createDefaultDeps` 进行依赖注入。
- 目标将文件保持在约 700 行以内；仅为指导方针（非硬性规则）。当有助于提高清晰度或可测试性时进行拆分/重构。
- 命名：产品/应用/文档标题使用 **OpenClaw**；CLI 命令、包/二进制文件、路径和配置键使用 `openclaw`。

## 发布渠道（命名）

- stable：仅限标签发布（例如 `vYYYY.M.D`），npm dist-tag `latest`。
- beta：预发布标签 `vYYYY.M.D-beta.N`，npm dist-tag `beta`（可能不包含 macOS 应用）。
- dev：`main` 分支的最新提交（无标签；git checkout main）。

## 测试指南

- 框架：Vitest，V8 覆盖率阈值（70% 行/分支/函数/语句）。
- 命名：源文件对应 `*.test.ts`；端到端测试为 `*.e2e.test.ts`。
- 修改逻辑后推送前运行 `pnpm test`（或 `pnpm test:coverage`）。
- 不要将测试 worker 设置超过 16；已经尝试过了。
- 实时测试（真实密钥）：`CLAWDBOT_LIVE_TEST=1 pnpm test:live`（仅 OpenClaw）或 `LIVE=1 pnpm test:live`（包含提供者实时测试）。Docker：`pnpm test:docker:live-models`、`pnpm test:docker:live-gateway`。引导 Docker E2E：`pnpm test:docker:onboard`。
- 完整工具包及覆盖内容：`docs/testing.md`。
- 纯测试添加/修复通常**不需要**变更日志条目，除非它们改变了面向用户的行为或用户要求添加。
- 移动端：使用模拟器前，先检查已连接的真机（iOS + Android），优先使用真机。

## 提交与 Pull Request 指南

- 使用 `scripts/committer "<msg>" <file...>` 创建提交；避免手动 `git add`/`git commit` 以保持暂存范围。
- 遵循简洁、面向操作的提交信息（例如 `CLI: add verbose flag to send`）。
- 分组相关更改；避免捆绑不相关的重构。
- 变更日志工作流：将最新已发布版本保持在顶部（不使用 `Unreleased`）；发布后，更新版本号并在顶部开始新章节。
- PR 应总结范围，注明已执行的测试，并提及任何面向用户的更改或新标志。
- 提交 PR 时阅读：`docs/help/submitting-a-pr.md`（[提交 PR](https://docs.openclaw.ai/help/submitting-a-pr)）
- 提交 issue 时阅读：`docs/help/submitting-an-issue.md`（[提交 Issue](https://docs.openclaw.ai/help/submitting-an-issue)）
- PR 审查流程：收到 PR 链接时，通过 `gh pr view`/`gh pr diff` 审查，**不要**切换分支。
- PR 审查调用：优先使用单个 `gh pr view --json ...` 批量获取元数据/评论；仅在需要时运行 `gh pr diff`。
- 当粘贴了 GH Issue/PR 链接开始审查前：运行 `git pull`；如果有本地更改或未推送的提交，停止并提醒用户后再审查。
- 目标：合并 PR。提交干净时优先使用 **rebase**；历史混乱时使用 **squash**。
- PR 合并流程：从 `main` 创建临时分支，将 PR 分支合并进来（除非提交历史很重要，否则优先 squash；重要时使用 rebase/merge）。始终尝试合并 PR，除非确实困难再使用其他方法。如果使用 squash，将 PR 作者添加为协作贡献者。应用修复，添加变更日志条目（包含 PR # + 感谢），在最终提交前运行完整检查，提交，合并回 `main`，删除临时分支，最终停留在 `main`。
- 如果你审查了 PR 并随后在其上工作，通过 merge/squash 合入（不直接提交到 main），始终将 PR 作者添加为协作贡献者。
- 处理 PR 时：添加包含 PR 编号的变更日志条目并感谢贡献者。
- 处理 issue 时：在变更日志条目中引用该 issue。
- 合并 PR 时：留下 PR 评论，解释我们做了什么并包含 SHA 哈希。
- 合并新贡献者的 PR 时：将其头像添加到 README "感谢所有 clawtributors" 缩略图列表中。
- 合并 PR 后：如果贡献者缺失，运行 `bun scripts/update-clawtributors.ts`，然后提交重新生成的 README。

## 简写命令

- `sync`：如果工作树有未提交更改，提交所有更改（选择合理的 Conventional Commit 消息），然后 `git pull --rebase`；如果 rebase 冲突且无法解决，停止；否则 `git push`。

### PR 工作流（审查 vs 合入）

- **审查模式（仅 PR 链接）：** 阅读 `gh pr view/diff`；**不要**切换分支；**不要**修改代码。
- **合入模式：** 从 `main` 创建集成分支，引入 PR 提交（**优先 rebase** 保持线性历史；复杂度/冲突较大时**允许 merge**），应用修复，添加变更日志（+ 感谢 + PR #），**提交前本地运行完整检查**（`pnpm build && pnpm check && pnpm test`），提交，合并回 `main`，然后 `git switch main`（合入后不要停留在主题分支）。重要：合入后贡献者必须出现在 git 图中！

## 安全与配置提示

- Web 提供者将凭证存储在 `~/.openclaw/credentials/`；如果登出，重新运行 `openclaw login`。
- Pi 会话默认位于 `~/.openclaw/sessions/`；基础目录不可配置。
- 环境变量：参见 `~/.profile`。
- 永远不要提交或发布真实电话号码、视频或实际配置值。在文档、测试和示例中使用明显的假占位符。
- 发布流程：在进行任何发布工作前，始终阅读 `docs/reference/RELEASING.md` 和 `docs/platforms/mac/release.md`；这些文档已回答的例行问题不要再问。

## 故障排查

- 品牌重塑/迁移问题或遗留配置/服务警告：运行 `openclaw doctor`（参见 `docs/gateway/doctor.md`）。

## Agent 专属注意事项

- 词汇："makeup" = "mac app"。
- 永远不要编辑 `node_modules`（包括全局/Homebrew/npm/git 安装的）。更新会覆盖。技能注释放在 `tools.md` 或 `AGENTS.md` 中。
- Signal："update fly" => `fly ssh console -a flawd-bot -C "bash -lc 'cd /data/clawd/openclaw && git pull --rebase origin main'"` 然后 `fly machines restart e825232f34d058 -a flawd-bot`。
- 处理 GitHub Issue 或 PR 时，在任务结束时打印完整 URL。
- 回答问题时，仅提供高置信度的答案：在代码中验证；不要猜测。
- 永远不要更新 Carbon 依赖。
- 任何带有 `pnpm.patchedDependencies` 的依赖必须使用精确版本（不带 `^`/`~`）。
- 依赖打补丁（pnpm patches、overrides 或 vendor 更改）需要明确批准；默认不要这样做。
- CLI 进度：使用 `src/cli/progress.ts`（`osc-progress` + `@clack/prompts` spinner）；不要手写 spinner/进度条。
- 状态输出：保持表格 + ANSI 安全换行（`src/terminal/table.ts`）；`status --all` = 只读/可粘贴，`status --deep` = 探测。
- 网关目前仅作为菜单栏应用运行；没有单独安装 LaunchAgent/helper 标签。通过 OpenClaw Mac 应用或 `scripts/restart-mac.sh` 重启；验证/终止使用 `launchctl print gui/$UID | grep openclaw` 而不是假设固定标签。**在 macOS 上调试时，通过应用启动/停止网关，而不是临时的 tmux 会话；移交前终止任何临时隧道。**
- macOS 日志：使用 `./scripts/clawlog.sh` 查询 OpenClaw 子系统的统一日志；支持 follow/tail/分类过滤，需要 `/usr/bin/log` 的免密 sudo。
- 如果本地有共享护栏，查阅它们；否则遵循此仓库的指导。
- SwiftUI 状态管理（iOS/macOS）：优先使用 `Observation` 框架（`@Observable`、`@Bindable`）而非 `ObservableObject`/`@StateObject`；除非兼容性需要，不要引入新的 `ObservableObject`，修改相关代码时迁移现有用法。
- 连接提供者：添加新连接时，更新每个 UI 界面和文档（macOS 应用、Web UI、移动端（如适用）、引导/概览文档），并添加匹配的状态 + 配置表单，以保持提供者列表和设置同步。
- 版本位置：`package.json`（CLI）、`apps/android/app/build.gradle.kts`（versionName/versionCode）、`apps/ios/Sources/Info.plist` + `apps/ios/Tests/Info.plist`（CFBundleShortVersionString/CFBundleVersion）、`apps/macos/Sources/OpenClaw/Resources/Info.plist`（CFBundleShortVersionString/CFBundleVersion）、`docs/install/updating.md`（固定的 npm 版本）、`docs/platforms/mac/release.md`（APP_VERSION/APP_BUILD 示例）、Peekaboo Xcode 项目/Info.plists（MARKETING_VERSION/CURRENT_PROJECT_VERSION）。
- **重启应用：** "restart iOS/Android apps" 意味着重新构建（编译/安装）并重新启动，而不仅仅是杀死/启动。
- **设备检查：** 测试前，先验证已连接的真机（iOS/Android），再考虑使用模拟器/仿真器。
- iOS Team ID 查找：`security find-identity -p codesigning -v` → 使用 Apple Development (…) TEAMID。备选：`defaults read com.apple.dt.Xcode IDEProvisioningTeamIdentifiers`。
- A2UI bundle 哈希：`src/canvas-host/a2ui/.bundle.hash` 是自动生成的；忽略意外更改，仅在需要时通过 `pnpm canvas:a2ui:bundle`（或 `scripts/bundle-a2ui.sh`）重新生成。将哈希作为单独的提交。
- 发布签名/公证密钥在仓库外管理；遵循内部发布文档。
- 公证认证环境变量（`APP_STORE_CONNECT_ISSUER_ID`、`APP_STORE_CONNECT_KEY_ID`、`APP_STORE_CONNECT_API_KEY_P8`）应存在于你的环境中（参见内部发布文档）。
- **多 Agent 安全：** 除非明确要求，**不要**创建/应用/删除 `git stash` 条目（包括 `git pull --rebase --autostash`）。假设其他 Agent 可能在工作；保持不相关的 WIP 不动，避免跨领域的状态更改。
- **多 Agent 安全：** 当用户说"push"时，你可以 `git pull --rebase` 集成最新更改（永远不要丢弃其他 Agent 的工作）。当用户说"commit"时，仅限于你的更改。当用户说"commit all"时，分组提交所有内容。
- **多 Agent 安全：** 除非明确要求，**不要**创建/删除/修改 `git worktree` 检出（或编辑 `.worktrees/*`）。
- **多 Agent 安全：** 除非明确要求，**不要**切换分支/检出不同分支。
- **多 Agent 安全：** 运行多个 Agent 是可以的，只要每个 Agent 有自己的会话。
- **多 Agent 安全：** 看到不认识的文件时，继续工作；专注于你的更改，只提交那些。
- 代码检查/格式化变动：
  - 如果已暂存 + 未暂存的差异仅为格式化，自动解决无需询问。
  - 如果已请求提交/推送，自动暂存并将仅格式化的后续更改包含在同一提交中（或在需要时作为一个小的后续提交），无需额外确认。
  - 仅当更改涉及语义（逻辑/数据/行为）时才询问。
- Lobster 接缝：使用 `src/terminal/palette.ts` 中的共享 CLI 调色板（不要硬编码颜色）；根据需要将调色板应用于引导/配置提示和其他 TTY UI 输出。
- **多 Agent 安全：** 报告聚焦于你的编辑；除非真正被阻塞，避免护栏免责声明；当多个 Agent 修改同一文件时，如果安全就继续；仅在相关时以简短的"存在其他文件"注释结尾。
- Bug 调查：在得出结论前，阅读相关 npm 依赖的源代码和所有相关本地代码；力求高置信度的根本原因。
- 代码风格：为复杂逻辑添加简要注释；尽可能将文件保持在约 500 行以内（根据需要拆分/重构）。
- 工具 Schema 护栏（google-antigravity）：避免在工具输入 schema 中使用 `Type.Union`；不要使用 `anyOf`/`oneOf`/`allOf`。字符串列表使用 `stringEnum`/`optionalStringEnum`（Type.Unsafe 枚举），用 `Type.Optional(...)` 代替 `... | null`。保持顶层工具 schema 为 `type: "object"` 带 `properties`。
- 工具 Schema 护栏：避免在工具 schema 中使用原始 `format` 属性名；某些验证器将 `format` 视为保留关键字并拒绝该 schema。
- 当被要求打开"会话"文件时，打开 `~/.openclaw/agents/<agentId>/sessions/*.jsonl` 下的 Pi 会话日志（使用系统提示 Runtime 行中的 `agent=<id>` 值；除非指定了特定 ID，否则使用最新的），而不是默认的 `sessions.json`。如果需要来自另一台机器的日志，通过 Tailscale SSH 读取相同路径。
- 不要通过 SSH 重新构建 macOS 应用；构建必须直接在 Mac 上运行。
- 永远不要向外部消息平台（WhatsApp、Telegram）发送流式/部分回复；只有最终回复才应送达。流式/工具事件仍可发送到内部 UI/控制频道。
- 语音唤醒转发提示：
  - 命令模板应保持 `openclaw-mac agent --message "${text}" --thinking low`；`VoiceWakeForwarder` 已经对 `${text}` 进行了 shell 转义。不要添加额外引号。
  - launchd PATH 很精简；确保应用的 launch agent PATH 包含标准系统路径和你的 pnpm bin（通常是 `$HOME/Library/pnpm`），以便通过 `openclaw-mac` 调用时 `pnpm`/`openclaw` 二进制文件能正确解析。
- 对于包含 `!` 的手动 `openclaw message send` 消息，使用上述 heredoc 模式以避免 Bash 工具的转义问题。
- 发布护栏：未经操作者明确同意，不要更改版本号；在运行任何 npm publish/release 步骤前始终请求许可。

## NPM + 1Password（发布/验证）

- 使用 1password 技能；所有 `op` 命令必须在新的 tmux 会话中运行。
- 登录：`eval "$(op signin --account my.1password.com)"`（应用已解锁 + 集成已开启）。
- OTP：`op read 'op://Private/Npmjs/one-time password?attribute=otp'`。
- 发布：`npm publish --access public --otp="<otp>"`（从包目录运行）。
- 验证（无本地 npmrc 副作用）：`npm view <pkg> version --userconfig "$(mktemp)"`。
- 发布后终止 tmux 会话。
