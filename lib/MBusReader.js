const net = require('net');
const { SerialPort } = require('serialport');

// M-Bus VIF codes (common units)
const VIF_UNITS = {
  0x00: { unit: 'Wh', scale: 1e-3 }, 0x01: { unit: 'Wh', scale: 1e-2 }, 0x02: { unit: 'Wh', scale: 1e-1 },
  0x03: { unit: 'Wh', scale: 1 }, 0x04: { unit: 'Wh', scale: 1e1 }, 0x05: { unit: 'Wh', scale: 1e2 },
  0x06: { unit: 'Wh', scale: 1e3 }, 0x07: { unit: 'Wh', scale: 1e4 },
  0x08: { unit: 'J', scale: 1 }, 0x09: { unit: 'J', scale: 1e1 }, 0x0A: { unit: 'J', scale: 1e2 },
  0x0B: { unit: 'J', scale: 1e3 }, 0x0C: { unit: 'J', scale: 1e4 }, 0x0D: { unit: 'J', scale: 1e5 },
  0x10: { unit: 'm³', scale: 1e-6 }, 0x11: { unit: 'm³', scale: 1e-5 }, 0x12: { unit: 'm³', scale: 1e-4 },
  0x13: { unit: 'm³', scale: 1e-3 }, 0x14: { unit: 'm³', scale: 1e-2 }, 0x15: { unit: 'm³', scale: 1e-1 },
  0x16: { unit: 'm³', scale: 1 }, 0x17: { unit: 'm³', scale: 1e1 },
  0x28: { unit: 'W', scale: 1e-3 }, 0x29: { unit: 'W', scale: 1e-2 }, 0x2A: { unit: 'W', scale: 1e-1 },
  0x2B: { unit: 'W', scale: 1 }, 0x2C: { unit: 'W', scale: 1e1 }, 0x2D: { unit: 'W', scale: 1e2 },
  0x2E: { unit: 'W', scale: 1e3 },
  0x38: { unit: 'm³/h', scale: 1e-6 }, 0x39: { unit: 'm³/h', scale: 1e-5 }, 0x3A: { unit: 'm³/h', scale: 1e-4 },
  0x3B: { unit: 'm³/h', scale: 1e-3 }, 0x3C: { unit: 'm³/h', scale: 1e-2 }, 0x3D: { unit: 'm³/h', scale: 1e-1 },
  0x58: { unit: '°C', scale: 1e-3 }, 0x59: { unit: '°C', scale: 1e-2 }, 0x5A: { unit: '°C', scale: 1e-1 },
  0x5B: { unit: '°C', scale: 1 },
  0x5C: { unit: '°C', scale: 1e-3 }, 0x5D: { unit: '°C', scale: 1e-2 }, // Return temp
  0x60: { unit: '°C', scale: 1e-3 }, 0x61: { unit: '°C', scale: 1e-2 }, // Temp diff
  0x6C: { unit: 'date', scale: 1 }, 0x6D: { unit: 'datetime', scale: 1 },
};

class MBusReader {
  constructor(config) {
    this.type = config.type;
    this.config = config;
    this.connection = null;
  }

  async connect() {
    if (this.type === 'tcp') {
      return this.connectTcp();
    }
    return this.connectSerial();
  }

  connectTcp() {
    return new Promise((resolve, reject) => {
      this.connection = new net.Socket();
      this.connection.connect(this.config.port, this.config.host, resolve);
      this.connection.on('error', reject);
    });
  }

  connectSerial() {
    return new Promise((resolve, reject) => {
      this.connection = new SerialPort({
        path: this.config.path,
        baudRate: this.config.baudRate || 2400,
        dataBits: 8, stopBits: 1, parity: 'even'
      });
      this.connection.on('open', resolve);
      this.connection.on('error', reject);
    });
  }

  buildSndNke(address) {
    return Buffer.from([0x10, 0x40, address, (0x40 + address) & 0xFF, 0x16]);
  }

  buildReqUd2(address) {
    const fcb = 0x5B;
    return Buffer.from([0x10, fcb, address, (fcb + address) & 0xFF, 0x16]);
  }

