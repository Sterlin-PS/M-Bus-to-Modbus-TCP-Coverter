# SESSION.md

This file tracks development session activities for context continuity.

---

## Session: 2024-02-06

### Summary
Built complete M-Bus to Modbus TCP Converter from scratch with Node.js, EJS dashboard, and SQLite persistence.

### What Was Built

#### Core Components
1. **MBusReader.js** - M-Bus protocol implementation
   - Serial and TCP connection support
   - Primary addressing (1-250)
   - Secondary addressing (8-digit meter ID with wildcards)
   - VIF parsing for common units (Wh, m³, W, °C, etc.)
   - BCD and binary value decoding

2. **ModbusServer.js** - Modbus TCP server
   - Multi-unit ID support (each device = unique unit ID)
   - FLOAT32, INT16, UINT32 data types
   - Configurable registers per unit

3. **LoopManager.js** - Loop lifecycle management
   - Multiple loops (different serial ports/TCP connections)
   - Multiple devices per loop
   - Automatic polling with configurable intervals
   - Auto-mapping M-Bus records to Modbus registers

4. **Database.js** - SQLite persistence
   - Tables: loops, devices, mappings
   - Configuration survives restarts

5. **Dashboard (EJS)** - Web UI
   - Create/delete loops
   - Add/remove devices per loop
   - Test M-Bus reads
   - View live register values

### Hardware Tested
- **Meter**: Landis+Gyr UltraHeat (GUL)
- **Medium**: Heat meter
- **M-Bus Address**: Primary 25, Secondary ID 66786758
- **Connection**: Serial /dev/ttyUSB0 @ 2400 baud

### Working Configuration
```
Loop 1:
  - Type: Serial
  - Path: /dev/ttyUSB0
  - Baud: 2400
  - Modbus Port: 5021
  - Device: Address 25 → Unit ID 1
```

### Sample Data Retrieved
| Register | Value | Unit | Description |
|----------|-------|------|-------------|
| 4-5 | 766000 | Wh | Total Energy (766 kWh) |
| 6-7 | 560.08 | m³ | Total Volume |
| 8-9 | 0 | W | Current Power |
| 10-11 | 0 | m³/h | Current Flow |

### Issues Encountered & Fixed

1. **Auto-refresh breaking UI** - Removed setInterval reload
2. **SND_NKE timing** - Added 100ms delay before REQ_UD2
3. **Loop polling wrong address** - Fixed address configuration
4. **Serial port lock** - Can't run test scripts while server running
5. **FCB timing issues** - Increased timeout to 5000ms

### Files Created/Modified
```
├── app.js                 ✅ Created - Express server & API
├── package.json           ✅ Created - Dependencies
├── lib/
│   ├── Database.js        ✅ Created - SQLite operations
│   ├── LoopManager.js     ✅ Created - Loop management
│   ├── MBusReader.js      ✅ Created - M-Bus protocol
│   └── ModbusServer.js    ✅ Created - Modbus TCP server
├── views/
│   └── dashboard.ejs      ✅ Created - Web UI
├── test-modbus.js         ✅ Created - Modbus test client
├── test-secondary.js      ✅ Created - M-Bus secondary test
├── README.md              ✅ Created - Documentation
├── CLAUDE.md              ✅ Created - AI context
├── LICENSE                ✅ Created - MIT license
├── .gitignore             ✅ Updated
└── config.db              (generated at runtime)
```

### API Endpoints Implemented
```
GET    /                        - Dashboard
GET    /api/loops               - List loops
POST   /api/loops               - Create loop
POST   /api/loops/:id/start     - Start loop
POST   /api/loops/:id/stop      - Stop loop
DELETE /api/loops/:id           - Delete loop
POST   /api/loops/:id/read      - Test M-Bus read
GET    /api/loops/:id/devices   - List devices
POST   /api/loops/:id/devices   - Add device
DELETE /api/devices/:id         - Delete device
GET    /api/devices/:id/mappings - List mappings
POST   /api/devices/:id/mappings - Add mapping
DELETE /api/mappings/:id        - Delete mapping
```

### Pending / TODO

- [ ] User hasn't pulled latest code with SQLite support
- [ ] Test multi-device polling (address 0 and 25)
- [ ] Add custom register mapping UI to dashboard
- [ ] Add device enable/disable toggle
- [ ] Add loop auto-start on server boot option
- [ ] Add export/import configuration feature
- [ ] Docker containerization
- [ ] Add authentication to dashboard
- [ ] Add Modbus connection counter to dashboard
- [ ] Test secondary addressing with wildcards

### Commands for Next Session

```bash
# On server - pull and install
cd ~/M-Bus-to-Modbus-TCP-Coverter
git pull
npm install
npm start

# Test Modbus reading
node test-modbus.js 127.0.0.1 5021 1 0 40

# Test secondary addressing (stop server first)
node test-secondary.js 66786758
```

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                 Web Dashboard (:3000)                       │
├─────────────────────────────────────────────────────────────┤
│                     LoopManager                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Loop 1 (/dev/ttyUSB0) → Modbus TCP :5021            │   │
│  │   ├── Device: M-Bus 25      → Unit ID 1             │   │
│  │   └── Device: M-Bus 0       → Unit ID 2 (to add)    │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                 SQLite Database (config.db)                 │
└─────────────────────────────────────────────────────────────┘
```

### Notes for Next Session
1. User's server still has old code - needs `git pull && npm install`
2. Two meters found on bus: address 0 and address 25
3. Meter ID for address 25: `66786758` (Landis+Gyr)
4. Server URL: `istavindis3111converter.volkkommen.in`
5. better-sqlite3 requires build-essential on Linux

---

## Previous Sessions

None - this is the first session.
