// ==UserScript==
// @name         Fodor Envíos — Cotizador en Kommo
// @namespace    https://odfor-bae97.web.app/
// @version      1.0.0
// @description  Agrega el botón "Cotizar Envío" en las fichas de lead de Kommo y abre el cotizador con la ciudad ya cargada.
// @author       Fodor SpA
// @match        https://*.kommo.com/*
// @match        https://*.amocrm.com/*
// @icon         https://odfor-bae97.web.app/favicon.ico
// @downloadURL  https://odfor-bae97.web.app/fodor-envios.user.js
// @updateURL    https://odfor-bae97.web.app/fodor-envios.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

/**
 * Fodor Envíos — Cotizador en Kommo
 *
 * Portado desde fodor-kommo-extension/content.js (2026-08-01).
 * La lógica es la misma; cambia el envase.
 *
 * Por qué userscript y no extensión descomprimida:
 *   - La extensión exigía Modo Desarrollador y que la carpeta no se moviera nunca.
 *     Si un vendedor ordenaba su escritorio, el botón dejaba de aparecer.
 *   - Actualizar obligaba a mandar un ZIP nuevo a cada persona y que cada una
 *     repitiera la instalación completa. Bastaba con que uno no lo hiciera para
 *     que quedaran versiones distintas conviviendo.
 *   - Con @updateURL, publicar una version nueva es hacer el deploy de siempre:
 *     Tampermonkey la baja solo en cada equipo.
 *
 * Para publicar un cambio:
 *   1. Editar este archivo
 *   2. SUBIR el numero de @version (si no, nadie recibe la actualizacion)
 *   3. Copiar a public/ y correr deploy-panel.command
 */

(function () {
  'use strict';

  var COTIZADOR_URL = 'https://odfor-bae97.web.app/envios.html';
  var BTN_ID        = 'fodor-envios-fab';

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getLeadId() {
    var m = location.pathname.match(/\/leads\/detail\/(\d+)/);
    return m ? m[1] : null;
  }

  function isLeadPage() {
    return /\/leads\/detail\/\d+/.test(location.href);
  }

  /**
   * Lee la ciudad desde los campos personalizados del lead en Kommo.
   * Busca etiquetas que digan "ciudad", "comuna" o "destino".
   */
  function getCity() {
    var allLabels = document.querySelectorAll('label, .custom-field__label, [class*="label"]');
    for (var i = 0; i < allLabels.length; i++) {
      var lbl = allLabels[i];
      var txt = (lbl.textContent || '').toLowerCase().trim();
      if (txt === 'ciudad' || txt === 'comuna' || txt === 'destino' || txt === 'ciudad de destino') {
        var container = lbl.closest('[class*="field"], .card-cf, li');
        if (container) {
          var inp = container.querySelector('input');
          if (inp && inp.value.trim()) return inp.value.trim();
          var val = container.querySelector('[class*="value"], [class*="text"]');
          if (val && val.textContent.trim()) return val.textContent.trim();
        }
      }
    }
    return '';
  }

  // ── Botón flotante ───────────────────────────────────────────────────────────

  function createBtn() {
    if (document.getElementById(BTN_ID)) return;

    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '🚚 Cotizar Envío';

    var s = btn.style;
    s.position      = 'fixed';
    s.bottom        = '24px';
    s.right         = '24px';
    s.zIndex        = '2147483647';
    s.background    = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
    s.color         = '#ffffff';
    s.border        = 'none';
    s.borderRadius  = '14px';
    s.padding       = '13px 22px';
    s.fontSize      = '14px';
    s.fontWeight    = '700';
    s.cursor        = 'pointer';
    s.boxShadow     = '0 4px 20px rgba(37,99,235,0.45), 0 1px 4px rgba(0,0,0,0.2)';
    s.fontFamily    = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    s.letterSpacing = '0.3px';
    s.lineHeight    = '1';
    s.transition    = 'transform 0.15s, filter 0.15s, box-shadow 0.15s';
    s.userSelect    = 'none';
    s.webkitUserSelect = 'none';

    btn.addEventListener('mouseenter', function () {
      btn.style.filter    = 'brightness(1.12)';
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 8px 28px rgba(37,99,235,0.55), 0 2px 6px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.filter    = '';
      btn.style.transform = '';
      btn.style.boxShadow = '0 4px 20px rgba(37,99,235,0.45), 0 1px 4px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mousedown', function () {
      btn.style.transform = 'translateY(0px) scale(0.97)';
    });
    btn.addEventListener('mouseup', function () {
      btn.style.transform = 'translateY(-2px) scale(1)';
    });

    btn.addEventListener('click', openCotizador);

    document.body.appendChild(btn);
  }

  function removeBtn() {
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
  }

  function openCotizador() {
    var leadId = getLeadId();
    var city   = getCity();
    var params = [];
    if (leadId) params.push('lead=' + encodeURIComponent(leadId));
    if (city)   params.push('ciudad=' + encodeURIComponent(city));
    var url = COTIZADOR_URL + (params.length ? '?' + params.join('&') : '');
    window.open(url, '_blank', 'width=760,height=920,noopener,noreferrer');
  }

  // ── Navegación SPA ───────────────────────────────────────────────────────────
  // Kommo no recarga la página al cambiar de ficha: solo cambia la URL. Por eso
  // se vigila la URL y no el DOM entero — Kommo muta el DOM constantemente y
  // reaccionar a cada mutación es trabajo al pedo que enlentece el navegador.

  function onNavigate() {
    if (isLeadPage()) {
      // Delay para que el DOM del lead termine de renderizarse
      setTimeout(createBtn, 700);
    } else {
      removeBtn();
    }
  }

  var _lastUrl = location.href;

  var _observer = new MutationObserver(function () {
    var current = location.href;
    if (current !== _lastUrl) {
      _lastUrl = current;
      onNavigate();
    }
  });

  _observer.observe(document.documentElement, { childList: true, subtree: true });

  // Verificación inicial
  onNavigate();

})();
