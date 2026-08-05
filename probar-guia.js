#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Fodor SpA — Prueba de guía de un solo tiro
//
//  Por qué existe: diagnosticar la generación de guías con envia-sync obligaba a
//  esperar el ciclo de 2 minutos, con una ventana de Terminal que tenía que
//  quedar abierta, y leyendo el error a medias entre otros mensajes. Cada intento
//  eran 5 minutos. Esto responde en 10 segundos y muestra todo.
//
//  Qué hace:
//    1. Lee la configuración y las credenciales (igual que envia-sync)
//    2. Toma el pedido más antiguo de la cola
//    3. Arma el payload EXACTO que se le manda a Envia.com y lo muestra
//    4. Lo envía y muestra la respuesta completa, sin recortar
//    5. Si sale bien, guarda la guía y limpia la cola (igual que envia-sync,
//       así no queda un pendiente suelto que genere una guía duplicada)
//
//  No modifica nada si falla. Se puede correr las veces que haga falta.
// ══════════════════════════════════════════════════════════════════════════════

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { resolverCiudad } = require('./envia-geo.js');

const FIREBASE_DB = 'odfor-bae97-default-rtdb.firebaseio.com';
const ENVIA_HOST  = 'api.envia.com';

const L = '─'.repeat(78);

// ─── Credenciales (mismo mecanismo que envia-sync.js) ────────────────────────
function leerDelLlavero(servicio) {
  try {
    return require('child_process').execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-a', process.env.USER || '', '-s', servicio, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch (e) { return ''; }
}

const ENVIA_TOKEN = (process.env.ENVIA_TOKEN || '').trim() || leerDelLlavero('fodor-envia-token');

// ─── HTTP ────────────────────────────────────────────────────────────────────
function get(host, ruta, headers) {
  return new Promise((res, rej) => {
    https.get({ hostname: host, path: ruta, headers: headers || {} }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(d) }); }
                          catch (e) { res({ status: r.statusCode, body: d }); } });
    }).on('error', rej);
  });
}

function post(host, ruta, cuerpo, headers) {
  return new Promise((res, rej) => {
    const buf = Buffer.from(JSON.stringify(cuerpo));
    const req = https.request({
      hostname: host, path: ruta, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': buf.length }, headers || {})
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(d) }); }
                          catch (e) { res({ status: r.statusCode, body: d }); } });
    });
    req.on('error', rej);
    req.write(buf);
    req.end();
  });
}

