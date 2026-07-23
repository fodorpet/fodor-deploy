#!/bin/bash
# Fodor Spa — Kommo Sync (doble clic para iniciar)
# Deja esta ventana abierta mientras trabajas con el panel
cd "$HOME/fodor-deploy"
echo "🔄 Fodor Spa — Kommo Sync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Detecta pagos en Kommo cada 5 min"
echo "✅ Los notifica en el panel web"
echo ""
echo "⚠️  NO CIERRES ESTA VENTANA mientras usas el panel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
node kommo-sync.js
