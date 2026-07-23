define(['jquery'], function ($) {
  'use strict';
  var Widget = function () {
    this.callbacks = {
      render: function () { return true; },
      init: function () { return true; },
      bind_actions: function () {
        var $w = $('.widget[data-id="fodor_envios"] .widget_body');
        if ($w.length) {
          $w.html('<div style="padding:16px;font-family:sans-serif;">' +
            '<p style="color:#0284c7;font-weight:bold;">🚚 Fodor Envios</p>' +
            '<p style="font-size:12px;color:#64748b;">Widget cargado correctamente</p>' +
            '</div>');
        }
        return true;
      },
      settings: function () { return true; },
      onSave: function () { return true; },
      destroy: function () { return true; }
    };
    return this;
  };
  return Widget;
});
