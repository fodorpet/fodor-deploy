// ══════════════════════════════════════════════════════════════════════════════
//  Fodor SpA — Resolución de código postal y región para Envia.com
//
//  Por qué existe: Envia.com exige `postalCode` en el destino con mínimo 3
//  caracteres. El cotizador nunca lo capturaba (en Chile casi no se usan), así
//  que iba vacío y la guía no se emitía nunca.
//
//  Además reemplaza la tabla ESTADOS hardcodeada de envios.html, que tenía unas
//  50 comunas y para cualquier otra caía a 'RM' en silencio: un envío a Puerto
//  Montt salía marcado como Región Metropolitana sin que nadie se enterara.
//
//  Usa el servicio de geocodificación de Envia.com, público y sin token:
//    GET https://geocodes.envia.com/locate/CL/{ciudad}
//    → [{ state:{code:{"2digit":"TA"}}, zip_codes:[{zip_code:"1100000"}] }]
//
//  Los resultados se cachean en memoria: las ciudades se repiten mucho y no
//  tiene sentido preguntar dos veces por la misma en la misma corrida.
// ══════════════════════════════════════════════════════════════════════════════

const https = require('https');

const GEO_HOST = 'geocodes.envia.com';
const _cache = {};

function _get(path) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: GEO_HOST,
      path: path,
      headers: { 'User-Agent': 'FodorSpa-Envios/1.0', 'Accept': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout consultando geocodes.envia.com')); });
  });
}

/**
 * Resuelve el código postal y el código de región (2 letras) de una ciudad chilena.
 *
 * @param {string} ciudad  Nombre de la comuna o ciudad, como lo escribió el vendedor.
 * @returns {Promise<{postalCode:string, state:string, localidad:string, region:string}>}
 * @throws  Si la ciudad no se puede resolver. Es a propósito: mandar un código
 *          postal inventado o vacío hace que la guía se emita mal o no se emita,
 *          y en ambos casos el problema aparece más tarde y más caro.
 */
async function resolverCiudad(ciudad) {
  const clave = String(ciudad || '').trim().toUpperCase();
  if (!clave) throw new Error('No se indicó ciudad de destino.');
  if (_cache[clave]) return _cache[clave];

  const r = await _get('/locate/CL/' + encodeURIComponent(clave));

  if (r.status !== 200) {
    throw new Error('geocodes.envia.com respondió HTTP ' + r.status + ' para "' + ciudad + '"');
  }

  // La respuesta es un ARRAY de coincidencias; puede venir vacío.
  const lista = Array.isArray(r.body) ? r.body : [r.body];
  const m = lista[0];

  if (!m || !m.zip_codes || !m.zip_codes.length) {
    throw new Error(
      'Envia.com no reconoce la ciudad "' + ciudad + '". ' +
      'Revisá cómo está escrita en el pedido (sin abreviaturas).'
    );
  }

  const zip   = m.zip_codes[0];
  const state = (m.state && m.state.code && m.state.code['2digit']) || '';

  if (!zip.zip_code || !state) {
    throw new Error('Respuesta incompleta de geocodes.envia.com para "' + ciudad + '"');
  }

  const res = {
    postalCode: String(zip.zip_code),
    state:      String(state),
    localidad:  zip.locality || clave,
    region:     (m.state && m.state.name) || ''
  };

  _cache[clave] = res;
  return res;
}

module.exports = { resolverCiudad };
