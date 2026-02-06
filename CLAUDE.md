# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

M-Bus to Modbus TCP Converter - A Node.js system that bridges M-Bus (Meter-Bus) protocol devices with Modbus TCP networks. Supports flexible loop configurations (1, 2, or more) with either serial or TCP M-Bus connections.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server on port 3000
npm run dev          # Start with auto-reload (--watch)
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Express + EJS                   │
│               http://localhost:3000              │
├─────────────────────────────────────────────────┤
│                  LoopManager                     │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│    │  Loop 1  │  │  Loop 2  │  │  Loop N  │    │
│    │ :5021    │  │ :5022    │  │ :50xx    │    │
│    └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│         │             │             │           │
│    MBusReader    MBusReader    MBusReader      │
│   (TCP/Serial)  (TCP/Serial)  (TCP/Serial)     │
└─────────────────────────────────────────────────┘
```

### Core Files

- **app.js** - Express server, API routes, dashboard
- **lib/LoopManager.js** - Manages converter loops, polling, status
- **lib/MBusReader.js** - M-Bus protocol (serial & TCP), frame building, parsing
- **lib/ModbusServer.js** - Modbus TCP server wrapper using modbus-serial
- **views/dashboard.ejs** - Single-page dashboard UI

## API Endpoints

```
GET  /                     Dashboard
GET  /api/loops            All loops status
POST /api/loops            Add loop {id, name, mbusType, modbusPort, ...}
POST /api/loops/:id/start  Start loop
POST /api/loops/:id/stop   Stop loop
DELETE /api/loops/:id      Remove loop
POST /api/loops/:id/read   Test M-Bus read {address}
GET  /api/loops/:id/registers  Get Modbus registers
```

## Key Conventions

- Loops can use TCP or Serial M-Bus connections
- Each loop runs its own Modbus TCP server on a configurable port
- M-Bus polling interval is configurable per loop
- Dashboard auto-refreshes status every 5 seconds
