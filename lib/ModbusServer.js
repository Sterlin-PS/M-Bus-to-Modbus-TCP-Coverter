const ModbusRTU = require('modbus-serial');

class ModbusServer {
  constructor(port, unitId = 1) {
    this.port = port;
    this.unitId = unitId;
    this.server = new ModbusRTU.ServerTCP();
    this.registers = new Array(100).fill(0); // Holding registers
    this.coils = new Array(100).fill(false);
    this.running = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      const vector = {
        getHoldingRegister: (addr) => this.registers[addr] || 0,
        getCoil: (addr) => this.coils[addr] || false,
        setRegister: (addr, value) => { this.registers[addr] = value; },
        setCoil: (addr, value) => { this.coils[addr] = value; }
      };

      this.server = new ModbusRTU.ServerTCP(vector, {
        host: '0.0.0.0',
        port: this.port,
        unitID: this.unitId
      });

      this.server.on('socketError', (err) => {
        console.error(`Modbus port ${this.port} error:`, err.message);
      });

      // Server starts immediately
      this.running = true;
      resolve();
    });
  }

  setFloat32(startReg, value) {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatBE(value, 0);
    this.registers[startReg] = buffer.readUInt16BE(0);
    this.registers[startReg + 1] = buffer.readUInt16BE(2);
  }

  setInt16(reg, value) {
    this.registers[reg] = value & 0xFFFF;
  }

  setUint32(startReg, value) {
    this.registers[startReg] = (value >> 16) & 0xFFFF;
    this.registers[startReg + 1] = value & 0xFFFF;
  }

  getRegisters() {
    return this.registers.slice(0, 20); // Return first 20 for display
  }

  stop() {
    this.running = false;
    if (this.server && this.server.close) {
      this.server.close();
    }
  }
}

module.exports = ModbusServer;
