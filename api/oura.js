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


// Tipos de dados permitidos (evita proxy aberto para a API da Oura)
const ALLOWED_TYPES = ['daily_sleep', 'sleep', 'daily_readiness', 'daily_activity'];

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await verifyFirebaseToken(req))) {
    return res.status(401).json({ error: 'Não autorizado — faça login no app' });
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
