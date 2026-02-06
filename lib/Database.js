const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'config.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS loops (
    id INTEGER PRIMARY KEY,
    name TEXT,
    mbus_type TEXT NOT NULL,
    mbus_path TEXT,
    mbus_host TEXT,
    mbus_port INTEGER,
    baud_rate INTEGER DEFAULT 2400,
    modbus_port INTEGER NOT NULL,
    poll_interval INTEGER DEFAULT 60000,
    enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loop_id INTEGER NOT NULL,
    name TEXT,
    mbus_address TEXT NOT NULL,
    modbus_unit_id INTEGER NOT NULL,
    enabled INTEGER DEFAULT 1,
    FOREIGN KEY (loop_id) REFERENCES loops(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    name TEXT,
    mbus_record_index INTEGER,
    mbus_unit TEXT,
    modbus_register INTEGER NOT NULL,
    data_type TEXT DEFAULT 'FLOAT32',
    scale REAL DEFAULT 1.0,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );
`);

module.exports = {
  // Loops
  getLoops() {
    return db.prepare('SELECT * FROM loops').all();
  },

  getLoop(id) {
    return db.prepare('SELECT * FROM loops WHERE id = ?').get(id);
  },

  createLoop(loop) {
    const stmt = db.prepare(`
      INSERT INTO loops (id, name, mbus_type, mbus_path, mbus_host, mbus_port, baud_rate, modbus_port, poll_interval, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(loop.id, loop.name, loop.mbus_type, loop.mbus_path, loop.mbus_host, loop.mbus_port,
             loop.baud_rate || 2400, loop.modbus_port, loop.poll_interval || 60000, loop.enabled !== false ? 1 : 0);
    return this.getLoop(loop.id);
  },

  updateLoop(id, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE loops SET ${fields} WHERE id = ?`);
    stmt.run(...Object.values(updates), id);
    return this.getLoop(id);
  },

  deleteLoop(id) {
    db.prepare('DELETE FROM loops WHERE id = ?').run(id);
  },

  // Devices
  getDevices(loopId) {
    return db.prepare('SELECT * FROM devices WHERE loop_id = ?').all(loopId);
  },

  getDevice(id) {
    return db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  },

  createDevice(device) {
    const stmt = db.prepare(`
      INSERT INTO devices (loop_id, name, mbus_address, modbus_unit_id, enabled)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(device.loop_id, device.name, device.mbus_address,
                            device.modbus_unit_id, device.enabled !== false ? 1 : 0);
    return this.getDevice(result.lastInsertRowid);
  },

  updateDevice(id, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE devices SET ${fields} WHERE id = ?`);
    stmt.run(...Object.values(updates), id);
    return this.getDevice(id);
  },

  deleteDevice(id) {
    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
  },

  // Mappings
  getMappings(deviceId) {
    return db.prepare('SELECT * FROM mappings WHERE device_id = ? ORDER BY modbus_register').all(deviceId);
  },

  createMapping(mapping) {
    const stmt = db.prepare(`
      INSERT INTO mappings (device_id, name, mbus_record_index, mbus_unit, modbus_register, data_type, scale)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(mapping.device_id, mapping.name, mapping.mbus_record_index,
                            mapping.mbus_unit, mapping.modbus_register, mapping.data_type || 'FLOAT32', mapping.scale || 1.0);
    return db.prepare('SELECT * FROM mappings WHERE id = ?').get(result.lastInsertRowid);
  },

  deleteMapping(id) {
    db.prepare('DELETE FROM mappings WHERE id = ?').run(id);
  },

  // Get full config for a loop
  getLoopConfig(loopId) {
    const loop = this.getLoop(loopId);
    if (!loop) return null;

    loop.devices = this.getDevices(loopId).map(device => {
      device.mappings = this.getMappings(device.id);
      return device;
    });
    return loop;
  },

  // Get all config
  getAllConfig() {
    return this.getLoops().map(loop => this.getLoopConfig(loop.id));
  }
};
