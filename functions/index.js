const functions = require('firebase-functions');
const https = require('https');

exports.kommoProxy = functions.https.onRequest((req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Kommo-Token');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const token = req.headers['x-kommo-token'] || '';
  const path = req.query.path || '/api/v4/leads?filter[custom_fields_values][1109935]=1&limit=50';

  const options = {
    hostname: 'marcelofodorcl.kommo.com',
    path: path,
    headers: { 'Authorization': 'Bearer ' + token }
  };

  https.get(options, (kommoRes) => {
    let data = '';
    kommoRes.on('data', chunk => data += chunk);
    kommoRes.on('end', () => {
      res.status(kommoRes.statusCode).set('Content-Type', 'application/json').send(data);
    });
  }).on('error', e => res.status(500).json({ error: e.message }));
});
