// Test M-Bus secondary addressing directly
const MBusReader = require('./lib/MBusReader');

async function test() {
  const mbus = new MBusReader({
    type: 'serial',
    path: '/dev/ttyUSB0',
    baudRate: 2400
  });

  try {
    await mbus.connect();
    console.log('Connected to M-Bus\n');

    // Test with secondary address (meter ID)
    // Use your meter's ID or wildcards like "FFFFFFFF" to find any device
    const meterId = process.argv[2] || '66786758';
    console.log(`Reading meter with secondary address: ${meterId}\n`);

    const data = await mbus.readDeviceSecondary(meterId);

    if (data.error) {
      console.log('Error:', data.error);
    } else {
      console.log('Meter ID:', data.id);
      console.log('Manufacturer:', data.manufacturer);
      console.log('Medium:', data.medium);
      console.log('Records:', data.records?.length || 0);
      console.log('\n--- Values ---\n');
      data.records?.forEach((r, i) => {
        console.log(`[${i}] ${r.value} ${r.unit}`);
      });
    }

    mbus.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
