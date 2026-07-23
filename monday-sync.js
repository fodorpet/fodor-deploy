#!/usr/bin/env node
// Fodor Spa — Monday Sync
// Sincroniza el board de Producción de Monday.com → Firebase Realtime Database
// Uso: node monday-sync.js
// Deja corriendo en terminal mientras usas el panel

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Configuración ────────────────────────────────────────────────────────────

// Lee el token desde monday-token.txt (mismo directorio que este script)
// Si no existe, muestra instrucciones y sale
const TOKEN_FILE = path.join(__dirname, 'monday-token.txt');
let MONDAY_TOKEN;
try {
  MONDAY_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!MONDAY_TOKEN) throw new Error('archivo vacío');
} catch(e) {
  console.error('');
  console.error('❌ Token de Monday no encontrado.');
  console.error('');
  console.error('👉 Pasos para configurarlo:');
  console.error('   1. Abre Monday.com → tu perfil → Developers → My Access Tokens');
  console.error('   2. Copia tu Personal API Token');
  console.error('   3. Crea el archivo: ~/fodor-deploy/monday-token.txt');
  console.error('   4. Pega el token y guarda');
  console.error('   5. Vuelve a ejecutar este script');
  console.error('');
  process.exit(1);
}
const BOARD_ID     = '8456772703'; // Producción
const FIREBASE_DB  = 'odfor-bae97-default-rtdb.firebaseio.com';
const INTERVALO_MS = 10 * 60 * 1000; // 10 minutos

// IDs de columnas del board de Producción
const COL = {
  cantidad:    'n_meros_mkn2385r',
  estado:      'label_mkn2xk8b',
  entrega:     'date_mm0ebcyh',
  entrega2:    'dup__of_fecha_emisi_n_mkn29vyx',
  maquina:     'label_mkn33zej',
  kommoRef:    'texto_mkn2xj3e',
  cliente:     'dup__of_kommo_mkn2q4d',   // Nombre del cliente/logo
  descripcion: 'long_text_mks9gkcq'        // Descripción adicional
};

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': buf.length }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpsPut(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname, path, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─── Monday API ──────────────────────────────────────────────────────────────

async function fetchMondayItems() {
  const gqlQuery = `{
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 500) {
        items {
          id
          name
          column_values { id text }
        }
      }
    }
  }`;

  const res = await httpsPost(
    'api.monday.com',
    '/v2',
    {
      'Authorization': MONDAY_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-01'
    },
    JSON.stringify({ query: gqlQuery })
  );

  if (res.status !== 200) {
    throw new Error(`Monday respondió HTTP ${res.status}: ${res.body.substring(0, 200)}`);
  }

  let data;
  try { data = JSON.parse(res.body); } catch(e) {
    throw new Error('Respuesta Monday no es JSON válido');
  }

  if (data.errors) {
    throw new Error('Error GraphQL Monday: ' + JSON.stringify(data.errors[0]));
  }

  const page = data.data &&
               data.data.boards &&
               data.data.boards[0] &&
               data.data.boards[0].items_page;

  const items = (page && page.items) || [];

  return items.map(item => {
    const cv = {};
    (item.column_values || []).forEach(c => { cv[c.id] = c.text || ''; });
    return {
      id:          item.id,
      nombre:      item.name || '',
      cantidad:    cv[COL.cantidad]    || '',
      estado:      cv[COL.estado]      || '',
      entrega:     cv[COL.entrega]     || cv[COL.entrega2] || '',
      maquina:     cv[COL.maquina]     || '',
      kommoRef:    cv[COL.kommoRef]    || '',
      cliente:     cv[COL.cliente]     || '',   // Nombre del cliente/logo
      descripcion: cv[COL.descripcion] || ''    // Descripción adicional
    };
  });
}

// ─── Firebase ────────────────────────────────────────────────────────────────

async function guardarEnFirebase(items) {
  const payload = {
    items:        items,
    ultima_sync:  new Date().toISOString(),
    total:        items.length
  };
  const status = await httpsPut(
    FIREBASE_DB,
    '/monday_production.json',
    JSON.stringify(payload)
  );
  if (status !== 200) {
    throw new Error(`Firebase PUT respondió HTTP ${status}`);
  }
  return status;
}

// ─── Loop principal ──────────────────────────────────────────────────────────

function hora() {
  return new Date().toLocaleTimeString('es-CL', { hour12: false });
}

async function sync() {
  console.log(`[${hora()}] 📋 Sincronizando Monday → Firebase…`);
  try {
    const items = await fetchMondayItems();
    await guardarEnFirebase(items);
    const activos = items.filter(i => {
      const est = (i.estado || '').toLowerCase();
      return !['completado','terminado','listo','entregado','cancelado','anulado'].some(e => est.includes(e));
    }).length;
    console.log(`[${hora()}] ✅ ${items.length} ítems sincronizados (${activos} activos)`);
  } catch(e) {
    console.error(`[${hora()}] ❌ Error: ${e.message}`);
  }
}

// ─── Inicio ──────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════');
console.log('  Fodor Spa — Monday Sync');
console.log('  Board: Producción (' + BOARD_ID + ')');
console.log('  → Firebase: monday_production');
console.log('  Intervalo: 10 minutos');
console.log('  Ctrl+C para detener');
console.log('══════════════════════════════════════════════');

sync(); // Primera sincronización inmediata
setInterval(sync, INTERVALO_MS);
