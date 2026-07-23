#!/bin/bash
# ══════════════════════════════════════════════════
#  Fodor Spa — Iniciar Monday Sync (doble clic)
# ══════════════════════════════════════════════════

DEPLOY="$HOME/fodor-deploy"

echo "══════════════════════════════════════════════"
echo "  Fodor Spa — Monday Sync"
echo "  Sincroniza Monday Producción → Firebase"
echo "  Ctrl+C para detener"
echo "══════════════════════════════════════════════"
echo ""

cd "$DEPLOY"
node monday-sync.js
