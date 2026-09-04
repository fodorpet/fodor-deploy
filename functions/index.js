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

// FIX 25-08-2026 — antes se disparaba con onWrite en /estado/EST. Gen1
// entrega el nodo /estado/EST COMPLETO (antes+después) como payload del
// evento, y ese nodo ya creció tanto que superó el límite duro de Google
// para triggers de RTDB: toda escritura a /estado empezó a rechazarse con
// TRIGGER_PAYLOAD_TOO_LARGE (bloqueaba el guardado de CUALQUIER pago en el
// Panel, no solo el que se estuviera probando). La función nunca usó el
// contenido del evento — calcularYPublicarDeudaPorRut() lee los datos
// directo de la base — así que pasar a horario elimina el problema de raíz
// sin cambiar el resultado ni el contrato de salida (deuda_por_rut).
// Contrapartida aceptada: hasta 3 min de desfase en vez de instantáneo.
exports.recalcularDeudaPorRut = functions
  .runWith(CONFIG_MEMORIA)
  .pubsub.schedule('every 3 minutes')
  .onRun(async (context) => {
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

/* ==========================================================================
   AGENDA DIARIA DE COBRANZA — Fodor SpA (agregado 2026-09-03)

   Por que existe: los compromisos de pago SI se guardan en el Panel
   (EST[folio].historial[].compromisoFecha) y el Panel incluso los muestra
   en "Compromisos para hoy". El problema reportado por la usuaria no es
   que falte la funcion, es que hay que acordarse de entrar a mirarla.
   Esta funcion invierte eso: la agenda la busca a ella.

   Que hace: cada dia habil a las 08:30 (America/Santiago) revisa los
   compromisos de pago y deja UN mensaje en /alertas_whatsapp_deborah, la
   misma cola que ya lee whatsapp-watcher.js en el Mac.

   Que NO hace: no modifica EST, ni el historial, ni la bitacora, ni
   D26/D25/D24/D26_EXTRA, ni deuda_por_rut, ni Kommo. No crea notas. Solo
   lee estado/* y escribe la cola de avisos mas su propia marca de dia.
   ========================================================================== */

const AGENDA_TOPE_LISTA = 10;   // maximo de clientes detallados por bloque
const AGENDA_ZONA = 'America/Santiago';

function _agPlata(n) {
  return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');
}

// Fecha de HOY en Chile como 'YYYY-MM-DD'. Se compara como texto contra
// compromisoFecha (que el Panel guarda con <input type="date">, mismo
// formato) para no arrastrar errores de zona horaria.
function _agHoy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: AGENDA_ZONA });
}

function _agFecha(iso) {
  const s = String(iso || '').slice(0, 10);
  const p = s.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] : s;
}

