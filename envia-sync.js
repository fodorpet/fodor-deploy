#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Fodor Spa — Envia.com Sync v1.0
//  Crea guías de despacho en Envia.com desde leads de Kommo CRM.
//  Escribe el número de tracking de vuelta en Firebase y Kommo.
//
//  Uso:
//    node envia-sync.js             → corre en bucle cada 2 minutos
//    node envia-sync.js --discover  → lista campos personalizados de Kommo
// ══════════════════════════════════════════════════════════════════════════════

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CREDENCIALES ─────────────────────────────────────────────────────────────
// FIX 2026-07-31 — Las credenciales se leen de variable de entorno o del Llavero
// de macOS. Nunca quedan escritas en el código.
//
// Antes este archivo sacaba el token de Kommo PARSEANDO el texto de kommo-sync.js
// con una expresión regular que buscaba `const TOKEN = 'literal'`. Cuando
// kommo-sync.js se endureció para leer del Llavero, ese literal desapareció, la
// regex dejó de encontrar nada y el proceso moría al arrancar con
// "No se pudo leer TOKEN desde kommo-sync.js". Dos archivos, dos criterios
// distintos para lo mismo. Ahora ambos usan el mismo mecanismo.
//
// Para guardar las credenciales (una sola vez, doble clic):
//   guardar-token-kommo.command  → 'fodor-kommo-token'
//   guardar-token-envia.command  → 'fodor-envia-token'

function _leerDelLlavero(servicio) {
  try {
    return require('child_process').execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-a', process.env.USER || '', '-s', servicio, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch (e) {
    return '';
  }
}

function _leerCredencial(nombreVarEntorno, servicioLlavero, comandoAyuda) {
  const desdeEntorno = (process.env[nombreVarEntorno] || '').trim();
  if (desdeEntorno) return desdeEntorno;

  const desdeLlavero = _leerDelLlavero(servicioLlavero);
  if (desdeLlavero) return desdeLlavero;

  console.error('');
  console.error('❌ No se encontró la credencial "' + servicioLlavero + '" en el Llavero de macOS.');
  console.error('   Solución: haz doble clic en ' + comandoAyuda);
  console.error('');
  process.exit(1);
}

const KOMMO_TOKEN = _leerCredencial('KOMMO_TOKEN', 'fodor-kommo-token', 'guardar-token-kommo.command');
const ENVIA_TOKEN = _leerCredencial('ENVIA_TOKEN', 'fodor-envia-token', 'guardar-token-envia.command');

const KOMMO_DOMAIN = 'marcelofodorcl.kommo.com';
const FIREBASE_DB  = 'odfor-bae97-default-rtdb.firebaseio.com';
const ENVIA_HOST   = 'api.envia.com';

// ─── CAMPOS KOMMO (conocidos del panel) ────────────────────────────────────────
const FIELD_ENVIOS  = 1109935;
const FIELD_EMPRESA = 1098687;
const FIELD_CIUDAD  = 1092664;
const FIELD_CORREO  = 1092662;
const FIELD_DETALLE = 1092658;

// ─── CAMPOS KOMMO (a descubrir con --discover) ─────────────────────────────────
// Ejecuta: node envia-sync.js --discover
// Copia los IDs que correspondan y reemplaza null por el número:
var FIELD_DIRECCION = null;   // Campo "Dirección" del lead
var FIELD_PESO      = null;   // Campo "Peso" (kg)
var FIELD_ALTO      = null;   // Campo "Alto" (cm)
var FIELD_ANCHO     = null;   // Campo "Ancho" (cm)
var FIELD_LARGO     = null;   // Campo "Largo" o "Profundidad" (cm)
var FIELD_TRACKING  = null;   // Campo donde escribir el tracking (opcional)

// ─── ORIGEN — DIRECCIÓN DE FODOR SPA ─────────────────────────────────────────
// ⚠️  EDITAR con tus datos reales antes de usar
const ORIGEN = {
  name:     'Fodor SpA',
  company:  'Fodor SpA',
  email:    'info@fodorspa.cl',        // ← EDITAR
  phone:    '+56912345678',             // ← EDITAR con tu teléfono
  street:   'EDITAR_NOMBRE_CALLE',     // ← EDITAR (solo nombre, sin número)
  number:   '000',                      // ← EDITAR (número de la calle)
  district: 'EDITAR_COMUNA',           // ← EDITAR
  city:     'Santiago',                 // ← EDITAR si no es Santiago
  state:    'Región Metropolitana',     // ← EDITAR si no es RM
  country:  'CL',
  zipCode:  ''
};

