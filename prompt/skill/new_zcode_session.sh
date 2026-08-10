#!/usr/bin/env bash
# 启动 ZCode 桌面应用的一个新的 GUI chat session，并可选地输入 prompt 并开始执行。
#
# 用法：
#   new_zcode_session.sh                 # 仅新建一个会话
#   new_zcode_session.sh "你的 prompt"    # 新建会话，输入该 prompt 并按回车发送、开始执行
#
# 原理：
#   1) 新建会话 —— ZCode 的「新建任务」对应桌面命令 NewTask，仅能通过应用菜单
#      「文件 → 新建任务」(快捷键 Cmd+N) 或托盘菜单触发。脚本用 AppleScript 模拟
#      Cmd+N（语言无关、最鲁棒）。
#   2) 输入并执行 prompt —— ZCode 是 Electron 应用，其 web 内容默认不暴露给
#      macOS Accessibility（无 AXTextArea/AXWebArea），无法用 AX 精确定位输入框。
#      但「文件 → 新建任务」后输入框会自动获得键盘焦点，因此可用系统级键盘事件
#      输入文本并回车发送。中文/多行文本用剪贴板粘贴（keystroke 不支持直接输入
#      非 ASCII，且会被中文输入法拦截），粘贴不会触发发送、Enter 才发送。
#
# 前置：运行 osascript 的宿主需在
#   系统设置 → 隐私与安全性 → 辅助功能 中被授权。
# 首次运行报 -1719 即未授权。
#
# 实现说明：AppleScript 经临时文件传入 osascript，而非 heredoc。
# 原因：bash 的 $(...) 命令替换内嵌 heredoc 时，若 AppleScript 注释/正文里
# 出现未配对的右括号（如「1)」「步骤 2)」），会被命令替换解析器误判为替换结束，
# 导致 heredoc 内容被当成 shell 命令执行。临时文件可彻底规避该问题。

set -euo pipefail

APP_NAME="ZCode"
PROMPT="${1:-}"

# 备用触发（仅当快捷键在某版本失效时启用，且依赖界面语言）：
#   中文界面：click menu item "新建任务" of menu 1 of menu bar item "文件" of menu bar 1
#   英文界面：click menu item "New task" of menu 1 of menu bar item "File" of menu bar 1

# --- 第 1 段 AppleScript：启动/激活 + 新建会话 ---
read -r -d '' NEW_SESSION_SCPT <<'APPLESCRIPT_EOF' || true
on isFront()
	tell application "System Events"
		return (name of first application process whose frontmost is true) is "ZCode"
	end tell
end isFront

on isRunning()
	tell application "System Events"
		return exists process "ZCode"
	end tell
end isRunning

-- 若未运行则先启动
if not isRunning() then
	tell application "ZCode" to launch
	repeat 50 times
		if isRunning() then exit repeat
		delay 0.2
	end repeat
end if

-- 激活并等待进入前台，最多约 5 秒
tell application "ZCode" to activate
set ok to false
repeat 25 times
	if isFront() then
		set ok to true
		exit repeat
	end if
	delay 0.2
end repeat
if not ok then error "ZCode did not come to front"

-- 触发「新建任务」: Cmd+N -> 桌面命令 NewTask -> IPC new-task -> 渲染层开新会话
tell application "System Events"
	keystroke "n" using command down
end tell
return "ok"
APPLESCRIPT_EOF

run_applescript() {
  # run_applescript <script_text>  -> prints result, returns osascript exit code
  local scpt="$1"
  local tmp
  tmp="$(mktemp -t zcode_new_session.XXXXXX).scpt"
  printf '%s\n' "$scpt" > "$tmp"
  osascript "$tmp" 2>&1
  local rc=$?
  rm -f "$tmp"
  return $rc
}

# 1) 新建会话
if ! RESULT=$(run_applescript "$NEW_SESSION_SCPT"); then
  echo "[new_session] 新建会话失败：${RESULT}" >&2
  echo "[new_session] 提示：确认已授予运行 osascript 的终端「辅助功能」权限。" >&2
  exit 1
fi

# 2) 若无 prompt 参数，到此结束
if [[ -z "$PROMPT" ]]; then
  echo "[new_session] 已新建 GUI chat session（Cmd+N -> NewTask）。"
  echo "[new_session] 注：新会话为空白视图，发出首条消息后才会在 tasks 表落库。"
  exit 0
fi

# 3) 有 prompt：等待输入框就绪，通过剪贴板粘贴 + 回车发送。
#    剪贴板内容会被恢复，对用户无副作用。
#    用临时 .scpt 文件传 prompt（避免命令行参数里特殊字符/引号转义问题）。
PROMPT_SCPT_FILE="$(mktemp -t zcode_prompt.XXXXXX).scpt"
trap 'rm -f "$PROMPT_SCPT_FILE"' EXIT

# 用 python 把 prompt 安全写进 AppleScript 字符串字面量（处理引号、反斜杠、换行）。
# AppleScript 字符串用双引号，转义 " 为 \" 、\ 为 \\。
ESCAPED_PROMPT="$(python3 -c 'import sys; s=sys.stdin.read(); print("\"" + s.replace("\\","\\\\").replace("\"","\\\"") + "\"")' <<<"$PROMPT")"

cat > "$PROMPT_SCPT_FILE" <<APPLESCRIPT_EOF
on isFront()
	tell application "System Events"
		return (name of first application process whose frontmost is true) is "ZCode"
	end tell
end isFront

-- 确保仍在 ZCode 前台
if not isFront() then
	tell application "ZCode" to activate
	delay 0.4
end if

-- 保存原剪贴板
set oldClip to the clipboard

-- 设置 prompt 到剪贴板并粘贴到（已聚焦的）输入框
set the clipboard to ${ESCAPED_PROMPT}
delay 0.3
tell application "System Events"
	keystroke "v" using command down
end tell
delay 0.6

-- 回车发送：Enter 在 ZCode 输入框默认为发送
tell application "System Events"
	keystroke return
end tell

-- 恢复原剪贴板
set the clipboard to oldClip
return "sent"
APPLESCRIPT_EOF

if ! RESULT=$(osascript "$PROMPT_SCPT_FILE" 2>&1); then
  echo "[new_session] 已新建会话，但发送 prompt 失败：${RESULT}" >&2
  echo "[new_session] 提示：若剪贴板被占用，可重试；确认 ZCode 仍在前台。" >&2
  exit 1
fi

echo "[new_session] 已新建 GUI chat session 并发送 prompt 开始执行。"
echo "[new_session] prompt: ${PROMPT}"
echo "[new_session] 注：首条消息发出后，新会话即在 tasks 表落库为一条 task。"
