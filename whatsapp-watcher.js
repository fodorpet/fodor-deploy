#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  Fodor SpA — WhatsApp Watcher v2.0 (Baileys — sin Chrome)
//  Monitorea grupo "Fodor Grup" y registra retiros en Firebase
//
//  Uso:  node whatsapp-watcher.js
//        (o doble clic en iniciar-whatsapp.command)
//
//  Dependencias: npm install @whiskeysockets/baileys pino
// ══════════════════════════════════════════════════════════════════

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const https  = require('https');
const path   = require('path');
const pino   = require('pino');
const fs     = require('fs');
const { exec } = require('child_process');

// ── Configuración ─────────────────────────────────────────────────

const FIREBASE_DB    = 'odfor-bae97-default-rtdb.firebaseio.com';
const FB_PATH        = '/retiros_wa.json';
const FB_PATH_G1     = '/grafica1_msgs.json';
const FB_PATH_ALERTAS = '/alertas_whatsapp_deborah.json';
const FIREBASE_API_KEY = 'AIzaSyCQ87DLsSBWBr0ckqMZK45RyFmOvGdwaQQ'; // misma que usa el Panel (pública, no es secreta)
const MAX_EVENTOS    = 200;
const MAX_G1         = 500;
const ALERTAS_POLL_MS = 20000; // cada 20s revisa si hay alertas de deuda nuevas
const GRUPO_PALABRAS = ['moto', 'carlos'];
const PALABRAS_CLAVE = ['retiro', 'catedral', 'despacho', 'envio', 'envío'];
const AUTH_DIR       = path.join(__dirname, '.watcher_auth');

// ── Colores consola ────────────────────────────────────────────────
const C = {
  verde:    s => `\x1b[32m${s}\x1b[0m`,
  azul:     s => `\x1b[36m${s}\x1b[0m`,
  amarillo: s => `\x1b[33m${s}\x1b[0m`,
  rojo:     s => `\x1b[31m${s}\x1b[0m`,
  gris:     s => `\x1b[90m${s}\x1b[0m`,
};

// ── Firebase helpers ───────────────────────────────────────────────

function fbGet(path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: FIREBASE_DB, path }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

