const https = require('https');

// Tipos de dados permitidos (evita proxy aberto para a API da Oura)
const ALLOWED_TYPES = ['daily_sleep', 'sleep', 'daily_readiness', 'daily_activity'];

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.OURA_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Oura token not configured' });
  }

  const type = req.query.type || 'daily_sleep';
  if (ALLOWED_TYPES.indexOf(type) === -1) {
    return res.status(400).json({ error: 'Invalid type. Allowed: ' + ALLOWED_TYPES.join(', ') });
  }

  // Período: por padrão os últimos 7 dias
  const end = req.query.end || new Date().toISOString().slice(0, 10);
  const start = req.query.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
  }

  return new Promise(function(resolve) {
    const options = {
      hostname: 'api.ouraring.com',
      path: '/v2/usercollection/' + type + '?start_date=' + start + '&end_date=' + end,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };

    const apiReq = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk) { data += chunk; });
      apiRes.on('end', function() {
        try {
          res.status(apiRes.statusCode).json(JSON.parse(data));
        } catch(e) {
          res.status(500).json({ error: 'Invalid response from Oura API' });
        }
        resolve();
      });
    });

    apiReq.on('error', function(err) {
      res.status(500).json({ error: err.message });
      resolve();
    });

    apiReq.end();
  });
};
