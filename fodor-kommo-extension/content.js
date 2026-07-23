/**
 * Fodor Envíos — Extensión Chrome para Kommo
 * Inyecta botón flotante "🚚 Cotizar Envío" en tarjetas de leads
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
   * Intenta leer la ciudad desde los campos personalizados del lead en Kommo.
   * Busca etiquetas que contengan "ciudad", "comuna" o "destino".
   */
  function getCity() {
    // Kommo renderiza campos como <label>Ciudad</label> + <input> o <span> adyacente
    var allLabels = document.querySelectorAll('label, .custom-field__label, [class*="label"]');
    for (var i = 0; i < allLabels.length; i++) {
      var lbl = allLabels[i];
      var txt = (lbl.textContent || '').toLowerCase().trim();
      if (txt === 'ciudad' || txt === 'comuna' || txt === 'destino' || txt === 'ciudad de destino') {
        // busca input o value en el contenedor padre
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

  function onNavigate() {
    if (isLeadPage()) {
      // Pequeño delay para que el DOM del lead termine de renderizarse
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
