#!/usr/bin/env node
// Fodor Spa — Kommo Sync (token incluido)
// Uso: node kommo-sync.js
// Deja corriendo en terminal mientras usas Fodor

const https = require('https');

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjU3NjQzYjE1ZDliYjc0YjFkNTY5YzM5NDJlMjYyN2IxYTg3NmZiNmRkNDMwOTMwZTNhZGRmY2QzMmJkMjJkOTM5YmRmNTFjY2VjNGYzM2EyIn0.eyJhdWQiOiI2OWYzNGRmYi02N2ExLTQ2MTgtODIwNy1hNWQzODI0YjQ0NTEiLCJqdGkiOiI1NzY0M2IxNWQ5YmI3NGIxZDU2OWMzOTQyZTI2MjdiMWE4NzZmYjZkZDQzMDkzMGUzYWRkZmNkMzJiZDIyZDkzOWJkZjUxY2NlYzRmMzNhMiIsImlhdCI6MTc4NDMxODc3NywibmJmIjoxNzg0MzE4Nzc3LCJleHAiOjE3ODU0NTYwMDAsInN1YiI6IjExNTQ4MjMxIiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjMzMTI5MjU5LCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiLCJ1c2Vyc19hY3RpdmF0ZSIsInVzZXJzX2FkZCIsInVzZXJzX2RlYWN0aXZhdGUiXSwiaGFzaF91dWlkIjoiZDJkMTYyYzQtYzliMC00YjRmLTk3ZjEtNTFiZWJiNDk5MWJhIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.BWDJCwMneQqsUnlpMgc3fvYgctxqBRrnQ6-tw5dE1K2-QDtJmwISb4PalhJfIplrJcAwQM2iqSg-R_VgKIuQN3Gg7lijcXqWRDS5wP8qWTryLr9W_JybWfuU6GQUYEIsJtkMLqipS3FC4kAMcxBonR7HmlFiaZr3ZY2hYK2OP12cpMZMx2jaOgePNBhYZYSk5wRIoRJlxhuPm0CHW_SEX9f3seBOVOTEUUgtg1f5QdW24q3Fr78iyyYsoqrmVpZkyxArqQuUtT77vWxvmZ3wSrzlP1GjHVRSshnJyzIVYhYQNA1GJxdy1SAPiEKrcKn6-S9ssBtEP-liDEorWZUcEA';

const KOMMO_DOMAIN  = 'marcelofodorcl.kommo.com';
const FIELD_ENVIOS  = 1109935;   // toggle ENVÍOS
const FIELD_PAGO    = 1109811;   // toggle PAGÓ
const FIELD_FACTURA = 1092676;   // N° de Factura (text, campo principal)
const FIELD_FACT2   = 1088773;   // N°Factura (textarea, alternativo)
const FIREBASE_DB   = 'odfor-bae97-default-rtdb.firebaseio.com';

// Ventana de detección: solo alertar PAGÓ marcado en los últimos 7 días
const VENTANA_DIAS  = 7;

