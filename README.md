# M-Bus to Modbus TCP Converter

A lightweight Node.js application that bridges M-Bus (Meter-Bus) devices to Modbus TCP protocol. Enables integration of M-Bus meters (heat, water, gas, electricity) with SCADA systems, BMS, and industrial automation platforms.



## Features

- **Multiple M-Bus Connections** - Support for Serial (RS-232/RS-485) and TCP/IP M-Bus gateways
- **Multiple Devices per Loop** - Poll multiple meters on the same M-Bus line
- **Primary & Secondary Addressing** - Use simple addresses (1-250) or 8-digit meter IDs
- **Modbus TCP Server** - Each device maps to a unique Modbus Unit ID
- **Web Dashboard** - Configure loops, devices, and view live data
- **SQLite Persistence** - Configuration survives restarts
- **Auto-mapping** - M-Bus records automatically map to Modbus FLOAT32 registers
- **Custom Mappings** - Define specific register addresses, data types, and scaling

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Web Dashboard (:3000)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Loop 1 (Serial /dev/ttyUSB0)     Modbus TCP :5021         │
│    ├── Heat Meter (addr: 25)      → Unit ID 1              │
│    ├── Water Meter (addr: 0)      → Unit ID 2              │
│    └── Gas Meter (ID: 66786758)   → Unit ID 3              │
│                                                             │
│  Loop 2 (TCP 192.168.1.100:10001) Modbus TCP :5022         │
│    └── Electricity Meter (addr: 1) → Unit ID 1             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                 SQLite Database (config.db)                 │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 18+
- Build tools for native modules (better-sqlite3)

```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# Clone repository
git clone https://github.com/Sterlin-PS/M-Bus-to-Modbus-TCP-Coverter.git
cd M-Bus-to-Modbus-TCP-Coverter

# Install dependencies
npm install

# Start server
npm start
```

### Docker (Coming Soon)

```bash
docker run -d \
  --name mbus-modbus \
  -p 3000:3000 \
  -p 5021:5021 \
  --device=/dev/ttyUSB0 \
  -v mbus-config:/app/data \
  mbus-modbus-converter
```

## Quick Start

1. **Open Dashboard**: http://localhost:3000

2. **Create a Loop** (M-Bus connection):
   - Loop ID: `1`
   - Name: `Heat Meters`
   - M-Bus Type: `Serial`
   - Serial Path: `/dev/ttyUSB0`
   - Baud Rate: `2400`
   - Modbus TCP Port: `5021`

3. **Add Devices** to the loop:
   - Device Name: `Heat Meter 1`
   - M-Bus Address: `25` (or secondary ID like `66786758`)
   - Modbus Unit ID: `1`

4. **Start the Loop**

5. **Read via Modbus TCP**:
   ```bash
   # Using the included test script
   node test-modbus.js 127.0.0.1 5021 1 0 40
   ```

## M-Bus Addressing

| Type | Format | Example | Description |
|------|--------|---------|-------------|
| Primary | 1-250 | `25` | Simple address, configured on meter |
| Secondary | 8 digits | `66786758` | Unique meter ID (printed on device) |
| Wildcard | With `F` | `6678FFFF` | Match partial IDs |

Secondary addressing is recommended for production as it uses the permanent meter ID.

## Modbus Register Mapping

By default, M-Bus records are auto-mapped to sequential FLOAT32 registers:

| M-Bus Record | Modbus Registers | Data Type |
|--------------|------------------|-----------|
| Record 0 | 0-1 | FLOAT32 BE |
| Record 1 | 2-3 | FLOAT32 BE |
| Record 2 | 4-5 | FLOAT32 BE |
| ... | ... | ... |

### Example: Landis+Gyr Heat Meter

| Register | Value | Description |
|----------|-------|-------------|
| 0-1 | 8 | Status |
| 2-3 | 8 | Access counter |
| 4-5 | 766000 | Energy (Wh) |
| 6-7 | 560.08 | Volume (m³) |
| 8-9 | 0 | Power (W) |
| 10-11 | 0 | Flow rate (m³/h) |
| 12-13 | 45.2 | Flow temp (°C) |
| 14-15 | 38.1 | Return temp (°C) |

### Custom Mappings

Configure specific mappings via API:

```bash
curl -X POST http://localhost:3000/api/devices/1/mappings \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Total Energy",
    "mbusRecordIndex": 2,
    "modbusRegister": 100,
    "dataType": "FLOAT32",
    "scale": 0.001
  }'
```

## API Reference

### Loops

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loops` | List all loops |
| POST | `/api/loops` | Create loop |
| POST | `/api/loops/:id/start` | Start loop |
| POST | `/api/loops/:id/stop` | Stop loop |
| DELETE | `/api/loops/:id` | Delete loop |
| POST | `/api/loops/:id/read` | Test M-Bus read |

### Devices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loops/:id/devices` | List devices |
| POST | `/api/loops/:id/devices` | Add device |
| DELETE | `/api/devices/:id` | Delete device |

### Mappings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices/:id/mappings` | List mappings |
| POST | `/api/devices/:id/mappings` | Add mapping |
| DELETE | `/api/mappings/:id` | Delete mapping |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Web dashboard port |

### Database

Configuration is stored in `config.db` (SQLite). Tables:

- `loops` - M-Bus connections
- `devices` - Meters per loop
- `mappings` - Custom register mappings

## Supported Devices

Tested with:

- **Landis+Gyr** - UltraHeat 2WR6
- **Kamstrup** - MULTICAL series
- **Diehl** - SHARKY heat meters
- **Sensus** - PolluCom, PolluTherm
- **Itron** - CF Echo II
- **Zenner** - Various models

Should work with any M-Bus compliant meter.

## Troubleshooting

### Serial Port Permission Denied

```bash
sudo usermod -a -G dialout $USER
# Logout and login again
```

### M-Bus Timeout

1. Check baud rate (usually 2400)
2. Verify wiring (M-Bus requires level converter)
3. Try different primary addresses (scan with `mbus-serial-scan`)
4. Use secondary addressing with meter ID

### better-sqlite3 Installation Failed

```bash
# Install build tools
sudo apt-get install build-essential python3

# Clear npm cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Development

```bash
# Run with auto-reload
npm run dev

# Test M-Bus reading
node test-secondary.js 66786758

# Test Modbus registers
node test-modbus.js 127.0.0.1 5021 1 0 40
```

## Project Structure

```
├── app.js                 # Express server & API
├── lib/
│   ├── Database.js        # SQLite operations
│   ├── LoopManager.js     # Loop lifecycle & polling
│   ├── MBusReader.js      # M-Bus protocol
│   └── ModbusServer.js    # Modbus TCP server
├── views/
│   └── dashboard.ejs      # Web UI
├── config.db              # SQLite database (created on first run)
├── test-modbus.js         # Modbus test client
└── test-secondary.js      # M-Bus secondary address test
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Acknowledgments

- [modbus-serial](https://github.com/yaacov/node-modbus-serial) - Modbus TCP implementation
- [serialport](https://serialport.io/) - Serial communication
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database
- [M-Bus Documentation](https://m-bus.com/) - Protocol specification

## Support

- **Issues**: [GitHub Issues](https://github.com/Sterlin-PS/M-Bus-to-Modbus-TCP-Coverter/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Sterlin-PS/M-Bus-to-Modbus-TCP-Coverter/discussions)

---

Made with ❤️ for the industrial automation community
