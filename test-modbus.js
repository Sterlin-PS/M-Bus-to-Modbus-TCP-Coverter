const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function test() {
  const host = process.argv[2] || '127.0.0.1';
  const port = parseInt(process.argv[3]) || 5021;
  const unitId = parseInt(process.argv[4]) || 1;
  const startReg = parseInt(process.argv[5]) || 0;
  const count = parseInt(process.argv[6]) || 40;

  try {
    await client.connectTCP(host, { port });
    client.setID(unitId);
    console.log(`Connected to ${host}:${port}, Unit ID: ${unitId}\n`);

    const data = await client.readHoldingRegisters(startReg, count);
    console.log('Raw registers:', data.data);
    console.log('\n--- Decoded FLOAT32 values (Big Endian) ---\n');

    for (let i = 0; i < data.data.length; i += 2) {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(data.data[i], 0);
      buf.writeUInt16BE(data.data[i + 1], 2);
      const value = buf.readFloatBE(0);
      if (value !== 0) {
        console.log(`Reg ${startReg + i}-${startReg + i + 1}: ${value}`);
      }
    }

    client.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

console.log('Usage: node test-modbus.js [host] [port] [unitId] [startReg] [count]');
console.log('Example: node test-modbus.js 127.0.0.1 5021 1 0 40\n');
test();