  async sendReceive(frame, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const timer = setTimeout(() => {
        this.connection.removeAllListeners('data');
        reject(new Error('Timeout'));
      }, timeout);

      const onData = (data) => {
        chunks.push(data);
        const response = Buffer.concat(chunks);
        if (response.length > 0 && response[response.length - 1] === 0x16) {
          clearTimeout(timer);
          this.connection.removeListener('data', onData);
          resolve(response);
        }
      };
      this.connection.on('data', onData);
      this.connection.write(frame);
    });
  }

  async readDevice(address) {
    try {
      await this.sendReceive(this.buildSndNke(address), 1000).catch(() => {});
      const response = await this.sendReceive(this.buildReqUd2(address));
      return this.parseResponse(response);
    } catch (err) {
      return { error: err.message };
    }
  }

  parseResponse(buffer) {
    if (buffer.length < 10) return { error: 'Invalid response' };
    if (buffer[0] !== 0x68) return { error: 'Not a long frame' };

    const length = buffer[1];
    const data = {
      raw: buffer.toString('hex'),
      address: buffer[5],
      ci: buffer[6],
      records: []
    };

    // CI=0x72 (114) = RSP_UD with variable data
    if (buffer[6] === 0x72) {
      // Fixed data header: 12 bytes after CI
      const fixedHeader = buffer.slice(7, 19);
      data.id = fixedHeader.slice(0, 4).reverse().toString('hex');
      data.manufacturer = String.fromCharCode(
        ((fixedHeader[4] & 0x1F) + 64),
        (((fixedHeader[4] >> 5) | ((fixedHeader[5] & 0x03) << 3)) + 64),
        ((fixedHeader[5] >> 2) + 64)
      );
      data.version = fixedHeader[6];
      data.medium = this.getMedium(fixedHeader[7]);
      data.accessNo = fixedHeader[8];
      data.status = fixedHeader[9];

      // Parse variable data records starting at offset 19
      data.records = this.parseVariableData(buffer.slice(19, 4 + length));
    }

    return data;
  }

  getMedium(code) {
    const mediums = { 0x00: 'Other', 0x01: 'Oil', 0x02: 'Electricity', 0x03: 'Gas',
      0x04: 'Heat', 0x05: 'Steam', 0x06: 'Hot Water', 0x07: 'Water', 0x08: 'HCA',
      0x09: 'Compressed Air', 0x0A: 'Cooling Load (Out)', 0x0B: 'Cooling Load (In)',
      0x0C: 'Heat (In)', 0x0D: 'Heat/Cooling', 0x0E: 'Bus', 0x0F: 'Unknown' };
    return mediums[code] || 'Unknown';
  }

  parseVariableData(payload) {
    const records = [];
    let i = 0;

    while (i < payload.length - 1) {
      const dif = payload[i++];
      if (dif === 0x0F || dif === 0x1F) break; // End of data

      // Get data length from DIF
      const dataLen = this.getDataLength(dif & 0x0F);
      if (dataLen === 0) continue;

      // Handle DIFE (extension)
      while (i < payload.length && (payload[i - 1] & 0x80)) i++;

      if (i >= payload.length) break;
      let vif = payload[i++];
      const vifBase = vif & 0x7F;

      // Handle VIFE (extension)
      while (i < payload.length && (payload[i - 1] & 0x80)) i++;

      if (i + dataLen > payload.length) break;

      // Extract value
      const valueBytes = payload.slice(i, i + dataLen);
      i += dataLen;

      let value = 0;
      if (dif & 0x04) { // BCD
        value = this.bcdToNumber(valueBytes);
      } else {
        for (let j = 0; j < valueBytes.length; j++) {
          value |= valueBytes[j] << (8 * j);
        }
        // Handle signed values
        if (dataLen === 2 && value > 0x7FFF) value -= 0x10000;
        if (dataLen === 4 && value > 0x7FFFFFFF) value -= 0x100000000;
      }

      const vifInfo = VIF_UNITS[vifBase] || { unit: `VIF:${vifBase.toString(16)}`, scale: 1 };
      const scaledValue = value * vifInfo.scale;

      records.push({
        dif: dif.toString(16),
        vif: vif.toString(16),
        unit: vifInfo.unit,
        rawValue: value,
        value: scaledValue,
        display: `${scaledValue.toFixed(3)} ${vifInfo.unit}`
      });
    }

    return records;
  }

  getDataLength(difData) {
    const lengths = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 6, 7: 8,
      8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 6, 14: 8, 15: 0 };
    return lengths[difData] || 0;
  }

  bcdToNumber(bytes) {
    let result = 0;
    let multiplier = 1;
    for (const byte of bytes) {
      result += (byte & 0x0F) * multiplier;
      multiplier *= 10;
      result += ((byte >> 4) & 0x0F) * multiplier;
      multiplier *= 10;
    }
    return result;
  }

  disconnect() {
    if (this.connection) {
      this.type === 'tcp' ? this.connection.destroy() : this.connection.close();
    }
  }
}

module.exports = MBusReader;
