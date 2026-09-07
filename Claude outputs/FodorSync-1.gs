/**
 * FODOR SPA — Sincronizacion automatica de facturacion y pagos
 * ============================================================
 * Lee los 3 Excel diarios desde Drive, cruza pagos contra facturas
 * y escribe el resultado en Firebase Realtime Database.
 *
 * Corre 4 veces al dia: 07:00, 12:00, 16:00, 19:00 (hora Chile)
 *
 * INSTALACION: ver funcion instalarTriggers() al final.
 * Version: 1.0 — 2026-09-06
 */

// ============================================================
// CONFIGURACION
// ============================================================

var CONFIG = {
  // Carpeta de Drive donde se dejan los 3 Excel diarios
  FOLDER_ID: '1cCAnMX7CY5_Kp3yxRjBu37l9krGrw-2p',

  // Firebase Realtime Database
  // OJO: confirmar esta URL en la consola de Firebase antes de activar.
  FIREBASE_URL: 'https://odfor-bae97-default-rtdb.firebaseio.com',
  FIREBASE_PATH: 'estado/FACTURAS_ACTUALIZADAS',

  // Token de escritura. Se guarda en Propiedades del Script,
  // NUNCA escrito aqui en duro. Ver guardarToken().
  // (se lee con PropertiesService en tiempo de ejecucion)

  // Patrones para identificar cada archivo por su nombre
  PATRON_FACTURAS: /FODORSPA_REPORTE_VENTA/i,
  PATRON_CARTOLA:  /^cartola/i,
  PATRON_WEBPAY:   /webpay/i,

  // Tolerancia en pesos al comparar montos (redondeos bancarios)
  TOLERANCIA_MONTO: 100,

  // Cuantos dias hacia atras se consideran archivos vigentes
  DIAS_VIGENCIA: 3,

  TIMEZONE: 'America/Santiago'
};

// ============================================================
// PUNTO DE ENTRADA — esto es lo que ejecuta el trigger
// ============================================================

function sincronizar() {
  var inicio = new Date();
  var log = { inicio: inicio.toISOString(), pasos: [], errores: [] };

  try {
    log.pasos.push('Buscando archivos en carpeta');
    var archivos = ubicarArchivos_();

    if (!archivos.facturas) {
      throw new Error('No se encontro el archivo de facturas (FODORSPA_REPORTE_VENTA) en la carpeta.');
    }

    log.pasos.push('Leyendo facturas: ' + archivos.facturas.getName());
    var facturas = leerFacturas_(archivos.facturas);
    log.facturasLeidas = facturas.length;

    var pagos = [];

    if (archivos.cartola) {
      log.pasos.push('Leyendo cartola: ' + archivos.cartola.getName());
      var pagosBanco = leerCartola_(archivos.cartola);
      pagos = pagos.concat(pagosBanco);
      log.pagosBanco = pagosBanco.length;
    } else {
      log.errores.push('Cartola bancaria no encontrada — se sincroniza sin ella.');
      log.pagosBanco = 0;
    }

    if (archivos.webpay) {
      log.pasos.push('Leyendo webpay: ' + archivos.webpay.getName());
      var pagosWebpay = leerWebpay_(archivos.webpay);
      pagos = pagos.concat(pagosWebpay);
      log.pagosWebpay = pagosWebpay.length;
    } else {
      log.errores.push('Reporte Webpay no encontrado — se sincroniza sin el.');
      log.pagosWebpay = 0;
    }

    log.pasos.push('Cruzando ' + pagos.length + ' pagos contra ' + facturas.length + ' facturas');
    var resultado = cruzar_(facturas, pagos);

    log.conciliadas    = resultado.resumen.conciliadas;
    log.pagosSinCruce  = resultado.resumen.pagosSinCruce;
    log.montoConciliado = resultado.resumen.montoConciliado;

    log.pasos.push('Escribiendo en Firebase');
    escribirFirebase_(resultado);

    log.estado = 'OK';

  } catch (e) {
    log.estado = 'ERROR';
    log.errores.push(e.message);
    Logger.log('ERROR: ' + e.message + '\n' + e.stack);
  }

  log.duracionSeg = Math.round((new Date() - inicio) / 1000);
  registrarLog_(log);
  Logger.log(JSON.stringify(log, null, 2));
  return log;
}

