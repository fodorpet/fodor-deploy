/* global define */
define(['jquery'], function ($) {
  'use strict';

  // ─── CONSTANTES ────────────────────────────────────────────────────────────
  var FB_DB   = 'https://odfor-bae97-default-rtdb.firebaseio.com';
  var ENVIA_T = 'c4b4d0ebd237ece6747226316f00fb380ca7d32fdedc7ab912359864643c50d5';
  var ENVIA_H = 'https://api.envia.com';
  var USD_CLP = 930;

  // ─── CATÁLOGO FODOR ────────────────────────────────────────────────────────
  var CATALOG = [
    {sku:'FSP-001',nombre:'Vaso 500cc Natural Liso',    cat:'🥤 Vasos',    kg:23, l:69,a:42,h:50},
    {sku:'FSP-002',nombre:'Vaso 500cc Natural Rugoso',  cat:'🥤 Vasos',    kg:23, l:69,a:42,h:50},
    {sku:'FSP-003',nombre:'Vaso 500cc PP Color',        cat:'🥤 Vasos',    kg:23, l:69,a:42,h:50},
    {sku:'FSP-004',nombre:'Vaso 380cc Natural',         cat:'🥤 Vasos',    kg:15, l:61,a:27,h:38},
    {sku:'FSP-005',nombre:'Vaso Poli 380cc',            cat:'🥤 Vasos',    kg:15, l:61,a:27,h:38},
    {sku:'FSP-006',nombre:'Vaso 280cc',                 cat:'🥤 Vasos',    kg:12, l:53,a:35,h:40},
    {sku:'FSP-007',nombre:'Vaso 800cc WPC',             cat:'🥤 Vasos',    kg:11, l:58,a:35,h:54},
    {sku:'FSP-016',nombre:'Vaso 80cc',                  cat:'🥤 Vasos',    kg:12, l:53,a:45,h:27},
    {sku:'FSP-018',nombre:'Vaso 500cc Metalizado',      cat:'🥤 Vasos',    kg:23, l:69,a:42,h:50},
    {sku:'FSP-019',nombre:'Vaso 380cc Color',           cat:'🥤 Vasos',    kg:15, l:61,a:27,h:38},
    {sku:'FSP-008',nombre:'Copa Tanker 500cc',          cat:'🍷 Copas',    kg:8,  l:57,a:32,h:27},
    {sku:'FSP-009',nombre:'Copa Aperitivo',             cat:'🍷 Copas',    kg:9,  l:57,a:32,h:57},
    {sku:'FSP-010',nombre:'Copa Cracker',               cat:'🍷 Copas',    kg:9,  l:57,a:32,h:57},
    {sku:'FSP-011',nombre:'Copa 600cc',                 cat:'🍷 Copas',    kg:8,  l:57,a:32,h:27},
    {sku:'FSP-012',nombre:'Copa/Vaso 415cc',            cat:'🍷 Copas',    kg:9,  l:57,a:32,h:57},
    {sku:'FSP-017',nombre:'Copa 200cc',                 cat:'🍷 Copas',    kg:8,  l:45,a:30,h:50},
    {sku:'FSP-013',nombre:'Hielera',                    cat:'🧊 Accesorios',kg:3,  l:61,a:27,h:38},
    {sku:'FSP-014',nombre:'Pulseras',                   cat:'🎁 Promo',    kg:1.5,l:29,a:21.5,h:5},
    {sku:'FSP-015',nombre:'Lanyard',                    cat:'🎁 Promo',    kg:2,  l:35,a:25,h:20},
    {sku:'FSP-020',nombre:'Pack Mixto (cliente)',       cat:'📦 Mixto',    kg:1,  l:30,a:30,h:30}
  ];

  // ─── ESTADOS CHILENOS (simplificado) ──────────────────────────────────────
  var ESTADOS = {
    'SANTIAGO':'RM','PROVIDENCIA':'RM','LAS CONDES':'RM','NUNOA':'RM','ÑUÑOA':'RM',
    'MAIPU':'RM','MAIPÚ':'RM','LA FLORIDA':'RM','PUENTE ALTO':'RM','SAN BERNARDO':'RM',
    'COLINA':'RM','PEÑAFLOR':'RM','BUIN':'RM','MELIPILLA':'RM','TALAGANTE':'RM',
    'QUILICURA':'RM','PUDAHUEL':'RM','RENCA':'RM','LAMPA':'RM','VITACURA':'RM',
    'VALPARAISO':'VS','VALPARAÍSO':'VS','VIÑA DEL MAR':'VS','VINA DEL MAR':'VS',
    'QUILPUE':'VS','QUILPUÉ':'VS','VILLA ALEMANA':'VS','SAN ANTONIO':'VS',
    'QUILLOTA':'VS','LA CALERA':'VS','LOS ANDES':'VS','SAN FELIPE':'VS',
    'CONCEPCION':'BI','CONCEPCIÓN':'BI','TALCAHUANO':'BI','CORONEL':'BI',
    'LOTA':'BI','PENCO':'BI','TOME':'BI','TOMÉ':'BI','LOS ANGELES':'BI','LOS ÁNGELES':'BI',
    'TEMUCO':'AR','PADRE LAS CASAS':'AR','VILLARRICA':'AR','PUCON':'AR','PUCÓN':'AR',
    'LA SERENA':'CO','COQUIMBO':'CO','OVALLE':'CO','ANDACOLLO':'CO',
    'ANTOFAGASTA':'AN','CALAMA':'AN','TOCOPILLA':'AN','MEJILLONES':'AN',
    'IQUIQUE':'TA','ALTO HOSPICIO':'TA',
    'ARICA':'AP',
    'RANCAGUA':'LI','SAN FERNANDO':'LI','SANTA CRUZ':'LI',
    'TALCA':'ML','LINARES':'ML','CURICO':'ML','CURICÓ':'ML','CONSTITUCION':'ML',
    'CHILLAN':'NB','CHILLÁN':'NB','SAN CARLOS':'NB',
    'VALDIVIA':'LR','LA UNION':'LR','LA UNIÓN':'LR','PANGUIPULLI':'LR',
    'OSORNO':'LL','PUERTO MONTT':'LL','CASTRO':'LL','ANCUD':'LL','PUERTO VARAS':'LL',
    'COPIAPO':'AT','COPIAPÓ':'AT','VALLENAR':'AT',
    'COYHAIQUE':'AY','PUNTA ARENAS':'MA','PUERTO NATALES':'MA'
  };

  // ─── ESTADO LOCAL DEL WIDGET ───────────────────────────────────────────────
  var _qtys   = {};
  var _rates  = [];
  var _leadId = 'lead-' + Date.now();
  var _leadNombre = '';
  var _leadEmail  = '';
  var _leadCiudad = '';

  // ─── HELPERS FIREBASE REST ─────────────────────────────────────────────────
  function fbGet(path) {
    return fetch(FB_DB + path + '.json')
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function fbPut(path, data) {
    return fetch(FB_DB + path + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function fbDel(path) {
    return fetch(FB_DB + path + '.json', { method: 'DELETE' })
      .catch(function () {});
  }

  // ─── HELPERS ENVIA API (directo desde browser) ─────────────────────────────
  function enviaRate(payload) {
    return fetch(ENVIA_H + '/ship/rate/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + ENVIA_T,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .catch(function () { return { data: [] }; });
  }

  // ─── ORIGEN FODOR SPA ─────────────────────────────────────────────────────
  var ORIGEN = {
    name:'Fodor Fast', company:'Fodor SpA',
    email:'comercial@fodorfast.cl', phone:'56986298699',
    street:'Av. Providencia', number:'1234',
    district:'Providencia', city:'Santiago',
    state:'RM', country:'CL', postalCode:'7500000'
  };

  // ─── MAPA DE ESTADOS PARA ENVIA ────────────────────────────────────────────
  var CHILE_ESTADOS_ENVIA = {
    'SANTIAGO':'RM','PROVIDENCIA':'RM','NUNOA':'RM','ÑUÑOA':'RM','LAS CONDES':'RM',
    'MAIPU':'RM','MAIPÚ':'RM','PUENTE ALTO':'RM','LA FLORIDA':'RM','SAN BERNARDO':'RM',
    'QUILICURA':'RM','PUDAHUEL':'RM','RENCA':'RM','LAMPA':'RM','VITACURA':'RM',
    'COLINA':'RM','BUIN':'RM','MELIPILLA':'RM','TALAGANTE':'RM','PEÑAFLOR':'RM',
    'VALPARAISO':'VS','VALPARAÍSO':'VS','VIÑA DEL MAR':'VS','VINA DEL MAR':'VS',
    'QUILPUE':'VS','QUILPUÉ':'VS','VILLA ALEMANA':'VS','SAN ANTONIO':'VS',
    'QUILLOTA':'VS','LA CALERA':'VS','LOS ANDES':'VS','SAN FELIPE':'VS',
    'CONCEPCION':'BI','CONCEPCIÓN':'BI','TALCAHUANO':'BI','CORONEL':'BI',
    'LOS ANGELES':'BI','LOS ÁNGELES':'BI','LOTA':'BI','LEBU':'BI',
    'TEMUCO':'AR','VILLARRICA':'AR','PUCON':'AR','PUCÓN':'AR','VICTORIA':'AR',
    'LA SERENA':'CO','COQUIMBO':'CO','OVALLE':'CO',
    'ANTOFAGASTA':'AN','CALAMA':'AN','TOCOPILLA':'AN',
    'IQUIQUE':'TA','ALTO HOSPICIO':'TA',
    'ARICA':'AP',
    'RANCAGUA':'LI','SAN FERNANDO':'LI',
    'TALCA':'ML','LINARES':'ML','CURICO':'ML','CURICÓ':'ML',
    'CHILLAN':'NB','CHILLÁN':'NB','SAN CARLOS':'NB',
    'VALDIVIA':'LR','OSORNO':'LL','PUERTO MONTT':'LL',
    'CASTRO':'LL','ANCUD':'LL','PUERTO VARAS':'LL',
    'COPIAPO':'AT','COPIAPÓ':'AT','VALLENAR':'AT',
    'COYHAIQUE':'AY','PUNTA ARENAS':'MA'
  };

  // ─── BUILDER DE CATÁLOGO ───────────────────────────────────────────────────
  function buildCatalogHTML() {
    var cats = {}, catOrder = [];
    CATALOG.forEach(function (p) {
      if (!cats[p.cat]) { cats[p.cat] = []; catOrder.push(p.cat); }
      cats[p.cat].push(p);
    });
    var html = '';
    catOrder.forEach(function (cat) {
      html += '<div style="font-size:10px;font-weight:800;color:#0369a1;text-transform:uppercase;'
        + 'margin:8px 0 4px;padding-top:6px;border-top:1px solid #e2e8f0;">' + cat + '</div>';
      cats[cat].forEach(function (p) {
        html += '<div id="fw-row-' + p.sku + '" style="display:flex;align-items:center;'
          + 'justify-content:space-between;padding:4px 6px;border-radius:6px;margin-bottom:2px;background:#f8fafc;">';
        html += '<span style="font-size:11px;color:#1e3a5f;flex:1;line-height:1.3;">' + p.nombre + '</span>';
        html += '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">';
        html += '<button class="fw-minus" data-sku="' + p.sku + '" '
          + 'style="width:22px;height:22px;border-radius:50%;border:none;background:#e2e8f0;'
          + 'cursor:pointer;font-size:14px;font-weight:bold;color:#475569;line-height:1;padding:0;">−</button>';
        html += '<span id="fw-qty-' + p.sku + '" style="font-size:12px;font-weight:800;'
          + 'color:#0284c7;min-width:18px;text-align:center;">0</span>';
        html += '<button class="fw-plus" data-sku="' + p.sku + '" '
          + 'style="width:22px;height:22px;border-radius:50%;border:none;background:#0284c7;'
          + 'cursor:pointer;font-size:14px;font-weight:bold;color:white;line-height:1;padding:0;">+</button>';
        html += '</div></div>';
      });
    });
    return html;
  }

  // ─── BUILDER HTML PRINCIPAL ────────────────────────────────────────────────
  function buildMainHTML() {
    return '<div id="fw-root" style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;padding:10px;background:#fff;">'
      // Catálogo
      + '<div id="fw-catalog" style="max-height:260px;overflow-y:auto;margin-bottom:8px;'
      + 'border:1px solid #e2e8f0;border-radius:8px;padding:8px;">'
      + buildCatalogHTML()
      + '</div>'
      // Total
      + '<div style="background:#1e3a5f;border-radius:8px;padding:8px 12px;margin-bottom:8px;'
      + 'display:flex;justify-content:space-between;align-items:center;">'
      + '<span style="font-size:11px;color:#94a3b8;font-weight:600;">Total pedido</span>'
      + '<span id="fw-total-txt" style="font-size:12px;font-weight:800;color:#7dd3fc;">0 cajas · 0 kg</span>'
      + '</div>'
      // Ciudad
      + '<div style="margin-bottom:6px;">'
      + '<label style="font-size:10px;font-weight:700;color:#374151;display:block;margin-bottom:3px;">Ciudad de destino</label>'
      + '<input id="fw-ciudad" value="' + (_leadCiudad || '') + '" placeholder="ej: Concepción" '
      + 'style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 10px;'
      + 'font-size:12px;font-weight:600;box-sizing:border-box;outline:none;">'
      + '</div>'
      // % Ganancia
      + '<div style="display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1.5px solid #86efac;'
      + 'border-radius:8px;padding:8px 10px;margin-bottom:8px;">'
      + '<span style="font-size:11px;font-weight:700;color:#15803d;">📊 % Ganancia:</span>'
      + '<input id="fw-pct" type="number" value="20" min="0" max="999" '
      + 'style="width:55px;border:1.5px solid #86efac;border-radius:5px;padding:3px 6px;'
      + 'font-size:14px;font-weight:800;color:#15803d;text-align:center;">'
      + '<span style="font-size:11px;color:#15803d;">%</span>'
      + '<span style="font-size:10px;color:#166534;">→ 🟢 precio cliente</span>'
      + '</div>'
      // Botón cotizar
      + '<button id="fw-btn-cotizar" style="width:100%;background:linear-gradient(135deg,#0ea5e9,#0284c7);'
      + 'color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:800;'
      + 'cursor:pointer;margin-bottom:8px;">🔍 Buscar Tarifas Envia.com</button>'
      // Área de tarifas
      + '<div id="fw-rates"></div>'
      + '</div>';
  }

  // ─── RECALCULAR TOTAL ──────────────────────────────────────────────────────
  function recalcTotal() {
    var cajas = 0, kg = 0;
    CATALOG.forEach(function (p) {
      var q = _qtys[p.sku] || 0;
      cajas += q;
      kg    += q * p.kg;
    });
    var $t = $('#fw-total-txt');
    if ($t.length) {
      $t.text(cajas + ' caja' + (cajas !== 1 ? 's' : '') + ' · ' + kg.toFixed(1) + ' kg');
    }
    return { cajas: cajas, kg: kg };
  }

  // ─── ACTUALIZAR CANTIDAD ───────────────────────────────────────────────────
  function updateQty(sku, delta) {
    var next = Math.max(0, (_qtys[sku] || 0) + delta);
    _qtys[sku] = next;
    $('#fw-qty-' + sku).text(next);
    $('#fw-row-' + sku).css('background', next > 0 ? '#eff6ff' : '#f8fafc');
    recalcTotal();
  }

  // ─── RECALCULAR PRECIOS CON % GANANCIA ─────────────────────────────────────
  function recalcPrecios() {
    var pct = parseFloat($('#fw-pct').val()) || 0;
    $('[data-precio-base]').each(function () {
      var base    = parseInt($(this).attr('data-precio-base'), 10);
      var cliente = Math.round(base * (1 + pct / 100));
      $(this).text('$' + cliente.toLocaleString('es-CL') + ' CLP');
    });
  }

  // ─── CONSTRUIR PAQUETES ────────────────────────────────────────────────────
  function buildPackages() {
    var packages = [];
    CATALOG.forEach(function (p) {
      var q = _qtys[p.sku] || 0;
      if (q > 0 && p.l > 0) {
        packages.push({
          content: p.nombre, amount: q, type: 'box',
          weight: p.kg, insurance: 0, declaredValue: 0,
          weightUnit: 'KG', lengthUnit: 'CM',
          dimensions: { length: p.l, width: p.a, height: p.h }
        });
      }
    });
    if (!packages.length) {
      packages = [{
        content: 'Mercaderia Fodor', amount: 1, type: 'box',
        weight: 1, insurance: 0, declaredValue: 0,
        weightUnit: 'KG', lengthUnit: 'CM',
        dimensions: { length: 30, width: 30, height: 30 }
      }];
    }
    return packages;
  }

  // ─── COTIZAR TARIFAS ───────────────────────────────────────────────────────
  function cotizar() {
    var ciudad = $('#fw-ciudad').val().trim().toUpperCase();
    var $rates = $('#fw-rates');

    if (!ciudad) {
      $rates.html('<div style="padding:8px;background:#fef9c3;border-radius:6px;'
        + 'color:#854d0e;font-size:11px;font-weight:700;">⚠️ Ingresa la ciudad de destino</div>');
      return;
    }

    var tot = recalcTotal();
    if (tot.cajas === 0) {
      $rates.html('<div style="padding:8px;background:#fef9c3;border-radius:6px;'
        + 'color:#854d0e;font-size:11px;font-weight:700;">⚠️ Selecciona al menos un producto</div>');
      return;
    }

    $rates.html('<div style="text-align:center;padding:14px;color:#0284c7;'
      + 'font-size:12px;font-weight:700;">🔄 Consultando tarifas para ' + ciudad + '...</div>');

    var estadoDest = CHILE_ESTADOS_ENVIA[ciudad] || 'RM';
    var packages   = buildPackages();

    var basePayload = {
      origin: ORIGEN,
      destination: {
        name: _leadNombre || 'Cliente', company: _leadNombre || '',
        email: _leadEmail || '', phone: '56900000000',
        street: 'Calle destino', number: '1',
        district: ciudad, city: ciudad,
        state: estadoDest, country: 'CL', postalCode: ''
      },
      packages: packages,
      shipment: { type: 1 }
    };

    var carriers = ['starken', 'chilexpress', 'correoschile'];
    Promise.all(carriers.map(function (c) {
      var p = JSON.parse(JSON.stringify(basePayload));
      p.shipment.carrier = c;
      return enviaRate(p);
    })).then(function (results) {
      var rates = [];
      results.forEach(function (data) {
        if (data && data.data) rates = rates.concat(data.data);
      });

      if (!rates.length) {
        $rates.html('<div style="padding:8px;background:#fef9c3;border-radius:6px;'
          + 'color:#854d0e;font-size:11px;font-weight:700;">'
          + '⚠️ Sin tarifas disponibles para "' + ciudad + '"</div>');
        return;
      }

      rates.sort(function (a, b) {
        return (a.totalPrice || 0) - (b.totalPrice || 0);
      });
      _rates = rates;
      renderRates(rates);
    });
  }

  // ─── RENDERIZAR TARIFAS ─────────────────────────────────────────────────────
  function renderRates(rates) {
    var pct = parseFloat($('#fw-pct').val()) || 0;
    var html = '<div style="font-size:10px;font-weight:800;color:#0369a1;'
      + 'margin-bottom:6px;text-transform:uppercase;">📦 Elige courier</div>';

    rates.forEach(function (r, i) {
      var precioRaw    = r.totalPrice || r.price || 0;
      var precioCLP    = (r.currency === 'USD') ? Math.round(precioRaw * USD_CLP) : Math.round(precioRaw);
      var precioCliente = Math.round(precioCLP * (1 + pct / 100));
      var carrier      = r.carrier || r.service || 'Courier';
      var dias         = r.deliveryEstimate || r.days || '?';
      var bg = i === 0 ? '#dcfce7' : '#f8fafc';
      var bd = i === 0 ? '#86efac' : '#e2e8f0';

      html += '<div class="fw-rate-card" data-rate-idx="' + i + '" '
        + 'style="background:' + bg + ';border:2px solid ' + bd + ';border-radius:8px;'
        + 'padding:10px;margin-bottom:6px;cursor:pointer;'
        + 'display:flex;justify-content:space-between;align-items:center;">';
      html += '<div>';
      html += '<div style="font-size:12px;font-weight:800;color:#1e3a5f;">' + carrier + '</div>';
      if (dias !== '?') {
        html += '<div style="font-size:10px;color:#64748b;">⏱ ' + dias + ' días hábiles</div>';
      }
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<div style="font-size:9px;color:#94a3b8;font-weight:600;">Costo Envia</div>';
      html += '<div style="font-size:11px;font-weight:700;color:#64748b;">'
        + '$' + precioCLP.toLocaleString('es-CL') + ' CLP</div>';
      html += '<div style="font-size:9px;color:#15803d;font-weight:700;margin-top:2px;">Precio cliente</div>';
      html += '<div data-precio-base="' + precioCLP + '" '
        + 'style="font-size:14px;font-weight:900;color:#15803d;">'
        + '$' + precioCliente.toLocaleString('es-CL') + ' CLP</div>';
      html += '</div></div>';
    });

    html += '<div id="fw-envio-form"></div>';
    $('#fw-rates').html(html);
  }

  // ─── FORMULARIO DE ENVÍO ────────────────────────────────────────────────────
  function mostrarFormEnvio(idx) {
    var rate    = _rates[idx] || {};
    var pct     = parseFloat($('#fw-pct').val()) || 0;
    var precioRaw   = rate.totalPrice || rate.price || 0;
    var precioCLP   = (rate.currency === 'USD') ? Math.round(precioRaw * USD_CLP) : Math.round(precioRaw);
    var precioCliente = Math.round(precioCLP * (1 + pct / 100));
    var carrier = rate.carrier || rate.service || 'Courier';
    var dias    = rate.deliveryEstimate || rate.days || '?';
    var ciudad  = $('#fw-ciudad').val().trim();

    // Resaltar tarifa elegida
    $('.fw-rate-card').each(function () {
      var i = parseInt($(this).attr('data-rate-idx'), 10);
      $(this).css({
        'border-color': i === idx ? '#0ea5e9' : (i === 0 ? '#86efac' : '#e2e8f0'),
        'background':   i === idx ? '#f0f9ff' : (i === 0 ? '#dcfce7' : '#f8fafc')
      });
    });

    var form = '<div style="border-top:2px solid #0ea5e9;padding-top:10px;margin-top:4px;">';
    form += '<div style="font-size:11px;font-weight:800;color:#1e3a5f;margin-bottom:6px;">'
      + '🚚 ' + carrier + (dias !== '?' ? ' · ' + dias + ' días' : '') + '</div>';
    // Resumen de precios
    form += '<div style="display:flex;gap:8px;margin-bottom:10px;">';
    form += '<div style="flex:1;background:#f8fafc;border-radius:6px;padding:6px 8px;">'
      + '<div style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Costo Envia</div>'
      + '<div style="font-size:13px;font-weight:800;color:#0284c7;">$' + precioCLP.toLocaleString('es-CL') + '</div></div>';
    form += '<div style="flex:1;background:#f0fdf4;border-radius:6px;padding:6px 8px;">'
      + '<div style="font-size:9px;color:#15803d;font-weight:700;text-transform:uppercase;">Precio cliente (+' + pct + '%)</div>'
      + '<div style="font-size:13px;font-weight:800;color:#15803d;">$' + precioCliente.toLocaleString('es-CL') + '</div></div>';
    form += '</div>';
    // Campos del destinatario
    form += '<div style="display:grid;gap:6px;margin-bottom:8px;">';
    form += field('fw-nombre', 'Nombre destinatario', _leadNombre || '');
    form += field('fw-tel',    'Teléfono (56XXXXXXXXX)', '');
    form += field('fw-email',  'Email', _leadEmail || '');
    form += field('fw-calle',  'Calle', '');
    form += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
    form += field('fw-numero', 'Número', '');
    form += field('fw-comuna', 'Ciudad / Comuna', ciudad);
    form += '</div>';
    form += '</div>';
    form += '<button id="fw-btn-generar" data-idx="' + idx + '" '
      + 'style="width:100%;background:linear-gradient(135deg,#16a34a,#15803d);'
      + 'color:white;border:none;border-radius:8px;padding:10px;'
      + 'font-size:12px;font-weight:800;cursor:pointer;">'
      + '🚀 Generar Guía en Envia.com</button>';
    form += '<div id="fw-result" style="margin-top:6px;"></div>';
    form += '</div>';

    $('#fw-envio-form').html(form);

    // Bind botón generar
    $('#fw-btn-generar').on('click', function () {
      generarEnvio(idx, rate);
    });

    // Scroll al formulario
    setTimeout(function () {
      var el = document.getElementById('fw-envio-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  function field(id, placeholder, val) {
    return '<input id="' + id + '" placeholder="' + placeholder + '" value="' + (val || '') + '" '
      + 'style="border:1.5px solid #e2e8f0;border-radius:6px;padding:7px 9px;font-size:11px;'
      + 'width:100%;box-sizing:border-box;font-weight:500;">';
  }

  // ─── GENERAR ENVÍO VÍA FIREBASE RELAY ──────────────────────────────────────
  function generarEnvio(idx, rate) {
    var nombre = $('#fw-nombre').val().trim();
    var tel    = $('#fw-tel').val().trim().replace(/\D/g, '');
    var email  = $('#fw-email').val().trim();
    var calle  = $('#fw-calle').val().trim();
    var numero = $('#fw-numero').val().trim();
    var comuna = $('#fw-comuna').val().trim();
    var $res   = $('#fw-result');

    if (!tel || tel.length < 8) {
      $res.html(msgBox('warning', '⚠️ Teléfono requerido — formato: 56912345678'));
      return;
    }
    if (!calle) {
      $res.html(msgBox('warning', '⚠️ Ingresa la calle de entrega'));
      return;
    }

    $res.html('<div style="text-align:center;padding:10px;color:#16a34a;'
      + 'font-size:11px;font-weight:700;">🔄 Generando guía en Envia.com...</div>');

    $('#fw-btn-generar').prop('disabled', true).css('opacity', '0.6');

    var estadoComuna = CHILE_ESTADOS_ENVIA[(comuna || '').toUpperCase()] || 'RM';
    var carrier      = rate.carrier || rate.service || '';
    var serviceCode  = rate.service || carrier;

    var pendiente = {
      ts:        new Date().toISOString(),
      nombre:    nombre || 'Cliente',
      correo:    email,
      telefono:  tel,
      ciudad:    comuna,
      carrier:   carrier,
      service:   serviceCode,
      calle:     calle,
      numero:    numero,
      estado:    estadoComuna,
      packages:  buildPackages(),
      source:    'kommo-widget',
      leadId:    _leadId
    };

    // Limpiar resultado previo y escribir pendiente
    fbDel('/envia_shipments/' + _leadId)
      .then(function () { return fbPut('/envia_pending/' + _leadId, pendiente); })
      .then(function () {
        // Polling — esperar que envia-sync.js procese
        var polls = 0;
        var timer = setInterval(function () {
          polls++;
          fbGet('/envia_shipments/' + _leadId).then(function (s) {
            if (s && s.trackingNumber) {
              clearInterval(timer);
              $('#fw-btn-generar').prop('disabled', false).css('opacity', '1');
              $res.html(msgBox('success',
                '✅ Guía generada — Tracking: <strong>' + s.trackingNumber + '</strong>'));
            } else if (s && s.error) {
              clearInterval(timer);
              $('#fw-btn-generar').prop('disabled', false).css('opacity', '1');
              $res.html(msgBox('error', '❌ ' + s.error));
            } else if (polls >= 30) {
              clearInterval(timer);
              $('#fw-btn-generar').prop('disabled', false).css('opacity', '1');
              $res.html(msgBox('warning',
                '⏱ Timeout — verifica que envia-sync.js esté corriendo en tu Mac'));
            }
          });
        }, 2000);
      })
      .catch(function () {
        $('#fw-btn-generar').prop('disabled', false).css('opacity', '1');
        $res.html(msgBox('error', '❌ Error al conectar con Firebase'));
      });
  }

  function msgBox(type, msg) {
    var styles = {
      success: 'background:#dcfce7;color:#166534',
      error:   'background:#fef2f2;color:#dc2626',
      warning: 'background:#fef9c3;color:#854d0e'
    };
    return '<div style="padding:8px 10px;border-radius:6px;font-size:11px;font-weight:700;'
      + (styles[type] || styles.warning) + '">' + msg + '</div>';
  }

  // ─── MÓDULO KOMMO ──────────────────────────────────────────────────────────
  var FodorEnviosWidget = function () {
    var self = this;

    this.callbacks = {

      render: function () {
        // Obtener datos del lead actual
        try {
          var entity = self.get_entity ? self.get_entity() : {};
          _leadId     = String(entity.id || ('lead-' + Date.now()));
          _leadNombre = entity.name || '';
          // Buscar email y ciudad en custom fields
          var fields = entity.custom_fields_values || [];
          fields.forEach(function (f) {
            var v = (f.values && f.values[0]) ? String(f.values[0].value || '') : '';
            var code = (f.field_code || '').toUpperCase();
            var name = (f.field_name || '').toUpperCase();
            if (code === 'EMAIL' || name.includes('EMAIL') || name.includes('CORREO')) {
              _leadEmail = _leadEmail || v;
            }
            if (name.includes('CIUDAD') || name.includes('CITY') || name.includes('LOCALIDAD')) {
              _leadCiudad = _leadCiudad || v;
            }
          });
        } catch (e) {
          _leadId = 'lead-' + Date.now();
        }

        // Fallback: lead ID desde URL
        if (!_leadId || _leadId === 'lead-') {
          var m = window.location.pathname.match(/\/leads\/detail\/(\d+)/);
          _leadId = m ? m[1] : ('lead-' + Date.now());
        }

        return true;
      },

      init: function () {
        return true;
      },

      bind_actions: function () {
        var $doc = $(document);

        // Inyectar HTML en el tab del widget
        var $body = $('.widget[data-id="fodor_envios"] .widget_body,' +
          '[class*="fodor_envios"] .widget_body,' +
          '#fodor_envios .widget_body');

        if (!$body.length) {
          // Fallback: buscar el contenedor del widget por el caption
          $body = $('div').filter(function () {
            return $(this).find('.widget_caption').text().indexOf('Envíos') >= 0;
          }).find('.widget_body').first();
        }

        if ($body.length) {
          $body.html(buildMainHTML());
        } else {
          // Último recurso: append al final del lcard content
          var $lcard = $('.card-cf__wrapper, .card__content, .detail-head__content').last();
          if ($lcard.length) {
            $lcard.append('<div id="fw-injected">' + buildMainHTML() + '</div>');
          }
        }

        // ── Eventos (delegados en document para sobrevivir re-renders) ────────

        // +/- botones del catálogo
        $doc.on('click.fw', '.fw-minus', function () {
          updateQty($(this).data('sku'), -1);
        });
        $doc.on('click.fw', '.fw-plus', function () {
          updateQty($(this).data('sku'), 1);
        });

        // Botón cotizar
        $doc.on('click.fw', '#fw-btn-cotizar', function () {
          cotizar();
        });

        // Recalcular precios al cambiar %
        $doc.on('input.fw', '#fw-pct', function () {
          recalcPrecios();
        });

        // Seleccionar tarifa
        $doc.on('click.fw', '.fw-rate-card', function () {
          var idx = parseInt($(this).attr('data-rate-idx'), 10);
          mostrarFormEnvio(idx);
        });

        return true;
      },

      settings: function ($modal_body) {
        // Pantalla de configuración (solo para admins)
        $modal_body.html(
          '<fieldset class="widget_settings_block">'
          + '<label>Token Envia.com (ya configurado por defecto)</label>'
          + '<input type="text" class="text-input" name="envia_token" '
          + 'value="' + ENVIA_T + '" style="width:100%;font-size:11px;">'
          + '<label style="margin-top:10px;display:block;">% Ganancia por defecto</label>'
          + '<input type="number" class="text-input" name="ganancia_pct" value="20" style="width:80px;">'
          + '</fieldset>'
        );
        return true;
      },

      onSave: function () {
        return true;
      },

      destroy: function () {
        $(document).off('.fw');
        return true;
      }
    };

    return this;
  };

  return FodorEnviosWidget;
});
