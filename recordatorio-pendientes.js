#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  Recordatorio diario de pendientes → WhatsApp
//
//  Lee PENDIENTES.md, arma el texto del recordatorio y lo deja en
//  Firebase (/alertas_whatsapp_deborah). El proceso whatsapp-watcher.js
//  lo detecta dentro de ~20s y lo envía por WhatsApp a "Mensaje para mí".
//
//  NO modifica whatsapp-watcher.js. Solo escribe en la cola que ese
//  proceso ya consume.
//
//  Uso:  node recordatorio-pendientes.js [--dry-run] [--modo cierre]
//
//    modo recordatorio (por defecto, 11:00): pendientes con otras personas.
//    modo cierre (19:30): todo lo abierto, preguntando en qué quedó cada cosa.
// ══════════════════════════════════════════════════════════════════

const https = require('https');
const path  = require('path');
const fs    = require('fs');

// ── Configuración ─────────────────────────────────────────────────
const CONFIG = {
  firebaseDb:     process.env.FODOR_FIREBASE_DB  || 'odfor-bae97-default-rtdb.firebaseio.com',
  firebaseApiKey: process.env.FODOR_FIREBASE_KEY || 'AIzaSyCQ87DLsSBWBr0ckqMZK45RyFmOvGdwaQQ',
  colaAlertas:    '/alertas_whatsapp_deborah',
  archivoPendientes: path.join(__dirname, 'PENDIENTES.md'),
  diasUrgente:    3,
  prefijo:        '📋 PENDIENTES',
  prefijoCierre:  '🌙 CIERRE DEL DÍA',
};

const DRY_RUN = process.argv.includes('--dry-run');
const MODO = process.argv.includes('--modo') ? process.argv[process.argv.indexOf('--modo') + 1] : 'recordatorio';
if (!['recordatorio', 'cierre'].includes(MODO)) {
  console.error(`❌ Modo desconocido: "${MODO}". Usa "recordatorio" o "cierre".`);
  process.exit(1);
}

// ── Lectura de pendientes ─────────────────────────────────────────
// Formato esperado por línea, bajo la sección "## Abiertos":
//   - **YYYY-MM-DD — Persona**: qué le pedí
//   (líneas indentadas que siguen son detalle del mismo pendiente)

// Secciones reconocidas: "Abiertos" (pedidos a otras personas) y
// "Mis trabajos" (cosas que Deborah empezó ella misma).

function leerPendientes(archivo) {
  if (!fs.existsSync(archivo)) {
    throw new Error(`No existe el archivo de pendientes: ${archivo}`);
  }
  const lineas = fs.readFileSync(archivo, 'utf8').split('\n');

  const seccionDe = titulo => {
    const t = titulo.replace(/^##\s+/, '').trim().toLowerCase();
    if (t === 'con fecha') return 'fecha';
    if (t === 'abiertos') return 'personas';
    if (t === 'mis trabajos') return 'propios';
    return null;
  };

  let seccion = null;
  const items = [];

  for (const linea of lineas) {
    if (/^##\s/.test(linea)) {
      seccion = seccionDe(linea);
      continue;
    }
    if (!seccion) continue;

    const m = linea.match(/^-\s+\*\*(\d{4}-\d{2}-\d{2})\s+—\s+([^*]+?)\*\*:\s*(.+)$/);
    if (m) {
      items.push({
        seccion,
        fecha:   m[1],
        persona: m[2].trim(),
        asunto:  m[3].trim(),
        detalle: [],
      });
      continue;
    }

    const d = linea.match(/^\s{2,}-\s+(.+)$/);
    if (d && items.length > 0) {
      items[items.length - 1].detalle.push(d[1].trim());
    }
  }

  return items;
}

function diasAbierto(fechaISO, hoy = new Date()) {
  const desde = new Date(`${fechaISO}T00:00:00`);
  const base  = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((base - desde) / 86400000));
}

// ── Armado del mensaje ────────────────────────────────────────────

// En la sección "Con fecha", la fecha es el VENCIMIENTO, no el registro.
function diasFaltantes(fechaISO, hoy = new Date()) {
  const hasta = new Date(`${fechaISO}T00:00:00`);
  const base  = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((hasta - base) / 86400000);
}

function etiquetaPlazo(dias) {
  if (dias < 0)  return `¡ATRASADO ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}!`;
  if (dias === 0) return '¡ES HOY!';
  if (dias === 1) return 'MAÑANA';
  return `faltan ${dias} días`;
}

