#!/usr/bin/env bash
# 在 Cursor Agents Window 中新建一个独立的 GUI Agent session，并可选地输入 prompt 开始执行。
#
# 用法：
#   new_cursor_agent_session.sh                         # 在当前目录 workspace 下仅新建一个 Agent
#   new_cursor_agent_session.sh "你的 prompt"            # 新建 Agent，输入该 prompt 并按回车发送、开始执行
#   new_cursor_agent_session.sh -w /path/to/workspace    # 指定 workspace，仅新建一个 Agent
#   new_cursor_agent_session.sh -w /path "你的 prompt"   # 指定 workspace，并发送 prompt
#
# 原理：
#   1) 确认 Cursor Agents Window（glass）已在运行并置于前台。
#   2) 执行 `cursor <workspace>`（不要加 -r/-n）：当已有 glass 窗口时，Cursor 主进程会
#      向其发送 vscode:createNewComposer → glass.newAgent，从而新建独立 Agent session。
#   3) 若提供 prompt，则通过剪贴板粘贴到新 Agent 自动聚焦的输入框，再按 Enter 发送。
#
# 前置：
#   1) Cursor Desktop 已打开 Agents Window（窗口标题一般为 “Cursor Agents”）。
#   2) 已安装 Cursor CLI，且 `cursor` 命令可用。
#   3) 运行 osascript 的宿主需在
#      系统设置 → 隐私与安全性 → 辅助功能 中被授权。
#   首次运行报 -1719 即未授权。
#
# 实现说明：AppleScript 经临时文件传入 osascript，而非 heredoc。
# 原因：bash 的 $(...) 命令替换内嵌 heredoc 时，若 AppleScript 注释/正文里
# 出现未配对的右括号（如「1)」「步骤 2)」），会被命令替换解析器误判为替换结束，
# 导致 heredoc 内容被当成 shell 命令执行。临时文件可彻底规避该问题。

set -euo pipefail

WORKSPACE="$(pwd)"
PROMPT=""

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -w|--workspace)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[cursor_agent_session] 缺少 workspace 参数。" >&2
        usage >&2
        exit 2
      fi
      WORKSPACE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      PROMPT="${*:-}"
      break
      ;;
    -*)
      echo "[cursor_agent_session] 未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      PROMPT="$1"
      shift
      if [[ $# -gt 0 ]]; then
        echo "[cursor_agent_session] prompt 请作为单个参数传入；多行可用 $'第一行\\n第二行'。" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ ! -d "$WORKSPACE" ]]; then
  echo "[cursor_agent_session] workspace 不存在或不是目录：$WORKSPACE" >&2
  exit 2
fi
WORKSPACE="$(cd "$WORKSPACE" && pwd)"

if ! command -v cursor >/dev/null 2>&1; then
  echo "[cursor_agent_session] 未找到 cursor 命令。" >&2
  echo "[cursor_agent_session] 提示：确认 Cursor.app 已安装，且 cursor CLI 在 PATH 中。" >&2
  exit 1
fi

run_applescript() {
  # run_applescript <script_text>  -> prints result, returns osascript exit code
  local scpt="$1"
  local tmp
  tmp="$(mktemp -t cursor_new_agent.XXXXXX).scpt"
  printf '%s\n' "$scpt" > "$tmp"
  osascript "$tmp" 2>&1
  local rc=$?
  rm -f "$tmp"
  return $rc
}

# --- 第 1 段：激活已有 Cursor Agents（glass）窗口 ---
read -r -d '' ACTIVATE_SCPT <<'APPLESCRIPT_EOF' || true
on isFront()
	tell application "System Events"
		return (name of first application process whose frontmost is true) is "Cursor"
	end tell
end isFront

on isRunning()
	tell application "System Events"
		return exists process "Cursor"
	end tell
end isRunning

on windowCount()
	tell application "System Events"
		tell process "Cursor"
			return count of windows
		end tell
	end tell
end windowCount

on windowNames()
	tell application "System Events"
		tell process "Cursor"
			return name of windows
		end tell
	end tell
end windowNames

if not isRunning() then error "Cursor is not running; open Agents Window first, then retry"