// ============================================================
// UBICAR ARCHIVOS
// ============================================================

function ubicarArchivos_() {
  var carpeta = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  var it = carpeta.getFiles();

  var limite = new Date();
  limite.setDate(limite.getDate() - CONFIG.DIAS_VIGENCIA);

  var encontrados = { facturas: null, cartola: null, webpay: null };

  while (it.hasNext()) {
    var f = it.next();
    if (f.getLastUpdated() < limite) continue;

    var nombre = f.getName();

    if (CONFIG.PATRON_FACTURAS.test(nombre)) {
      encontrados.facturas = masReciente_(encontrados.facturas, f);
    } else if (CONFIG.PATRON_CARTOLA.test(nombre)) {
      encontrados.cartola = masReciente_(encontrados.cartola, f);
    } else if (CONFIG.PATRON_WEBPAY.test(nombre)) {
      encontrados.webpay = masReciente_(encontrados.webpay, f);
    }
  }
  return encontrados;
}

function masReciente_(actual, candidato) {
  if (!actual) return candidato;
  return candidato.getLastUpdated() > actual.getLastUpdated() ? candidato : actual;
}

/**
 * Convierte un Excel (.xls/.xlsx) a Google Sheet temporal y devuelve
 * su contenido como matriz. Borra la copia temporal al terminar.
 *
 * Usa la API REST de Drive directamente (no requiere activar el
 * servicio avanzado "Drive API" en el editor).
 */
function leerComoMatriz_(archivo) {
  var tempId = null;
  try {
    var resp = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + archivo.getId() + '/copy',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({
          name: 'TMP_' + archivo.getName(),
          mimeType: 'application/vnd.google-apps.spreadsheet'
        }),
        muteHttpExceptions: true
      }
    );

    if (resp.getResponseCode() !== 200) {
      throw new Error('No se pudo convertir "' + archivo.getName() + '" (' +
                      resp.getResponseCode() + '): ' +
                      resp.getContentText().slice(0, 200));
    }

    tempId = JSON.parse(resp.getContentText()).id;
    var hoja = SpreadsheetApp.openById(tempId).getSheets()[0];
    return hoja.getDataRange().getValues();

  } finally {
    if (tempId) {
      try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) {}
    }
  }
}

/**
 * Localiza la fila de encabezados buscando una columna conocida,
 * y devuelve un mapa nombreColumna -> indice.
 */
function mapearColumnas_(matriz, columnaAncla) {
  for (var i = 0; i < Math.min(matriz.length, 15); i++) {
    var fila = matriz[i];
    for (var j = 0; j < fila.length; j++) {
      if (normalizarTexto_(fila[j]).indexOf(columnaAncla) !== -1) {
        var mapa = {};
        for (var k = 0; k < fila.length; k++) {
          var nom = normalizarTexto_(fila[k]);
          if (nom) mapa[nom] = k;
        }
        return { fila: i, mapa: mapa };
      }
    }
  }
  throw new Error('No se encontro la fila de encabezados (buscando "' + columnaAncla + '").');
}

function buscarCol_(mapa, alternativas) {
  for (var i = 0; i < alternativas.length; i++) {
    var alt = alternativas[i];
    for (var clave in mapa) {
      if (clave.indexOf(alt) !== -1) return mapa[clave];
    }
  }
  return -1;
}

// ============================================================
// LECTORES POR ARCHIVO
// ============================================================

function leerFacturas_(archivo) {
  var m = leerComoMatriz_(archivo);
  var enc = mapearColumnas_(m, 'folio');
  var c = enc.mapa;

  var iFolio = buscarCol_(c, ['folio']);
  var iFecha = buscarCol_(c, ['fecha vencimiento', 'vencimiento']);
  var iEmis  = buscarCol_(c, ['fecha']);
  var iRut   = buscarCol_(c, ['rut']);
  var iRazon = buscarCol_(c, ['razon social', 'razon']);
  var iTotal = buscarCol_(c, ['total']);
  var iPag   = buscarCol_(c, ['pagado']);

  var out = [];
  for (var i = enc.fila + 1; i < m.length; i++) {
    var f = m[i];
    var folio = f[iFolio];
    if (folio === '' || folio === null || folio === undefined) continue;

    var total = aNumero_(f[iTotal]);
    if (total <= 0) continue;

    out.push({
      folio: String(folio).trim(),
      fechaEmision: aFechaISO_(iEmis >= 0 ? f[iEmis] : null),
      fechaVencimiento: aFechaISO_(iFecha >= 0 ? f[iFecha] : null),
      rut: normalizarRut_(iRut >= 0 ? f[iRut] : ''),
      rutOriginal: iRut >= 0 ? String(f[iRut] || '').trim() : '',
      razonSocial: iRazon >= 0 ? String(f[iRazon] || '').trim() : '',
      total: total,
      pagadoOrigen: iPag >= 0 ? aNumero_(f[iPag]) : 0
    });
  }
  return out;
}

