# Codex 桌面 UI 新建 Chat 操作经验

日期：2026-05-26

## 结论

可以从当前 Codex 会话里触发 Codex 桌面 UI 在当前 project 下新建 chat。可行路径不是 Computer Use，而是通过 macOS Accessibility 授权后的 AppleScript 操作 Codex 菜单：

```bash
codex app /Users/camus/Work/medeo

osascript <<'APPLESCRIPT'
tell application "Codex" to activate
delay 0.5
tell application "System Events"
  tell process "Codex"
    click menu item "New Chat" of menu "File" of menu bar item "File" of menu bar 1
  end tell
end tell
APPLESCRIPT
```

这会触发桌面 UI 的 `File -> New Chat`。如果当前 workspace 已经是 `/Users/camus/Work/medeo`，新 chat 会归属到 medeo project。

## 前置条件

需要给发起命令的终端或 Codex 相关进程 macOS 辅助功能权限。未授权时，AppleScript 会失败：

```text
System Events got an error: osascript is not allowed assistive access. (-1719)
```

授权后，可以用下面命令验证是否已经能访问 Codex 菜单：

```bash
osascript -e 'tell application "System Events" to tell process "Codex" to get name of menu bar items of menu bar 1'
```

成功时会返回类似：

```text
Apple, Codex, File, Edit, View, Window, Help
```

## 推荐流程

1. 先确保 Codex 桌面端打开到目标 project：

```bash
codex app /Users/camus/Work/medeo
```

2. 确认 `New Chat` 菜单项存在且可用：

```bash
osascript <<'APPLESCRIPT'
tell application "System Events"
  tell process "Codex"
    tell menu item "New Chat" of menu "File" of menu bar item "File" of menu bar 1
      return "enabled=" & (enabled as text) & ", key=" & (value of attribute "AXMenuItemCmdChar" as text)
    end tell
  end tell
end tell
APPLESCRIPT
```

3. 触发新建 chat：

```bash
osascript <<'APPLESCRIPT'
tell application "Codex" to activate
delay 0.5
tell application "System Events"
  tell process "Codex"
    click menu item "New Chat" of menu "File" of menu bar item "File" of menu bar 1
  end tell
end tell
APPLESCRIPT
```

4. 如果需要让新 chat 立即执行任务，可以在新建后继续通过 UI 输入任务文本并按回车。实践中更稳的是使用 Codex 自身的 chat-spawn/subagent 能力或 CLI `codex exec` 来启动可验证的新会话；单纯点击 `New Chat` 可能只创建 UI 空白状态，直到输入内容后才持久化到 session 文件。

## 验证方式

可以通过 session index 和 rollout 文件验证是否真的创建了新 chat，并且是否属于 medeo workspace：

```bash
tail -5 /Users/camus/.codex/session_index.jsonl
```

找到新 session id 后，再检查对应 rollout 文件中的 `session_meta.cwd`：

```bash
rg -n '"cwd"|/Users/camus/Work/medeo' /Users/camus/.codex/sessions/2026/05/26/rollout-*.jsonl
```

成功样例中，新 session 记录包含：

```json
{
  "cwd": "/Users/camus/Work/medeo",
  "originator": "Codex Desktop"
}
```

这说明新 chat 是由 Codex Desktop 创建，并绑定到了 medeo project。

## 这次踩到的边界

Computer Use 不能直接操作 Codex 自己的桌面窗口，会被插件安全策略拒绝：

```text
Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.
```

`codex exec` 可以启动一个新的非交互式 Codex 会话，但它不是桌面 UI 里的新 chat：

```bash
codex exec --ephemeral --skip-git-repo-check -s read-only --color never "请只回复：nested codex ok"
```

`codex remote-control start` 在当前机器上不可直接使用，因为缺少 standalone installer 管理的固定安装路径：

```text
managed standalone Codex install not found at /Users/camus/.codex/packages/standalone/current/codex
```

所以当前最可靠的桌面 UI 路线是：`codex app <workspace>` 打开 project，然后用 AppleScript 触发 `File -> New Chat`。
