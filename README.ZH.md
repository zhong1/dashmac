# DashMac

一款免费开源的 Mac 系统监控工具。通过 Grafana 风格的深色仪表盘界面，深度分析磁盘使用、内存占用和网络活动。

[English](README.md)

## 功能特性

- **仪表盘概览** — 内存、磁盘、网络的实时摘要卡片
- **内存分析** — 使用统计、内存压力指示、进程排行、实时曲线和历史趋势图
- **磁盘分析** — 卷宗概览、I/O 速度图表、文件大小树图（类似 DaisyDisk）、Top 50 大文件
- **网络分析** — 网络接口信息、上传/下载速度图表、按应用统计流量、活跃连接列表
- **菜单栏托盘** — 紧凑的弹出面板，随时查看关键指标
- **设置** — 可配置采集间隔、历史保留天数、数据导出（CSV/JSON）
- **历史数据** — SQLite 存储，自动降采样，最长保留 90 天

## 系统要求

- macOS 13 (Ventura) 或更高版本
- Node.js 20+
- npm 10+

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 41 |
| 前端 | React 19 + TypeScript |
| 构建 | electron-vite + Vite |
| 样式 | TailwindCSS 4 |
| 图表 | Recharts |
| 树图 | d3-hierarchy |
| 系统数据 | systeminformation |
| 数据库 | better-sqlite3 (SQLite) |
| 状态管理 | Zustand |
| 打包 | electron-builder |

## 快速开始

### 克隆并安装

```bash
git clone <repo-url> DashMac
cd DashMac
npm install
```

### 开发调试

启动开发服务器（支持热重载）：

```bash
npm run dev
```

运行后会打开 Electron 窗口和菜单栏托盘图标。`src/` 下的代码修改会即时热重载；`electron/` 下的修改会触发自动重启。

#### 调试技巧

**打开开发者工具：**

在应用窗口中按 `Cmd + Option + I` 打开 Chrome DevTools，可以：
- 在 Console 中查看日志输出
- 在 Network 面板查看 IPC 通信
- 在 Elements 面板检查 UI 元素

**调试主进程：**

```bash
# 方法 1：electron-vite 自带调试模式
npm run dev

# 在 Chrome 中打开 chrome://inspect，点击 inspect 连接到主进程
```

也可以在 VS Code 中调试，创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-vite",
      "args": ["dev"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"]
    }
  ]
}
```

**调试渲染进程：**

渲染进程就是标准的 React 应用，直接使用 Chrome DevTools 即可。推荐安装 React Developer Tools 浏览器扩展。

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式（文件修改后自动重跑）
npm run test:watch
```

### 构建（仅编译，不打包）

```bash
npm run build
```

输出到 `out/` 目录（main、preload、renderer 三个模块）。

## 打包分发

### 生成 .dmg 安装包

```bash
npm run dist:dmg
```

输出文件：`dist/DashMac-<版本号>-universal.dmg`

打开 DMG 后，左边是应用图标，右边是 Applications 文件夹快捷方式 — 拖拽即可安装。

### 其他打包命令

```bash
# 生成未打包的 .app 目录（速度快，用于测试）
npm run pack

# 构建所有配置的目标格式
npm run dist
```

### 原生模块

`better-sqlite3` 包含 C++ 原生代码，需要针对 Electron 的 Node.js 版本编译。如果遇到原生模块加载错误：

```bash
npx @electron/rebuild
```

### 代码签名（可选）

如果要分发给其他人使用，Apple 要求进行代码签名和公证。在运行 `npm run dist` 之前设置以下环境变量：

```bash
export CSC_LINK="path/to/Developer_ID_Application.p12"
export CSC_KEY_PASSWORD="你的证书密码"
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="应用专用密码"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

如果没有代码签名，macOS 的 Gatekeeper 会阻止打开应用。收到的人可以通过 **系统设置 > 隐私与安全性 > 仍要打开** 来绕过，但正式分发建议签名。

**没有开发者账号的临时方案：**

收到未签名的 .dmg 后，安装应用，然后在终端执行：

```bash
xattr -cr /Applications/DashMac.app
```

这会移除隔离属性，允许应用正常运行。

## 项目结构

```
DashMac/
├── electron/                # 主进程（Node.js）
│   ├── main.ts             # 入口，窗口/托盘管理，IPC 处理
│   ├── preload.ts          # IPC 桥接（contextBridge）
│   ├── collectors/          # 系统数据采集器
│   │   ├── memory.ts       # 内存数据
│   │   ├── disk.ts         # 磁盘卷宗 + I/O
│   │   ├── network.ts      # 网络接口 + 连接
│   │   └── process.ts      # 进程列表（按内存排序）
│   ├── database/            # SQLite 持久化
│   │   ├── schema.ts       # 表定义
│   │   ├── queries.ts      # 增删改查函数
│   │   └── index.ts        # 数据库连接单例
│   └── services/            # 业务逻辑
│       ├── scheduler.ts    # 双层采集定时器（2秒实时，60秒持久化）
│       ├── aggregator.ts   # 旧数据降采样为小时级平均
│       └── exporter.ts     # CSV/JSON 导出
├── src/                     # 渲染进程（React）
│   ├── App.tsx             # 根组件，页面路由
│   ├── types.ts            # 共享 TypeScript 类型
│   ├── components/
│   │   ├── dashboard/      # 概览页
│   │   ├── memory/         # 内存分析页
│   │   ├── disk/           # 磁盘分析 + 树图
│   │   ├── network/        # 网络分析页
│   │   ├── settings/       # 设置页
│   │   ├── tray/           # 菜单栏弹出面板
│   │   ├── charts/         # 共享图表组件
│   │   └── layout/         # 侧边栏 + 顶栏
│   ├── hooks/              # useRealtimeData, useHistoryQuery
│   ├── stores/             # Zustand 状态管理
│   └── styles/             # Tailwind 主题（globals.css）
├── tests/                   # Vitest 测试
├── resources/               # 应用图标
└── package.json
```

## 数据架构

- **实时层**：每 2 秒采集一次，通过 IPC 推送到 UI，不写入数据库
- **持久层**：每 60 秒采集一次，聚合后写入 SQLite
- **保留策略**：原始数据保留 7 天，之后自动降采样为小时级；90 天后删除
- **数据库位置**：`~/Library/Application Support/dashmac/dashmac-data.db`

## 常见问题

### 打包后应用无法启动

检查原生模块是否正确编译：

```bash
npx @electron/rebuild
npm run dist:dmg
```

### 菜单栏图标不显示

确保 `resources/trayTemplate.png` 存在。macOS 要求托盘图标使用 Template Image 格式（文件名包含 `Template`），这样系统会自动适配浅色/深色模式。

### 数据库文件在哪里

```bash
ls ~/Library/Application\ Support/dashmac/
```

如需重置数据，删除 `dashmac-data.db` 文件即可。

## 许可证

MIT
