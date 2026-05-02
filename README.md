# DashMac

A free, open-source Mac system monitoring application. Provides deep analysis of disk usage, memory consumption, and network activity through a Grafana-style dark dashboard UI.

[中文文档](README.ZH.md)

## Features

- **Dashboard Overview** — real-time summary cards for memory, disk, and network
- **Memory Analysis** — usage stats, pressure gauge, process ranking, real-time & history charts
- **Disk Analysis** — volume overview, I/O speed charts, file size treemap (DaisyDisk-style), top 50 largest files
- **Network Analysis** — interface info, upload/download speed charts, per-app traffic, active connections
- **Menu Bar Tray** — compact popup panel with key metrics, always accessible
- **Settings** — configurable collection intervals, history retention, data export (CSV/JSON)
- **History Data** — SQLite-backed, auto down-sampled, up to 90 days retention

## Screenshots

> Coming soon

## Requirements

- macOS 13 (Ventura) or later
- Node.js 20+
- npm 10+

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 41 |
| Frontend | React 19 + TypeScript |
| Build | electron-vite + Vite |
| Styling | TailwindCSS 4 |
| Charts | Recharts |
| Treemap | d3-hierarchy |
| System Data | systeminformation |
| Database | better-sqlite3 (SQLite) |
| State | Zustand |
| Packaging | electron-builder |

## Getting Started

### Clone and Install

```bash
git clone <repo-url> DashMac
cd DashMac
npm install
```

### Development

Start the dev server with hot-reload:

```bash
npm run dev
```

This opens the Electron window and a tray icon. Code changes in `src/` hot-reload instantly; changes in `electron/` trigger a restart.

#### Debugging the Toolbox → Screenshot tool

1. **Grant Screen Recording permission to the dev Electron binary.** The first capture will silently fail (or surface a dialog) because macOS gates screen capture per-binary. Open `System Settings → Privacy & Security → Screen Recording`, enable the entry for `Electron` (path: `node_modules/electron/dist/Electron.app`), then **fully quit** Electron and run `npm run dev` again. You'll need to re-grant after each `electron` version bump.

2. **Trigger capture two ways:**
   - **Card**: sidebar → Toolbox → click the Screenshot card. Source is `'card'`; on success, a toast pushes via IPC `toast:push` to the main window.
   - **Global hotkey**: configure under `Settings → Screenshot`. Source is `'hotkey'`; on success, a native macOS Notification appears (the main window may not be visible).

3. **Logs:**
   - Main process (`electron/services/screenshot/*`): `console.log` / `console.error` print to the terminal running `npm run dev`. Look for `[screenshot]` prefixes.
   - Main window renderer: `Cmd + Option + I` opens DevTools.
   - **Overlay window**: it's `frame: false` + `alwaysOnTop: 'screen-saver'`, so the menu bar shortcut won't reach it. Temporarily add `win.webContents.openDevTools({ mode: 'detach' })` inside `OverlayManager.createWindow` (`electron/services/screenshot/overlayManager.ts`) — detached mode floats above the overlay so you can inspect React state for `OverlayApp` / `SelectionLayer` / `Magnifier` / `Toolbar`.

4. **Workflow tips:**
   - The overlay covers the whole display — press `ESC` to dismiss before switching back to your editor.
   - Saving a file under `electron/` restarts the main process and clears any in-flight capture state; re-trigger from scratch.
   - Renderer-only edits (overlay UI, toolbar, magnifier) hot-reload without re-triggering capture, but you'll need to re-open the overlay to see the new render.

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Build (production bundle, no packaging)

```bash
npm run build
```

Output goes to `out/` (main, preload, renderer).

## Packaging

### Generate .dmg installer

```bash
npm run dist:dmg
```

Output: `dist/DashMac-<version>-universal.dmg`

The DMG opens with the app icon on the left and an Applications folder shortcut on the right — drag to install.

### Other packaging commands

```bash
# Build unpacked .app directory (fast, for testing)
npm run pack

# Build all configured targets
npm run dist
```

### Native Modules

`better-sqlite3` contains native C++ code that must be compiled for Electron's Node.js version. If you encounter native module errors:

```bash
npx @electron/rebuild
```

### Code Signing (optional)

For distribution outside your own machine, Apple requires code signing and notarization. Set these environment variables before running `npm run dist`:

```bash
export CSC_LINK="path/to/Developer_ID_Application.p12"
export CSC_KEY_PASSWORD="your-certificate-password"
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Without code signing, macOS Gatekeeper will block the app. Recipients can bypass this via System Settings > Privacy & Security > Open Anyway, but signing is recommended for real distribution.

## Project Structure

```
DashMac/
├── electron/                # Main process (Node.js)
│   ├── main.ts             # Entry point, window/tray management, IPC handlers
│   ├── preload.ts          # IPC bridge (contextBridge)
│   ├── collectors/          # System data collectors
│   │   ├── memory.ts       # Memory stats via systeminformation
│   │   ├── disk.ts         # Disk volumes + I/O
│   │   ├── network.ts      # Network interfaces + connections
│   │   └── process.ts      # Process list sorted by memory
│   ├── database/            # SQLite persistence
│   │   ├── schema.ts       # Table definitions
│   │   ├── queries.ts      # Insert/query/cleanup functions
│   │   └── index.ts        # DB connection singleton
│   └── services/            # Business logic
│       ├── scheduler.ts    # Two-tier collection timer (2s realtime, 60s persist)
│       ├── aggregator.ts   # Down-sample old data to hourly averages
│       └── exporter.ts     # CSV/JSON export
├── src/                     # Renderer process (React)
│   ├── App.tsx             # Root component with routing
│   ├── types.ts            # Shared TypeScript types
│   ├── components/
│   │   ├── dashboard/      # Overview page
│   │   ├── memory/         # Memory analysis page
│   │   ├── disk/           # Disk analysis + treemap
│   │   ├── network/        # Network analysis page
│   │   ├── settings/       # Settings page
│   │   ├── tray/           # Menu bar popup panel
│   │   ├── charts/         # Shared RealtimeChart + HistoryChart
│   │   └── layout/         # Sidebar + Header
│   ├── hooks/              # useRealtimeData, useHistoryQuery
│   ├── stores/             # Zustand store
│   └── styles/             # Tailwind theme (globals.css)
├── tests/                   # Vitest tests
├── resources/               # App icons
└── package.json
```

## Data Architecture

- **Real-time tier**: collected every 2 seconds, pushed to UI via IPC, not persisted
- **Persistence tier**: collected every 60 seconds, aggregated and written to SQLite
- **Retention**: raw data kept 7 days, then down-sampled to hourly; deleted after 90 days
- **Database location**: `~/Library/Application Support/dashmac/dashmac-data.db`

## License

MIT