// Mapa: leadId → timestamp (ms) de la última vez que fue alertado
// Permite re-alertar si el lead fue actualizado en Kommo DESPUÉS de la última alerta
const pagosAlertados = new Map();

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function httpsPut(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request({
      hostname, path, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// PATCH: actualiza solo el nodo indicado sin borrar los demás hermanos en Firebase
function httpsPatch(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request({
      hostname, path, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─── Helpers de campo Kommo ──────────────────────────────────────────────────

function getCampo(lead, fieldId) {
  const fields = lead.custom_fields_values || [];
  const f = fields.find(f => f.field_id == fieldId);
  return (f && f.values && f.values.length > 0) ? f.values[0].value : null;
}

function esCheckboxTrue(lead, fieldId) {
  const v = getCampo(lead, fieldId);
  return v === true || v === 'true' || v === 1;
}

// ─── Cargar alertas previas desde Firebase ───────────────────────────────────

async function cargarAlertasPrevias() {
  try {
    const r = await httpsGet(FIREBASE_DB, '/kommo_pagos_alertas.json', {});
    if (r.status === 200 && r.body && r.body !== 'null') {
      const data = JSON.parse(r.body);
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(id => {
          // Guardar timestamp de la última alerta para comparar con updated_at de Kommo
          const ts = data[id].ts ? new Date(data[id].ts).getTime() : 0;
          pagosAlertados.set(String(id), ts);
        });
        console.log('   📋 Alertas PAGÓ previas cargadas:', pagosAlertados.size);
      }
    }
  } catch(e) {
    console.log('   ⚠️  No se pudieron cargar alertas previas:', e.message);
  }
}

// ─── Sync principal ──────────────────────────────────────────────────────────

async function sync() {
  await procesarResetsPago();
  await procesarResetsEnvio();
  const ts = new Date().toLocaleTimeString('es-CL');
  process.stdout.write('[' + ts + '] Consultando Kommo... ');
  try {
    // Paginar para obtener TODOS los leads (no solo los 250 más recientes)
    const allLeads = [];
    let page = 1;
    const MAX_PAGES = 10; // máximo 2500 leads
    while (page <= MAX_PAGES) {
      const r = await httpsGet(KOMMO_DOMAIN,
        '/api/v4/leads?limit=250&page=' + page + '&with=contacts,custom_fields_values&order[updated_at]=desc',
        { 'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'FodorSpa/1.0' }
      );
      if (r.status === 401) { console.log('❌ Token expirado'); return; }
      if (r.status !== 200) { console.log('❌ HTTP', r.status); break; }
      const kommo = JSON.parse(r.body);
      const pageLeads = (kommo._embedded && kommo._embedded.leads) ? kommo._embedded.leads : [];
      allLeads.push(...pageLeads);
      if (pageLeads.length < 250) break; // última página
      page++;
    }

    // ── ENVÍOS: lógica original, sin cambios ───────────────────────────────
    const leadsEnvios = allLeads.filter(lead => esCheckboxTrue(lead, FIELD_ENVIOS));
    const payloadEnvios = JSON.stringify({
      leads: leadsEnvios,
      updated: new Date().toISOString(),
      count: leadsEnvios.length
    });
    const fbEnvios = await httpsPut(FIREBASE_DB, '/kommo_envios.json', payloadEnvios);
    process.stdout.write('✅ ' + leadsEnvios.length + '/' + allLeads.length + ' ENVÍOS ');

    // ── PAGÓ: detectar nuevos pagos ────────────────────────────────────────
    // Solo considerar leads actualizados en los últimos VENTANA_DIAS días
    // Esto evita generar alertas para pagos históricos en la primera ejecución
    const umbralSeg = Math.floor(Date.now() / 1000) - (VENTANA_DIAS * 24 * 3600);

    const candidatosPago = allLeads.filter(lead =>
      esCheckboxTrue(lead, FIELD_PAGO) &&
      (lead.updated_at || 0) >= umbralSeg
    );

    // Pre-fetch teléfonos de contactos vinculados a los candidatos PAGÓ
    const _contactIds = [];
    candidatosPago.forEach(function(lead) {
      const emb = (lead._embedded && lead._embedded.contacts) || [];
      if (emb.length > 0 && emb[0].id) _contactIds.push(String(emb[0].id));
    });
    const phoneMap = await fetchContactPhones(_contactIds);

    let nuevosAlertas = 0;
    for (const lead of candidatosPago) {
      const leadKey = String(lead.id);
      const ultimaAlertaMs = pagosAlertados.get(leadKey) || 0;
      const leadActualizadoMs = (lead.updated_at || 0) * 1000; // Kommo da segundos
      // Saltar si el lead no fue actualizado en Kommo después de la última alerta
      if (leadActualizadoMs <= ultimaAlertaMs) continue;

      const cliente = (lead.name || 'Sin nombre').trim();
      const factura = String(getCampo(lead, FIELD_FACTURA) || getCampo(lead, FIELD_FACT2) || '').trim();

      // Obtener teléfono del contacto principal
      const _embC = (lead._embedded && lead._embedded.contacts) || [];
      const _cId  = (_embC.length > 0) ? String(_embC[0].id) : '';
      const _cInfo = _cId ? (phoneMap[_cId] || null) : null;

      const alerta = {
        leadId:   lead.id,
        cliente:  cliente,
        factura:  factura,
        ts:       new Date().toISOString(),
        contacto: _cInfo ? _cInfo.nombre : '',
        telefono: _cInfo ? _cInfo.telefono : ''
      };

      // PATCH: escribe solo este nodo en /kommo_pagos_alertas/{leadId}
      // No afecta ni borra los otros nodos de la colección
      const fbPath = '/kommo_pagos_alertas/' + leadKey + '.json';
      const fbStatus = await httpsPatch(FIREBASE_DB, fbPath, JSON.stringify(alerta));

      if (fbStatus === 200 || fbStatus === 201) {
        pagosAlertados.set(leadKey, Date.now()); // registrar timestamp de esta alerta
        nuevosAlertas++;
        console.log('\n   💰 NUEVO PAGÓ → ' + cliente +
          (factura ? ' [Fac:' + factura + ']' : '') +
          ' (lead #' + lead.id + ')');
      } else {
        console.log('\n   ⚠️  PAGÓ lead #' + lead.id + ' → Firebase respondió HTTP ' + fbStatus);
      }
    }

    if (nuevosAlertas > 0) {
      console.log('   ↳ ' + nuevosAlertas + ' alerta(s) PAGÓ enviadas al panel\n');
    } else {
      console.log('| PAGÓ detectados: ' + candidatosPago.length +
        ' (ya alertados: ' + pagosAlertados.size + ')');
    }

  } catch(e) {
    console.log('❌ Error:', e.message);
  }
}

// ─── PATCH Kommo con Authorization ───────────────────────────────────────────

function httpsPatchKommo(path, bodyObj) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(bodyObj));
    const req = https.request({
      hostname: KOMMO_DOMAIN, path, method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'Authorization': 'Bearer ' + TOKEN,
        'User-Agent': 'FodorSpa/1.0'
      }
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

// ─── Procesar resets PAGÓ pendientes ─────────────────────────────────────────

async function procesarResetsPago() {
  try {
    const r = await httpsGet(FIREBASE_DB, '/kommo_reset_pago.json', {});
    if (r.status !== 200 || !r.body || r.body === 'null') return;
    const pendientes = JSON.parse(r.body);
    if (!pendientes || typeof pendientes !== 'object') return;
    const ids = Object.keys(pendientes).filter(id => pendientes[id]);
    if (ids.length === 0) return;

    // PATCH Kommo: desmarcar FIELD_PAGO para cada leadId en batch
    const payload = ids.map(id => ({
      id: parseInt(id),
      custom_fields_values: [{ field_id: FIELD_PAGO, values: [{ value: false }] }]
    }));
    const resp = await httpsPatchKommo('/api/v4/leads', payload);
    if (resp.status === 200) {
      console.log('\n   🔄 PAGÓ desmarcado en Kommo para leads:', ids.join(', '));
      // Limpiar nodo en Firebase (PUT null)
      await httpsPut(FIREBASE_DB, '/kommo_reset_pago.json', 'null');
    } else {
      console.log('\n   ⚠️  Error reset PAGÓ Kommo HTTP', resp.status);
    }
  } catch(e) {
    console.log('\n   ⚠️  procesarResetsPago:', e.message);
  }
}

// ─── Procesar resets ENVÍOS pendientes ───────────────────────────────────────

async function procesarResetsEnvio() {
  try {
    const r = await httpsGet(FIREBASE_DB, '/kommo_reset_envio.json', {});
    if (r.status !== 200 || !r.body || r.body === 'null') return;
    const pendientes = JSON.parse(r.body);
    if (!pendientes || typeof pendientes !== 'object') return;
    const ids = Object.keys(pendientes).filter(id => pendientes[id]);
    if (ids.length === 0) return;

    // PATCH Kommo: desmarcar FIELD_ENVIOS para cada leadId en batch
    const payload = ids.map(id => ({
      id: parseInt(id),
      custom_fields_values: [{ field_id: FIELD_ENVIOS, values: [{ value: false }] }]
    }));
    const resp = await httpsPatchKommo('/api/v4/leads', payload);
    if (resp.status === 200) {
      console.log('\n   🔄 ENVÍOS desmarcado en Kommo para leads:', ids.join(', '));
      // Limpiar nodo en Firebase (PUT null)
      await httpsPut(FIREBASE_DB, '/kommo_reset_envio.json', 'null');
    } else {
      console.log('\n   ⚠️  Error reset ENVÍOS Kommo HTTP', resp.status);
    }
  } catch(e) {
    console.log('\n   ⚠️  procesarResetsEnvio:', e.message);
  }
}

// ─── Fetch teléfonos de contactos (batch) ────────────────────────────────────

async function fetchContactPhones(contactIds) {
  if (!contactIds || contactIds.length === 0) return {};
  try {
    const ids = contactIds.slice(0, 100).join(',');
    const r = await httpsGet(KOMMO_DOMAIN,
      '/api/v4/contacts?filter[id]=' + ids + '&with=custom_fields_values&limit=250',
      { 'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'FodorSpa/1.0' }
    );
    if (r.status !== 200) return {};
    const data = JSON.parse(r.body);
    const contacts = (data._embedded && data._embedded.contacts) || [];
    const phoneMap = {};
    contacts.forEach(function(c) {
      var tel = '';
      var fields = c.custom_fields_values || [];
      // Buscar campo de teléfono por field_code o por nombre
      var pf = fields.find(function(f) {
        return f.field_code === 'PHONE' ||
               f.field_code === 'MOB_PHONE' ||
               (f.field_name && f.field_name.toLowerCase().includes('tel'));
      });
      if (pf && pf.values && pf.values.length > 0) {
        tel = String(pf.values[0].value || '');
      }
      if (tel) {
        phoneMap[String(c.id)] = { nombre: c.name || '', telefono: tel };
      }
    });
    return phoneMap;
  } catch(e) {
    console.log('   ⚠️  Error contactos Kommo:', e.message);
    return {};
  }
}

// ─── Inicio ──────────────────────────────────────────────────────────────────

console.log('🚀 Kommo sync v2 — ENVÍOS + alertas PAGÓ — cada 5 min. Ctrl+C para detener.\n');
cargarAlertasPrevias().then(() => {
  sync();
  setInterval(sync, 5 * 60 * 1000);
});