function _agDias(desde, hasta) {
  const a = new Date(desde + 'T00:00:00Z'), b = new Date(hasta + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Copia local deliberada del decodificador de nodos. NO se reutiliza el de
// calcularYPublicarDeudaPorRut porque esta definido dentro de esa funcion y
// extraerlo obligaria a modificar codigo critico durante un cambio que no lo
// necesita. Deuda tecnica anotada a proposito.
function _agDecodificar(snap) {
  if (!snap.exists()) return null;
  const v = snap.val();
  if (typeof v === 'string') {
    try {
      let p = JSON.parse(v);
      if (typeof p === 'string') p = JSON.parse(p);
      return p;
    } catch (e) {
      console.error('agenda: no se pudo decodificar', snap.ref.toString(), e.message);
      return null;
    }
  }
  return v;
}

function _agArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return Object.values(v);
}

async function construirAgendaCobranza() {
  const db = admin.database();
  const hoy = _agHoy();

  const [d26, d25, d24, d26e, estSnap, borrSnap, borr25Snap] = await Promise.all([
    db.ref('estado/D26').once('value'),
    db.ref('estado/D25').once('value'),
    db.ref('estado/D24').once('value'),
    db.ref('estado/D26_EXTRA').once('value'),
    db.ref('estado/EST').once('value'),
    db.ref('estado/BORRADAS').once('value'),
    db.ref('estado/BORRADAS25').once('value'),
  ]);

  // Mismo dedup por folio que recalcularDeudaPorRut (fix 12-08-2026):
  // recorrer D26 -> D25 -> D24 -> D26_EXTRA y quedarse con la ultima
  // aparicion deja la version mas completa de cada folio.
  const porFolio = new Map();
  for (const r of [
    ..._agArray(_agDecodificar(d26)),
    ..._agArray(_agDecodificar(d25)),
    ..._agArray(_agDecodificar(d24)),
    ..._agArray(_agDecodificar(d26e)),
  ]) {
    if (r && r.folio) porFolio.set(String(r.folio), r);
  }

  const borradas = new Set(
    [..._agArray(_agDecodificar(borrSnap)), ..._agArray(_agDecodificar(borr25Snap))]
      .map((f) => String(f))
  );

  const EST = _agDecodificar(estSnap) || {};
  const vencidos = [], deHoy = [], proximos = [];

  for (const folio in EST) {
    const e = EST[folio];
    if (!e || e.pagado) continue;
    if (borradas.has(String(folio))) continue;

    const hist = Array.isArray(e.historial) ? e.historial : _agArray(e.historial);
    if (!hist.length) continue;

    // Ultima gestion con compromiso (por ts; si no hay ts, por orden).
    let ult = null;
    for (const h of hist) {
      if (!h || !h.compromisoFecha) continue;
      if (!ult) { ult = h; continue; }
      if (String(h.ts || '') >= String(ult.ts || '')) ult = h;
    }
    if (!ult) continue;

    // Estado de gestion vigente = el de la ultima entrada del historial.
    const vig = hist[hist.length - 1] || {};
    if (vig.estadoGest === 'ANULADA' || vig.estadoGest === 'PAGADO') continue;

    const comp = String(ult.compromisoFecha).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(comp)) continue;

    const r = porFolio.get(String(folio)) || {};
    const item = {
      folio: String(folio),
      empresa: r.empresa || '(sin razon social)',
      saldo: Number(r.saldo) || 0,
      comp,
      dias: _agDias(comp, hoy),
    };

    if (comp < hoy) vencidos.push(item);
    else if (comp === hoy) deHoy.push(item);
    else if (_agDias(hoy, comp) <= 7) proximos.push(item);
  }

  vencidos.sort((a, b) => b.saldo - a.saldo);
  deHoy.sort((a, b) => b.saldo - a.saldo);

  const suma = (l) => l.reduce((s, x) => s + x.saldo, 0);
  const linea = (x) => '• ' + x.empresa + ' — ' + _agPlata(x.saldo) + ' (folio ' + x.folio + ')';

  let txt = '📅 *AGENDA DE COBRANZA* — ' + _agFecha(hoy) + '\n';

  if (deHoy.length) {
    txt += '\n✅ *Prometieron pagar HOY* (' + deHoy.length + ' · ' + _agPlata(suma(deHoy)) + ')\n';
    txt += deHoy.slice(0, AGENDA_TOPE_LISTA).map(linea).join('\n');
    if (deHoy.length > AGENDA_TOPE_LISTA) txt += '\n… y ' + (deHoy.length - AGENDA_TOPE_LISTA) + ' mas';
    txt += '\n';
  }

  if (vencidos.length) {
    txt += '\n🚨 *Prometieron y no pagaron* (' + vencidos.length + ' · ' + _agPlata(suma(vencidos)) + ')\n';
    txt += vencidos.slice(0, AGENDA_TOPE_LISTA)
      .map((x) => linea(x) + ' — dijo ' + _agFecha(x.comp) + ', hace ' + x.dias + 'd').join('\n');
    if (vencidos.length > AGENDA_TOPE_LISTA) txt += '\n… y ' + (vencidos.length - AGENDA_TOPE_LISTA) + ' mas';
    txt += '\n';
  }

  if (proximos.length) {
    txt += '\n🔔 Prometieron pagar en los proximos 7 dias: ' + proximos.length +
           ' · ' + _agPlata(suma(proximos)) + '\n';
  }

  if (!deHoy.length && !vencidos.length && !proximos.length) {
    txt += '\nNo hay compromisos de pago registrados.\n' +
           'Si cobraste y te dieron fecha, anotala en el Panel para que aparezca aca.';
  }

  return {
    texto: txt.trim(),
    hoy,
    n_hoy: deHoy.length,
    n_vencidos: vencidos.length,
    n_proximos: proximos.length,
  };
}

exports.agendaCobranzaDiaria = functions
  .runWith(CONFIG_MEMORIA)
  .pubsub.schedule('30 8 * * 1-5')
  .timeZone(AGENDA_ZONA)
  .onRun(async () => {
    const a = await construirAgendaCobranza();

    // Idempotencia: si este dia ya se encolo (reintento de Cloud Functions),
    // la transaccion aborta y no se manda dos veces el mismo mensaje.
    const marca = await admin.database().ref('agenda_cobranza/ultimo_envio')
      .transaction((cur) => (cur === a.hoy ? undefined : a.hoy));
    if (!marca.committed) {
      console.log('agenda: ya se habia enviado la de ' + a.hoy + ', no se repite.');
      return null;
    }

    await admin.database().ref('alertas_whatsapp_deborah').push({
      texto: a.texto,
      tipo: 'agenda_cobranza',
      ts: Date.now(),
      enviado: false,
    });

    console.log('agenda encolada ' + a.hoy + ': hoy=' + a.n_hoy +
                ' vencidos=' + a.n_vencidos + ' proximos=' + a.n_proximos);
    return null;
  });

// Prueba manual: devuelve el texto EXACTO que se enviaria, sin encolar nada
// ni tocar la marca de dia. Sirve para revisar el mensaje antes de confiar
// en el envio automatico.
exports.agendaCobranzaPreview = functions
  .runWith(CONFIG_MEMORIA)
  .https.onRequest(async (req, res) => {
    try {
      const a = await construirAgendaCobranza();
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(a.texto + '\n\n---\n(vista previa: NO se envio nada)\n' +
               'hoy=' + a.n_hoy + ' vencidos=' + a.n_vencidos + ' proximos=' + a.n_proximos);
    } catch (e) {
      console.error('ERROR en agendaCobranzaPreview:', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
