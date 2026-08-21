const functions = require('firebase-functions');
const https = require('https');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');
if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: 'https://odfor-bae97-default-rtdb.firebaseio.com',
  });
}

/* ==========================================================================
   TRELLO PROXY — Fodor SpA (agregado 20-08-2026)

   Por qué existe: _TRELLO_KEY/_TRELLO_TOKEN vivían como texto plano en el
   HTML del Panel — cualquiera que abriera "Ver código fuente" en el
   navegador los veía. Se revocaron y se vaciaron (ver comentario en
   index.html), lo que dejó "Enviar a Trello" roto (401 missing scopes).

   Qué hace: guarda la clave y el token de Trello en Secret Manager (nunca
   en el código ni en el navegador) y expone 3 funciones — una por cada
   operación que el Panel necesita — que el frontend llama sin conocer el
   secreto. Un secreto por operación, no una API key genérica reexpuesta:
   el navegador solo manda los datos de negocio (folio, nombre, lista).

   Qué NO hace: no toca EST, D26 ni ningún dato de facturación — solo
   reenvía a Trello lo que el Panel ya arma (nombre, descripción, lista).
   ========================================================================== */
const TRELLO_KEY = defineSecret('TRELLO_KEY');
const TRELLO_TOKEN = defineSecret('TRELLO_TOKEN');

function _trelloCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

function _trelloRequest(method, path, body, cb) {
  const data = body ? new URLSearchParams(body).toString() : '';
  const options = {
    hostname: 'api.trello.com',
    path: path,
    method: method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  };
  const req = https.request(options, (tRes) => {
    let out = '';
    tRes.on('data', (chunk) => { out += chunk; });
    tRes.on('end', () => cb(null, tRes.statusCode, out));
  });
  req.on('error', (e) => cb(e));
  if (method !== 'GET' && data) req.write(data);
  req.end();
}

