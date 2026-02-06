const MBusReader = require('./MBusReader');
const ModbusServer = require('./ModbusServer');
const db = require('./Database');

class Loop {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || `Loop ${config.id}`;
    this.mbusConfig = {
      type: config.mbus_type,
      path: config.mbus_path,
      host: config.mbus_host,
      port: config.mbus_port,
      baudRate: config.baud_rate || 2400
    };
    this.modbusPort = config.modbus_port;
    this.pollInterval = config.poll_interval || 60000;
    this.devices = config.devices || [];

    this.mbus = null;
    this.modbus = null;
    this.pollTimer = null;
    this.status = 'stopped';
    this.lastPoll = null;
    this.lastError = null;
    this.deviceData = {}; // Store last data per device
    this.polling = false;
  }

  async start() {
    try {
      // Start Modbus server
      this.modbus = new ModbusServer(this.modbusPort);
      await this.modbus.start();

      // Initialize units for each device
      for (const device of this.devices) {
        this.modbus.initUnit(device.modbus_unit_id);
      }

      // Connect M-Bus
      this.mbus = new MBusReader(this.mbusConfig);
      await this.mbus.connect();

      this.status = 'running';
      this.poll(); // First poll immediately
      this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

      console.log(`[Loop ${this.id}] Started - Modbus TCP :${this.modbusPort}`);
      return { success: true };
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      console.error(`[Loop ${this.id}] Start error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async poll() {
    if (!this.mbus || this.polling) return;
    this.polling = true;

    for (const device of this.devices) {
      if (!device.enabled) continue;

      const addr = device.mbus_address?.toString() || '1';
      console.log(`[Loop ${this.id}] Polling device ${device.name || addr} (Unit ${device.modbus_unit_id})...`);

      try {
        let data;
        if (addr.length > 3) {
          data = await this.mbus.readDeviceSecondary(addr);
        } else {
          data = await this.mbus.readDevice(parseInt(addr));
        }

        this.lastPoll = new Date();

        if (!data.error && data.records) {
          this.deviceData[device.id] = data;
          this.lastError = null;
          this.applyMappings(device, data.records);
          console.log(`[Loop ${this.id}] Device ${device.modbus_unit_id}: ${data.records.length} records`);
        } else if (data.error) {
          this.lastError = `Device ${addr}: ${data.error}`;
          console.log(`[Loop ${this.id}] Device ${addr} error:`, data.error);
        }
      } catch (err) {
        this.lastError = err.message;
      }

      // Small delay between devices on same bus
      await new Promise(r => setTimeout(r, 200));
    }

    this.polling = false;
  }

  applyMappings(device, records) {
    const unitId = device.modbus_unit_id;
    const mappings = device.mappings || [];

    if (mappings.length === 0) {
      // Auto-map: each record to sequential registers as FLOAT32
      let regAddr = 0;
      for (const rec of records) {
        if (typeof rec.value === 'number' && !isNaN(rec.value)) {
          this.modbus.setFloat32(unitId, regAddr, rec.value);
          regAddr += 2;
        }
      }
    } else {
      // Use configured mappings
      for (const mapping of mappings) {
        const record = records[mapping.mbus_record_index];
        if (record && typeof record.value === 'number') {
          const value = record.value * (mapping.scale || 1.0);

          switch (mapping.data_type) {
            case 'INT16':
              this.modbus.setInt16(unitId, mapping.modbus_register, Math.round(value));
              break;
            case 'UINT32':
              this.modbus.setUint32(unitId, mapping.modbus_register, Math.round(value));
              break;
            case 'FLOAT32':
            default:
              this.modbus.setFloat32(unitId, mapping.modbus_register, value);
          }
        }
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
    console.log(`[Loop ${this.id}] Stopped`);
  }

  reload() {
    const config = db.getLoopConfig(this.id);
    if (config) {
      this.devices = config.devices || [];
      console.log(`[Loop ${this.id}] Reloaded ${this.devices.length} devices`);
    }
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
      pollInterval: this.pollInterval,
      devices: this.devices,
      lastPoll: this.lastPoll,
      lastError: this.lastError,
      deviceData: this.deviceData,
      registers: this.modbus ? this.modbus.getAllUnits() : {}
    };
  }
}

class LoopManager {
  constructor() {
    this.loops = new Map();
    this.loadFromDatabase();
  }

  loadFromDatabase() {
    const configs = db.getAllConfig();
    for (const config of configs) {
      const loop = new Loop(config);
      this.loops.set(config.id, loop);
      if (config.enabled) {
        loop.start().catch(err => console.error(`Failed to start loop ${config.id}:`, err));
      }
    }
    console.log(`Loaded ${configs.length} loops from database`);
  }

  createLoop(config) {
    // Save to database
    const saved = db.createLoop({
      id: config.id,
      name: config.name,
      mbus_type: config.mbusType,
      mbus_path: config.mbusPath,
      mbus_host: config.mbusHost,
      mbus_port: config.mbusPort,
      baud_rate: config.baudRate,
      modbus_port: config.modbusPort,
      poll_interval: config.pollInterval,
      enabled: true
    });

    // Create loop instance
    const fullConfig = db.getLoopConfig(saved.id);
    const loop = new Loop(fullConfig);
    this.loops.set(saved.id, loop);
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
    if (loop) {
      loop.reload(); // Reload config from DB
      return loop.start();
    }
    return { success: false, error: 'Loop not found' };
  }

  stopLoop(id) {
    const loop = this.loops.get(id);
    if (loop) loop.stop();
  }

  deleteLoop(id) {
    const loop = this.loops.get(id);
    if (loop) {
      loop.stop();
      this.loops.delete(id);
      db.deleteLoop(id);
    }
  }

  // Device management
  addDevice(loopId, device) {
    const saved = db.createDevice({
      loop_id: loopId,
      name: device.name,
      mbus_address: device.mbusAddress,
      modbus_unit_id: device.modbusUnitId,
      enabled: true
    });

    const loop = this.loops.get(loopId);
    if (loop) {
      loop.reload();
      if (loop.modbus) {
        loop.modbus.initUnit(saved.modbus_unit_id);
      }
    }
    return saved;
  }

  deleteDevice(deviceId) {
    const device = db.getDevice(deviceId);
    if (device) {
      db.deleteDevice(deviceId);
      const loop = this.loops.get(device.loop_id);
      if (loop) loop.reload();
    }
  }

  // Mapping management
  addMapping(deviceId, mapping) {
    return db.createMapping({
      device_id: deviceId,
      name: mapping.name,
      mbus_record_index: mapping.mbusRecordIndex,
      mbus_unit: mapping.mbusUnit,
      modbus_register: mapping.modbusRegister,
      data_type: mapping.dataType,
      scale: mapping.scale
    });
  }

  deleteMapping(mappingId) {
    db.deleteMapping(mappingId);
  }

  getStatus() {
    return this.getAllLoops().map(l => l.getStatus());
  }
}

module.exports = new LoopManager();