tell application "Cursor" to activate
set frontOK to false
repeat 40 times
	if isFront() then
		set frontOK to true
		exit repeat
	end if
	delay 0.2
end repeat
if not frontOK then error "Cursor did not come to front"

set windowOK to false
repeat 50 times
	if windowCount() > 0 then
		set windowOK to true
		exit repeat
	end if
	delay 0.2
end repeat
if not windowOK then error "Cursor did not open a window"

-- 记录窗口名，便于诊断是否在 Agents Window（glass）。
set namesText to ""
try
	set namesText to (windowNames() as text)
end try
return "ok|" & namesText
APPLESCRIPT_EOF

if ! RESULT=$(run_applescript "$ACTIVATE_SCPT"); then
  echo "[cursor_agent_session] 激活 Cursor 失败：${RESULT}" >&2
  echo "[cursor_agent_session] 提示：确认已授予运行 osascript 的终端「辅助功能」权限。" >&2
  exit 1
fi

# 2) 通过 CLI 打开目录 → 已有 glass 窗口时路由为 createNewComposer / glass.newAgent。
#    关键：不要加 -r/--reuse-window 或 -n/--new-window，否则会走经典编辑器路径，
#    不会触发「新建独立 Agent session」。
if ! CURSOR_OPEN_OUTPUT=$(cursor "$WORKSPACE" 2>&1); then
  echo "[cursor_agent_session] 通过 cursor CLI 新建 Agent 失败：${CURSOR_OPEN_OUTPUT}" >&2
  exit 1
fi

# 给 glass.newAgent 一点时间切换到新 session 并聚焦输入框。
sleep 1.8

# 3) 若无 prompt 参数，到此结束。
if [[ -z "$PROMPT" ]]; then
  echo "[cursor_agent_session] 已通过 cursor CLI 在 Agents Window 中新建独立 Agent session。"
  echo "[cursor_agent_session] workspace: ${WORKSPACE}"
  echo "[cursor_agent_session] activate: ${RESULT}"
  exit 0
fi

# 4) 有 prompt：通过剪贴板粘贴 + 回车发送。
#    不要点击窗口底部——那会把焦点打回当前可见的旧 session。
#    依赖 glass.newAgent 后新 session 输入框自动聚焦。
PROMPT_SCPT_FILE="$(mktemp -t cursor_agent_prompt.XXXXXX).scpt"
trap 'rm -f "$PROMPT_SCPT_FILE"' EXIT

# 用 python 把 prompt 安全写进 AppleScript 字符串字面量（处理引号、反斜杠、换行）。
ESCAPED_PROMPT="$(python3 -c 'import sys; s=sys.stdin.read(); print("\"" + s.replace("\\","\\\\").replace("\"","\\\"") + "\"")' <<<"$PROMPT")"

cat > "$PROMPT_SCPT_FILE" <<APPLESCRIPT_EOF
on isFront()
	tell application "System Events"
		return (name of first application process whose frontmost is true) is "Cursor"
	end tell
end isFront

-- 确保仍在 Cursor 前台
if not isFront() then
	tell application "Cursor" to activate
	delay 0.4
end if

-- 依赖 glass.newAgent 后新 session 输入框自动聚焦；不要再点旧窗口底部。
delay 0.4
set oldClip to the clipboard

set the clipboard to ${ESCAPED_PROMPT}
delay 0.3
tell application "System Events"
	keystroke "v" using command down
end tell
delay 0.6

tell application "System Events"
	keystroke return
end tell

set the clipboard to oldClip
return "sent"
APPLESCRIPT_EOF

if ! RESULT=$(osascript "$PROMPT_SCPT_FILE" 2>&1); then
  echo "[cursor_agent_session] 已新建独立 Agent，但发送 prompt 失败：${RESULT}" >&2
  echo "[cursor_agent_session] 提示：若剪贴板被占用，可重试；确认 Cursor 仍在前台。" >&2
  exit 1
fi

echo "[cursor_agent_session] 已在 Agents Window 中新建独立 Agent session 并发送 prompt 开始执行。"
echo "[cursor_agent_session] workspace: ${WORKSPACE}"
echo "[cursor_agent_session] prompt: ${PROMPT}"
