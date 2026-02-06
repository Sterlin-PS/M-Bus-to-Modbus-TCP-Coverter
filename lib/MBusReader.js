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
  0x5C: { unit: '°C', scale: 1e-3 }, 0x5D: { unit: '°C', scale: 1e-2 },
  0x60: { unit: '°C', scale: 1e-3 }, 0x61: { unit: '°C', scale: 1e-2 },
  0x6C: { unit: 'date', scale: 1 }, 0x6D: { unit: 'datetime', scale: 1 },
};

class MBusReader {
  constructor(config) {
    this.type = config.type;
    this.config = config;
    this.connection = null;
  }

  async connect() {
    console.log(`  M-Bus connect: ${this.type} ${this.type === 'tcp' ? this.config.host + ':' + this.config.port : this.config.path}`);
    if (this.type === 'tcp') {
      return this.connectTcp();
    }
    return this.connectSerial();
  }

  connectTcp() {
    return new Promise((resolve, reject) => {
      this.connection = new net.Socket();
      this.connection.connect(this.config.port, this.config.host, () => {
        console.log(`  TCP connected`);
        resolve();
      });
      this.connection.on('error', (err) => {
        console.log(`  TCP error: ${err.message}`);
        reject(err);
      });
    });
  }

  connectSerial() {
    return new Promise((resolve, reject) => {
      this.connection = new SerialPort({
        path: this.config.path,
        baudRate: this.config.baudRate || 2400,
        dataBits: 8, stopBits: 1, parity: 'even'
      });
      this.connection.on('open', () => {
        console.log(`  Serial opened: ${this.config.path} @ ${this.config.baudRate || 2400}`);
        resolve();
      });
      this.connection.on('error', (err) => {
        console.log(`  Serial error: ${err.message}`);
        reject(err);
      });
    });
  }

  // Primary address frames
  buildSndNke(address) {
    return Buffer.from([0x10, 0x40, address, (0x40 + address) & 0xFF, 0x16]);
  }

  buildReqUd2(address) {
    const fcb = 0x5B;
    return Buffer.from([0x10, fcb, address, (fcb + address) & 0xFF, 0x16]);
  }

  // Secondary address selection frame
  // secondaryAddr format: "12345678" (8 hex digits) or with wildcards "1234FFFF"
  buildSelectSecondary(secondaryAddr) {
    // Secondary address selection uses address 253 (0xFD)
    // CI = 0x52 (selection)
    // Then 8 bytes: ID (4 bytes BCD), Manufacturer (2 bytes), Version (1), Medium (1)
    // For wildcard matching, use 0xFF for unknown bytes

    const addrBytes = this.parseSecondaryAddress(secondaryAddr);

    // Long frame: 68 L L 68 C A CI [data] CS 16
    const data = Buffer.alloc(8);
    // ID in BCD (reversed)
    data[0] = addrBytes[3];
    data[1] = addrBytes[2];
    data[2] = addrBytes[1];
    data[3] = addrBytes[0];
    // Manufacturer, version, medium = wildcards
    data[4] = 0xFF;
    data[5] = 0xFF;
    data[6] = 0xFF;
    data[7] = 0xFF;

    const length = 3 + data.length; // C + A + CI + data
    const cField = 0x53; // SND_UD
    const aField = 0xFD; // Secondary addressing
    const ciField = 0x52; // Selection

    const frame = Buffer.alloc(4 + length + 2);
    frame[0] = 0x68;
    frame[1] = length;
    frame[2] = length;
    frame[3] = 0x68;
    frame[4] = cField;
    frame[5] = aField;
    frame[6] = ciField;
    data.copy(frame, 7);

    // Checksum
    let cs = cField + aField + ciField;
    for (let i = 0; i < data.length; i++) cs += data[i];
    frame[frame.length - 2] = cs & 0xFF;
    frame[frame.length - 1] = 0x16;

    return frame;
  }

  parseSecondaryAddress(addr) {
    // Parse "12345678" or "1234FFFF" into bytes
    // Returns 4 bytes in BCD format
    const bytes = [];
    const clean = addr.replace(/[^0-9A-Fa-f]/g, '').padStart(8, '0').slice(0, 8);
    for (let i = 0; i < 8; i += 2) {
      const hex = clean.substr(i, 2).toUpperCase();
      if (hex === 'FF') {
        bytes.push(0xFF);
      } else {
        // Convert to BCD
        const d1 = parseInt(hex[0], 16);
        const d2 = parseInt(hex[1], 16);
        bytes.push((d1 << 4) | d2);
      }
    }
    return bytes;
  }

