#!/usr/bin/env bash
# 启动 ZCode 桌面应用的一个新的 GUI chat session，并可选地输入 prompt 并开始执行。
#
# 用法：
#   new_zcode_session.sh                              # 当前前台 workspace：仅新建一个会话
#   new_zcode_session.sh "你的 prompt"                 # 当前前台 workspace：新建并发送 prompt
#   new_zcode_session.sh -w /path/to/workspace         # 先切到该 workspace，再新建会话
#   new_zcode_session.sh -w /path "你的 prompt"        # 先切 workspace，再新建并发送 prompt
#
# 原理：
#   0) 指定 workspace —— 走 zcode://workspace/open?path= 深链（3.9.1+）。
#      该路由会弹出「打开外部链接工作区？」确认框（默认取消）。脚本用 Accessibility
#      点击「打开文件夹」/「Open folder」。不要改用 --open-workspace：本脚本约定走深链。
#   1) 新建会话 —— 「文件 → 新建任务」对应桌面命令 NewTask，快捷键 Cmd+N。
#      NewTask 不接受路径，新任务落在当前前台 workspace。
#   2) 输入并执行 prompt —— ZCode 渲染层不暴露 AX 文本框；新建任务后输入框自动聚焦，
#      中文/多行走剪贴板粘贴，Enter 才发送。
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
WORKSPACE=""
PROMPT=""

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -w|--workspace)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[new_session] 缺少 workspace 参数。" >&2
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
      echo "[new_session] 未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      PROMPT="$1"
      shift
      if [[ $# -gt 0 ]]; then
        echo "[new_session] prompt 请作为单个参数传入；多行可用 \$'第一行\\n第二行'。" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -n "$WORKSPACE" ]]; then
  if [[ ! -d "$WORKSPACE" ]]; then
    echo "[new_session] workspace 不存在或不是目录：$WORKSPACE" >&2
    exit 2
  fi
  WORKSPACE="$(cd "$WORKSPACE" && pwd)"
fi

# 备用触发（仅当快捷键在某版本失效时启用，且依赖界面语言）：
#   中文界面：click menu item "新建任务" of menu 1 of menu bar item "文件" of menu bar 1
#   英文界面：click menu item "New task" of menu 1 of menu bar item "File" of menu bar 1

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

# --- 指定 workspace：zcode://workspace/open?path= + 点击确认框 ---
if [[ -n "$WORKSPACE" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "[new_session] 未找到 python3；无法编码 workspace 深链。" >&2
    exit 1
  fi
  ENCODED_PATH="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$WORKSPACE")"
  DEEP_LINK="zcode://workspace/open?path=${ENCODED_PATH}"
  if ! open "$DEEP_LINK"; then
    echo "[new_session] 无法打开 workspace 深链：$DEEP_LINK" >&2
    exit 1
  fi

  read -r -d '' OPEN_WORKSPACE_SCPT <<'APPLESCRIPT_EOF' || true
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

on clickOpenFolder()
	tell application "System Events"
		tell process "ZCode"
			set buttonNames to {"打开文件夹", "Open folder"}
			repeat with w in windows
				repeat with nm in buttonNames
					try
						if exists button nm of w then
							click button nm of w
							return true
						end if
					end try
					try
						if exists sheet 1 of w then
							if exists button nm of sheet 1 of w then
								click button nm of sheet 1 of w
								return true
							end if
						end if
					end try
				end repeat
			end repeat
		end tell
	end tell
	return false
end clickOpenFolder

repeat 50 times
	if isRunning() then exit repeat
	delay 0.2
end repeat
if not isRunning() then error "ZCode did not start from workspace deep link"

tell application "ZCode" to activate
set ok to false
repeat 40 times
	if isFront() then
		set ok to true
		exit repeat
	end if
	delay 0.2
end repeat
if not ok then error "ZCode did not come to front"

repeat 100 times
	if isFront() is false then
		tell application "ZCode" to activate
	end if
	if clickOpenFolder() then
		delay 1.5
		return "ok"
	end if
	delay 0.2
end repeat
error "workspace confirmation dialog not found"
APPLESCRIPT_EOF

  if ! RESULT=$(run_applescript "$OPEN_WORKSPACE_SCPT"); then
    echo "[new_session] 切换 workspace 失败：${RESULT}" >&2
    echo "[new_session] 提示：深链会弹出确认框；确认已授予「辅助功能」权限，或手动点「打开文件夹」。" >&2
    echo "[new_session] workspace: ${WORKSPACE}" >&2
    exit 1
  fi
fi

# --- 启动/激活 + 新建会话 ---
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

if ! RESULT=$(run_applescript "$NEW_SESSION_SCPT"); then
  echo "[new_session] 新建会话失败：${RESULT}" >&2
  echo "[new_session] 提示：确认已授予运行 osascript 的终端「辅助功能」权限。" >&2
  exit 1
fi

# 若无 prompt 参数，到此结束
if [[ -z "$PROMPT" ]]; then
  echo "[new_session] 已新建 GUI chat session（Cmd+N -> NewTask）。"
  if [[ -n "$WORKSPACE" ]]; then
    echo "[new_session] workspace: ${WORKSPACE}"
  fi
  echo "[new_session] 注：新会话为空白视图，发出首条消息后才会在 tasks 表落库。"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[new_session] 未找到 python3；无法安全传递多行 prompt。" >&2
  exit 1
fi

# 有 prompt：等待输入框就绪，通过剪贴板粘贴 + 回车发送。
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
if [[ -n "$WORKSPACE" ]]; then
  echo "[new_session] workspace: ${WORKSPACE}"
fi
echo "[new_session] prompt: ${PROMPT}"
echo "[new_session] 注：首条消息发出后，新会话即在 tasks 表落库为一条 task。"
