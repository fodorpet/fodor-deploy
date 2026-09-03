/* ============================================================
   ALERTA DE COBRANZA - Fodor Spa
   Vive en el proyecto de PRODUCCION (odfor-bae97).
   Es INDEPENDIENTE del Canal Ciego: se despliega, se enciende
   y se apaga sin tocar nada de aquel sistema.

   Que hace: cuando un cliente escribe por WhatsApp, Kommo avisa
   aca. Se busca su RUT en la tarjeta, se consulta la tabla
   deuda_por_rut que publica el Panel, y si corresponde se crea
   UNA NOTA en el lead.

   Que NO hace: no crea tareas, no envia mensajes al cliente,
   no modifica ningun campo, no borra nada.
   ============================================================ */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
admin.initializeApp();

const KOMMO_TOKEN = defineSecret("KOMMO_TOKEN");
const KOMMO_SUBDOMAIN = "marcelofodorcl";
const CLAVE = "9b1a8f834173242b165d7d9f7895b3b6";

const ACTIVA = true;        // INTERRUPTOR MAESTRO. false = solo simula.
const MONTO_MINIMO = 1;        // avisa cualquier deuda mayor a cero
const TOPE_DIARIO = 200;      // freno de emergencia: max notas por dia
const VENTANA_MS = 24 * 3600 * 1000;  // max 1 aviso por lead cada 24h
const F_RUT = [1092656, 1074692];

function rutNorm(r) { return String(r || "").replace(/[^0-9kK]/g, "").toUpperCase(); }
function plata(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-CL"); }

exports.alertaCobranza = onRequest(
  { region: "us-central1", cors: false, secrets: [KOMMO_TOKEN] },
  async (req, res) => {
    if (req.method !== "POST") { res.status(200).send("ok"); return; }
    if (((req.query || {}).k) !== CLAVE) { console.warn("[cobranza] clave invalida"); res.status(403).send("no"); return; }
    try {
      const b = req.body || {};
      const ids = [];
      function empujar(o) { if (!o) return; const id = o.entity_id || o.element_id; if (id) ids.push(String(id)); }
      const cont = b.message || b;
      const add = cont && cont.add;
      if (Array.isArray(add)) add.forEach(empujar);
      else if (add && typeof add === "object") Object.keys(add).forEach(k => empujar(add[k]));
      const unicos = Array.from(new Set(ids));
      const out = [];
      for (const id of unicos) {
        try { out.push(id + ":" + await revisar(id)); }
        catch (e) { console.error("[cobranza] lead " + id + ":", e.message || e); out.push(id + ":error"); }
      }
      console.log("[cobranza] " + (out.join(" ") || "sin leads"));
      res.status(200).send(out.join(" ") || "sin leads");
    } catch (e) {
      console.error("[cobranza] error general:", e.message || e);
      res.status(200).send("error-registrado");
    }
  }
);

async function revisar(leadId) {
  const db = admin.database();
  // La ventana de 24h ya no se chequea aca: se reserva de forma ATOMICA
  // mas abajo, justo antes de escribir la nota. Ver comentario alli.

  const token = KOMMO_TOKEN.value();
  const r = await fetch("https://" + KOMMO_SUBDOMAIN + ".kommo.com/api/v4/leads/" + leadId,
    { headers: { "Authorization": "Bearer " + token } });
  if (!r.ok) return "kommo_" + r.status;
  const lead = await r.json();

  let rut = "";
  for (const f of (lead.custom_fields_values || [])) {
    if (F_RUT.indexOf(f.field_id) >= 0 && f.values && f.values[0] && f.values[0].value) {
      rut = String(f.values[0].value).split("/")[0]; break;
    }
  }
  const k = rutNorm(rut);
  if (k.length < 7) return "sin_rut";

  const d = (await db.ref("deuda_por_rut/rut/" + k).get()).val();
  if (!d || !(d.total > 0)) return "sin_deuda";
  const rel = (d.vencido > 0) ? d.vencido : d.total;
  if (rel < MONTO_MINIMO) return "bajo_umbral";

  const fecha = (await db.ref("deuda_por_rut/ts").get()).val() || "";
  const emp = d.empresa || "(sin razon social)";
  // FIX 12-08-2026: antes se mezclaba deuda vencida con saldo al dia y se
  // atribuia la antiguedad de la factura mas vieja al total. Eso convertia a
  // un cliente al dia en moroso (caso ARTESANAL AYSEN SPA). Ahora los dos
  // numeros van separados y la antiguedad solo se menciona si hay vencido.
  const vencido = Number(d.vencido) || 0;
  const totalPend = Number(d.total) || 0;
  const alDia = Math.max(0, totalPend - vencido);
  let txt;
  if (vencido > 0) {
    txt = ">>> DEUDA VENCIDA <<< " + plata(vencido) + " - " + emp + "\n";
    txt += (d.nVenc || 0) + " factura(s) vencida(s)";
    if (d.masViejo) txt += ", la mas antigua de " + d.masViejo + " dias";
    txt += ".\n";
    if (alDia > 0) txt += "Ademas " + plata(alDia) + " al dia, dentro de plazo (no reclamar).\n";
  } else {
    txt = "--- SALDO PENDIENTE --- " + plata(totalPend) + " - " + emp + " (TODO dentro de plazo)\n";
  }
  txt += "Total pendiente: " + plata(totalPend) + " en " + (d.n || 0) + " factura(s).\n";
  txt += "Dato del Panel al " + String(fecha).slice(0, 10) + " - confirmar antes de cobrar.";

  if (!ACTIVA) { console.log("[cobranza] SIMULADO " + leadId + ": " + txt.replace(/\n/g, " | ")); return "simulado"; }

  // Reserva ATOMICA de la ventana de 24h. Antes esto era leer-y-luego-
  // escribir: con varios webhooks en el mismo segundo todos pasaban el
  // chequeo y se duplicaban las notas. El lead 10771212 recibio 4 notas
  // identicas el 12-08-2026 a las 13:53:38. La transaccion lo impide.
  const refAviso = db.ref("cobranza_avisos/" + leadId);
  const tx = await refAviso.transaction(function (cur) {
    if (cur && cur.ts && (Date.now() - cur.ts) < VENTANA_MS) return; // aborta
    return { ts: Date.now(), rut: k, monto: rel };
  });
  if (!tx.committed) return "ya_avisado";

  const hoy = new Date().toISOString().slice(0, 10);
  const t = await db.ref("cobranza_contador/" + hoy).transaction(v => (v || 0) + 1);
  const n = (t.snapshot && t.snapshot.val()) || 0;
  if (n > TOPE_DIARIO) { console.warn("[cobranza] TOPE DIARIO alcanzado"); return "tope_diario"; }

  const nr = await fetch("https://" + KOMMO_SUBDOMAIN + ".kommo.com/api/v4/leads/" + leadId + "/notes", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify([{ note_type: "common", params: { text: txt } }])
  });
  if (!nr.ok) {
    // La nota no se pudo crear: liberamos la reserva para no bloquear
    // 24h un aviso que en realidad nunca salio.
    await refAviso.remove();
    return "error_nota_" + nr.status;
  }
  return "avisado(" + n + "/" + TOPE_DIARIO + ")";
}
