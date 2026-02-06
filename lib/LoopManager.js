const MBusReader = require('./MBusReader');
const ModbusServer = require('./ModbusServer');

class Loop {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || `Loop ${config.id}`;
    this.mbusConfig = config.mbus;
    this.modbusPort = config.modbusPort;
    this.pollInterval = config.pollInterval || 60000;
    this.devices = config.devices || [{ address: 1 }]; // M-Bus device addresses to poll

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
      this.modbus = new ModbusServer(this.modbusPort);
      await this.modbus.start();

      this.mbus = new MBusReader(this.mbusConfig);
      await this.mbus.connect();

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
      for (const device of this.devices) {
        let data;
        // Use secondary addressing if address is longer than 3 chars (e.g., "66786758")
        if (device.address && device.address.toString().length > 3) {
          data = await this.mbus.readDeviceSecondary(device.address.toString());
        } else {
          data = await this.mbus.readDevice(parseInt(device.address));
        }

        this.lastData = data;
        this.lastPoll = new Date();

        if (!data.error && data.records) {
          this.mapToRegisters(data.records, device.registerOffset || 0);
        } else if (data.error) {
          this.lastError = data.error;
        }
      }
    } catch (err) {
      this.lastError = err.message;
    }
  }

  mapToRegisters(records, offset) {
    // Map each M-Bus record to sequential Modbus registers as FLOAT32
    let regAddr = offset;
    for (const rec of records) {
      if (typeof rec.value === 'number' && !isNaN(rec.value)) {
        this.modbus.setFloat32(regAddr, rec.value);
        regAddr += 2; // FLOAT32 uses 2 registers
      }
    }
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.mbus) this.mbus.disconnect();
    if (this.modbus) this.modbus.stop();
    this.status = 'stopped';
    this.mbus = null;
    this.modbus = null;
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
      devices: this.devices,
      lastPoll: this.lastPoll,
      lastError: this.lastError,
      lastData: this.lastData,
      registers: this.modbus ? this.modbus.getRegisters() : []
    };
  }

  addDevice(address, registerOffset = 0) {
    this.devices.push({ address, registerOffset });
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