// Bloque de cosas con fecha, ordenadas por urgencia. Se muestra primero
// en ambos mensajes: es lo que no se puede dejar pasar.
function bloqueConFecha(items) {
  const conFecha = items
    .filter(i => i.seccion === 'fecha')
    .map(i => ({ ...i, faltan: diasFaltantes(i.fecha) }))
    .sort((a, b) => a.faltan - b.faltan);

  if (conFecha.length === 0) return null;

  const linea = i => {
    const [, mes, dia] = i.fecha.split('-');
    return `☐ ${dia}/${mes} · ${i.persona} — ${i.asunto} (${etiquetaPlazo(i.faltan)})${conDetalle(i)}`;
  };
  return `\n📅 CON FECHA\n` + conFecha.map(linea).join('\n');
}

function etiquetaDias(dias) {
  return dias === 0 ? 'hoy' : dias === 1 ? '1 día' : `${dias} días`;
}

function conDetalle(item) {
  return item.detalle.length ? `\n   ${item.detalle.join('\n   ')}` : '';
}

// 11:00 — solo lo que espera respuesta de otra persona.
function textoRecordatorio(items) {
  const abiertos = items.filter(i => i.seccion === 'personas').map(i => ({ ...i, dias: diasAbierto(i.fecha) }));
  const fechas = bloqueConFecha(items);
  if (abiertos.length === 0 && !fechas) return null;

  const urgentes = abiertos.filter(i => i.dias > CONFIG.diasUrgente);
  const normales = abiertos.filter(i => i.dias <= CONFIG.diasUrgente);
  const linea = i => `• ${i.persona} — ${i.asunto} (${etiquetaDias(i.dias)})${conDetalle(i)}`;

  const partes = [`${CONFIG.prefijo} — ${abiertos.length} esperando respuesta`];
  if (fechas) partes.push(fechas);
  if (urgentes.length) partes.push(`\n🔴 URGENTE (más de ${CONFIG.diasUrgente} días)\n` + urgentes.map(linea).join('\n'));
  if (normales.length) partes.push(`\n⏳ En espera\n` + normales.map(linea).join('\n'));
  return partes.join('\n');
}

// 19:30 — checklist de cierre: todo lo abierto, preguntando en qué quedó.
function textoCierre(items) {
  if (items.length === 0) return null;

  const fechas   = bloqueConFecha(items);
  const conDias  = items.filter(i => i.seccion !== 'fecha').map(i => ({ ...i, dias: diasAbierto(i.fecha) }));
  const deHoy    = conDias.filter(i => i.dias === 0);
  const arrastre = conDias.filter(i => i.dias > 0);

  const casilla = i => `☐ ${i.persona} — ${i.asunto}${conDetalle(i)}`;
  const casillaConDias = i => `☐ ${i.persona} — ${i.asunto} (${etiquetaDias(i.dias)})${conDetalle(i)}`;

  const partes = [`${CONFIG.prefijoCierre}\n¿En qué quedó cada una?`];

  if (fechas) partes.push(fechas);
  if (deHoy.length) {
    partes.push(`\n📌 Empezaste hoy\n` + deHoy.map(casilla).join('\n'));
  }
  if (arrastre.length) {
    partes.push(`\n📂 Viene de antes\n` + arrastre.map(casillaConDias).join('\n'));
  }

  partes.push(`\n👉 Respóndeme cuáles cerraste y las saco de la lista.`);
  return partes.join('\n');
}

// ── Firebase ──────────────────────────────────────────────────────

function pedirToken() {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify({ returnSecureToken: true }));
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signUp?key=${CONFIG.firebaseApiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (!j.idToken) return reject(new Error(`Sin idToken: ${data.slice(0, 200)}`));
          resolve(j.idToken);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function encolarAlerta(token, id, payload) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(payload));
    const req = https.request({
      hostname: CONFIG.firebaseDb,
      path: `${CONFIG.colaAlertas}/${id}.json?auth=${token}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.statusCode);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────
// Idempotencia: el id incluye la fecha, así que si el script corre dos
// veces el mismo día se sobrescribe la misma entrada en vez de duplicar.

(async () => {
  try {
    const items = leerPendientes(CONFIG.archivoPendientes);
    const texto = MODO === 'cierre' ? textoCierre(items) : textoRecordatorio(items);

    if (!texto) {
      console.log('Sin pendientes abiertos — no se envía nada.');
      return;
    }

    console.log('─── Mensaje ───');
    console.log(texto);
    console.log('───────────────');

    if (DRY_RUN) {
      console.log('DRY RUN — no se escribió en Firebase.');
      return;
    }

    const hoy = new Date();
    const pad = n => String(n).padStart(2, '0');
    const id = `${MODO}-${hoy.getFullYear()}${pad(hoy.getMonth() + 1)}${pad(hoy.getDate())}`;

    const token = await pedirToken();
    await encolarAlerta(token, id, {
      texto,
      enviado: false,
      origen: `recordatorio-pendientes:${MODO}`,
      ts: hoy.toISOString(),
    });

    console.log(`✅ Encolado como ${id}. El watcher lo enviará en ~20s.`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
