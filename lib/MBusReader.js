const net = require('net');
const { SerialPort } = require('serialport');

class MBusReader {
  constructor(config) {
    this.type = config.type; // 'serial' or 'tcp'
    this.config = config;
    this.connection = null;
  }

  async connect() {
    if (this.type === 'tcp') {
      return this.connectTcp();
    } else {
      return this.connectSerial();
    }
  }

  connectTcp() {
    return new Promise((resolve, reject) => {
      this.connection = new net.Socket();
      this.connection.connect(this.config.port, this.config.host, () => {
        resolve();
      });
      this.connection.on('error', reject);
    });
  }

  connectSerial() {
    return new Promise((resolve, reject) => {
      this.connection = new SerialPort({
        path: this.config.path,
        baudRate: this.config.baudRate || 2400,
        dataBits: 8,
        stopBits: 1,
        parity: 'even'
      });
      this.connection.on('open', resolve);
      this.connection.on('error', reject);
    });
  }

  // M-Bus SND_NKE (initialization)
  buildSndNke(address) {
    const frame = Buffer.from([0x10, 0x40, address, 0x40 + address, 0x16]);
    return frame;
  }

  // M-Bus REQ_UD2 (request user data)
  buildReqUd2(address) {
    const fcb = 0x5B; // FCB=1, FCV=1, REQ_UD2
    const checksum = (fcb + address) & 0xFF;
    return Buffer.from([0x10, fcb, address, checksum, 0x16]);
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
        // Check for complete M-Bus frame (ends with 0x16)
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
      // Initialize
      await this.sendReceive(this.buildSndNke(address), 1000).catch(() => {});

      // Request data
      const response = await this.sendReceive(this.buildReqUd2(address));
      return this.parseResponse(response);
    } catch (err) {
      return { error: err.message };
    }
  }

  parseResponse(buffer) {
    if (buffer.length < 10) return { error: 'Invalid response' };

    // Basic M-Bus long frame parsing
    const data = {
      raw: buffer.toString('hex'),
      records: []
    };

    // Skip header, parse data records (simplified)
    // Full parsing would require complete M-Bus variable data structure handling
    if (buffer[0] === 0x68) { // Long frame
      const length = buffer[1];
      const cField = buffer[4];
      const aField = buffer[5];
      const ciField = buffer[6];

      data.length = length;
      data.address = aField;
      data.ci = ciField;

      // Extract payload for further processing
      const payload = buffer.slice(7, 7 + length - 3);
      data.payload = payload.toString('hex');
    }

    return data;
  }

  disconnect() {
    if (this.connection) {
      if (this.type === 'tcp') {
        this.connection.destroy();
      } else {
        this.connection.close();
      }
    }
  }
}

module.exports = MBusReader;
