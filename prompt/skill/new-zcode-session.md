# 启动 ZCode 新 GUI Chat Session（并可输入 prompt 开始执行）

> 用途：在不使用 CLI 的前提下，从脚本/自动化里**启动 ZCode 桌面应用的一个新的图形界面
> chat session**，并可选地**输入 prompt 文本、按回车发送、开始执行**。

## 调研结论（为什么用 AppleScript）

ZCode 桌面端是 Electron 应用（`/Applications/ZCode.app`，版本 3.1.1）。通过对
`Contents/Resources/app.asar` 反编译核实，新建会话的内部命令是桌面命令
`NewTask`（枚举值 `"newTask"`），它在主进程里这样被消费：

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
打开一个空白的新对话视图。该命令的**唯一外部触发入口**是：

- 应用菜单「文件 → 新建任务」，快捷键 **`Cmd+N`**（源码：`accelerator:"CmdOrCtrl+N"`）
- 托盘菜单「新建任务」

已排除的其他外部触发路径：

| 路径 | 结论 |
|---|---|
| `zcode://` URL scheme | ❌ 仅支持 `payment` / `oauth` / `bigmodel-auth` / `zai-auth` 四个路由，无新建会话路由（见 `handleDeepLink()`） |
| CLI 子命令 / argv | ❌ argv 仅用于注册协议，不解析新会话参数 |
| 本地 RPC 端口 | ❌ ZCode 主进程未监听用于新建会话的本地端口 |

因此**唯一可靠的 GUI 触发方式是 AppleScript 模拟菜单/快捷键**。

## 前置条件

1. **macOS**（AppleScript / System Events 仅 macOS 可用）。
2. **辅助功能（Accessibility）权限**：运行 `osascript` 的宿主（通常是「终端」/「iTerm」/「ZCode
   内嵌终端」）必须在
   `系统设置 → 隐私与安全性 → 辅助功能` 中被勾选。
   - 首次运行若报 `osascript is not allowed assistive access (-1719)`，即未授权。
   - 授权后无需重启终端，重跑即可。

## 用法

```bash
# 仅新建一个会话
bash prompt/skill/new_zcode_session.sh

# 新建会话，输入该 prompt 并按回车发送、开始执行
bash prompt/skill/new_zcode_session.sh "你的 prompt"

# 多行 prompt（用 $'...' 传入换行）
bash prompt/skill/new_zcode_session.sh $'第一行\n第二行'
```

脚本行为：

- 若 ZCode 未运行，先 `launch` 启动；
- 激活并等待 ZCode 进入前台（最多约 5 秒）；
- 发送 `Cmd+N` 触发「新建任务」，打开一个新的 GUI chat session；
- 若给了 prompt 参数：等待输入框就绪，通过剪贴板粘贴 prompt 到（已自动聚焦的）输入框，
  按回车发送、开始执行，**结束后恢复原剪贴板内容**（对用户无副作用）；
- 未在前台 / 权限缺失时以非零退出码并打印诊断信息。

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
