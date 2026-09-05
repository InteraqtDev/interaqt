# 启动 ZCode 新 GUI Chat Session（并可输入 prompt 开始执行）

> 用途：在不使用 CLI 的前提下，从脚本/自动化里**启动 ZCode 桌面应用的一个新的图形界面
> chat session**，并可选地**切到指定 workspace**、**输入 prompt 文本、按回车发送、开始执行**。
> （上游权威版本：`~/.agents/skills/launch-local-agent-session/sessions/new-zcode-session.md`，
> 本文件是随循环任务 ensure 进仓库的副本，同步时以上游为准。）

## 调研结论（为什么用 AppleScript + 深链）

ZCode 桌面端是 Electron 应用（`/Applications/ZCode.app`，核实版本 3.1.1；workspace
深链在 3.9.1 核实可用）。新建会话的内部命令是桌面命令 `NewTask`（枚举值 `"newTask"`），
它在主进程里这样被消费：

```js
// out/main/index.js（已格式化）
async function executeDesktopCommand(e) {
  const t = getFocusedWindow();
  switch (e.command) {
    case O.NewTask:        t?.webContents.send(C.NewTask); return;   // → 渲染层开新会话
    case O.OpenWorkspace:  t?.webContents.send(C.OpenWorkspace); return;
    case O.CloseActiveContext: t?.webContents.send(C.CloseActiveContextRequest); return;
    // ...
  }
}
```

渲染层收到 IPC 通道 `C.NewTask`（值 `"zcode:new-task"`，同枚举 `NewTask:"newTask"`）后，
打开一个空白的新对话视图。该命令**不接受路径参数**，新任务落在**当前前台 workspace**。
它的外部触发入口是：

- 应用菜单「文件 → 新建任务」，快捷键 **`Cmd+N`**（源码：`accelerator:"CmdOrCtrl+N"`）
- 托盘菜单「新建任务」

已排除的其他外部触发路径：

| 路径 | 结论 |
|---|---|
| `zcode://` URL scheme | ❌ 仅支持 `payment` / `oauth` / `bigmodel-auth` / `zai-auth` / `workspace/open`（后者见下）路由，无新建会话路由（见 `handleDeepLink()`） |
| CLI 子命令 / argv | ❌ argv 仅用于注册协议，不解析新会话参数（`--open-workspace` 可切目录，但本脚本约定走深链） |
| 本地 RPC 端口 | ❌ ZCode 主进程未监听用于新建会话的本地端口 |

因此**唯一可靠的 GUI 触发方式是 AppleScript 模拟菜单/快捷键**。

## 指定 workspace（先切目录，再新建会话）

`Cmd+N` / `NewTask` 不接受路径，未指定 workspace 时新任务**继承当前前台 workspace**。
若当前前台不是目标仓库（例如侧边栏停留在其它项目），新会话会开进错误的仓库。
要保证目录正确，用 `-w` 显式指定：

- **`zcode://workspace/open?path=<urlencoded>`（3.9.1+）**：切到本地目录；会弹
  「打开外部链接工作区？」确认框（默认取消），脚本用 Accessibility 按按钮标题点击
  「打开文件夹」/「Open folder」（与界面语言无关，不要点 `button 1`——默认按钮是取消）。
- `--open-workspace <dir>` argv：也能切目录且不弹框；本脚本**不用**（约定走深链）。
- `Cmd+O` / `OpenWorkspace`：只打开系统选目录框，不能带路径。

深链只切换 workspace，随后仍须 `Cmd+N` 才新建 session；两步都由脚本完成。

## 前置条件

1. **macOS**（AppleScript / System Events 仅 macOS 可用）。
2. **辅助功能（Accessibility）权限**：运行 `osascript` 的宿主（通常是「终端」/「iTerm」/「ZCode
   内嵌终端」）必须在
   `系统设置 → 隐私与安全性 → 辅助功能` 中被勾选。
   - 首次运行若报 `osascript is not allowed assistive access (-1719)`，即未授权。
   - 授权后无需重启终端，重跑即可。

## 用法

```bash
# 当前前台 workspace：仅新建一个会话
bash prompt/skill/new_zcode_session.sh

# 当前前台 workspace：新建会话，输入该 prompt 并按回车发送、开始执行
bash prompt/skill/new_zcode_session.sh "你的 prompt"

# 指定 workspace，仅新建一个会话
bash prompt/skill/new_zcode_session.sh -w /path/to/workspace

# 指定 workspace，并发送 prompt（循环任务续启下一轮的推荐形态）
bash prompt/skill/new_zcode_session.sh -w "$(pwd)" "你的 prompt"

# 多行 prompt（用 $'...' 传入换行）
bash prompt/skill/new_zcode_session.sh -w /path/to/workspace $'第一行\n第二行'
```

脚本行为：

- 若给了 `-w` / `--workspace`：校验目录存在并转成绝对路径，然后
  `open zcode://workspace/open?path=<urlencoded>`；等待确认框并点击
  「打开文件夹」/「Open folder」，再短暂等待 workspace 切换完成；
- 若 ZCode 未运行且未指定 `-w`，先 `launch` 启动；
- 激活并等待 ZCode 进入前台（最多约 5 秒）；
- 发送 `Cmd+N` 触发「新建任务」，打开一个新的 GUI chat session；
- 若给了 prompt 参数：等待输入框就绪，通过剪贴板粘贴 prompt 到（已自动聚焦的）输入框，
  按回车发送、开始执行，**结束后恢复原剪贴板内容**（对用户无副作用）；
- 未在前台 / 权限缺失 / 确认框未出现时以非零退出码并打印诊断信息。
- **不要**把 `-w` 当成 prompt 正文传入。

## 触发方式对比（新建会话部分）