  async sendReceive(frame, timeout = 3000) {
    return new Promise((resolve, reject) => {
      console.log(`  TX: ${frame.toString('hex')}`);
      const chunks = [];
      const timer = setTimeout(() => {
        this.connection.removeAllListeners('data');
        console.log(`  RX: Timeout (${timeout}ms)`);
        reject(new Error('Timeout'));
      }, timeout);

      const onData = (data) => {
        chunks.push(data);
        const response = Buffer.concat(chunks);
        // Check for complete frame: single ACK (0xE5) or long frame ending with 0x16
        if (response.length === 1 && response[0] === 0xE5) {
          clearTimeout(timer);
          this.connection.removeListener('data', onData);
          console.log(`  RX: ACK (E5)`);
          resolve(response);
        } else if (response.length > 1 && response[response.length - 1] === 0x16) {
          clearTimeout(timer);
          this.connection.removeListener('data', onData);
          console.log(`  RX complete: ${response.length} bytes`);
          resolve(response);
        }
      };
      this.connection.on('data', onData);
      this.connection.write(frame);
    });
  }

  // Read using primary address (1-250)
  async readDevice(address) {
    console.log(`  M-Bus readDevice(primary: ${address})`);
    try {
      console.log(`  Sending SND_NKE...`);
      await this.sendReceive(this.buildSndNke(address), 1000).catch(() => console.log('  SND_NKE no response (ok)'));
      console.log(`  Sending REQ_UD2...`);
      const response = await this.sendReceive(this.buildReqUd2(address));
      console.log(`  Parsing response...`);
      const parsed = this.parseResponse(response);
      console.log(`  Parsed: ${parsed.records?.length || 0} records, manufacturer: ${parsed.manufacturer || 'N/A'}`);
      return parsed;
    } catch (err) {
      console.log(`  readDevice error: ${err.message}`);
      return { error: err.message };
    }
  }

  // Read using secondary address (8-digit ID with optional wildcards)
  async readDeviceSecondary(secondaryAddr) {
    console.log(`  M-Bus readDevice(secondary: ${secondaryAddr})`);
    try {
      // Step 1: Send SND_NKE to broadcast address 255
      console.log(`  Sending SND_NKE to broadcast...`);
      await this.sendReceive(this.buildSndNke(0xFF), 500).catch(() => {});

      // Step 2: Select device by secondary address
      console.log(`  Selecting secondary address ${secondaryAddr}...`);
      const selectFrame = this.buildSelectSecondary(secondaryAddr);
      const selectResp = await this.sendReceive(selectFrame, 3000);

      if (selectResp.length !== 1 || selectResp[0] !== 0xE5) {
        return { error: 'Device not found (no ACK to selection)' };
      }
      console.log(`  Device selected!`);

      // Step 3: Read data using address 253 (selected device)
      console.log(`  Sending REQ_UD2 to selected device...`);
      const response = await this.sendReceive(this.buildReqUd2(0xFD));

      // Step 4: Deselect (send SND_NKE to broadcast)
      await this.sendReceive(this.buildSndNke(0xFF), 300).catch(() => {});

      console.log(`  Parsing response...`);
      const parsed = this.parseResponse(response);
      console.log(`  Parsed: ${parsed.records?.length || 0} records, manufacturer: ${parsed.manufacturer || 'N/A'}`);
      return parsed;
    } catch (err) {
      console.log(`  readDeviceSecondary error: ${err.message}`);
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

    if (buffer[6] === 0x72) {
      const fixedHeader = buffer.slice(7, 19);
      data.id = this.bcdToString(fixedHeader.slice(0, 4).reverse());
      data.manufacturer = String.fromCharCode(
        ((fixedHeader[4] & 0x1F) + 64),
        (((fixedHeader[4] >> 5) | ((fixedHeader[5] & 0x03) << 3)) + 64),
        ((fixedHeader[5] >> 2) + 64)
      );
      data.version = fixedHeader[6];
      data.medium = this.getMedium(fixedHeader[7]);
      data.accessNo = fixedHeader[8];
      data.status = fixedHeader[9];
      data.records = this.parseVariableData(buffer.slice(19, 4 + length));
    }

    return data;
  }

  bcdToString(bytes) {
    let result = '';
    for (const byte of bytes) {
      result += ((byte >> 4) & 0x0F).toString(16);
      result += (byte & 0x0F).toString(16);
    }
    return result;
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
      if (dif === 0x0F || dif === 0x1F) break;

      const dataLen = this.getDataLength(dif & 0x0F);
      if (dataLen === 0) continue;

      while (i < payload.length && (payload[i - 1] & 0x80)) i++;

      if (i >= payload.length) break;
      let vif = payload[i++];
      const vifBase = vif & 0x7F;

      while (i < payload.length && (payload[i - 1] & 0x80)) i++;

      if (i + dataLen > payload.length) break;

      const valueBytes = payload.slice(i, i + dataLen);
      i += dataLen;

      let value = 0;
      if (dif & 0x04) {
        value = this.bcdToNumber(valueBytes);
      } else {
        for (let j = 0; j < valueBytes.length; j++) {
          value |= valueBytes[j] << (8 * j);
        }
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
