#!/bin/bash
# ══════════════════════════════════════════════════
#  Fodor Spa — Deploy Panel (doble clic para subir)
# ══════════════════════════════════════════════════

DEPLOY="$HOME/fodor-deploy"
BACKUP="$DEPLOY/backups"
FECHA=$(date '+%Y-%m-%d_%H-%M')

echo "🚀 Fodor Spa — Subiendo panel a Firebase..."
echo ""

# Crear backup del index.html actual
mkdir -p "$BACKUP"
cp "$DEPLOY/index.html" "$BACKUP/index_$FECHA.html" 2>/dev/null && echo "✅ Backup guardado: backups/index_$FECHA.html"

# Ir a la carpeta y desplegar
cd "$DEPLOY"
echo ""
echo "📡 Desplegando en Firebase Hosting..."
npx firebase-tools deploy --only hosting,database

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ Deploy completado"
echo "  🌐 URL: https://odfor-bae97.web.app"
echo ""
echo "  Si necesitas revertir:"
echo "  cp ~/fodor-deploy/backups/index_$FECHA.html ~/fodor-deploy/index.html"
echo "  Luego vuelve a hacer doble clic en deploy-panel.command"
echo "══════════════════════════════════════════"
