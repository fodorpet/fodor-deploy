#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  Fodor Spa — Publicar SOLO el arreglo de Pago a Proveedores
#  Generado 2026-08-21. Version no interactiva de deploy-panel.command
#  (no hace preguntas: guarda respaldo, commitea, valida y publica).
# ══════════════════════════════════════════════════════════════
DEPLOY="$HOME/fodor-deploy"
cd "$DEPLOY" || { echo "No encuentro $DEPLOY"; read -p "Enter para cerrar..."; exit 1; }

FECHA=$(date '+%Y-%m-%d_%H-%M')
mkdir -p backups

echo "═══════════════════════════════════════════"
echo "  Publicando arreglo de Pago a Proveedores"
echo "═══════════════════════════════════════════"
echo ""

cp "$DEPLOY/index.html"        "backups/index_$FECHA.html"        2>/dev/null && echo "Respaldo: backups/index_$FECHA.html"
cp "$DEPLOY/public/index.html" "backups/public_index_$FECHA.html" 2>/dev/null && echo "Respaldo: backups/public_index_$FECHA.html"
echo ""

# --- Sello de version (igual que deploy-panel.command) ---
SELLO="v$(date '+%Y-%m-%d_%H:%M')"
echo "Sellando version: $SELLO"
for ARCHIVO in "$DEPLOY/index.html" "$DEPLOY/public/index.html"; do
  [ -f "$ARCHIVO" ] || continue
  /usr/bin/sed -i '' -E \
    -e "s|(<span id=\"chipVersion\"[^>]*>)[^<]*(</span>)|\1$SELLO\2|" \
    -e "s|(<title>Fodor Spa — Panel de Facturación )[^<]*(</title>)|\1$SELLO\2|" \
    "$ARCHIVO"
done
grep -q "$SELLO" "$DEPLOY/public/index.html" && echo "   Sello escrito OK" || echo "   AVISO: no se pudo escribir el sello"
echo ""

# --- Respaldo en git (sin preguntar) ---
if [ -d "$DEPLOY/.git" ]; then
  rm -f "$DEPLOY/.git/HEAD.lock" "$DEPLOY/.git/index.lock" 2>/dev/null
  rm -rf "$DEPLOY/_to_delete" 2>/dev/null
  git add -A 2>/dev/null
  git -c user.email="byfodor@gmail.com" -c user.name="Fodor SpA" \
      commit -q -m "Fix persistencia Pago a Proveedores $FECHA" 2>/dev/null \
      && echo "Guardado en el historial de git" \
      || echo "Nada nuevo que guardar en git (o ya estaba guardado)"
fi
echo ""

# --- Freno de sintaxis ---
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: no encuentro 'node'. No se publica nada."
  read -p "Enter para cerrar..."; exit 1
fi
node "$DEPLOY/validar-deploy.js" "$DEPLOY"
if [ $? -ne 0 ]; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  DEPLOY DETENIDO - error de sintaxis."
  echo "  No se subio nada. Produccion sigue igual."
  echo "═══════════════════════════════════════════"
  read -p "Enter para cerrar..."; exit 1
fi
echo ""

echo "Desplegando en Firebase Hosting..."
npx firebase-tools deploy --only hosting,database
CODIGO=$?

echo ""
echo "═══════════════════════════════════════════"
if [ $CODIGO -eq 0 ]; then
  echo "  LISTO - publicado correctamente"
  echo "  URL: https://odfor-bae97.web.app"
  echo ""
  echo "  AHORA EN EL NAVEGADOR:"
  echo "  1) Recarga con Cmd+Shift+R"
  echo "  2) El chip de version debe decir: $SELLO"
  echo "  3) Entra a Pagos y mira si estan los 288 registros"
else
  echo "  FALLO EL DEPLOY (codigo $CODIGO)"
  echo "  Produccion sigue como estaba. Copia el error de arriba."
fi
echo "═══════════════════════════════════════════"
echo ""
read -p "Presiona Enter para cerrar esta ventana..."
