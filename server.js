require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const AGENT_ID = process.env.TWIN_AGENT_ID || process.env.AGENT_ID;
const API_KEY = process.env.TWIN_API_KEY || process.env.API_KEY;
const BASE_URL = process.env.BASE_URL || 'https://build.twin.so';

const isConfigured = () =>
  AGENT_ID && AGENT_ID !== 'YOUR_AGENT_ID' &&
  API_KEY && API_KEY !== 'YOUR_API_KEY';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (_req, res) => {
  res.json({ configured: isConfigured() });
});

app.post('/api/runs', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'الأسرار غير مُعدّة. أضف TWIN_AGENT_ID و TWIN_API_KEY' });
  }

  try {
    const twinRes = await fetch(`${BASE_URL}/v1/agents/${AGENT_ID}/runs`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await twinRes.json();
    res.status(twinRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/runs/:runId/events', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'الأسرار غير مُعدّة' });
  }

  const limit = req.query.limit || '100';

  try {
    const twinRes = await fetch(
      `${BASE_URL}/v1/agents/${AGENT_ID}/runs/${req.params.runId}/events?limit=${limit}`,
      { headers: { 'x-api-key': API_KEY } }
    );

    const data = await twinRes.json();
    res.status(twinRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`المحلل المالي يعمل على http://localhost:${PORT}`);
  if (!isConfigured()) {
    console.warn('تحذير: أضف TWIN_AGENT_ID و TWIN_API_KEY في .env أو GitHub Secrets');
  }
});
