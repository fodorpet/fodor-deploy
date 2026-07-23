#!/bin/bash
# Doble clic para iniciar Envia.com Sync
cd "$(dirname "$0")"
echo "════════════════════════════════════════════"
echo "  🚀 Fodor SpA — Envia.com Sync"
echo "  Carrier: Chilexpress"
echo "  Ctrl+C para detener"
echo "════════════════════════════════════════════"
echo ""
node envia-sync.js
echo ""
echo "El proceso terminó. Cierra esta ventana."
read -n 1