function leerCartola_(archivo) {
  var m = leerComoMatriz_(archivo);
  var enc = mapearColumnas_(m, 'monto');
  var c = enc.mapa;

  var iFecha  = buscarCol_(c, ['fecha']);
  var iId     = buscarCol_(c, ['id transferencia', 'transferencia', 'id']);
  var iRut    = buscarCol_(c, ['rut origen', 'rut']);
  var iMonto  = buscarCol_(c, ['monto']);
  var iEstado = buscarCol_(c, ['estado']);
  var iNombre = buscarCol_(c, ['nombre origen', 'nombre']);

  var out = [];
  for (var i = enc.fila + 1; i < m.length; i++) {
    var f = m[i];
    var monto = aNumero_(f[iMonto]);
    if (monto <= 0) continue;

    var estado = iEstado >= 0 ? String(f[iEstado] || '').trim() : '';
    // Descarta transferencias que el banco no dio por buenas
    if (estado && /rechaz|anul|revers/i.test(estado)) continue;

    out.push({
      origen: 'BANCO',
      fecha: aFechaISO_(iFecha >= 0 ? f[iFecha] : null),
      referencia: iId >= 0 ? String(f[iId] || '').trim() : '',
      rut: normalizarRut_(iRut >= 0 ? f[iRut] : ''),
      pagador: iNombre >= 0 ? String(f[iNombre] || '').trim() : '',
      monto: monto,
      estado: estado
    });
  }
  return out;
}

function leerWebpay_(archivo) {
  var m = leerComoMatriz_(archivo);
  var enc = mapearColumnas_(m, 'monto');
  var c = enc.mapa;

  var iFecha = buscarCol_(c, ['fecha pago', 'fecha']);
  var iMonto = buscarCol_(c, ['monto']);
  var iOC    = buscarCol_(c, ['oc', 'orden']);
  var iAut   = buscarCol_(c, ['codigo autorizacion', 'autorizacion']);
  var iRut   = buscarCol_(c, ['rut']);
  var iTipo  = buscarCol_(c, ['tipo de pago', 'tipo']);

  var out = [];
  for (var i = enc.fila + 1; i < m.length; i++) {
    var f = m[i];
    var monto = aNumero_(f[iMonto]);
    if (monto <= 0) continue;

    out.push({
      origen: 'WEBPAY',
      fecha: aFechaISO_(iFecha >= 0 ? f[iFecha] : null),
      referencia: iAut >= 0 ? String(f[iAut] || '').trim() : '',
      oc: iOC >= 0 ? String(f[iOC] || '').trim() : '',
      rut: normalizarRut_(iRut >= 0 ? f[iRut] : ''),
      pagador: '',
      monto: monto,
      tipo: iTipo >= 0 ? String(f[iTipo] || '').trim() : ''
    });
  }
  return out;
}

// ============================================================
// LOGICA DE CRUCE
// ============================================================

/**
 * Estrategia en 3 pasadas, de mas confiable a menos:
 *   1. RUT + monto exacto
 *   2. RUT + monto dentro de tolerancia
 *   3. Monto exacto sin RUT (solo si es unico en todo el set)
 * Cada pago se consume una sola vez. Cada factura se paga una sola vez.
 */