exports.trelloCrearTarjeta = functions
  .runWith({ secrets: [TRELLO_KEY, TRELLO_TOKEN], memory: '256MB', timeoutSeconds: 20 })
  .https.onRequest((req, res) => {
    if (_trelloCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
    const b = req.body || {};
    if (!b.idList || !b.name) { res.status(400).json({ error: 'faltan idList o name' }); return; }
    const body = {
      key: TRELLO_KEY.value(), token: TRELLO_TOKEN.value(),
      idList: b.idList, name: b.name, desc: b.desc || '',
    };
    if (b.due) body.due = b.due;
    if (b.idLabels) body.idLabels = b.idLabels;
    _trelloRequest('POST', '/1/cards', body, (err, status, out) => {
      if (err) { res.status(500).json({ error: err.message }); return; }
      res.status(status).set('Content-Type', 'application/json').send(out);
    });
  });

exports.trelloAgregarComentario = functions
  .runWith({ secrets: [TRELLO_KEY, TRELLO_TOKEN], memory: '256MB', timeoutSeconds: 20 })
  .https.onRequest((req, res) => {
    if (_trelloCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
    const b = req.body || {};
    if (!b.cardId || !b.texto) { res.status(400).json({ error: 'faltan cardId o texto' }); return; }
    const body = { key: TRELLO_KEY.value(), token: TRELLO_TOKEN.value(), text: b.texto };
    _trelloRequest('POST', '/1/cards/' + encodeURIComponent(b.cardId) + '/actions/comments', body, (err, status, out) => {
      if (err) { res.status(500).json({ error: err.message }); return; }
      res.status(status).set('Content-Type', 'application/json').send(out);
    });
  });

exports.trelloMoverTarjeta = functions
  .runWith({ secrets: [TRELLO_KEY, TRELLO_TOKEN], memory: '256MB', timeoutSeconds: 20 })
  .https.onRequest((req, res) => {
    if (_trelloCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
    const b = req.body || {};
    if (!b.cardId || !b.idList) { res.status(400).json({ error: 'faltan cardId o idList' }); return; }
    const path = '/1/cards/' + encodeURIComponent(b.cardId)
      + '?key=' + encodeURIComponent(TRELLO_KEY.value())
      + '&token=' + encodeURIComponent(TRELLO_TOKEN.value())
      + '&idList=' + encodeURIComponent(b.idList);
    _trelloRequest('PUT', path, null, (err, status, out) => {
      if (err) { res.status(500).json({ error: err.message }); return; }
      res.status(status).set('Content-Type', 'application/json').send(out);
    });
  });

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

/* ==========================================================================
   RECALCULAR DEUDA POR RUT — Fodor SpA (agregado 10-08-2026)
   Vive en el proyecto de PRODUCCION (odfor-bae97).

   Que hace: cada vez que el Panel guarda algo en /estado/EST (se marca un
   pago, se anula, se agrega gestión), recalcula la deuda pendiente de TODOS
   los clientes desde la única fuente de verdad real (D26+D25+D24+D26_EXTRA,
   cruzado con EST) y actualiza deuda_por_rut/rut/{rut} — el nodo que lee
   la función alertaCobranza (Cloud Run, independiente, no se toca acá).

   Por que existe: deuda_por_rut era un nodo huérfano — nada lo escribía.
   Quedó con datos manuales/desactualizados que no correspondían a la
   realidad del Panel (verificado 10-08-2026 con el caso Rapa Nui, RUT
   78.142.889-2: el número real es $65.450 / 1 factura / 315 días, y no
   coincidía con lo que había cacheado). Esta función reemplaza esa carga
   manual por un cálculo automático, trazable y desde una sola fuente de
   verdad (principio OEGS #3 — CLAUDE.md).

   Que NO hace: no toca EST, no toca D26/D25/D24, no manda mensajes a nadie,
   no crea notas en Kommo (eso lo sigue haciendo alertaCobranza, sin cambios
   en su código).
   ========================================================================== */

function rutNorm(r) {
  return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function diasVencido(fechaVencIso, hoy) {
  try {
    const v = new Date(fechaVencIso.slice(0, 10) + 'T00:00:00');
    return Math.round((hoy - v) / 86400000);
  } catch (e) {
    return null;
  }
}

async function calcularYPublicarDeudaPorRut() {
  const db = admin.database();

  // IMPORTANTE — dos particularidades del guardado de este Panel:
  //
  // 1) D26, D25, D24, D26_EXTRA y EST se guardan como STRING JSON
  //    DOBLE-CODIFICADO (JSON.stringify aplicado dos veces), no como nodos
  //    reales con hijos. Por eso snap.exists()===true pero
  //    snap.numChildren()===0: es un valor de texto plano, no un objeto.
  //    Hay que leer snap.val() como string y hacer JSON.parse dos veces.
  //    (Mismo patrón ya documentado y usado en informe-impagas.html y en
  //    los scripts de diagnóstico de sesiones anteriores.)
  //
  // 2) Si alguna vez se guardara como nodo real con hijos, evitar
  //    snap.val() + Object.values() en nodos grandes: si las claves
  //    numéricas no son 0,1,2,3... seguidas (como en D26_EXTRA, indexado
  //    por folio), el SDK puede reconstruir un arreglo con huecos hasta el
  //    índice más alto, multiplicando la memoria real necesaria (esto tiró
  //    "heap out of memory" en un intento anterior). Por eso se contempla
  //    también la vía forEach() como respaldo.
  function decodificarNodo(snap) {
    if (!snap.exists()) return null;
    const v = snap.val();
    if (typeof v === 'string') {
      try {
        let parsed = JSON.parse(v);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
      } catch (e) {
        console.error('No se pudo decodificar', snap.ref.toString(), e.message);
        return null;
      }
    }
    return v;
  }

  function aArray(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor;
    return Object.values(valor);
  }

  const [d26Snap, d25Snap, d24Snap, d26ExtraSnap, estSnap] = await Promise.all([
    db.ref('estado/D26').once('value'),
    db.ref('estado/D25').once('value'),
    db.ref('estado/D24').once('value'),
    db.ref('estado/D26_EXTRA').once('value'),
    db.ref('estado/EST').once('value'),
  ]);

  const todasConDuplicados = [
    ...aArray(decodificarNodo(d26Snap)),
    ...aArray(decodificarNodo(d25Snap)),
    ...aArray(decodificarNodo(d24Snap)),
    ...aArray(decodificarNodo(d26ExtraSnap)),
  ];

  // FIX 12-08-2026 — deduplicar por folio antes de sumar.
  // Encontrado: 668 folios existen simultáneamente en D25 y D26_EXTRA con
  // saldo IDÉNTICO en ambas fuentes (verificado, 0 inconsistencias) —
  // D26_EXTRA es la reimportación más completa (trae fecha_venc_iso que D25
  // no tiene). Sin este dedup, esos folios se sumaban dos veces: inflaba la
  // deuda total del sistema en $243.984.784 (662 de esos folios estaban
  // pendientes de pago). Caso que lo destapó: EVENTOS E.M.LTDA, RUT
  // 77.675.924-4 (folios 42835 y 37623 contados dos veces).
  // Al recorrer el array en orden D26→D25→D24→D26_EXTRA y quedarnos con la
  // ÚLTIMA aparición de cada folio, el duplicado automáticamente conserva
  // la versión de D26_EXTRA (la más completa), sin perder ningún dato.
  const porFolio = new Map();
  for (const r of todasConDuplicados) {
    if (r && r.folio) porFolio.set(String(r.folio), r);
  }
  const todas = Array.from(porFolio.values());

  const estVal = decodificarNodo(estSnap) || {};

  const hoy = new Date();
  const porRut = {};

  for (const r of todas) {
    if (!r || !r.folio || !r.rut) continue;
    const folio = String(r.folio);
    const pagado = !!(estVal[folio] && estVal[folio].pagado);
    if (pagado) continue;

    const key = rutNorm(r.rut);
    if (!key) continue;

    if (!porRut[key]) {
      porRut[key] = { rut: r.rut, empresa: r.empresa || '', facturas: [] };
    }
    const venc = r.fecha_venc_iso || r.fecha_iso || null;
    porRut[key].facturas.push({
      folio,
      saldo: Number(r.saldo) || 0,
      fecha_venc_iso: venc,
      dias_vencido: venc ? diasVencido(venc, hoy) : null,
    });
  }

  const salida = {};
  for (const key in porRut) {
    const c = porRut[key];
    const total = c.facturas.reduce((s, f) => s + (f.saldo || 0), 0);
    const diasMax = c.facturas.reduce((m, f) => Math.max(m, f.dias_vencido || 0), 0);

    // Subconjunto vencido (dias_vencido > 0) — es lo que alertaCobranza usa
    // para decidir si avisa y con qué texto.
    const facturasVencidas = c.facturas.filter((f) => (f.dias_vencido || 0) > 0);
    const totalVencido = facturasVencidas.reduce((s, f) => s + (f.saldo || 0), 0);
    const diasMaxVencido = facturasVencidas.reduce((m, f) => Math.max(m, f.dias_vencido || 0), 0);

    salida[key] = {
      rut: c.rut,
      empresa: c.empresa,

      // ---- Contrato que consume alertaCobranza (Cloud Run, código en
      // otro servicio — NO se modifica, ver source en
      // us-central1-odfor-bae97.cloudfunctions.net/alertaCobranza).
      // Encontrado 11-08-2026: hasta este fix estos campos NO existían,
      // por eso alertaCobranza devolvía "sin_deuda" para TODOS los
      // clientes desde el 10-08-2026 (fecha en que este nodo se reemplazó
      // por primera vez) — no era un problema de un cliente puntual.
      total,                        // deuda total pendiente (vencida o no)
      vencido: totalVencido,        // solo la parte vencida
      nVenc: facturasVencidas.length,
      masViejo: diasMaxVencido,
      n: c.facturas.length,

      // ---- Campos propios de este Panel (usados por listarAlertasDelDia,
      // notificarAlertaWhatsapp y por cualquier futura pantalla del Panel).
      // Se mantienen igual, no se tocan sus consumidores.
      cantidad_facturas: c.facturas.length,
      total_pendiente: total,
      dias_mas_antigua: diasMax,
      folios: c.facturas.map((f) => f.folio),
      actualizado_ts: hoy.toISOString(),
      fuente: 'recalcularDeudaPorRut v2 (D26+D25+D24+D26_EXTRA+EST) — con contrato alertaCobranza',
    };
  }

  await db.ref('deuda_por_rut/rut').set(salida);
  await db.ref('deuda_por_rut/ts').set(hoy.toISOString());
  await db.ref('deuda_por_rut/meta').set({
    clientes_con_deuda: Object.keys(salida).length,
    calculado_por: 'recalcularDeudaPorRut',
  });

  return {
    clientes_con_deuda: Object.keys(salida).length,
    total_facturas_procesadas: todas.length,
  };
}

/* ==========================================================================
   NOTIFICAR ALERTA WHATSAPP — Fodor SpA (agregado 10-08-2026)

   Que hace: cada vez que alertaCobranza manda una alerta de "DEUDA VENCIDA"
   a un lead de Kommo, deja registro en /cobranza_avisos/{leadId} (para su
   propio control de no repetir aviso antes de 24h — eso NO se toca). Esta
   función escucha esa misma escritura y arma un mensaje para WhatsApp,
   cruzando el RUT (mismo formato normalizado en ambos nodos) contra
   deuda_por_rut/rut/{rut} para sacar empresa, monto y días de atraso reales.

   El mensaje se deja en /alertas_whatsapp_deborah — un proceso aparte que
   corre en el Mac (whatsapp-watcher.js) lo lee y lo manda por WhatsApp.
   Esta función NO manda el WhatsApp directamente: no tiene cómo, vive en la
   nube y la sesión de WhatsApp está en el teléfono/Mac de Deborah.

   Que NO hace: no modifica alertaCobranza, no modifica cobranza_avisos, no
   crea ni borra notas de Kommo.
   ========================================================================== */
exports.notificarAlertaWhatsapp = functions
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .database.ref('/cobranza_avisos/{leadId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists()) return null; // se borró, no se avisa
    const aviso = change.after.val();
    if (!aviso || !aviso.rut) return null;

    const db = admin.database();
    // BUG encontrado 11-08-2026: deuda_por_rut se guarda con la clave
    // normalizada (rutNorm, solo dígitos/K) pero acá se estaba consultando
    // con aviso.rut tal cual viene ("77.675.924-4"). Firebase RTDB no
    // permite "." en las rutas, así que esto lanzaba una excepción y
    // notificarAlertaWhatsapp se caía en silencio para cualquier cliente
    // cuyo RUT tuviera puntos (la mayoría). Caso detectado: EVENTOS
    // E.M.LTDA, RUT 77.675.924-4.
    const infoSnap = await db.ref(`deuda_por_rut/rut/${rutNorm(aviso.rut)}`).once('value');
    const info = infoSnap.val();

    const monto = Number(aviso.monto || (info && info.total_pendiente) || 0)
      .toLocaleString('es-CL');
    const empresa = (info && info.empresa) || 'Cliente sin nombre en el Panel';
    const dias = info && info.dias_mas_antigua;
    const facturas = info && info.cantidad_facturas;

    const texto =
      `⚠️ *DEUDA VENCIDA* — se avisó en Kommo\n` +
      `${empresa}\n` +
      `RUT: ${aviso.rut}\n` +
      `Monto: $${monto}` +
      (facturas ? ` (${facturas} factura${facturas === 1 ? '' : 's'})` : '') +
      (dias ? `\nLa más antigua: ${dias} días vencida` : '') +
      `\nLead Kommo: ${context.params.leadId}`;

    await db.ref('alertas_whatsapp_deborah').push({
      texto,
      leadId: context.params.leadId,
      rut: aviso.rut,
      ts: Date.now(),
      enviado: false,
    });

    console.log(`Aviso WhatsApp encolado para lead ${context.params.leadId}`);
    return null;
  });

// Memoria: se sube a 1GB como margen de seguridad además del fix de
// snapAArray (que ya evita el problema real de fondo).
const CONFIG_MEMORIA = { memory: '1GB', timeoutSeconds: 120 };

// Se dispara sola cada vez que el Panel guarda /estado/EST
exports.recalcularDeudaPorRut = functions
  .runWith(CONFIG_MEMORIA)
  .database.ref('/estado/EST')
  .onWrite(async (change, context) => {
    const r = await calcularYPublicarDeudaPorRut();
    console.log(`deuda_por_rut recalculada: ${r.clientes_con_deuda} clientes con deuda pendiente.`);
    return null;
  });

// Endpoint manual para probar sin esperar un cambio real en EST.
// NO requiere token — solo lee y recalcula, no expone ni modifica nada
// sensible. Se puede restringir después si se quiere.
exports.recalcularDeudaPorRutManual = functions
  .runWith(CONFIG_MEMORIA)
  .https.onRequest(async (req, res) => {
    try {
      const r = await calcularYPublicarDeudaPorRut();
      res.json({ ok: true, ...r });
    } catch (e) {
      console.error('ERROR en recalcularDeudaPorRutManual:', e);
      res.status(500).json({ ok: false, error: e.message, stack: e.stack });
    }
  });

/* ==========================================================================
   LISTAR ALERTAS DE UN DÍA — Fodor SpA (agregado 10-08-2026)
   Devuelve, para una fecha dada (YYYY-MM-DD, por defecto hoy), los clientes
   a los que alertaCobranza les mandó aviso de deuda vencida, con empresa,
   monto y días de atraso (cruzando cobranza_avisos con deuda_por_rut).
   Parámetro opcional: ?fecha=2026-08-09
   ========================================================================== */
exports.listarAlertasDelDia = functions
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    try {
      const db = admin.database();
      const fechaObjetivo = req.query.fecha || new Date().toISOString().slice(0, 10);

      const [avisosSnap, deudaSnap] = await Promise.all([
        db.ref('cobranza_avisos').once('value'),
        db.ref('deuda_por_rut/rut').once('value'),
      ]);

      const avisos = avisosSnap.val() || {};
      const deuda = deudaSnap.val() || {};

      const resultado = [];
      for (const leadId in avisos) {
        const a = avisos[leadId];
        if (!a || !a.ts) continue;
        const fechaAviso = new Date(a.ts).toISOString().slice(0, 10);
        if (fechaAviso !== fechaObjetivo) continue;

        const info = deuda[a.rut] || {};
        resultado.push({
          leadId,
          rut: a.rut,
          empresa: info.empresa || null,
          monto: a.monto,
          cantidad_facturas: info.cantidad_facturas || null,
          dias_mas_antigua: info.dias_mas_antigua || null,
          hora: new Date(a.ts).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' }),
        });
      }

      resultado.sort((x, y) => (y.monto || 0) - (x.monto || 0));

      res.json({
        ok: true,
        fecha: fechaObjetivo,
        total_alertas: resultado.length,
        clientes: resultado,
      });
    } catch (e) {
      console.error('ERROR en listarAlertasDelDia:', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
