const MBusReader = require('./MBusReader');
const ModbusServer = require('./ModbusServer');

class Loop {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || `Loop ${config.id}`;
    this.mbusConfig = config.mbus;
    this.modbusPort = config.modbusPort;
    this.pollInterval = config.pollInterval || 60000;
    this.mappings = config.mappings || [];

    this.mbus = null;
    this.modbus = null;
    this.pollTimer = null;
    this.status = 'stopped';
    this.lastPoll = null;
    this.lastError = null;
    this.lastData = null;
  }

  async start() {
    try {
      // Start Modbus server
      this.modbus = new ModbusServer(this.modbusPort);
      await this.modbus.start();

      // Connect M-Bus
      this.mbus = new MBusReader(this.mbusConfig);
      await this.mbus.connect();

      // Start polling
      this.status = 'running';
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

      return { success: true };
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  async poll() {
    if (!this.mbus) return;

    try {
      for (const mapping of this.mappings) {
        const data = await this.mbus.readDevice(mapping.mbusAddress);
        this.lastData = data;
        this.lastPoll = new Date();

        if (!data.error) {
          // Map data to Modbus registers based on mappings
          this.applyMappings(data, mapping);
        }
      }
    } catch (err) {
      this.lastError = err.message;
    }
  }

  applyMappings(data, mapping) {
    // Apply register mappings from M-Bus data to Modbus registers
    if (mapping.registers) {
      for (const reg of mapping.registers) {
        // This would parse actual M-Bus data - simplified for now
        if (reg.type === 'float32') {
          this.modbus.setFloat32(reg.address, reg.testValue || 0);
        } else {
          this.modbus.setInt16(reg.address, reg.testValue || 0);
        }
      }
    }
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.mbus) this.mbus.disconnect();
    if (this.modbus) this.modbus.stop();
    this.status = 'stopped';
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      modbusPort: this.modbusPort,
      mbusType: this.mbusConfig.type,
      mbusConnection: this.mbusConfig.type === 'tcp'
        ? `${this.mbusConfig.host}:${this.mbusConfig.port}`
        : this.mbusConfig.path,
      lastPoll: this.lastPoll,
      lastError: this.lastError,
      registers: this.modbus ? this.modbus.getRegisters() : []
    };
  }
}

class LoopManager {
  constructor() {
    this.loops = new Map();
  }

  addLoop(config) {
    const loop = new Loop(config);
    this.loops.set(config.id, loop);
    return loop;
  }

  getLoop(id) {
    return this.loops.get(id);
  }

  getAllLoops() {
    return Array.from(this.loops.values());
  }

  async startLoop(id) {
    const loop = this.loops.get(id);
    if (loop) return loop.start();
    return { success: false, error: 'Loop not found' };
  }

  stopLoop(id) {
    const loop = this.loops.get(id);
    if (loop) loop.stop();
  }

  removeLoop(id) {
    const loop = this.loops.get(id);
    if (loop) {
      loop.stop();
      this.loops.delete(id);
    }
  }

  getStatus() {
    return this.getAllLoops().map(l => l.getStatus());
  }
}

module.exports = new LoopManager();