| 方式 | 命令 | 语言相关性 | 备注 |
|---|---|---|---|
| **快捷键 `Cmd+N`（推荐）** | `keystroke "n" using command down` | 无关 | 与界面语言无关，最鲁棒 |
| 菜单点击（中文界面） | `click menu item "新建任务" of menu 1 of menu bar item "文件"` | 强相关 | 仅在中文界面下可用；英文界面需用 `"New task"` / `"File"` |
| 托盘菜单点击 | 点击托盘「新建任务」 | 强相关 | 依赖托盘常驻，不推荐 |

脚本默认采用快捷键方式。如需改为菜单点击，见脚本内注释的备用分支。

## 输入 prompt 并执行（原理与坑）

新建会话后，下一步是把 prompt 文本送进输入框并触发发送。这里有几个关键约束：

1. **ZCode 的 web 内容不暴露给 macOS Accessibility**。Electron 默认不把渲染层 DOM
   导出为原生 AX 元素 —— 实测 `entire contents of window 1` 只返回 `AXGroup` 与
   窗口按钮，**没有 `AXWebArea` / `AXTextArea` / `AXTextField`**，因此无法用 AX
   精确定位输入框、读取焦点元素，也无法用 `set value of ...` 直接写值。

2. **靠「新建任务后输入框自动聚焦」+ 系统级键盘事件**。`文件 → 新建任务` 后输入框
   会获得键盘焦点，于是用 System Events 的 `keystroke` 即可向当前焦点控件输入。

3. **中文必须走剪贴板粘贴，不能直接 `keystroke`**。`keystroke` 只发键码，会被激活的
   中文输入法拦截，非 ASCII 字符无法正确输入（实测直接 `keystroke "请只回复…"`
   会导致输入框收到错误内容）。统一做法：

   ```applescript
   set the clipboard to <prompt>          -- 写入剪贴板
   keystroke "v" using command down       -- Cmd+V 粘贴
   keystroke return                       -- 回车发送
   ```

   剪贴板内容在粘贴前后会被保存/恢复，对用户无副作用（已验证 round-trip）。

4. **粘贴不触发发送、Enter 才发送**。多行 prompt（含换行）粘贴进去不会提前发送，
   最后按一次 `return` 才整体提交 —— 因此多行 prompt 安全。

5. **prompt 经临时 `.scpt` 文件传入**，并用 python 对 `"` / `\` 做转义后拼成
   AppleScript 字符串字面量，避免命令行参数里特殊字符/引号转义问题。

## 实现注意事项

- **AppleScript 经临时文件传入 `osascript`，而非 heredoc**：bash 的 `$(...)`
  命令替换内嵌 heredoc 时，若 AppleScript 正文/注释里出现未配对的右括号
  （如 `1)`、`步骤 2)`），会被命令替换解析器误判为替换提前结束，导致
  heredoc 内容被当成 shell 命令执行（报 `xxx: command not found`）。临时文件
  可彻底规避。改写时若要恢复 heredoc，务必避免在 `$(...)` 内出现裸 `)`。
- **进程检测用 `System Events` 的 `exists process`**，不用 `application "X" is
  running`（该写法在某些 `tell` 上下文会报 -1728），也不用 `pgrep`（沙箱环境下
  进程可见性不稳定）。
- **`-w` 走深链，不走 `--open-workspace`**。`zcode://workspace/open` 每次都会弹
  原生确认框；脚本按按钮标题点击（中文「打开文件夹」/ 英文「Open folder」），
  与界面语言无关的 fallback 不要点 `button 1`（默认按钮是取消）。
- **path 必须 URL-encode**（与 Finder「在 ZCode 中打开」相同，`encodeURIComponent` /
  `urllib.parse.quote(..., safe="")`）。目录必须已存在，网络/UNC 路径会被主进程拒绝。

## 验证记录（2026-06-17）

- 菜单项 `enabled = true`，点击返回对象引用、无错误；
- `Cmd+N` 快捷键触发后 ZCode 保持响应、窗口数正常；
- 脚本 `new_zcode_session.sh` 连续运行均返回 exit=0 并成功触发新会话；
- **带 prompt 端到端验证**（每次均新增一条 `tasks` 表记录，状态 `running`/`completed`）：
  - 无参数：仅新建会话，`tasks` 数不变（符合「首条消息后才落库」）；
  - 中文 prompt `"用一句话说明你是谁"` → 新 task 标题为该 prompt，正确发送执行；
  - 多行 prompt `$'第一行：你好\n第二行：请简短回复'` → 整体发送成功，标题内换行显示为空格；
  - 剪贴板恢复：脚本运行前后剪贴板内容保持不变。
- DB 层面 `tasks` 表在「仅新建会话」时不会立即新增记录 —— 属预期：新会话为空白视图，
  **首条消息发出后**才落库为一条 task。

## 指定 workspace（2026-08-25 上游核实，ZCode 3.9.1）

- `-w` 使用 `zcode://workspace/open?path=`，不是 `--open-workspace`，也不是 `Cmd+O`。
- 深链只切换 workspace，随后仍须 `Cmd+N` 才新建 session。
- 未传 `-w` 时行为与旧脚本相同：不切目录，新任务落在当前前台 workspace。

## 2026-09-05 同步记录

上游（`~/.agents/skills/launch-local-agent-session/sessions/`）新增 `-w` 后，仓库副本
仍是无 workspace 参数的旧版。一次循环任务调度依赖「前台恰好是目标仓库」才把审计轮
会话开对了目录 —— 这属于巧合性成立而非机制保证。本次将仓库脚本与文档同步到上游
版本（脚本逐字节取自上游；文档按仓库上下节选自上游并保留原验证记录）。
