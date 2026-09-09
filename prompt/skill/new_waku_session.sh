#!/usr/bin/env bash
# 在 Waku 桌面应用里新建一次未开始任务，并可选地自动提交 prompt。
#
# 用法：
#   new_waku_session.sh                              # 当前目录：只准备 New Task，不发送
#   new_waku_session.sh "你的 prompt"                 # 当前目录：准备并自动提交
#   new_waku_session.sh -w /path/to/workspace         # 指定项目：只准备
#   new_waku_session.sh -w /path "你的 prompt"        # 指定项目：准备并自动提交
#   new_waku_session.sh --harness claude -w /path "你的 prompt"
#   new_waku_session.sh --dev -w /path "你的 prompt"  # Debug 包（waku-dev://）
#
# 原理：一条 launch link，不是剪贴板粘贴。
#   <scheme>://new-task?project=<abs>&harness=<id>&model=<id>&effort=<id>&prompt=<text>
#   正式包 scheme 为 waku（/Applications/Waku.app）；Debug 为 waku-dev。
#   有 prompt 时 Waku 按发送键路径自动提交；省略 prompt 不提交。
#   查询值 form-urlencoded（+ → 空格，字面 + 必须 %2B）；整段 URL ≤ 16384 字节。
#
# 不要手写未编码的 prompt 拼进 open；不要对 Waku 用 Cmd+N / 剪贴板粘贴。

set -euo pipefail

SCHEME="waku"
APP_PATH="${WAKU_APP:-/Applications/Waku.app}"
DEBUG_APP_PATH="${WAKU_DEBUG_APP:-}"
WORKSPACE="$(pwd)"
HARNESS=""
MODEL=""
EFFORT=""
PROMPT=""
USE_DEV=0

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -w|--workspace)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[waku_new_session] 缺少 workspace 参数。" >&2
        usage >&2
        exit 2
      fi
      WORKSPACE="$2"
      shift 2
      ;;
    --harness)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[waku_new_session] 缺少 harness 参数。" >&2
        exit 2
      fi
      HARNESS="$2"
      shift 2
      ;;
    --model)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[waku_new_session] 缺少 model 参数。" >&2
        exit 2
      fi
      MODEL="$2"
      shift 2
      ;;
    --effort)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[waku_new_session] 缺少 effort 参数。" >&2
        exit 2
      fi
      EFFORT="$2"
      shift 2
      ;;
    --dev)
      USE_DEV=1
      shift
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
      echo "[waku_new_session] 未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      PROMPT="$1"
      shift
      if [[ $# -gt 0 ]]; then
        echo "[waku_new_session] prompt 请作为单个参数传入；多行可用 \$'第一行\\n第二行'。" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ ! -d "$WORKSPACE" ]]; then
  echo "[waku_new_session] workspace 不存在或不是目录：$WORKSPACE" >&2
  exit 2
fi
WORKSPACE="$(cd "$WORKSPACE" && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[waku_new_session] 仅支持 macOS（launch link 由 LaunchServices 投递）。" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[waku_new_session] 未找到 python3；无法编码 launch URL。" >&2
  exit 1
fi

if [[ "$USE_DEV" -eq 1 ]]; then
  SCHEME="waku-dev"
  if [[ -z "$DEBUG_APP_PATH" ]]; then
    for candidate in \
      "$PWD/target/debug/Waku Debug.app" \
      "$HOME/Work/waku/target/debug/Waku Debug.app"
    do
      if [[ -d "$candidate" ]]; then
        DEBUG_APP_PATH="$candidate"
        break
      fi
    done
  fi
else
  if [[ ! -d "$APP_PATH" ]]; then
    echo "[waku_new_session] 未找到正式包：$APP_PATH" >&2
    echo "[waku_new_session] 在仓库根执行 ./scripts/bundle.sh release 后拷到 /Applications。" >&2
    echo "[waku_new_session] Debug 包请加 --dev（scheme 为 waku-dev://）。" >&2
    exit 1
  fi
fi

URL="$(
  WAKU_LAUNCH_PROMPT="$PROMPT" python3 - "$SCHEME" "$WORKSPACE" "$HARNESS" "$MODEL" "$EFFORT" <<'PY'
import os
import sys
from urllib.parse import quote, urlencode

scheme, workspace, harness, model, effort = sys.argv[1:6]
prompt = os.environ.get("WAKU_LAUNCH_PROMPT", "")
pairs = []
if workspace:
    pairs.append(("project", workspace))
if harness:
    pairs.append(("harness", harness))
if model:
    pairs.append(("model", model))
if effort:
    pairs.append(("effort", effort))
if prompt.strip():
    pairs.append(("prompt", prompt))
query = urlencode(pairs, quote_via=quote, safe="")
url = f"{scheme}://new-task"
if query:
    url = f"{url}?{query}"
nbytes = len(url.encode())
limit = 16384
if nbytes > limit:
    print(
        f"[waku_new_session] URL 为 {nbytes} 字节，超过 Waku 上限 {limit}。"
        " 缩短 prompt 或路径；没有文件旁路。",
        file=sys.stderr,
    )
    sys.exit(3)
print(url)
PY
)"

if ! open "$URL"; then
  echo "[waku_new_session] 无法打开 launch link。" >&2
  echo "[waku_new_session] scheme=$SCHEME url_bytes=${#URL}" >&2
  if [[ "$USE_DEV" -eq 1 ]]; then
    echo "[waku_new_session] 确认 Waku Debug 已登记 waku-dev://（dev watcher 重建过）。" >&2
  else
    echo "[waku_new_session] 确认 /Applications/Waku.app 已登记 waku://，且未被旧公证包覆盖。" >&2
  fi
  exit 1
fi

if [[ -n "$PROMPT" && -n "${PROMPT//[[:space:]]/}" ]]; then
  echo "[waku_new_session] 已打开 Waku launch link 并请求自动提交 prompt。"
else
  echo "[waku_new_session] 已打开 Waku launch link（无 prompt，不提交）。"
fi
echo "[waku_new_session] scheme: ${SCHEME}"
echo "[waku_new_session] workspace: ${WORKSPACE}"
if [[ -n "$HARNESS" ]]; then
  echo "[waku_new_session] harness: ${HARNESS}"
fi
if [[ -n "$MODEL" ]]; then
  echo "[waku_new_session] model: ${MODEL}"
fi
if [[ -n "$EFFORT" ]]; then
  echo "[waku_new_session] effort: ${EFFORT}"
fi
if [[ -n "$PROMPT" && -n "${PROMPT//[[:space:]]/}" ]]; then
  echo "[waku_new_session] prompt_bytes: ${#PROMPT}"
fi