// ─── PAQUETE POR DEFECTO ──────────────────────────────────────────────────────
// Valores usados cuando Kommo no tiene los campos de peso/dimensiones
const PAQUETE_DEFAULT = {
  peso:  0.5,   // kg
  largo: 30,    // cm
  ancho: 20,    // cm
  alto:  10     // cm
};

// ─── CARRIER ──────────────────────────────────────────────────────────────────
// Opciones Chile en Envia.com: 'chilexpress' | 'starken' | 'blueexpress'
const CARRIER = 'chilexpress';

// ══════════════════════════════════════════════════════════════════════════════
//  HTTP HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function httpsPost(host, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: host, path, method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': buf.length
      }, extraHeaders || {})
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpsGet(host, path, extraHeaders) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: host, path,
      headers: extraHeaders || {}
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

function httpsPutFirebase(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body === null ? 'null' : JSON.stringify(body);
    const buf = Buffer.from(bodyStr);
    const req = https.request({
      hostname: FIREBASE_DB, path, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpsPatchFirebase(path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: FIREBASE_DB, path, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpsPatchKommo(path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: KOMMO_DOMAIN, path, method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'Authorization': 'Bearer ' + KOMMO_TOKEN,
        'User-Agent': 'FodorSpa-Envia/1.0'
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

function httpsPostKommo(path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: KOMMO_DOMAIN, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'Authorization': 'Bearer ' + KOMMO_TOKEN,
        'User-Agent': 'FodorSpa-Envia/1.0'
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

// ══════════════════════════════════════════════════════════════════════════════
//  KOMMO HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getCampo(lead, fieldId) {
  if (!fieldId) return null;
  const f = (lead.custom_fields_values || []).find(x => x.field_id == fieldId);
  return (f && f.values && f.values[0]) ? f.values[0].value : null;
}

async function fetchLead(leadId) {
  const r = await httpsGet(KOMMO_DOMAIN,
    '/api/v4/leads/' + leadId + '?with=contacts,custom_fields_values',
    { 'Authorization': 'Bearer ' + KOMMO_TOKEN, 'User-Agent': 'FodorSpa-Envia/1.0' }
  );
  if (r.status !== 200) throw new Error('Kommo lead ' + leadId + ' HTTP ' + r.status);
  return r.body;
}

async function fetchContactPhone(contactId) {
  if (!contactId) return '';
  try {
    const r = await httpsGet(KOMMO_DOMAIN,
      '/api/v4/contacts/' + contactId + '?with=custom_fields_values',
      { 'Authorization': 'Bearer ' + KOMMO_TOKEN, 'User-Agent': 'FodorSpa-Envia/1.0' }
    );
    if (r.status !== 200) return '';
    const fields = r.body.custom_fields_values || [];
    const pf = fields.find(f =>
      f.field_code === 'PHONE' || f.field_code === 'MOB_PHONE' ||
      (f.field_name || '').toLowerCase().includes('tel')
    );
    return (pf && pf.values && pf.values[0]) ? String(pf.values[0].value || '') : '';
  } catch(e) {
    return '';
  }
}

// ─── Descubrimiento de campos ─────────────────────────────────────────────────
async function descubrirCampos(autoSet) {
  const r = await httpsGet(KOMMO_DOMAIN,
    '/api/v4/leads/custom_fields?limit=250',
    { 'Authorization': 'Bearer ' + KOMMO_TOKEN, 'User-Agent': 'FodorSpa-Envia/1.0' }
  );
  if (r.status !== 200) {
    console.log('⚠️  Error al obtener campos Kommo HTTP', r.status);
    return;
  }

  const fields = (r.body && r.body._embedded && r.body._embedded.custom_fields) || [];

  if (!autoSet) {
    // Modo --discover: solo mostrar lista
    console.log('\n📋 CAMPOS PERSONALIZADOS DEL LEAD EN KOMMO:');
    console.log('═'.repeat(60));
    fields.forEach(f => {
      console.log('  ID: ' + String(f.id).padEnd(10) + '│ ' + (f.name || '').padEnd(30) + '│ ' + (f.type || ''));
    });
    console.log('═'.repeat(60));
    console.log('\n💡 Copia los IDs relevantes en la sección "CAMPOS KOMMO"');
    console.log('   de este script (variables FIELD_DIRECCION, FIELD_PESO, etc.)\n');
    return;
  }

  // Modo auto-descubrimiento por nombre
  let found = 0;
  fields.forEach(f => {
    const n = (f.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!FIELD_DIRECCION && (n.includes('direc') || n === 'calle' || n === 'domicilio' || n.includes('address'))) {
      FIELD_DIRECCION = f.id; found++;
      console.log('  ✅ Dirección → campo "' + f.name + '" (ID ' + f.id + ')');
    }
    if (!FIELD_PESO && (n === 'peso' || n.includes('kg') || n.includes('weight'))) {
      FIELD_PESO = f.id; found++;
      console.log('  ✅ Peso → campo "' + f.name + '" (ID ' + f.id + ')');
    }
    if (!FIELD_ALTO && (n === 'alto' || n === 'altura' || n === 'height')) {
      FIELD_ALTO = f.id; found++;
      console.log('  ✅ Alto → campo "' + f.name + '" (ID ' + f.id + ')');
    }
    if (!FIELD_ANCHO && (n === 'ancho' || n === 'anchura' || n === 'width')) {
      FIELD_ANCHO = f.id; found++;
      console.log('  ✅ Ancho → campo "' + f.name + '" (ID ' + f.id + ')');
    }
    if (!FIELD_LARGO && (n === 'largo' || n === 'longitud' || n === 'profundidad' || n === 'depth' || n === 'length')) {
      FIELD_LARGO = f.id; found++;
      console.log('  ✅ Largo → campo "' + f.name + '" (ID ' + f.id + ')');
    }
    if (!FIELD_TRACKING && (n.includes('tracking') || n.includes('seguimiento') || n.includes('guia') || n === 'numero guia')) {
      FIELD_TRACKING = f.id; found++;
      console.log('  ✅ Tracking → campo "' + f.name + '" (ID ' + f.id + ')');
    }
  });

  if (found > 0) {
    console.log('  → ' + found + ' campo(s) descubierto(s) automáticamente.');
  } else {
    console.log('  ⚠️  No se encontraron campos por nombre automático.');
    console.log('     Ejecuta: node envia-sync.js --discover para ver todos los campos');
    console.log('     y configura los IDs manualmente en este script.\n');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENVIA.COM HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function crearGuia(lead, telefono, opcionesExtras) {
  const opc      = opcionesExtras || {};
  const empresa  = getCampo(lead, FIELD_EMPRESA) || lead.name || 'Cliente';
  const ciudad   = getCampo(lead, FIELD_CIUDAD)  || opc.ciudad   || 'Santiago';
  const correo   = getCampo(lead, FIELD_CORREO)  || opc.correo   || '';
  const calle    = getCampo(lead, FIELD_DIRECCION)  || opc.direccion || 'Sin especificar';
  const peso     = parseFloat(getCampo(lead, FIELD_PESO))  || opc.peso  || PAQUETE_DEFAULT.peso;
  const alto     = parseFloat(getCampo(lead, FIELD_ALTO))  || opc.alto  || PAQUETE_DEFAULT.alto;
  const ancho    = parseFloat(getCampo(lead, FIELD_ANCHO)) || opc.ancho || PAQUETE_DEFAULT.ancho;
  const largo    = parseFloat(getCampo(lead, FIELD_LARGO)) || opc.largo || PAQUETE_DEFAULT.largo;

  // Separar nombre y número de la calle ("Av. Providencia 1234" → nombre + número)
  const calleMatch = calle.trim().match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
  const calleNombre = calleMatch ? calleMatch[1].trim() : calle.trim();
  const calleNum    = calleMatch ? calleMatch[2]        : 's/n';

  // Paquetes reales del cotizador si vienen; si no, el bulto por defecto.
  const packages = (opc._packages && opc._packages.length > 0)
    ? opc._packages
    : [{
        content:       getCampo(lead, FIELD_DETALLE) || 'Productos impresos',
        amount:        1,
        type:          'box',
        weight:        peso,
        insurance:     0,
        declaredValue: 0,
        weightUnit:    'KG',
        lengthUnit:    'CM',
        dimensions:    { length: largo, width: ancho, height: alto }
      }];

  // Courier elegido en pantalla; CARRIER queda solo como valor por defecto.
  const carrier = opc._carrier || CARRIER;
  const service = opc._service || 'normal';
  const estado  = opc.estado   || 'Región Metropolitana';

  const payload = {
    origin: { ...ORIGEN },
    destination: {
      name:     empresa,
      company:  empresa,
      email:    correo,
      phone:    telefono || '',
      street:   calleNombre,
      number:   calleNum,
      district: ciudad,
      city:     ciudad,
      state:    estado,
      country:  'CL',
      zipCode:  ''
    },
    packages: packages,
    shipment: {
      carrier: carrier,
      type:    1,
      service: service
    },
    settings: {
      printFormat: 'PDF',
      printSize:   'CARTA',
      comments:    'Pedido Fodor SpA — Lead #' + (lead.id || 'web'),
      currency:    'CLP'
    }
  };

  return httpsPost(ENVIA_HOST, '/ship/generate/', payload, {
    'Authorization': 'Bearer ' + ENVIA_TOKEN
  });
}

async function consultarTracking(trackingNumber, carrier) {
  return httpsGet(ENVIA_HOST,
    '/ship/track/?trackingNumbers=' + encodeURIComponent(trackingNumber) +
    '&carrier=' + encodeURIComponent(carrier || CARRIER),
    { 'Authorization': 'Bearer ' + ENVIA_TOKEN }
  );
}

// ─── Extraer tracking de la respuesta de Envia ───────────────────────────────
function extraerDatosEnvia(respBody) {
  // Envia puede responder en distintos formatos según versión de API
  const data = respBody.data || respBody;
  if (Array.isArray(data)) {
    const item = data[0] || {};
    return {
      tracking: item.tracking_number || item.trackingNumber || item.guide || '',
      label_url: item.label || item.label_url || item.labelUrl || item.pdf || ''
    };
  }
  return {
    tracking: data.tracking_number || data.trackingNumber || data.guide || data.label || '',
    label_url: data.label_url || data.labelUrl || data.pdf || ''
  };
}

// ─── Extraer estado de la respuesta de tracking ──────────────────────────────
function extraerEstadoTracking(respBody) {
  const data = respBody.data || respBody;
  const item = Array.isArray(data) ? (data[0] || {}) : data;
  const historial = item.trackingHistory || item.history || [];
  const ultimoEvento = historial[historial.length - 1] || {};
  return {
    status:       item.status       || item.state       || ultimoEvento.status || 'unknown',
    description:  item.statusLabel  || item.description || ultimoEvento.description || '',
    location:     item.location     || ultimoEvento.location || ''
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  LÓGICA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

// ─── Procesar envíos pendientes (Firebase → Envia) ─────────────────────────
async function procesarPendientes() {
  const r = await httpsGet(FIREBASE_DB, '/envia_pending.json', {});
  if (r.status !== 200 || !r.body || r.body === 'null') return 0;
  if (typeof r.body !== 'object') return 0;

  const pendientes = Object.entries(r.body).filter(
    ([, v]) => v && (v.status === 'pending' || !v.status)
  );
  if (pendientes.length === 0) return 0;

  console.log('\n📦 ' + pendientes.length + ' envío(s) pendiente(s) de crear...');

  let creados = 0;
  for (const [leadId, pendiente] of pendientes) {
    try {
      // Marcar como procesando para evitar doble ejecución
      await httpsPatchFirebase('/envia_pending/' + leadId + '.json', {
        status: 'processing',
        processing_at: new Date().toISOString()
      });

      // ── FIX 2026-07-31 (1 de 3): de dónde salen los datos ────────────────
      // El cotizador web escribe el pendiente con TODO lo necesario (nombre,
      // correo, teléfono, ciudad, calle, número, carrier y packages). Ir a
      // buscarlo a Kommo era un viaje al pedo: los campos FIELD_DIRECCION,
      // FIELD_PESO, FIELD_ALTO, FIELD_ANCHO y FIELD_LARGO están en null —
      // nunca se configuraron— así que la respuesta de Kommo no aportaba nada
      // que el pendiente no tuviera ya.
      const tieneDataCompleta = pendiente.packages && pendiente.calle && pendiente.ciudad;
      let lead, telefono, opcExtras;

      if (tieneDataCompleta) {
        console.log('   → Lead #' + leadId + ': datos completos en el pendiente (sin consultar Kommo)');
        lead = {
          id:   leadId,
          name: pendiente.nombre || 'Cliente',
          custom_fields_values: []   // vacío a propósito: todo viaja en opcExtras
        };
        telefono  = pendiente.telefono || '';
        opcExtras = {
          ciudad:    pendiente.ciudad || 'Santiago',
          correo:    pendiente.correo || '',
          direccion: (pendiente.calle || '') + ' ' + (pendiente.numero || 's/n'),
          estado:    pendiente.estado || 'Región Metropolitana'
        };
      } else {
        // ── FIX 2026-07-31 (2 de 3): el prefijo 'kommo-' ────────────────────
        // envios.html arma la clave como 'kommo-' + número de lead. Ese string
        // se pasaba tal cual a /api/v4/leads/{id}, y Kommo devolvía 404 porque
        // espera solo el número. Se limpia antes de consultar.
        const kommoId = String(leadId).replace(/^kommo-/, '');
        console.log('   → Lead #' + leadId + ': consultando Kommo (ID ' + kommoId + ')...');
        lead = await fetchLead(kommoId);

        const contacts  = (lead._embedded && lead._embedded.contacts) || [];
        const contactId = contacts.length > 0 ? contacts[0].id : null;
        telefono  = contactId ? await fetchContactPhone(contactId) : '';
        opcExtras = pendiente.opciones || {};
      }

      // ── FIX 2026-07-31 (3 de 3): respetar lo que eligió el usuario ────────
      // Los paquetes reales del cotizador (con medidas y peso por producto) y
      // el courier elegido en pantalla se estaban descartando: la guía salía
      // con un bulto genérico y el carrier fijo de la constante CARRIER.
      if (pendiente.packages && pendiente.packages.length > 0) opcExtras._packages = pendiente.packages;
      if (pendiente.carrier) opcExtras._carrier = pendiente.carrier;
      if (pendiente.service) opcExtras._service = pendiente.service;

      // Crear guía en Envia.com
      const empresa = getCampo(lead, FIELD_EMPRESA) || lead.name || 'Lead #' + leadId;
      console.log('   → Creando guía en Envia.com para: ' + empresa);
      const enviaResp = await crearGuia(lead, telefono, opcExtras);

      if (enviaResp.status !== 200 && enviaResp.status !== 201) {
        const errMsg = 'Envia.com HTTP ' + enviaResp.status + ': ' +
          (typeof enviaResp.body === 'object' ?
            JSON.stringify(enviaResp.body).slice(0, 300) :
            String(enviaResp.body).slice(0, 300));
        throw new Error(errMsg);
      }

      // Extraer tracking y URL de guía
      const { tracking, label_url } = extraerDatosEnvia(enviaResp.body);
      if (!tracking) {
        console.log('   ⚠️  Respuesta Envia sin tracking. Respuesta completa:', JSON.stringify(enviaResp.body).slice(0, 500));
      }

      // Guardar en Firebase /envia_shipments/{leadId}
      const shipment = {
        leadId:       leadId,
        cliente:      empresa,
        tracking:     tracking,
        carrier:      opcExtras._carrier || CARRIER,
        status:       'created',
        status_label: 'Guía creada',
        label_url:    label_url,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      };
      await httpsPatchFirebase('/envia_shipments/' + leadId + '.json', shipment);

      // Limpiar pendiente (PUT null = eliminar nodo)
      await httpsPutFirebase('/envia_pending/' + leadId + '.json', null);

      // Escribir tracking en campo Kommo. Solo si hay campo configurado, hay
      // tracking, y el pedido efectivamente viene de Kommo: los que nacen en el
      // cotizador web usan claves 'web-<timestamp>' que no son leads de Kommo.
      const kommoNumId = parseInt(String(leadId).replace(/^kommo-/, ''));
      if (FIELD_TRACKING && tracking && !isNaN(kommoNumId) && !String(leadId).startsWith('web-')) {
        const kommoResp = await httpsPatchKommo('/api/v4/leads', [{
          id: kommoNumId,
          custom_fields_values: [{
            field_id: FIELD_TRACKING,
            values: [{ value: tracking }]
          }]
        }]);
        if (kommoResp.status === 200) {
          console.log('   ✅ Tracking escrito en Kommo: ' + tracking);
        }
      }

      console.log('   ✅ #' + leadId + ' → Tracking: ' + (tracking || 'ver respuesta') +
        (label_url ? ' | PDF: ' + label_url : ''));
      creados++;

    } catch(e) {
      console.error('   ❌ Error lead #' + leadId + ':', e.message);
      // Escribir error en Firebase para que el panel lo muestre
      await httpsPatchFirebase('/envia_shipments/' + leadId + '.json', {
        leadId:       leadId,
        status:       'error',
        status_label: 'Error al crear guía',
        error:        e.message,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      });
      // Limpiar pendiente aunque haya error (evita bucle infinito de reintentos)
      await httpsPutFirebase('/envia_pending/' + leadId + '.json', null);
    }
  }

  return creados;
}

// ─── Actualizar tracking de envíos activos ────────────────────────────────────
async function actualizarTrackings() {
  const r = await httpsGet(FIREBASE_DB, '/envia_shipments.json', {});
  if (r.status !== 200 || !r.body || r.body === 'null') return;
  if (typeof r.body !== 'object') return;

  // Solo trackear los que no están en estado final
  const estadosFinales = ['delivered', 'entregado', 'error'];
  const activos = Object.entries(r.body).filter(
    ([, s]) => s && s.tracking && !estadosFinales.includes((s.status || '').toLowerCase())
  );
  if (activos.length === 0) return;

  process.stdout.write('   🔄 Actualizando ' + activos.length + ' tracking(s)... ');
  let actualizados = 0;

  for (const [leadId, shipment] of activos) {
    try {
      const t = await consultarTracking(shipment.tracking, shipment.carrier);
      if (t.status !== 200) continue;

      const { status, description, location } = extraerEstadoTracking(t.body);
      if (status && status !== shipment.status) {
        await httpsPatchFirebase('/envia_shipments/' + leadId + '.json', {
          status:       status,
          status_label: description || status,
          location:     location,
          updated_at:   new Date().toISOString()
        });
        actualizados++;
        console.log('\n   📍 #' + leadId + ': ' + (shipment.status || '?') + ' → ' + status +
          (description ? ' (' + description + ')' : ''));
      }
    } catch(e) {
      // Fallo de tracking no es crítico — solo logear
      console.log('\n   ⚠️  Tracking #' + leadId + ': ' + e.message);
    }
  }

  if (actualizados === 0) process.stdout.write('sin cambios\n');
  else process.stdout.write(actualizados + ' actualizado(s)\n');
}

// ══════════════════════════════════════════════════════════════════════════════
//  COTIZACIÓN DE PRECIOS (rate) — lee /envia_rate_pending y responde
// ══════════════════════════════════════════════════════════════════════════════

// Tipo de cambio USD → CLP (actualizar si cambia mucho)
const USD_A_CLP = 930;

async function procesarRatesPendientes() {
  const r = await httpsGet(FIREBASE_DB, '/envia_rate_pending.json', {});
  if (r.status !== 200 || !r.body || r.body === 'null') return 0;
  let pendientes;
  try { pendientes = JSON.parse(r.body); } catch(e) { return 0; }
  if (!pendientes || typeof pendientes !== 'object') return 0;

  const leadIds = Object.keys(pendientes);
  if (leadIds.length === 0) return 0;

  let procesados = 0;
  for (const leadId of leadIds) {
    const datos = pendientes[leadId];
    if (!datos || datos.status === 'processing') continue;

    // Marcar como procesando para evitar doble ejecución
    await httpsPutFirebase('/envia_rate_pending/' + leadId + '.json',
      JSON.stringify({ ...datos, status: 'processing' }));

    const ciudad = datos.ciudad || 'Santiago';
    const peso   = parseFloat(datos.peso)  || PAQUETE_DEFAULT.peso;
    const largo  = parseFloat(datos.largo) || PAQUETE_DEFAULT.largo;
    const ancho  = parseFloat(datos.ancho) || PAQUETE_DEFAULT.ancho;
    const alto   = parseFloat(datos.alto)  || PAQUETE_DEFAULT.alto;

    // Construir ORIGEN para rate API (state corto, max 2 chars)
    const origenRate = Object.assign({}, ORIGEN, { state: 'RM', zipCode: '8320000' });

    const payload = {
      origin:      origenRate,
      destination: {
        name:     datos.nombre || 'Cliente',
        company:  '',
        email:    datos.correo || '',
        phone:    datos.telefono || ORIGEN.phone,
        street:   ciudad,
        number:   's/n',
        district: ciudad,
        city:     ciudad,
        state:    'RM',
        country:  'CL',
        postalCode: datos.postalCode || '7550000'
      },
      packages: [{
        content:       'Productos',
        amount:        1,
        type:          'box',
        weight:        peso,
        insurance:     0,
        declaredValue: 0,
        weightUnit:    'KG',
        lengthUnit:    'CM',
        dimensions:    { length: largo, width: ancho, height: alto }
      }],
      shipment: { carrier: CARRIER, type: 1 }
    };

    try {
      const resp = await httpsPost(ENVIA_HOST, '/ship/rate/', payload,
        { 'Authorization': 'Bearer ' + ENVIA_TOKEN });

      let resultado;
      if (resp.status === 200 && resp.body) {
        const data = JSON.parse(resp.body);
        if (data.meta === 'rate' && Array.isArray(data.data) && data.data.length > 0) {
          const tarifa = data.data[0];
          const precioUSD = tarifa.totalPrice || 0;
          const precioCLP = Math.round(precioUSD * USD_A_CLP);
          resultado = {
            status:           'ok',
            totalPrice_usd:   precioUSD,
            totalPrice_clp:   precioCLP,
            currency:         tarifa.currency || 'USD',
            service:          tarifa.service || '',
            serviceDesc:      tarifa.serviceDescription || tarifa.service || '',
            deliveryEstimate: tarifa.deliveryEstimate || '',
            ts:               new Date().toISOString()
          };
          process.stdout.write('\n   💰 Rate lead #' + leadId + ': $' + precioCLP + ' CLP (~$' + precioUSD + ' USD) → ' + resultado.serviceDesc);
        } else {
          const errMsg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data).slice(0, 120);
          resultado = { status: 'error', error: errMsg, ts: new Date().toISOString() };
          process.stdout.write('\n   ⚠️  Rate lead #' + leadId + ' error: ' + errMsg.slice(0, 60));
        }
      } else {
        resultado = { status: 'error', error: 'HTTP ' + resp.status, ts: new Date().toISOString() };
      }

      await httpsPutFirebase('/envia_rate_result/' + leadId + '.json', JSON.stringify(resultado));
    } catch(e) {
      await httpsPutFirebase('/envia_rate_result/' + leadId + '.json',
        JSON.stringify({ status: 'error', error: e.message, ts: new Date().toISOString() }));
    }

    // Limpiar el pending
    await httpsPutFirebase('/envia_rate_pending/' + leadId + '.json', 'null');
    procesados++;
  }
  return procesados;
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTO-REPLY DESPACHO — detecta mensajes de clientes y responde automático
// ══════════════════════════════════════════════════════════════════════════════

const KEYWORDS_DESPACHO = [
  // Intención directa de envío/despacho
  'despacho','despachar','despachen','despáchame','despachame',
  'envío','envio','envíen','envíame','enviame','enviar','enviarlo',
  'mandarlo','mandármelo','mandamelo',
  'delivery','entrega a domicilio','entrega en casa',
  'flete','chilexpress','starken','correos de chile',
  // Preguntas sobre envío
  'hacen despacho','hacen envío','hacen envio','envían','envian',
  'llegan hasta','llegan a','pueden enviar','pueden llegar',
  'cómo llega','como llega','cómo lo recibo','puedo recibirlo',
  // Indicadores de ubicación fuera de Santiago
  'soy de ','vivo en ','estoy en ','me encuentro en ','me quedo en ',
  'fuera de santiago','no soy de santiago','lejos de santiago',
  'otra ciudad','otra región','otra region','soy del norte','soy del sur',
  'no estoy en santiago','estoy fuera',
  // Ciudades principales fuera de la RM
  'viña del mar','valparaíso','valparaiso','concepción','concepcion',
  'temuco','la serena','antofagasta','iquique','arica','puerto montt',
  'osorno','valdivia','coyhaique','punta arenas','copiapó','copiapo',
  'curicó','curico','linares','talca','chillán','chillan','rancagua',
  'quilpué','quilpue','villa alemana','coronel','lota','lebu','arauco',
  'cañete','canete','nacimiento','los ángeles','los angeles',
  'san carlos','ovalle','calama','quillota','san antonio',
  'pitrufquén','pitrufquen','villarrica','pucón','pucon','victoria',
  'curanilahue','padre las casas','panguipulli','castro','ancud',
  'puerto varas','frutillar','calbuco','la unión','la union',
  'rancagua','maipú','maipu','san bernardo','melipilla','talagante',
];

const MSG_AUTO_DESPACHO =
  '📦 Te preparo una cotización formal y coordinamos el despacho. ¿Me mandas tu ciudad y dirección de entrega? 🚚';

async function procesarMensajesEntrantes() {
  const ahora = Math.floor(Date.now() / 1000);
  const desdeTs = ahora - 75; // últimos 75 segundos (margen para ciclo de 60s)

  // 1. Consultar eventos recientes de mensajes entrantes de clientes
  const evPath = '/api/v4/events'
    + '?filter[type][]=incoming_chat_message'
    + '&filter[created_at][from]=' + desdeTs
    + '&limit=50';

  let evR;
  try {
    evR = await httpsGet(KOMMO_DOMAIN, evPath,
      { 'Authorization': 'Bearer ' + KOMMO_TOKEN, 'User-Agent': 'FodorSpa/1.0' }
    );
  } catch(e) { return 0; }

  if (evR.status !== 200) return 0;

  let parsed;
  try { parsed = JSON.parse(evR.body); } catch(e) { return 0; }

  const eventos = (parsed._embedded && parsed._embedded.events) || [];
  if (eventos.length === 0) return 0;

  // 2. Cargar historial de auto-replies (evitar spam: 1 por lead cada 24h)
  let historial = {};
  try {
    const histR = await httpsGet(FIREBASE_DB, '/kommo_auto_replied.json', {});
    if (histR.status === 200 && histR.body && histR.body !== 'null') {
      historial = JSON.parse(histR.body);
    }
  } catch(e) {}

  let enviados = 0;

  for (const ev of eventos) {
    const leadId = String(ev.entity_id || '');
    const va = ev.value_after || {};
    const texto = ((va.text || va.message || '') + '').toLowerCase();
    const talkId = va.talk_id || null;

    if (!leadId || leadId === 'undefined' || !texto) continue;

    // Saltar si ya respondimos este lead en las últimas 24 horas
    const ultima = historial[leadId];
    if (ultima && (ahora - ultima) < 86400) continue;

    // Detectar keyword de despacho o región
    const hayKeyword = KEYWORDS_DESPACHO.some(kw => texto.includes(kw));
    if (!hayKeyword) continue;

    console.log('\n   🤖 Auto-reply despacho → lead ' + leadId
      + ': "' + texto.slice(0, 70) + '"');

    let exito = false;

    // Opción A: Responder en el talk (WhatsApp / Instagram / canal chat)
    if (talkId) {
      try {
        const r = await httpsPostKommo(
          '/api/v4/talks/' + talkId + '/messages',
          { text: MSG_AUTO_DESPACHO }
        );
        if (r.status >= 200 && r.status < 300) {
          exito = true;
          console.log('   ✅ Mensaje enviado por talk ' + talkId);
        } else {
          console.log('   ⚠️  Talk msg HTTP ' + r.status + ' — intentando nota');
        }
      } catch(e) {
        console.log('   ⚠️  Error talk msg:', e.message);
      }
    }

    // Opción B (fallback): Nota interna en el lead para alertar al equipo
    if (!exito) {
      try {
        const r = await httpsPostKommo(
          '/api/v4/leads/' + leadId + '/notes',
          [{ note_type: 'common', params: { text: '🤖 AUTO-REPLY pendiente (enviar manual):\n' + MSG_AUTO_DESPACHO } }]
        );
        if (r.status >= 200 && r.status < 300) {
          exito = true;
          console.log('   📝 Nota guardada en lead ' + leadId + ' (fallback)');
        }
      } catch(e) {
        console.log('   ⚠️  Error nota:', e.message);
      }
    }

    if (exito) {
      historial[leadId] = ahora;
      enviados++;
    }
  }

  // Persistir historial actualizado en Firebase
  if (enviados > 0) {
    try {
      await httpsPutFirebase('/kommo_auto_replied.json', JSON.stringify(historial));
    } catch(e) {}
  }

  return enviados;
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOOP PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

async function sync() {
  const ts = new Date().toLocaleTimeString('es-CL');
  process.stdout.write('[' + ts + '] Envia sync... ');
  try {
    await procesarRatesPendientes();
    const creados = await procesarPendientes();
    await actualizarTrackings();
    if (creados === 0) process.stdout.write('✅\n');
  } catch(e) {
    console.log('❌ Error:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENTRADA
// ══════════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.includes('--discover')) {
  // Listar campos de Kommo y salir
  console.log('🔍 Consultando campos personalizados de Kommo...\n');
  descubrirCampos(false)
    .then(() => process.exit(0))
    .catch(e => { console.error('Error:', e.message); process.exit(1); });

} else {
  // Validar que ORIGEN esté editado
  if (ORIGEN.street.startsWith('EDITAR')) {
    console.log('\n⚠️  ATENCIÓN: Debes editar la dirección de origen (Fodor SpA) en este script.');
    console.log('   Busca la sección "ORIGEN — DIRECCIÓN DE FODOR SPA" y completa los campos.\n');
  }

  console.log('🚀 Envia.com Sync — Carrier: ' + CARRIER.toUpperCase() + ' — cada 2 min. Ctrl+C para detener.');
  console.log('   🤖 Auto-reply despacho: activo (cada 60 seg)');
  console.log('   💡 Para ver campos de Kommo: node envia-sync.js --discover\n');

  // Auto-descubrimiento de campos (si son null)
  descubrirCampos(true).then(() => {
    sync();
    setInterval(sync, 2 * 60 * 1000);

    // Loop independiente de 60s para detección de mensajes de clientes
    setInterval(async () => {
      try {
        const n = await procesarMensajesEntrantes();
        if (n > 0) console.log('[Auto-reply] ' + n + ' mensaje(s) enviado(s)');
      } catch(e) {
        console.log('[Auto-reply] Error:', e.message);
      }
    }, 60 * 1000);
  });
}