function fbPut(fbPath, data) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(data));
    const req = https.request({
      hostname: FIREBASE_DB, path: fbPath, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ── Autenticación anónima (solo para /alertas_whatsapp_deborah, que sí
//    exige login a diferencia de /retiros_wa y /grafica1_msgs) ────────
let _authToken = null;
let _authTokenExp = 0;

function fbAuthToken() {
  return new Promise((resolve, reject) => {
    if (_authToken && Date.now() < _authTokenExp) return resolve(_authToken);
    const buf = Buffer.from(JSON.stringify({ returnSecureToken: true }));
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          _authToken = j.idToken;
          _authTokenExp = Date.now() + 55 * 60 * 1000; // ~55 min de margen
          resolve(_authToken);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function fbGetAuth(fbPath) {
  return fbAuthToken().then(token => new Promise((resolve, reject) => {
    https.get({ hostname: FIREBASE_DB, path: `${fbPath}?auth=${token}` }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  }));
}

function fbPatchAuth(fbPath, data) {
  return fbAuthToken().then(token => new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(data));
    const req = https.request({
      hostname: FIREBASE_DB, path: `${fbPath}?auth=${token}`, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  }));
}

// ── Alertas de deuda vencida → WhatsApp ────────────────────────────
// Revisa /alertas_whatsapp_deborah cada ALERTAS_POLL_MS, manda por
// WhatsApp (a "Mensaje para mí") las que tengan enviado:false, y las
// marca enviado:true para no repetirlas.

async function revisarAlertasDeuda(sock) {
  try {
    const alertas = await fbGetAuth(FB_PATH_ALERTAS);
    if (!alertas) return;

    const miJid = jidNormalizedUser(sock.user.id);

    for (const id in alertas) {
      const a = alertas[id];
      if (!a || a.enviado) continue;
      try {
        await sock.sendMessage(miJid, { text: a.texto });
        await fbPatchAuth(`/alertas_whatsapp_deborah/${id}.json`, { enviado: true });
        console.log(C.verde(`  📲 Alerta de deuda enviada a WhatsApp (lead ${a.leadId || '?'})`));
      } catch (e) {
        console.error(C.rojo(`  ⚠️ No se pudo enviar alerta ${id}:`), e.message);
      }
    }
  } catch (e) {
    console.error(C.rojo('  ⚠️ Error revisando alertas de deuda:'), e.message);
  }
}

// ── Lógica de detección ────────────────────────────────────────────

function normalizar(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function detectarTipo(texto) {
  const n = normalizar(texto);
  const found = PALABRAS_CLAVE.filter(p => n.includes(normalizar(p)));
  return found.length > 0 ? found : null;
}

function esFodorGrup(nombre) {
  const n = normalizar(nombre || '');
  return GRUPO_PALABRAS.every(p => n.includes(p));
}

function esGrafica1(nombre) {
  const n = normalizar(nombre || '');
  return n.includes('grafica') && n.includes('1');
}

function ahora() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    hora:  `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    ts:    d.toISOString(),
  };
}

async function guardarMensajeGrafica1(evento) {
  try {
    let historial = await fbGet(FB_PATH_G1);
    if (historial && !Array.isArray(historial)) historial = Object.values(historial).filter(Boolean);
    if (!Array.isArray(historial)) historial = [];
    historial.unshift(evento);
    if (historial.length > MAX_G1) historial = historial.slice(0, MAX_G1);
    await fbPut(FB_PATH_G1, historial);
    console.log(C.verde('  ✅ Gráfica 1 guardado'), C.gris(`(${historial.length} msgs)`));
  } catch(err) {
    console.error(C.rojo('  ❌ Error Gráfica 1:'), err.message);
  }
}

async function guardarEvento(evento) {
  try {
    let historial = await fbGet(FB_PATH);
    if (historial && !Array.isArray(historial)) historial = Object.values(historial).filter(Boolean);
    if (!Array.isArray(historial)) historial = [];
    historial.unshift(evento);
    if (historial.length > MAX_EVENTOS) historial = historial.slice(0, MAX_EVENTOS);
    await fbPut(FB_PATH, historial);
    console.log(C.verde('  ✅ Guardado en Firebase'), C.gris(`(${historial.length} eventos)`));
  } catch(err) {
    console.error(C.rojo('  ❌ Error Firebase:'), err.message);
  }
}

// ── Conexión WhatsApp ──────────────────────────────────────────────

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '22.0.0'],
    connectTimeoutMs: 30000,
    retryRequestDelayMs: 2000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // Guardar QR como HTML y abrir en el navegador
      const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WhatsApp QR — Fodor</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head><body style="background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#fff;">
<h2 style="margin-bottom:20px;">📱 WhatsApp — Fodor Watcher</h2>
<div id="qr" style="background:#fff;padding:20px;border-radius:12px;"></div>
<p style="margin-top:20px;color:#aaa;font-size:14px;">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
<p style="color:#f59e0b;font-size:13px;">⚡ Este QR expira en 60 segundos — recarga si no funciona</p>
<script>new QRCode(document.getElementById("qr"), {text:"${qr.replace(/"/g,'\\"')}",width:280,height:280});</script>
</body></html>`;
      const qrFile = '/tmp/fodor_wa_qr.html';
      fs.writeFileSync(qrFile, htmlContent);
      exec('open /tmp/fodor_wa_qr.html');
      console.log(C.amarillo('\n  📷 QR abierto en el navegador — escanéalo con WhatsApp'));
      console.log(C.gris('     (WhatsApp → Dispositivos vinculados → Vincular dispositivo)\n'));
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(C.gris(`  Código de cierre: ${code || 'desconocido'}`));
      const reconectar = code !== DisconnectReason.loggedOut;
      if (reconectar) {
        console.log(C.amarillo('  🔄 Reconectando en 5 segundos...'));
        setTimeout(conectar, 5000);
      } else {
        console.log(C.rojo('  📵 Sesión cerrada. Eliminando sesión para re-escanear...'));
        const fs = require('fs');
        try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch(e) {}
        setTimeout(conectar, 2000);
      }
    } else if (connection === 'open') {
      console.log(C.verde('\n  🟢 WhatsApp CONECTADO — escuchando Fodor Grup...\n'));
      console.log(C.gris(`  💰 Alertas de deuda vencida: revisando cada ${ALERTAS_POLL_MS/1000}s (se envían a "Mensaje para mí")\n`));
      revisarAlertasDeuda(sock); // primera revisión inmediata
      setInterval(() => revisarAlertasDeuda(sock), ALERTAS_POLL_MS);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(C.gris(`  [DEBUG] messages.upsert type="${type}" count=${messages.length}`));

    for (const msg of messages) {
      try {
        const esGrupo = msg.key.remoteJid.endsWith('@g.us');
        const tieneMsg = !!msg.message;
        const esMio = msg.key.fromMe;

        // Ignorar mensajes propios solo en privado; en grupos capturar todo
        if (!tieneMsg) continue;
        if (esMio && !esGrupo) continue;

        // Extraer texto del mensaje
        const texto =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption || '';

        if (!esGrupo) {
          console.log(C.gris(`  [DEBUG] Mensaje privado ignorado: "${texto.substring(0,40)}"`));
          continue;
        }

        // Nombre del grupo
        let groupName = '';
        try {
          const meta = await sock.groupMetadata(msg.key.remoteJid);
          groupName = meta.subject || '';
        } catch(e) { groupName = msg.key.remoteJid; }

        console.log(C.azul(`  [DEBUG] Grupo: "${groupName}" | Texto: "${texto.substring(0,60)}"`));

        const remitente = msg.pushName || msg.key.participant || 'Desconocido';
        const { fecha, hora, ts } = ahora();

        // ── Gráfica 1: capturar TODO sin filtro ─────────────────────
        if (esGrafica1(groupName)) {
          const tieneImagen = !!(msg.message?.imageMessage || msg.message?.videoMessage);
          if (texto || tieneImagen) {
            console.log(C.verde(`\n  🖨️  GRÁFICA 1 — ${fecha} ${hora}`));
            console.log(C.azul(`     De:      ${remitente}`));
            if (texto) console.log(C.azul(`     Mensaje: ${texto.substring(0, 100)}`));
            if (tieneImagen) console.log(C.azul(`     Imagen:  ✓`));
            await guardarMensajeGrafica1({
              id: 'G1-' + Date.now(),
              fecha, hora, ts,
              grupo: groupName,
              remitente,
              mensaje: texto.substring(0, 500),
              tieneImagen,
              leido: false,
            });
          }
          continue;
        }

        // ── Retiros: filtrar por palabras clave en Moto Carlos Grupo ─
        const tipos = detectarTipo(texto);
        if (!tipos) {
          console.log(C.gris(`  [DEBUG] Sin palabras clave — ignorado`));
          continue;
        }

        if (!esFodorGrup(groupName)) {
          console.log(C.gris(`  [DEBUG] Grupo "${groupName}" no es Fodor Grup — ignorado`));
          continue;
        }

        const evento = {
          id:       'WA-' + Date.now(),
          fecha, hora,
          grupo:    groupName,
          remitente,
          mensaje:  texto.substring(0, 300),
          palabras: tipos,
          ts,
          leido:    false,
        };

        console.log(C.amarillo(`\n  🔔 RETIRO — ${fecha} ${hora}`));
        console.log(C.azul(`     Grupo:   ${groupName}`));
        console.log(C.azul(`     De:      ${remitente}`));
        console.log(C.azul(`     Mensaje: ${texto.substring(0, 100)}`));
        console.log(C.azul(`     Clave:   ${tipos.join(', ')}`));

        await guardarEvento(evento);

      } catch(e) {
        console.error(C.rojo('  ⚠️ Error procesando mensaje:'), e.message);
      }
    }
  });
}

// ── Arranque ───────────────────────────────────────────────────────

console.log(C.azul('\n══════════════════════════════════════════'));
console.log(C.azul('  📱 Fodor SpA — WhatsApp Watcher v2.0'));
console.log(C.azul('  (Protocolo directo — sin Chrome)'));
console.log(C.azul('══════════════════════════════════════════\n'));
console.log(C.gris('  Grupo:    "Moto Carlos Grupo"'));
console.log(C.gris('  Palabras:'), PALABRAS_CLAVE.join(', '));
console.log(C.gris('  Firebase:'), FIREBASE_DB);
console.log('');

conectar().catch(err => {
  console.error(C.rojo('Error fatal:'), err);
  process.exit(1);
});
