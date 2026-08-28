#!/bin/bash
# Publica el index.html ACTUAL de ~/fodor-deploy a Firebase Hosting.
# NO usa deploy.sh (ese sobrescribe index.html desde una carpeta de sesion vieja).
cd "$HOME/fodor-deploy" || exit 1
FECHA=$(date '+%Y-%m-%d_%H-%M')
mkdir -p backups
cp index.html "backups/index_predeploy_$FECHA.html" && echo "Backup: backups/index_predeploy_$FECHA.html"
cp index.html public/index.html && echo "public/index.html sincronizado"
echo "Subiendo a Firebase Hosting (proyecto odfor-bae97)..."
npx firebase-tools deploy --only hosting
echo ""
echo "Listo. Si algo falla, revertir con:"
echo "  cp ~/fodor-deploy/backups/index.html.pre-quitar-tabs-20260828-135505 ~/fodor-deploy/index.html"
echo "  cd ~/fodor-deploy && cp index.html public/index.html && npx firebase-tools deploy --only hosting"
echo ""
read -p "Presiona Enter para cerrar..."