function escribirFirebase(ruta, cuerpo, metodo) {
  return new Promise((res, rej) => {
    const txt = cuerpo === null ? 'null' : JSON.stringify(cuerpo);
    const buf = Buffer.from(txt);
    const req = https.request({
      hostname: FIREBASE_DB, path: ruta, method: metodo || 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, r => { r.resume(); res(r.statusCode); });
    req.on('error', rej);
    req.write(buf);
    req.end();
  });
}

// ─── Programa ────────────────────────────────────────────────────────────────
(async () => {
  console.log(L);
  console.log('  FODOR SpA — Prueba de guía');
  console.log(L);
  console.log('');

  // 1. Credencial
  if (!ENVIA_TOKEN) {
    console.log('❌ No hay token de Envia.com en el Llavero.');
    console.log('   Solución: doble clic en guardar-token-envia.command');
    return;
  }
  console.log('✅ Token de Envia.com encontrado (' + ENVIA_TOKEN.length + ' caracteres)');

  // 2. Configuración
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'empresa.config.json'), 'utf8'));
  } catch (e) {
    console.log('❌ No se pudo leer empresa.config.json: ' + e.message);
    return;
  }
  const d = cfg.despacho;
  console.log('✅ Origen: ' + d.calle + ' ' + d.numero + ', ' + d.comuna + ' · CP ' + d.codigoPostal);
  console.log('');

  // 3. Pedido en cola
  const cola = await get(FIREBASE_DB, '/envia_pending.json', {});
  if (!cola.body || cola.body === null) {
    console.log('ℹ️  La cola está vacía. Genera una guía desde el cotizador y volvé a correr esto.');
    return;
  }
  const claves = Object.keys(cola.body);
  const leadId = claves[0];
  const p = cola.body[leadId];

  console.log(L);
  console.log('  PEDIDO A PROBAR: ' + leadId);
  console.log(L);
  console.log('  Cliente : ' + (p.nombre || '?'));
  console.log('  Destino : ' + (p.calle || '') + ' ' + (p.numero || '') + ', ' + (p.ciudad || ''));
  console.log('  Courier : ' + (p.carrier || '?') + ' / ' + (p.service || '?'));
  console.log('  Bultos  : ' + ((p.packages || []).length));
  console.log('');

  // 4. Payload — exactamente el mismo que arma envia-sync.js
  const calle = (p.calle || 'Sin especificar').trim();
  const m = calle.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
  const calleNombre = m ? m[1].trim() : calle;
  const calleNum    = p.numero || (m ? m[2] : 's/n');

  // Codigo postal y region del destino. Envia.com exige postalCode con minimo
  // 3 caracteres; el cotizador nunca lo capturaba y por eso iba vacio.
  console.log('  Resolviendo código postal de "' + (p.ciudad || '') + '"...');
  let geo;
  try {
    geo = await resolverCiudad(p.ciudad);
    console.log('  ✅ ' + geo.localidad + ' → CP ' + geo.postalCode + ' · región ' + geo.state);
  } catch (e) {
    console.log('');
    console.log('  ❌ ' + e.message);
    console.log('     Sin código postal la guía no se puede emitir. No se modificó nada.');
    return;
  }
  console.log('');

  const payload = {
    origin: {
      name:       d.nombre || cfg.empresa.nombre,
      company:    d.empresa || cfg.empresa.nombre,
      email:      d.email || '',
      phone:      String(d.telefono).replace(/\D/g, ''),
      street:     d.calle,
      number:     String(d.numero),
      district:   d.comuna,
      city:       d.ciudad,
      state:      d.region,
      country:    d.pais || 'CL',
      postalCode: d.codigoPostal || ''
    },
    destination: {
      name:       p.nombre || 'Cliente',
      company:    p.nombre || 'Cliente',
      email:      p.correo || '',
      phone:      String(p.telefono || '').replace(/\D/g, ''),
      street:     calleNombre,
      number:     String(calleNum),
      district:   p.ciudad || '',
      city:       geo.localidad || p.ciudad || '',
      // Region y codigo postal salen del servicio de Envia, no de la tabla
      // hardcodeada del cotizador (que solo tenia ~50 comunas y para el resto
      // caia a 'RM' en silencio: un envio a Puerto Montt salia como Metropolitana).
      state:      geo.state,
      country:    'CL',
      postalCode: geo.postalCode
    },
    packages: p.packages || [],
    shipment: {
      carrier: p.carrier || cfg.envios.carrierPorDefecto || 'chilexpress',
      type:    1,
      service: p.service || 'normal'
    },
    settings: {
      printFormat: 'PDF',
      printSize:   (cfg.envios && cfg.envios.formatoEtiqueta) || 'PAPER_LETTER',
      comments:    'Pedido ' + (cfg.empresa.nombre || '') + ' — ' + leadId,
      currency:    'CLP'
    }
  };

  console.log(L);
  console.log('  LO QUE SE LE MANDA A ENVIA.COM');
  console.log(L);
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  // 5. Llamada
  console.log(L);
  console.log('  RESPUESTA DE ENVIA.COM');
  console.log(L);
  const r = await post(ENVIA_HOST, '/ship/generate/', payload, {
    'Authorization': 'Bearer ' + ENVIA_TOKEN
  });
  console.log('  HTTP ' + r.status);
  console.log('');
  console.log(typeof r.body === 'object' ? JSON.stringify(r.body, null, 2) : String(r.body));
  console.log('');

  // 6. Lectura del resultado
  const data = (r.body && r.body.data) || r.body;
  const item = Array.isArray(data) ? (data[0] || {}) : (data || {});
  const tracking = item.trackingNumber || item.tracking_number || item.guide || '';
  const label    = item.label || item.label_url || item.labelUrl || item.pdf || '';

  console.log(L);
  if (tracking) {
    console.log('  ✅ GUÍA EMITIDA');
    console.log(L);
    console.log('  Tracking : ' + tracking);
    if (label) console.log('  Etiqueta : ' + label);
    console.log('');

    await escribirFirebase('/envia_shipments/' + leadId + '.json', {
      leadId: leadId,
      cliente: p.nombre || '',
      tracking: tracking,
      carrier: payload.shipment.carrier,
      status: 'created',
      status_label: 'Guía creada',
      label_url: label,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const cod = await escribirFirebase('/envia_pending/' + leadId + '.json', null, 'PUT');
    console.log('  Guardada en el panel y sacada de la cola' + (cod === 200 ? '' : ' (⚠️ la cola respondió HTTP ' + cod + ')'));
  } else {
    console.log('  ❌ NO SALIÓ NÚMERO DE SEGUIMIENTO');
    console.log(L);
    const msg = (r.body && r.body.error && r.body.error.message) ||
                (r.body && r.body.message) || '';
    if (msg) {
      console.log('  Envia.com dice: ' + msg);
      console.log('');
    }
    console.log('  No se modificó nada. El pedido sigue en la cola.');
    console.log('  Copiá TODO lo de arriba y pasámelo.');
  }
  console.log(L);
})().catch(e => {
  console.log('');
  console.log('❌ Error inesperado: ' + e.message);
  console.log(e.stack);
});
