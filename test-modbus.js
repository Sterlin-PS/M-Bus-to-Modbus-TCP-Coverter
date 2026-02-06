const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function test() {
  try {
    // Connect to Modbus TCP server
    await client.connectTCP('127.0.0.1', { port: 5021 });
    client.setID(1);
    console.log('Connected to Modbus TCP port 5021\n');

    // Read holding registers (FC 03)
    // Reading 40 registers (20 FLOAT32 values)
    const data = await client.readHoldingRegisters(0, 40);

    console.log('Raw registers:', data.data);
    console.log('\n--- Decoded FLOAT32 values (Big Endian) ---\n');

    // Decode as FLOAT32 Big Endian
    for (let i = 0; i < data.data.length; i += 2) {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(data.data[i], 0);
      buf.writeUInt16BE(data.data[i + 1], 2);
      const value = buf.readFloatBE(0);
      console.log(`Reg ${i}-${i+1}: ${value}`);
    }

    client.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
