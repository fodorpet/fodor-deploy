#!/bin/bash
# Fodor SpA — Guarda la clave y el token de Trello en Firebase Secret Manager
# Ninguno de los dos pasa por el chat con Claude: se pegan acá, se validan
# contra la API de Trello, y quedan guardados solo en la nube de Firebase
# (nunca en el código del Panel). Después de guardarlos, publica las
# Cloud Functions que los usan.

clear
echo "═══════════════════════════════════════════════"
echo "  🔐 Fodor SpA — Guardar credenciales de Trello"
echo "═══════════════════════════════════════════════"
echo ""
echo "  Dónde conseguirlas (con permiso de LECTURA y ESCRITURA):"
echo "  1. Entra a https://trello.com/app-key con tu sesión de Trello abierta"
echo "     → copia el 'Key' que aparece arriba."
echo "  2. En la misma página, hace clic en el link 'Token' (o generá uno"
echo "     nuevo) y AUTORIZÁ con permisos de lectura y escritura — el error"
echo "     anterior (401 missing scopes) fue justamente por un token sin"
echo "     permiso de escritura."
echo ""

DEPLOY="$HOME/fodor-deploy"
cd "$DEPLOY" || { echo "❌ No encontré la carpeta $DEPLOY"; read -p "Presiona Enter para cerrar..."; exit 1; }

read -s -p "  Pega la API KEY de Trello y presioná Enter: " KEY_IN
echo ""
KEY=$(echo "$KEY_IN" | tr -d '[:space:]')
if [ -z "$KEY" ]; then
  echo "❌ No se ingresó ninguna key."
  read -p "Presiona Enter para cerrar..."; exit 1
fi

read -s -p "  Pega el TOKEN de Trello y presioná Enter: " TOKEN_IN
echo ""
echo ""
TOKEN=$(echo "$TOKEN_IN" | tr -d '[:space:]')
if [ -z "$TOKEN" ]; then
  echo "❌ No se ingresó ningún token."
  read -p "Presiona Enter para cerrar..."; exit 1
fi

# Probar ANTES de guardar, para no dejar una credencial mala en Firebase
echo "🔍 Probando la key y el token con Trello..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://api.trello.com/1/members/me?key=${KEY}&token=${TOKEN}")

if [ "$CODE" != "200" ]; then
  echo "❌ Trello respondió HTTP $CODE — la key/token no sirven."
  echo ""
  if [ "$CODE" = "401" ]; then
    echo "   401 significa que el token está vencido, revocado, o no se"
    echo "   autorizó correctamente. Generá uno nuevo y volvé a intentar."
  else
    echo "   Revisá que copiaste bien la key y el token, e intenta de nuevo."
  fi
  echo ""
  echo "   NO se guardó nada (para no dejar una credencial mala)."
  echo ""
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

echo "✅ Key y token válidos (HTTP 200)"
echo ""

echo "☁️  Guardando en Firebase Secret Manager..."
echo "$KEY" | npx firebase-tools functions:secrets:set TRELLO_KEY --data-file - --force
if [ $? -ne 0 ]; then
  echo "❌ No se pudo guardar TRELLO_KEY. Revisá el mensaje de arriba."
  read -p "Presiona Enter para cerrar..."; exit 1
fi

echo "$TOKEN" | npx firebase-tools functions:secrets:set TRELLO_TOKEN --data-file - --force
if [ $? -ne 0 ]; then
  echo "❌ No se pudo guardar TRELLO_TOKEN. Revisá el mensaje de arriba."
  read -p "Presiona Enter para cerrar..."; exit 1
fi

echo ""
echo "✅ Credenciales guardadas en Firebase Secret Manager."
echo ""
echo "🚀 Publicando las funciones de Trello (esto puede tardar un par de minutos)..."
npx firebase-tools deploy --only functions:trelloCrearTarjeta,functions:trelloAgregarComentario,functions:trelloMoverTarjeta

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Listo. \"Enviar a Trello\" ya debería funcionar en el Panel."
else
  echo ""
  echo "⚠️  Las credenciales quedaron guardadas, pero el deploy de las"
  echo "   funciones falló. Revisá el mensaje de arriba (por ejemplo, puede"
  echo "   pedir habilitar la facturación/Secret Manager en el proyecto"
  echo "   de Firebase) y volvé a intentar corriendo este mismo script."
fi

echo ""
read -p "Presiona Enter para cerrar..."
