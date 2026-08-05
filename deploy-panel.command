#!/bin/bash
# ══════════════════════════════════════════════════
#  Fodor Spa — Deploy Panel (doble clic para subir)
# ══════════════════════════════════════════════════

DEPLOY="$HOME/fodor-deploy"
BACKUP="$DEPLOY/backups"
FECHA=$(date '+%Y-%m-%d_%H-%M')

echo "🚀 Fodor Spa — Subiendo panel a Firebase..."
echo ""

# Crear backup del index.html actual (copia de trabajo Y copia publicada)
mkdir -p "$BACKUP"
cp "$DEPLOY/index.html" "$BACKUP/index_$FECHA.html" 2>/dev/null && echo "✅ Backup guardado: backups/index_$FECHA.html"
cp "$DEPLOY/public/index.html" "$BACKUP/public_index_$FECHA.html" 2>/dev/null && echo "✅ Backup guardado: backups/public_index_$FECHA.html"

cd "$DEPLOY"

# ══════════════════════════════════════════════════
#  SELLO DE VERSIÓN AUTOMÁTICO  (agregado 04-08-2026)
#
#  La etiqueta de versión estaba escrita a mano en el HTML y no se tocaba
#  desde el 29-07. Resultado: publicabas un arreglo, el panel seguía
#  diciendo "v2026-07-29B", y no había forma de saber si el navegador
#  estaba corriendo el código nuevo o una copia guardada en caché.
#  El 04-08 se perdieron horas por esto: se probaban arreglos sin poder
#  confirmar que se estuvieran ejecutando.
#
#  Ahora el sello lo escribe el deploy, con fecha y hora reales.
# ══════════════════════════════════════════════════
# ══════════════════════════════════════════════════
#  RESPALDO EN GIT ANTES DE PUBLICAR  (agregado 04-08-2026)
#
#  El 31-07 se perdieron los arreglos de envia-sync.js: estaban en disco
#  pero nunca se commitearon, y algo los sobreescribió. Un commit los
#  habría recuperado en un comando.
#
#  Publicar sin commitear significa que lo que está en producción no
#  existe en ningún historial: si se pisa, no hay de dónde sacarlo.
# ══════════════════════════════════════════════════
if [ -d "$DEPLOY/.git" ]; then
  # Los .lock quedan colgados cuando un git anterior se cortó a la mitad
  rm -f "$DEPLOY/.git/HEAD.lock" "$DEPLOY/.git/index.lock" 2>/dev/null
  SUELTOS=$(cd "$DEPLOY" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$SUELTOS" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "⚠️  Hay $SUELTOS archivo(s) con cambios SIN GUARDAR en el historial:"
    (cd "$DEPLOY" && git status --porcelain 2>/dev/null | head -12 | sed 's/^/     /')
    [ "$SUELTOS" -gt 12 ] && echo "     ... y $((SUELTOS-12)) más"
    echo ""
    echo "   Si publicás así y algo los sobreescribe, no hay forma de recuperarlos."
    echo ""
    read -p "   ¿Guardarlos en el historial antes de publicar? [S/n/c=cancelar] " RESP
    case "$RESP" in
      [cC]) echo ""; echo "   Deploy cancelado. No se subió nada."; echo ""
            read -p "Presiona Enter para cerrar..."; exit 0 ;;
      [nN]) echo "   ⚠️  Se publica sin respaldo en el historial. Bajo tu responsabilidad." ;;
      *)    (cd "$DEPLOY" && git add -A && \
             git -c user.email="byfodor@gmail.com" -c user.name="Fodor SpA" \
                 commit -q -m "Respaldo automático antes del deploy $(date '+%Y-%m-%d %H:%M')") \
            && echo "   ✅ Guardado en el historial" \
            || echo "   ⚠️  No se pudo guardar en el historial. El deploy sigue igual." ;;
    esac
  else
    echo ""
    echo "✅ Sin cambios sueltos: todo está guardado en el historial."
  fi
fi

SELLO="v$(date '+%Y-%m-%d_%H:%M')"
echo ""
echo "🏷  Sellando versión: $SELLO"

for ARCHIVO in "$DEPLOY/index.html" "$DEPLOY/public/index.html"; do
  [ -f "$ARCHIVO" ] || continue
  # Reemplaza el contenido del chip de versión y el <title>, sea cual sea
  # el valor anterior. El patrón v0000-00-00 cubre los dos formatos usados.
  /usr/bin/sed -i '' -E \
    -e "s|(<span id=\"chipVersion\"[^>]*>)[^<]*(</span>)|\1$SELLO\2|" \
    -e "s|(<title>Fodor Spa — Panel de Facturación )[^<]*(</title>)|\1$SELLO\2|" \
    "$ARCHIVO"
done

# Comprobar que el sello quedó escrito: si el patrón no coincidió, el
# usuario tiene que saberlo, no descubrirlo cuando falle un diagnóstico.
if grep -q "$SELLO" "$DEPLOY/public/index.html" 2>/dev/null; then
  echo "   ✅ Sello escrito en index.html y public/index.html"
else
  echo "   ⚠️  NO se pudo escribir el sello (cambió el HTML del chip de versión)."
  echo "      El deploy sigue, pero la etiqueta del panel va a mostrar la versión vieja."
fi

# ══════════════════════════════════════════════════
#  FRENO DE SINTAXIS  (agregado 27-07-2026)
#  Un `});` de más publicado el 27-07 dejó el panel en blanco: un error
#  de sintaxis hace que el navegador descarte el <script> ENTERO. Desde
#  ahora nada sube a producción sin compilar primero.
# ══════════════════════════════════════════════════
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "❌ No encuentro 'node'. Sin node no se puede validar NI desplegar."
  echo "   Deploy cancelado. Producción sigue como estaba."
  echo ""
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

if [ -f "$DEPLOY/validar-deploy.js" ]; then
  node "$DEPLOY/validar-deploy.js" "$DEPLOY"
  if [ $? -ne 0 ]; then
    echo "══════════════════════════════════════════"
    echo "  🛑 DEPLOY DETENIDO"
    echo "  No se subió nada. El panel en producción"
    echo "  sigue funcionando exactamente igual."
    echo "  Corrige la línea que sale arriba y repite."
    echo "══════════════════════════════════════════"
    echo ""
    read -p "Presiona Enter para cerrar..."
    exit 1
  fi
else
  echo "⚠️  Falta validar-deploy.js — se publica SIN validar sintaxis."
  echo ""
fi

# Desplegar
echo "📡 Desplegando en Firebase Hosting..."
npx firebase-tools deploy --only hosting,database

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ Deploy completado"
echo "  🌐 URL: https://odfor-bae97.web.app"
echo ""
echo "  Si necesitas revertir (los DOS comandos, en orden):"
echo "  cp ~/fodor-deploy/backups/index_$FECHA.html ~/fodor-deploy/index.html"
echo "  cp ~/fodor-deploy/backups/index_$FECHA.html ~/fodor-deploy/public/index.html"
echo "  Luego vuelve a hacer doble clic en deploy-panel.command"
echo "  (Firebase publica la carpeta public/ — si solo cambias la raíz, no pasa nada)"
echo "══════════════════════════════════════════"
