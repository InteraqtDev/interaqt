# 启动 Waku 新 GUI Task（并可带 prompt 自动提交）

> **权威位置**：`~/.agents/skills/launch-local-agent-session/sessions/`  
> 任意场景优先跑本目录脚本（或 `../scripts/launch.sh`）。循环任务 ensure 后的仓库副本：`prompt/skill/`。  
> 不要手写未编码的 `waku://` 查询、不要对 Waku 用剪贴板粘贴 / `Cmd+N`、不要把 prompt 发进当前对话。云端 Cloud Agent 不在本 skill。

> 用途：从脚本/自动化里**在 Waku 桌面应用中新建一次未开始任务**，并可选地把
> prompt 作为该任务的**第一条用户消息自动提交**。
>
> 目标是其它本地 GUI 后端的对等物：一个**新的 Waku task**，而不是往当前
> Waku 窗口里再贴一条消息。

## 调研结论（为什么用 launch link，而不是粘贴）

Waku 的正式契约是 `docs/deeplink.md`（应用内）。一条 URL 同时完成选项目、选
harness/model/effort，以及（若带 `prompt`）按发送键路径提交：

```
waku://new-task[?project=<abs>][&harness=<id>][&model=<id>][&effort=<id>][&prompt=<text>]
```

- **scheme**：正式安装 `/Applications/Waku.app` 登记 `waku`；Debug 包登记
  `waku-dev`。两套互不抢 handler，数据目录也分离（`~/.waku` vs 仓库 `temp/`）。
- **有 `prompt`**：解码、CRLF→LF 后走与发送按钮相同的提交序列，会话立刻开工。
- **省略 `prompt`**：只准备 New Task，不发送。
- **编码**：form-urlencoded；原始 `+` 变成空格，字面 `+` 必须 `%2B`。整段 URL
  UTF-8 字节数上限 **16384**。超限会 toast，不会截断后开工。
- **不要**用 Accessibility / 剪贴板往 composer 里贴：那会把正文打进**当前**任务，
  且绕过占用检查与自动提交契约。

macOS 由 LaunchServices 把 `open waku://…` 交给已登记的正式包。本机若被 Sparkle
用旧公证包覆盖，`/Applications/Waku.app` 可能不再声明 `waku://`，链接会落到
Debug 或没有 handler——脚本默认打正式包；Debug 必须显式 `--dev`。

## 前置条件

1. **macOS**。
2. **正式包**：`/Applications/Waku.app` 已登记 `waku://`（`./scripts/bundle.sh release`
   后安装）。本机无 Developer ID 时是 ad-hoc 签名；须关掉 Sparkle 自动更新，否则
   会被线上旧包覆盖并丢掉 URL types。
3. **python3**：用于查询编码。
4. **不需要**辅助功能权限（与 Cursor / ZCode 粘贴路径不同）。

## 用法

```bash
# 当前目录：只准备 New Task
bash prompt/skill/new_waku_session.sh

# 当前目录：准备并自动提交 prompt
bash prompt/skill/new_waku_session.sh "你的 prompt"

# 指定项目
bash prompt/skill/new_waku_session.sh -w /path/to/workspace "你的 prompt"

# 指定 harness / model
bash prompt/skill/new_waku_session.sh --harness claude --model claude-sonnet-4-6 \
  -w /path/to/workspace $'第一行\n第二行'

# Debug 包（waku-dev://），仅当正在跑 Waku Debug
bash prompt/skill/new_waku_session.sh --dev -w /path/to/workspace "你的 prompt"
```

调度器等价：

```bash
bash "$HOME/.agents/skills/launch-local-agent-session/scripts/launch.sh" \
  waku -w "$(pwd)" "你的 prompt"
```

脚本行为：

- 未传 `-w` 时使用当前工作目录（必须存在），编码为 `project=`。
- `--harness` / `--model` / `--effort` 可省略；省略则与手动 New Task 的记忆默认相同。
- 有非空白 prompt 时写入 `prompt=` 并自动提交；空白 prompt 视为省略。
- `open` 该 URL 后立即退出，不等待 agent 跑完。
- **不要**把 `-w` 当成 prompt 正文传入。

## 触发方式对比

| 方式 | 结果 |
|---|---|
| **`open waku://new-task?…`（本脚本）** | 新未开始任务；带 prompt 则自动提交 |
| 手写未编码的 `prompt=` | 换行、`&`、`+` 会截断或变空格 |
| `waku-dev://` 却想打正式包 | 进 Debug，或 WrongScheme toast |
| 剪贴板贴进当前窗口 | 进**当前** composer，不是新 session |
| `Cmd+N` / 菜单 New Task | 不会带上脚本里的 prompt |

## 实现注意事项

- 编码用 `urllib.parse.urlencode(..., quote_via=quote, safe="")`，只解码一次的对端
  是 Waku 的 `query_pairs()`。
- 目标项目 New Task 输入框已有未发送文字或附件时，整链失败（toast occupied），
  不覆盖用户草稿。
- Projectless slug 的 RPC `prompt` 字段是目录名，不是用户消息；脚本不会把它
  和 launch `prompt` 搞混。
- 正式包与 Debug 不要混用 scheme。循环任务默认走 `waku://`。

## 验证记录（2026-08-29）

- `/Applications/Waku.app` 声明 `CFBundleURLSchemes = ["waku"]`；
  `NSWorkspace.urlForApplication(toOpen: waku://new-task)` 指向该包。
- `waku-dev://` 默认仍是 `target/debug/Waku Debug.app`。
- 脚本 `open` 一条无 prompt 的 `waku://new-task?project=…` 后，前台进程名为
  `Waku`，不是 `Waku Debug`。
