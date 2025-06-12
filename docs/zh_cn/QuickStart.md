# Quick Start

## @interaqt/runtime 是什么

@interaqt/runtime 是一个全新的应用框架。
为了便于理解，可以简单的当成 Web Framework + ORM/ CMS + BPM Engine 的替代品。

## 为什么创造 @interaqt/runtime

@interaqt/runtime 实现一种更简单，但也更难实现的范式：
```
data = computation(events)
```

使用这种范式，我们始终只描述系统中的数据是什么，而用谢一行操作数据的代码即可实现一个完整的应用。
直观的特点是:
- 几乎做到了将需求建模完成，软件就实现了
- 不存在人工编写的数据变化的代码，因此不存在因人产生的 bug。

更重要的特点，也是我们创造 @interaqt/runtime 的原因：
- 将需求建模后，它的代码，软件架构可以开始实现自动生成，不再依赖于人的经验。
- 需求不变，但架构可以随着数据量、并发数自动变化。

## 使用 @interaqt/runtime

### Step1: 安装

使用 npx 创建一个新的 interaqt 应用。

```bash
npx create-interaqt-app newInteraqtApp
cd newInteraqtApp
```

进入到新创建的应用目录，你讲得到如下目录结构：
```
├── app
│    └── index.ts
├── dashboard
├── data.ts
├── database.db
├── install.ts
├── package.json
├── server.ts
└── // 其他不重要的文件
```

其中 
- app 目录下是你的整个应用的定义
- dashboard 是一个可选的应用管理界面
- data.ts 是你的初始化数据
- database.db 是你的 SQLite 数据库文件
- install.ts 是初始化数据库的脚本
- server.ts 是启动应用的脚本

### Step2: 使用预定义命令初始化数据库和启动项目

package.json 中已经预定好初始化数据库和启动的命令。我们可以直接使用

```bash
npm run install  // 初始化数据库
npm start  // 启动项目
```

完成启动后，你将可以通过 `http://localhost:3000/api` 接口。
你可以通过以下命令启动 dashboard 管理界面来查看所有信息

```bash
cd dashboard
npm start
```

