const https = require('https');

// Verifica o token Firebase do usuário logado (app é invite-only)
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyALZguDLc-eqlQO1oq0SXFnPw-xfLIM9y8';
async function verifyFirebaseToken(req) {
  const auth = req.headers.authorization || '';
  const idToken = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
  if (!idToken) return false;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!r.ok) return false;
    const data = await r.json();
    return !!(data.users && data.users.length);
  } catch (e) { return false; }
}


module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await verifyFirebaseToken(req))) {
    return res.status(401).json({ error: 'Não autorizado — faça login no app' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  return new Promise(function(resolve) {
    const body = JSON.stringify(req.body);

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    };

    const apiReq = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk) { data += chunk; });
      apiRes.on('end', function() {
        try {
          res.status(apiRes.statusCode).json(JSON.parse(data));
        } catch(e) {
          res.status(500).json({ error: 'Invalid response from Anthropic API' });
        }
        resolve();
      });
    });

    apiReq.on('error', function(err) {
      res.status(500).json({ error: err.message });
      resolve();
    });

    apiReq.write(body);
    apiReq.end();
  });
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