function cruzar_(facturas, pagos) {
  var pendientes = facturas.filter(function (f) { return f.pagadoOrigen < f.total; });
  var usados = {};
  var conciliaciones = [];

  function intentar_(criterio) {
    for (var i = 0; i < pendientes.length; i++) {
      var fac = pendientes[i];
      if (fac._conciliada) continue;

      for (var j = 0; j < pagos.length; j++) {
        if (usados[j]) continue;
        var pago = pagos[j];

        var m = criterio(fac, pago, j);
        if (!m) continue;

        usados[j] = true;
        fac._conciliada = true;
        conciliaciones.push({
          folio: fac.folio,
          rut: fac.rut,
          razonSocial: fac.razonSocial,
          montoFactura: fac.total,
          montoPago: pago.monto,
          diferencia: pago.monto - fac.total,
          origenPago: pago.origen,
          referencia: pago.referencia,
          fechaPago: pago.fecha,
          metodo: m
        });
        break;
      }
    }
  }

  // Pasada 1 — RUT + monto exacto
  intentar_(function (fac, pago) {
    if (!fac.rut || !pago.rut) return null;
    if (fac.rut !== pago.rut) return null;
    if (pago.monto !== fac.total) return null;
    return 'RUT_MONTO_EXACTO';
  });

  // Pasada 2 — RUT + monto con tolerancia
  intentar_(function (fac, pago) {
    if (!fac.rut || !pago.rut) return null;
    if (fac.rut !== pago.rut) return null;
    if (Math.abs(pago.monto - fac.total) > CONFIG.TOLERANCIA_MONTO) return null;
    return 'RUT_MONTO_TOLERANCIA';
  });

  // Pasada 3 — monto exacto unico, sin RUT
  var conteoMonto = {};
  pagos.forEach(function (p, idx) {
    if (usados[idx]) return;
    conteoMonto[p.monto] = (conteoMonto[p.monto] || 0) + 1;
  });
  var conteoFactura = {};
  pendientes.forEach(function (f) {
    if (f._conciliada) return;
    conteoFactura[f.total] = (conteoFactura[f.total] || 0) + 1;
  });

  intentar_(function (fac, pago) {
    if (pago.monto !== fac.total) return null;
    if (conteoMonto[pago.monto] !== 1) return null;   // pago ambiguo
    if (conteoFactura[fac.total] !== 1) return null;  // factura ambigua
    return 'MONTO_UNICO_SIN_RUT';
  });

  // Pagos que no calzaron con nada
  var huerfanos = [];
  pagos.forEach(function (p, idx) {
    if (!usados[idx]) huerfanos.push(p);
  });

  // Facturas que siguen impagas
  var hoy = new Date();
  var impagas = pendientes.filter(function (f) { return !f._conciliada; })
    .map(function (f) {
      var venc = f.fechaVencimiento ? new Date(f.fechaVencimiento) : null;
      var dias = venc ? Math.floor((hoy - venc) / 86400000) : null;
      return {
        folio: f.folio,
        rut: f.rutOriginal,
        razonSocial: f.razonSocial,
        total: f.total,
        fechaVencimiento: f.fechaVencimiento,
        diasVencida: dias,
        vencida: dias !== null && dias > 0
      };
    });

  var montoConciliado = conciliaciones.reduce(function (s, c) { return s + c.montoPago; }, 0);
  var montoImpago = impagas.reduce(function (s, f) { return s + f.total; }, 0);
  var montoVencido = impagas.filter(function (f) { return f.vencida; })
    .reduce(function (s, f) { return s + f.total; }, 0);

  return {
    generadoEn: Utilities.formatDate(hoy, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"),
    resumen: {
      totalFacturas: facturas.length,
      totalPagos: pagos.length,
      conciliadas: conciliaciones.length,
      pagosSinCruce: huerfanos.length,
      facturasImpagas: impagas.length,
      facturasVencidas: impagas.filter(function (f) { return f.vencida; }).length,
      montoConciliado: montoConciliado,
      montoImpago: montoImpago,
      montoVencido: montoVencido
    },
    conciliaciones: conciliaciones,
    pagosSinCruce: huerfanos,
    facturasImpagas: impagas
  };
}

// ============================================================
// ESCRITURA A FIREBASE
// ============================================================

function escribirFirebase_(datos) {
  var token = PropertiesService.getScriptProperties().getProperty('FIREBASE_TOKEN');
  if (!token) {
    throw new Error('Falta FIREBASE_TOKEN en Propiedades del Script. Ejecuta guardarToken() una vez.');
  }

  var url = CONFIG.FIREBASE_URL + '/' + CONFIG.FIREBASE_PATH + '.json?auth=' + encodeURIComponent(token);

  var resp = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(datos),
    muteHttpExceptions: true
  });

  var codigo = resp.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('Firebase respondio ' + codigo + ': ' + resp.getContentText().slice(0, 300));
  }
}

