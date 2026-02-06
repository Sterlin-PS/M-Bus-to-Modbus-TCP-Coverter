module.exports = {
  apps: [
    {
      name: 'mbus-modbus-loop1',
      script: 'venv/bin/python',
      args: 'mbus_modbus_server.py --loop 1 --port 5021',
      cwd: '/opt/volkkommen/mbus-modbus-converter',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        PYTHONUNBUFFERED: '1',
        CONFIG_PATH: '/etc/mbus-modbus/loop1.json'
      }
    },
    {
      name: 'mbus-modbus-loop2',
      script: 'venv/bin/python',
      args: 'mbus_modbus_server.py --loop 2 --port 5022',
      cwd: '/opt/volkkommen/mbus-modbus-converter',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    // ... repeat for all 13 loops
    {
      name: 'mbus-modbus-webui',
      script: 'app.js',  // Web UI for configuration
      cwd: '/opt/volkkommen/mbus-modbus-converter/web',
      instances: 1,
      autorestart: true,
      env: {
        PORT: 3050,
        NODE_ENV: 'production'
      }
    }
  ]
};
```

## Web UI Architecture

I'd suggest a **FastAPI + React** approach:

**Backend (FastAPI):**
- Serves configuration API
- Manages PM2 processes via Python subprocess
- Real-time status via WebSockets
- Handles register mapping CRUD

**Frontend (React/Next.js):**
- Visual register mapper (drag-and-drop style)
- Live Modbus register viewer
- PM2 process management dashboard
- Configuration import/export

## Simplified Stack

**Option 1: FastAPI + Simple HTML/htmx** (Lighter weight)
```
Backend: FastAPI (Python)
Frontend: HTML + Alpine.js + Tailwind CSS
Why: Same language as your converter, no build step, simple deployment
```

**Option 2: Express + React** (Your team's comfort zone)
```
Backend: Express.js
Frontend: React (could use your existing Next.js knowledge)
Why: Your team knows Node.js well from Node-RED work
```

## Proposed GUI Features

**Dashboard View:**
- 13 loops status (green/red indicators)
- Active Modbus connections count per loop
- Last M-Bus poll timestamp
- Error counts and alerts

**Register Mapper:**
```
┌─────────────────────────────────────────┐
│ Loop 1 - Device: 01 (Landis+Gyr)        │
├─────────────────────────────────────────┤
│ M-Bus Data Point     → Modbus Register  │
│ Energy (kWh)         → 0-1 (FLOAT32)    │
│ Volume (m³)          → 2-3 (FLOAT32)    │
│ Flow (m³/h)          → 4-5 (FLOAT32)    │
│ Power (kW)           → 6-7 (FLOAT32)    │
│ Temperature In (°C)  → 8-9 (FLOAT32)    │
│ Temperature Out (°C) → 10-11 (FLOAT32)  │
│ [+ Add Mapping]                          │
└─────────────────────────────────────────┘
```

**Configuration Manager:**
- Upload/download JSON configs
- Clone configuration across loops
- Template library for common meter types
- Validation before applying

**Live Monitor:**
- Real-time Modbus register values
- M-Bus raw data viewer
- Request/response logs
- Performance metrics

## Quick Implementation Plan

**Phase 1: Core Converter (Week 1)**
```
- Python Modbus TCP server with pymodbus
- JSON-based configuration
- Basic libmbus integration
- PM2 setup for one loop
```

**Phase 2: Web UI (Week 2)**
```
- FastAPI backend or Express.js
- Simple dashboard with status
- Configuration editor (JSON viewer)
- PM2 control (start/stop/restart)
```

**Phase 3: Advanced Mapper (Week 3)**
```
- Visual register mapper
- Live data viewer
- Template system
- Full 13-loop deployment
```

## File Structure
```
/opt/volkkommen/mbus-modbus-converter/
├── converter/
│   ├── mbus_modbus_server.py      # Main server
│   ├── mbus_reader.py              # libmbus wrapper
│   ├── register_mapper.py          # Mapping logic
│   └── requirements.txt
├── web/
│   ├── backend/
│   │   ├── app.py (FastAPI) or app.js (Express)
│   │   ├── routes/
│   │   └── models/
│   ├── frontend/
│   │   ├── public/
│   │   └── src/
│   └── package.json
├── configs/
│   ├── loop1.json
│   ├── loop2.json
│   └── templates/
├── ecosystem.config.js
└── venv/