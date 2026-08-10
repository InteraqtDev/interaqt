# 在 Cursor Agents Window 中启动新的独立 Agent Session（并可输入 prompt 开始执行）

> 用途：从脚本/自动化里**在 Cursor Agents Window 中新建一个独立的 GUI Agent session**，
> 并可选地**输入 prompt 文本、按回车发送、开始执行**。
>
> 目标是 Codex 的「New Task」对等物：一个**新的 Agent session**，而不是往当前
> session 里再塞一条对话。

## 调研结论（为什么用 `cursor <workspace>`，而不是菜单 New Agent）

Cursor 3 的 Agents Window（glass）里，真正新建独立 Agent 的内部路径是：

```text
CLI 打开目录
  → 主进程 vscode:createNewComposer { folderUri }
  → glass.newAgent({ folderUri, source: "cli" })
```

当 **已有 glass 窗口**，且满足下列条件时，`cursor /path/to/workspace` 会走这条路径
（源码：`glassCliFolderOpenRouting.js` / `windowsManager#open`）：

1. `openContext === CLI`
2. 恰好 1 个位置参数，且是已存在的目录
3. 未带冲突 flag：`-n/--new-window`、`-r/--reuse-window`、`--classic` 等
4. 最近活动窗口是 glass（Agents Window）

因此脚本采用：

1. 激活已打开的 Cursor Agents Window；
2. 执行 `cursor <workspace>`（**不加** `-r` / `-n`）触发 `glass.newAgent`；
3. 若给了 prompt：剪贴板粘贴 + 回车发送（依赖新 session 输入框自动聚焦）。

### 已排除 / 会踩坑的方式

| 方式 | 结果 |
|---|---|
| `File → New Agent` + 点击窗口底部再粘贴 | 容易把 prompt 打进**当前正在看的旧 session**（本仓库 2026-07-11 已复现） |
| `cursor -r <workspace>` | 复用/打开经典编辑器窗口，不保证新建 Agent |
| `cursor -n <workspace>` | 强制新窗口，打断 glass 的 createNewComposer 路由 |
| `cursor agent ...` | 终端 Agent，不是 GUI Agents Window session |
| `cursor --chat` | 实测未额外打开独立 Agents session 窗口 |

## 前置条件

1. **macOS**（AppleScript / System Events 仅 macOS 可用）。
2. **Cursor Desktop 已打开 Agents Window**（窗口标题一般为 `Cursor Agents`）。
3. **`cursor` CLI 可用**（本机实测 `/usr/local/bin/cursor` → Cursor.app）。
4. **辅助功能（Accessibility）权限**：运行 `osascript` 的宿主必须在
   `系统设置 → 隐私与安全性 → 辅助功能` 中被勾选。
   - 首次运行若报 `osascript is not allowed assistive access (-1719)`，即未授权。

可用下面命令验证权限与窗口：

```bash
osascript -e 'tell application "System Events" to tell process "Cursor" to get name of windows'
```

成功时应能看到类似：

```text
Cursor Agents
```

## 用法

```bash
# 在当前目录 workspace 下仅新建一个独立 Agent
bash prompt/skill/new_cursor_agent_session.sh

# 新建独立 Agent，输入该 prompt 并按回车发送、开始执行
bash prompt/skill/new_cursor_agent_session.sh "你的 prompt"

# 指定 workspace，仅新建一个独立 Agent
bash prompt/skill/new_cursor_agent_session.sh -w /path/to/workspace

# 指定 workspace，并发送 prompt
bash prompt/skill/new_cursor_agent_session.sh -w /path/to/workspace "你的 prompt"

# 多行 prompt（用 $'...' 传入换行）
bash prompt/skill/new_cursor_agent_session.sh -w /path/to/workspace $'第一行\n第二行'
```

脚本行为：

- 校验 workspace 目录存在，并转成绝对路径；
- 校验 `cursor` 命令存在；
- 激活已运行的 Cursor，并等待进入前台、窗口存在；
- 执行 `cursor <workspace>`，在已有 Agents Window 中触发 `glass.newAgent`；
- 若给了 prompt：等待新 session 输入框聚焦，剪贴板粘贴 + 回车发送，
  **结束后恢复原剪贴板内容**；
- **不会**点击窗口底部输入区（那会把焦点打回旧 session）。

## 触发方式对比

| 方式 | 命令 | 备注 |
|---|---|---|
| **`cursor <workspace>`（推荐）** | `cursor /path/to/repo` | 已有 glass 时 → `createNewComposer` → 独立新 Agent |
| 菜单 `File → New Agent` | AppleScript click | 可新建，但后续粘贴极易落到旧 session；不作默认 |
| 快捷键 `Cmd+N` | `keystroke "n" using command down` | 绑定 New Agent，同样有焦点问题 |
| `cursor -r <workspace>` | reuse-window | 破坏 glass 路由，禁用 |
| `cursor agent` | 终端 Agent | 不符合 GUI 观察目标 |

## 输入 prompt 并执行（原理与坑）

1. **不要点窗口底部再粘贴**。旧实现为了“抢焦点”点击 Agents 窗口底部，结果把
   焦点打回当前可见的旧 session，造成「以为新建了，其实 prompt 进了当前对话」。
2. **依赖 `glass.newAgent` 后新 session 输入框自动聚焦**，再 `Cmd+V` + `Return`。
3. **中文必须走剪贴板**，不能直接 `keystroke`（输入法会干扰）。
4. **prompt 经临时 `.scpt` + python 转义**，避免引号/反斜杠/换行问题。

## 实现注意事项

- **必须用 `cursor <workspace>`，不要改回菜单点击作为默认路径**。
- **禁止 `-r` / `-n` / `--classic`**：这些 flag 会让 `hie()` 路由失败。
- **AppleScript 经临时文件传入 `osascript`**，避免 bash `$(...)` + heredoc 括号陷阱。
- **进程检测用 `System Events` 的 `exists process "Cursor"`**。
- **最近活动窗口必须是 glass**。若当前在经典 IDE 窗口，先切回 Agents Window
 （`Cmd+Shift+P` → Open Agents Window），再跑脚本。

## 验证记录（2026-07-11）

### 源码核对

- Cursor `3.11.13`；窗口名 `Cursor Agents`（glass）。
- 主进程在已有 glass 时对 CLI 单目录 open 发送 `vscode:createNewComposer`。
- glass 侧将该 IPC 映射为 `glass.newAgent({ folderUri, source: "cli" })`。

### 错误路径复现

- 旧脚本：`File → New Agent` + 点击窗口底部粘贴；
- 结果：prompt `请只回复：cursor_new_session_test_ok_20260711` **进入了当前 session**，
  而不是新 session。

### 正确路径端到端（2026-07-11 12:50）

```bash
bash prompt/skill/new_cursor_agent_session.sh -w /path/to/workspace \
  "请只回复：cursor_cli_new_session_ok_20260711c"
```

结果：

- 脚本 exit=0；
- **新 session** `c56d76e9-8351-4dd2-a66e-b393fb4462d3` 收到 prompt，并回复
  `cursor_cli_new_session_ok_20260711c`；
- **当前旧 session** `54e8b057-0034-4460-b417-e5e99cdd7d09` 的 transcript 中
  **不含**该 marker（确认没有打进当前对话）。