// ============================================================
// UTILIDADES
// ============================================================

function normalizarRut_(valor) {
  if (valor === null || valor === undefined) return '';
  var s = String(valor).trim().toUpperCase();
  s = s.replace(/[^0-9K]/g, '');   // quita puntos, guion, espacios
  if (s.length < 7) return '';
  return s;
}

function normalizarTexto_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // saca tildes
    .replace(/\s+/g, ' ');
}

function aNumero_(valor) {
  if (typeof valor === 'number') return Math.round(valor);
  if (valor === null || valor === undefined || valor === '') return 0;
  var s = String(valor).replace(/[^0-9,.\-]/g, '');
  // Formato chileno: 1.234.567,89 -> punto = miles, coma = decimal
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}

function aFechaISO_(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor)) {
    return Utilities.formatDate(valor, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  var s = String(valor).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    var anio = m[3].length === 2 ? '20' + m[3] : m[3];
    return anio + '-' + pad_(m[2]) + '-' + pad_(m[1]);
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]);
  return null;
}

function pad_(v) { return String(v).length === 1 ? '0' + v : String(v); }

function registrarLog_(log) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ULTIMA_EJECUCION', JSON.stringify({
    fecha: log.inicio,
    estado: log.estado,
    conciliadas: log.conciliadas || 0,
    errores: log.errores
  }));
}

// ============================================================
// INSTALACION — ejecutar una sola vez, a mano
// ============================================================

/**
 * PASO 1: pega aqui el token de Firebase, ejecuta esta funcion una vez,
 * y despues BORRA el token de esta linea y vuelve a guardar el archivo.
 */
function guardarToken() {
  var TOKEN = 'PEGA_AQUI_EL_TOKEN';
  if (TOKEN === 'PEGA_AQUI_EL_TOKEN') {
    throw new Error('Reemplaza TOKEN por el valor real antes de ejecutar.');
  }
  PropertiesService.getScriptProperties().setProperty('FIREBASE_TOKEN', TOKEN);
  Logger.log('Token guardado.');
}

/**
 * PASO 2: ejecutar una vez para dejar los 4 horarios activos.
 */
function instalarTriggers() {
  // Limpia triggers previos de esta funcion para no duplicar
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });

  [7, 12, 16, 19].forEach(function (hora) {
    ScriptApp.newTrigger('sincronizar')
      .timeBased()
      .atHour(hora)
      .everyDays(1)
      .inTimezone(CONFIG.TIMEZONE)
      .create();
  });

  Logger.log('4 triggers instalados: 07:00, 12:00, 16:00, 19:00 (America/Santiago)');
}

/**
 * PASO 3: prueba en seco. Lee y cruza pero NO escribe en Firebase.
 * Usar esta antes de activar los triggers.
 */
function probarSinEscribir() {
  var archivos = ubicarArchivos_();
  Logger.log('Facturas: ' + (archivos.facturas ? archivos.facturas.getName() : 'NO ENCONTRADO'));
  Logger.log('Cartola:  ' + (archivos.cartola  ? archivos.cartola.getName()  : 'NO ENCONTRADO'));
  Logger.log('Webpay:   ' + (archivos.webpay   ? archivos.webpay.getName()   : 'NO ENCONTRADO'));

  if (!archivos.facturas) return;

  var facturas = leerFacturas_(archivos.facturas);
  var pagos = [];
  if (archivos.cartola) pagos = pagos.concat(leerCartola_(archivos.cartola));
  if (archivos.webpay)  pagos = pagos.concat(leerWebpay_(archivos.webpay));

  var r = cruzar_(facturas, pagos);
  Logger.log(JSON.stringify(r.resumen, null, 2));
  Logger.log('Primeras 5 conciliaciones:');
  Logger.log(JSON.stringify(r.conciliaciones.slice(0, 5), null, 2));
  return r.resumen;
}

function verUltimaEjecucion() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('ULTIMA_EJECUCION') || 'sin registro');
}
