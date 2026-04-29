export const TABLES = {
  memoryStats: 'memory_stats',
  diskStats: 'disk_stats',
  networkStats: 'network_stats',
  processSnapshots: 'process_snapshots',
  appTraffic: 'app_traffic',
} as const

export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS memory_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    total INTEGER NOT NULL,
    used INTEGER NOT NULL,
    free INTEGER NOT NULL,
    cached INTEGER NOT NULL,
    swap_used INTEGER NOT NULL,
    swap_total INTEGER NOT NULL,
    pressure_level TEXT CHECK(pressure_level IN ('normal', 'warn', 'critical'))
);

CREATE TABLE IF NOT EXISTS disk_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    mount_point TEXT NOT NULL,
    total INTEGER NOT NULL,
    used INTEGER NOT NULL,
    available INTEGER NOT NULL,
    read_speed REAL,
    write_speed REAL
);

CREATE TABLE IF NOT EXISTS network_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    interface TEXT NOT NULL,
    rx_bytes INTEGER NOT NULL,
    tx_bytes INTEGER NOT NULL,
    rx_speed REAL,
    tx_speed REAL
);

CREATE TABLE IF NOT EXISTS process_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    pid INTEGER NOT NULL,
    name TEXT NOT NULL,
    memory_usage INTEGER NOT NULL,
    cpu_usage REAL,
    network_usage INTEGER
);

CREATE TABLE IF NOT EXISTS app_traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    app_name TEXT NOT NULL,
    rx_total INTEGER NOT NULL,
    tx_total INTEGER NOT NULL,
    UNIQUE(date, app_name)
);
`

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_stats(timestamp);
CREATE INDEX IF NOT EXISTS idx_disk_timestamp ON disk_stats(timestamp);
CREATE INDEX IF NOT EXISTS idx_network_timestamp ON network_stats(timestamp);
CREATE INDEX IF NOT EXISTS idx_process_timestamp ON process_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_app_traffic_date_app ON app_traffic(date, app_name);
`
