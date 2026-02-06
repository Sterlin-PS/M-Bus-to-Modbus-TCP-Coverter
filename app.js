const express = require('express');
const path = require('path');
const loopManager = require('./lib/LoopManager');
const db = require('./lib/Database');

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

// ==================== LOOP APIs ====================

app.get('/api/loops', (req, res) => {
  res.json(loopManager.getStatus());
});

app.post('/api/loops', (req, res) => {
  const { id, name, mbusType, mbusHost, mbusPort, mbusPath, baudRate, modbusPort, pollInterval } = req.body;

  try {
    const loop = loopManager.createLoop({
      id: parseInt(id),
      name,
      mbusType,
      mbusHost,
      mbusPort: parseInt(mbusPort),
      mbusPath,
      baudRate: parseInt(baudRate) || 2400,
      modbusPort: parseInt(modbusPort),
      pollInterval: parseInt(pollInterval) || 60000
    });
    res.json({ success: true, id: loop.id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/loops/:id/start', async (req, res) => {
  const result = await loopManager.startLoop(parseInt(req.params.id));
  res.json(result);
});

app.post('/api/loops/:id/stop', (req, res) => {
  loopManager.stopLoop(parseInt(req.params.id));
  res.json({ success: true });
});

app.delete('/api/loops/:id', (req, res) => {
  loopManager.deleteLoop(parseInt(req.params.id));
  res.json({ success: true });
});

// ==================== DEVICE APIs ====================

app.get('/api/loops/:id/devices', (req, res) => {
  const loop = loopManager.getLoop(parseInt(req.params.id));
  if (!loop) return res.json({ error: 'Loop not found' });
  res.json(loop.devices);
});

app.post('/api/loops/:id/devices', (req, res) => {
  const loopId = parseInt(req.params.id);
  const { name, mbusAddress, modbusUnitId } = req.body;

  try {
    const device = loopManager.addDevice(loopId, {
      name,
      mbusAddress,
      modbusUnitId: parseInt(modbusUnitId)
    });
    res.json({ success: true, device });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.delete('/api/devices/:id', (req, res) => {
  loopManager.deleteDevice(parseInt(req.params.id));
  res.json({ success: true });
});

// ==================== MAPPING APIs ====================

app.get('/api/devices/:id/mappings', (req, res) => {
  const mappings = db.getMappings(parseInt(req.params.id));
  res.json(mappings);
});

app.post('/api/devices/:id/mappings', (req, res) => {
  const deviceId = parseInt(req.params.id);
  const { name, mbusRecordIndex, mbusUnit, modbusRegister, dataType, scale } = req.body;

  try {
    const mapping = loopManager.addMapping(deviceId, {
      name,
      mbusRecordIndex: parseInt(mbusRecordIndex),
      mbusUnit,
      modbusRegister: parseInt(modbusRegister),
      dataType: dataType || 'FLOAT32',
      scale: parseFloat(scale) || 1.0
    });
    res.json({ success: true, mapping });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.delete('/api/mappings/:id', (req, res) => {
  loopManager.deleteMapping(parseInt(req.params.id));
  res.json({ success: true });
});

// ==================== TEST READ API ====================

app.post('/api/loops/:id/read', async (req, res) => {
  const loopId = parseInt(req.params.id);
  const loop = loopManager.getLoop(loopId);

  if (!loop) {
    return res.json({ error: 'Loop not found' });
  }

  // Create temporary M-Bus connection if loop not running
  let mbus = loop.mbus;
  let tempConnection = false;

  if (!mbus) {
    const MBusReader = require('./lib/MBusReader');
    mbus = new MBusReader(loop.mbusConfig);
    try {
      await mbus.connect();
      tempConnection = true;
    } catch (err) {
      return res.json({ error: 'M-Bus connect failed: ' + err.message });
    }
  }

  const address = req.body.address || '1';
  console.log(`[Loop ${loopId}] Test read address ${address}...`);

  try {
    let data;
    if (address.toString().length > 3) {
      data = await mbus.readDeviceSecondary(address.toString());
    } else {
      data = await mbus.readDevice(parseInt(address));
    }

    if (tempConnection) mbus.disconnect();

    console.log(`[Loop ${loopId}] Test read result:`, data.error || `${data.records?.length || 0} records`);
    res.json(data);
  } catch (err) {
    if (tempConnection) mbus.disconnect();
    res.json({ error: err.message });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('M-Bus to Modbus Converter');
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('');
});
