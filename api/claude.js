const https = require('https');

// Verifica o token Firebase E se o usuário é aprovado (admin ou membro aprovado da comunidade)
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyALZguDLc-eqlQO1oq0SXFnPw-xfLIM9y8';
const ADMIN_EMAILS = ['camposwalter@gmail.com', 'walter@camposhq.com'];
async function verifyFirebaseToken(req) {
  const auth = req.headers.authorization || '';
  const idToken = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
  if (!idToken) return false;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
      method: 'POST',
      // a chave web do Firebase tem restrição de referer — o servidor precisa se identificar como o app
      headers: { 'Content-Type': 'application/json', 'Referer': 'https://camposhq.vercel.app/' },
      body: JSON.stringify({ idToken })
    });
    if (!r.ok) return false;
    const data = await r.json();
    const user = data.users && data.users[0];
    if (!user) return false;
    if (ADMIN_EMAILS.indexOf((user.email || '').toLowerCase()) !== -1) return true;
    // usuário comum: precisa estar aprovado na comunidade (criar conta no Auth é aberto,
    // então login válido não basta — o doc community/{uid} com approved:true é o crachá)
    const d = await fetch('https://firestore.googleapis.com/v1/projects/myhealth-app-d8acf/databases/(default)/documents/community/' + user.localId, {
      headers: { 'Authorization': 'Bearer ' + idToken }
    });
    if (!d.ok) return false;
    const doc = await d.json();
    return !!(doc.fields && doc.fields.approved && doc.fields.approved.booleanValue === true);
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
