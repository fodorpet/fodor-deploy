/* ============================================================
   LEADS SIN RUT — Fodor SpA  (creado 2026-09-03)

   SOLO LECTURA. Este archivo no contiene ninguna peticion PUT,
   PATCH, POST ni DELETE. Unicamente GET a la API de Kommo.
   No escribe en Kommo, ni en Firebase, ni en el Panel.
   Su unica salida es un archivo local: leads-sin-rut.jsonl

   Para que sirve: alertaCobranza solo detecta deuda si el lead
   trae el RUT en los campos 1092656 o 1074692. Si no lo trae,
   devuelve "sin_rut" y el cliente nunca recibe aviso aunque deba.
   Este script lista esos leads para poder corregirlos a mano.

   Uso:  node leads-sin-rut.js [paginaInicial]
   ============================================================ */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const KOMMO_DOMAIN = 'marcelofodorcl.kommo.com';
const F_RUT = [1092656, 1074692];        // campos donde alertaCobranza busca el RUT
const SALIDA = path.join(__dirname, 'leads-sin-rut.jsonl');
const LIMITE_SEG = Number(process.env.LIMITE_SEG || 0); // 0 = sin limite; se detiene solo y guarda el avance
const PAUSA_MS = 250;                     // respeta el limite de la API

function token() {
  const t = (process.env.KOMMO_TOKEN || '').trim();
  if (t) return t;
  try {
    return execFileSync('/usr/bin/security',
      ['find-generic-password', '-a', process.env.USER || '', '-s', 'fodor-kommo-token', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    console.error('[SEGURIDAD] No encontre la credencial de Kommo en el Llavero de macOS.');
    process.exit(1);
  }
}

function get(hostname, ruta, headers) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path: ruta, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

// RUT chileno con digito verificador valido (evita confundir telefonos con RUT)
function rutValido(v) {
  const s = String(v || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (s.length < 8 || s.length > 9) return null;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return null;
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (suma % 11);
  const esperado = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return dv === esperado ? s : null;
}

function campo(lead, id) {
  const f = (lead.custom_fields_values || []).find(x => x.field_id == id);
  return (f && f.values && f.values[0]) ? f.values[0].value : null;
}

(async () => {
  const TOKEN = token();
  const t0 = Date.now();
  let page = Number(process.argv[2] || 1);
  const vistos = new Set();
  if (fs.existsSync(SALIDA)) {
    fs.readFileSync(SALIDA, 'utf8').split('\n').filter(Boolean)
      .forEach(l => { try { vistos.add(JSON.parse(l).id); } catch (e) {} });
  }
  let total = 0, sinRut = 0, otroCampo = 0, conRut = 0;

  while (true) {
    if (LIMITE_SEG > 0 && (Date.now() - t0) / 1000 > LIMITE_SEG) {
      console.log('\n== PAUSA POR TIEMPO. Continuar con:  node leads-sin-rut.js ' + page);
      break;
    }
    const r = await get(KOMMO_DOMAIN,
      '/api/v4/leads?limit=250&page=' + page + '&with=custom_fields_values&order[updated_at]=desc',
      { 'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'FodorSpa/1.0' });

    if (r.status === 401) { console.error('\nTOKEN RECHAZADO (401): el token guardado en el Llavero esta vencido.\nSolucion: copia el token nuevo de Kommo y ejecuta guardar-token-kommo.command, luego vuelve a correr esto.'); process.exit(2); }
    if (r.status === 204) { console.log('\n== FIN: no hay mas paginas.'); break; }
    if (r.status !== 200) { console.error('HTTP ' + r.status + ' en pagina ' + page); break; }

    let leads = [];
    try { leads = JSON.parse(r.body)._embedded.leads || []; } catch (e) { console.error('respuesta ilegible'); break; }
    if (!leads.length) { console.log('\n== FIN: no hay mas leads.'); break; }

    const lineas = [];
    for (const L of leads) {
      total++;
      const rutOficial = F_RUT.map(id => rutValido(String(campo(L, id) || '').split('/')[0])).find(Boolean);
      if (rutOficial) { conRut++; continue; }

      // busca un RUT valido en CUALQUIER otro campo del lead
      let escondido = null, dondeEscondido = null;
      for (const f of (L.custom_fields_values || [])) {
        if (F_RUT.includes(Number(f.field_id))) continue;
        for (const v of (f.values || [])) {
          const c = rutValido(String(v.value || '').split('/')[0]);
          if (c) { escondido = c; dondeEscondido = f.field_name + ' (' + f.field_id + ')'; break; }
        }
        if (escondido) break;
      }
      if (escondido) otroCampo++; else sinRut++;
      if (vistos.has(L.id)) continue;
      lineas.push(JSON.stringify({
        id: L.id,
        nombre: L.name || '',
        actualizado: new Date((L.updated_at || 0) * 1000).toISOString().slice(0, 10),
        caso: escondido ? 'RUT_EN_OTRO_CAMPO' : 'SIN_RUT',
        rut_encontrado: escondido || '',
        campo_encontrado: dondeEscondido || ''
      }));
      vistos.add(L.id);
    }
    if (lineas.length) fs.appendFileSync(SALIDA, lineas.join('\n') + '\n');
    process.stdout.write('pag ' + page + ' (' + total + ' leads)   \r');
    if (leads.length < 250) { console.log('\n== FIN: ultima pagina.'); break; }
    page++;
    await new Promise(r => setTimeout(r, PAUSA_MS));
  }
  console.log('Revisados: ' + total + ' | con RUT ok: ' + conRut + ' | RUT en otro campo: ' + otroCampo + ' | sin RUT: ' + sinRut);
  console.log('Salida: ' + SALIDA);
})();
