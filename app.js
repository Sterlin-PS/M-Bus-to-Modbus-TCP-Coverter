const express = require('express');
const path = require('path');
const loopManager = require('./lib/LoopManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard
app.get('/', (req, res) => {
  res.render('dashboard', { loops: loopManager.getStatus() });
});

// API: Get all loops status
app.get('/api/loops', (req, res) => {
  res.json(loopManager.getStatus());
});

// API: Add new loop
app.post('/api/loops', (req, res) => {
  const { id, name, mbusType, mbusHost, mbusPort, mbusPath, baudRate, modbusPort, pollInterval, mbusAddress } = req.body;

  const config = {
    id: parseInt(id),
    name,
    modbusPort: parseInt(modbusPort),
    pollInterval: parseInt(pollInterval) || 60000,
    mbus: mbusType === 'tcp'
      ? { type: 'tcp', host: mbusHost, port: parseInt(mbusPort) }
      : { type: 'serial', path: mbusPath, baudRate: parseInt(baudRate) || 2400 },
    devices: [{ address: parseInt(mbusAddress) || 1, registerOffset: 0 }]
  };

  loopManager.addLoop(config);
  res.json({ success: true, id: config.id });
});

// API: Start loop
app.post('/api/loops/:id/start', async (req, res) => {
  const result = await loopManager.startLoop(parseInt(req.params.id));
  res.json(result);
});

// API: Stop loop
app.post('/api/loops/:id/stop', (req, res) => {
  loopManager.stopLoop(parseInt(req.params.id));
  res.json({ success: true });
});

// API: Delete loop
app.delete('/api/loops/:id', (req, res) => {
  loopManager.removeLoop(parseInt(req.params.id));
  res.json({ success: true });
});

// API: Read M-Bus device (test read)
app.post('/api/loops/:id/read', async (req, res) => {
  const loopId = parseInt(req.params.id);
  const loop = loopManager.getLoop(loopId);
  console.log(`[Loop ${loopId}] Test read requested`);

  if (!loop) {
    console.log(`[Loop ${loopId}] Loop not found`);
    return res.json({ error: 'Loop not found' });
  }
  if (!loop.mbus) {
    console.log(`[Loop ${loopId}] M-Bus not connected, connecting now...`);
    // Try to connect for test read even if loop not started
    const MBusReader = require('./lib/MBusReader');
    loop.mbus = new MBusReader(loop.mbusConfig);
    try {
      await loop.mbus.connect();
      console.log(`[Loop ${loopId}] M-Bus connected`);
    } catch (err) {
      console.log(`[Loop ${loopId}] M-Bus connect error:`, err.message);
      return res.json({ error: 'M-Bus connect failed: ' + err.message });
    }
  }

  const address = parseInt(req.body.address) || 1;
  console.log(`[Loop ${loopId}] Reading M-Bus address ${address}...`);

  try {
    const data = await loop.mbus.readDevice(address);
    console.log(`[Loop ${loopId}] Read result:`, data.error || `${data.records?.length || 0} records`);
    if (data.records) {
      data.records.forEach((r, i) => console.log(`  [${i}] ${r.value} ${r.unit}`));
      // Also update Modbus registers from test read
      if (loop.modbus) {
        loop.mapToRegisters(data.records, 0);
        console.log(`[Loop ${loopId}] Updated Modbus registers`);
      }
    }
    loop.lastData = data;
    res.json(data);
  } catch (err) {
    console.log(`[Loop ${loopId}] Read error:`, err.message);
    res.json({ error: err.message });
  }
});

// API: Get registers for a loop
app.get('/api/loops/:id/registers', (req, res) => {
  const loop = loopManager.getLoop(parseInt(req.params.id));
  if (!loop) return res.json({ error: 'Loop not found' });
  res.json(loop.getStatus());
});

// Add mapping to loop
app.post('/api/loops/:id/mappings', (req, res) => {
  const loop = loopManager.getLoop(parseInt(req.params.id));
  if (!loop) return res.json({ error: 'Loop not found' });

  const mapping = {
    mbusAddress: parseInt(req.body.mbusAddress),
    registers: [{
      address: parseInt(req.body.registerAddress),
      type: req.body.registerType || 'int16',
      testValue: parseFloat(req.body.testValue) || 0
    }]
  };

  loop.mappings.push(mapping);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log(`M-Bus to Modbus Converter`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('');
});
