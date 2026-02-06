const ModbusRTU = require('modbus-serial');

class ModbusServer {
  constructor(port) {
    this.port = port;
    this.server = null;
    this.running = false;
    // Registers per unit ID: { unitId: { registers: [...], coils: [...] } }
    this.units = {};
  }

  // Initialize a unit (device)
  initUnit(unitId) {
    if (!this.units[unitId]) {
      this.units[unitId] = {
        registers: new Array(1000).fill(0),
        coils: new Array(100).fill(false)
      };
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      const vector = {
        getHoldingRegister: (addr, unitId) => {
          const unit = this.units[unitId];
          return unit ? unit.registers[addr] || 0 : 0;
        },
        getCoil: (addr, unitId) => {
          const unit = this.units[unitId];
          return unit ? unit.coils[addr] || false : false;
        },
        setRegister: (addr, value, unitId) => {
          this.initUnit(unitId);
          this.units[unitId].registers[addr] = value;
        },
        setCoil: (addr, value, unitId) => {
          this.initUnit(unitId);
          this.units[unitId].coils[addr] = value;
        }
      };

      try {
        this.server = new ModbusRTU.ServerTCP(vector, {
          host: '0.0.0.0',
          port: this.port,
          unitID: 255 // Accept any unit ID
        });

        this.server.on('socketError', (err) => {
          console.error(`Modbus port ${this.port} error:`, err.message);
        });

        this.running = true;
        console.log(`Modbus TCP server started on port ${this.port}`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Set FLOAT32 value (Big Endian) for a specific unit
  setFloat32(unitId, startReg, value) {
    this.initUnit(unitId);
    const buffer = Buffer.alloc(4);
    buffer.writeFloatBE(value, 0);
    this.units[unitId].registers[startReg] = buffer.readUInt16BE(0);
    this.units[unitId].registers[startReg + 1] = buffer.readUInt16BE(2);
  }

  // Set INT16 value for a specific unit
  setInt16(unitId, reg, value) {
    this.initUnit(unitId);
    this.units[unitId].registers[reg] = value & 0xFFFF;
  }

  // Set UINT32 value for a specific unit
  setUint32(unitId, startReg, value) {
    this.initUnit(unitId);
    this.units[unitId].registers[startReg] = (value >> 16) & 0xFFFF;
    this.units[unitId].registers[startReg + 1] = value & 0xFFFF;
  }

  // Get registers for a unit (for display)
  getRegisters(unitId, count = 20) {
    if (!this.units[unitId]) return [];
    return this.units[unitId].registers.slice(0, count);
  }

  // Get all units with their register data
  getAllUnits() {
    const result = {};
    for (const unitId in this.units) {
      result[unitId] = this.units[unitId].registers.slice(0, 50);
    }
    return result;
  }

  stop() {
    this.running = false;
    if (this.server && this.server.close) {
      this.server.close();
    }
  }
}

module.exports = ModbusServer;
