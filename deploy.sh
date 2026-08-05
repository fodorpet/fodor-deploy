#!/bin/bash
# ═══════════════════════════════════════════════
#  Fodor Spa — Deploy Script con Backup + Git
# ═══════════════════════════════════════════════

FUENTE="/Users/deborahfodor/Library/Application Support/Claude/local-agent-mode-sessions/410c4ddc-4726-4448-9afa-ae7e768f6f70/6e0e1da9-9120-4958-bd4a-29d77b3c581c/local_d30383b9-3331-4fca-b218-83a1b4a9fcc2/outputs/index_cifrado.html"
DEPLOY="$HOME/fodor-deploy"
BACKUP="$DEPLOY/backups"

mkdir -p "$BACKUP"

FECHA=$(date '+%Y-%m-%d_%H-%M')
cp "$DEPLOY/index.html" "$BACKUP/index_$FECHA.html" 2>/dev/null && echo "✅ Backup: backups/index_$FECHA.html"

cp "$FUENTE" "$DEPLOY/index.html" && echo "✅ Archivo actualizado"

cd "$DEPLOY"
git add index.html
git commit -m "Deploy $FECHA" 2>/dev/null && echo "✅ Git commit guardado"

echo "🚀 Subiendo a Firebase..."
npx firebase-tools deploy --only hosting

echo ""
echo "══════════════════════════════════════"
echo "  Backup en: backups/index_$FECHA.html"
echo "  Para revertir si algo falla:"
echo "  cp ~/fodor-deploy/backups/index_$FECHA.html ~/fodor-deploy/index.html"
echo "  npx firebase-tools deploy --only hosting"
echo "══════════════════════════════════════"Cmd+Vcp "/Users/deborahfodor/Library/Application Support/Claude/local-agent-mode-sessions/410c4ddc-4726-4448-9afa-ae7e768f6f70/6e0e1da9-9120-4958-bd4a-29d77b3c581c/local_d30383b9-3331-4fca-b218-83a1b4a9fcc2/outputs/index.html" ~/fodor-deploy/index.html && cd ~/fodor-deploy && npx firebase-tools deploy --only hosting

cd ~/fodor-deploy && npx firebase-tools deploy --only hosting
cd ~/fodor-deploy && node envia-sync.js

