# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Session Context**: See `SESSION.md` for detailed development history and TODO items.

## Project Overview

M-Bus to Modbus TCP Converter - A Node.js system that bridges M-Bus (Meter-Bus) devices to Modbus TCP. Supports multiple loops, multiple devices per loop, with SQLite configuration persistence.

## Commands

```bash
npm install          # Install dependencies (requires better-sqlite3)
npm start            # Start server on port 3000
npm run dev          # Start with auto-reload
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard (EJS)                          │
│                 http://localhost:3000                       │
├─────────────────────────────────────────────────────────────┤
│                     LoopManager                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Loop 1 (/dev/ttyUSB0) → Modbus TCP :5021            │   │
│  │   ├── Device: M-Bus 25      → Unit ID 1             │   │
│  │   ├── Device: M-Bus 0       → Unit ID 2             │   │
│  │   └── Device: M-Bus 66786758 → Unit ID 3            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Loop 2 (/dev/ttyUSB1) → Modbus TCP :5022            │   │
│  │   └── Device: M-Bus 1       → Unit ID 1             │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                   SQLite Database                           │
│                    config.db                                │
└─────────────────────────────────────────────────────────────┘
```

## Core Files

- **app.js** - Express server, REST API endpoints
- **lib/Database.js** - SQLite schema and queries (loops, devices, mappings)
- **lib/LoopManager.js** - Loop lifecycle, polling, register mapping
- **lib/MBusReader.js** - M-Bus protocol (primary & secondary addressing)
- **lib/ModbusServer.js** - Modbus TCP server with multi-unit support
- **views/dashboard.ejs** - Configuration UI

## Database Schema

```sql
loops (id, name, mbus_type, mbus_path, mbus_host, mbus_port, baud_rate, modbus_port, poll_interval, enabled)
devices (id, loop_id, name, mbus_address, modbus_unit_id, enabled)
mappings (id, device_id, name, mbus_record_index, mbus_unit, modbus_register, data_type, scale)
```

## API Endpoints

```
Loops:
  GET    /api/loops              - List all loops
  POST   /api/loops              - Create loop
  POST   /api/loops/:id/start    - Start loop
  POST   /api/loops/:id/stop     - Stop loop
  DELETE /api/loops/:id          - Delete loop
  POST   /api/loops/:id/read     - Test M-Bus read

Devices:
  GET    /api/loops/:id/devices  - List devices in loop
  POST   /api/loops/:id/devices  - Add device to loop
  DELETE /api/devices/:id        - Delete device

Mappings:
  GET    /api/devices/:id/mappings  - List mappings
  POST   /api/devices/:id/mappings  - Add mapping
  DELETE /api/mappings/:id          - Delete mapping
```

## M-Bus Addressing

- **Primary**: 1-250 (simple, configured on meter)
- **Secondary**: 8-digit meter ID (e.g., `66786758`)
- Address length > 3 chars triggers secondary addressing

## Modbus Mapping

Each M-Bus device maps to a Modbus Unit ID. By default:
- Records auto-map to sequential FLOAT32 registers (2 regs per value)
- Custom mappings can specify: record index, register, data type, scale

## Test Script

```bash
node test-modbus.js [host] [port] [unitId] [startReg] [count]
node test-modbus.js 127.0.0.1 5021 1 0 40
```
