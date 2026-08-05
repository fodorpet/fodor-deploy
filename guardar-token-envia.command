#!/bin/bash
# Fodor SpA — Guarda el token de Envia.com en el Llavero de macOS
# Mismo patrón que guardar-token-kommo.command: el token nunca queda escrito
# en el código ni en un archivo de texto, solo en el Llavero.
clear
echo "═══════════════════════════════════════════════"
echo "  🔐 Fodor SpA — Guardar token de Envia.com"
echo "═══════════════════════════════════════════════"
echo ""

# El unico filtro por largo es para descartar un pegado vacio o accidental.
# Quien decide si el token sirve es Envia.com, mas abajo: adivinar el formato
# desde aca solo sirve para rechazar tokens buenos.
validar() { [[ ${#1} -ge 8 ]]; }

TOKEN=$(pbpaste | tr -d '[:space:]')

if validar "$TOKEN"; then
  echo "📋 Token tomado del portapapeles (${#TOKEN} caracteres)"
  echo ""
else
  echo "El portapapeles está vacío o trae muy poco texto."
  echo ""
  echo "  Dónde encontrarlo:"
  echo "  Envia.com → inicia sesión → Configuración / Settings"
  echo "  → API / Integraciones → Token de producción"
  echo ""
  echo "  Ojo: copia el TOKEN completo, no el nombre de la cuenta ni el ID."
  echo "  Suele ser una cadena larga de letras y números sin espacios."
  echo ""
  echo "  Pégalo aquí abajo con Cmd+V y presiona Enter."
  echo "  (no se ve mientras lo pegas — es por seguridad, es normal)"
  echo ""
  read -s -p "  Pega el token: " TOKEN_IN
  echo ""
  echo ""
  TOKEN=$(echo "$TOKEN_IN" | tr -d '[:space:]')
  if ! validar "$TOKEN"; then
    echo "❌ No recibí casi nada (${#TOKEN} caracteres)."
    echo ""
    echo "   Si pegaste con Cmd+V y no pasó nada, probá así:"
    echo "   copiá el token, cerrá esta ventana y volvé a abrir el .command."
    echo "   El script lee el portapapeles solo, sin que tengas que pegar."
    echo ""
    read -p "Presiona Enter para cerrar..."
    exit 1
  fi
  echo "📋 Token recibido (${#TOKEN} caracteres)"
  echo ""
fi

# Probar ANTES de guardar, para no dejar una credencial mala en el Llavero.
# Se usa /ship/rate/ porque es el endpoint que el propio envia-sync.js consulta:
# no se inventa una ruta que no esté ya en uso.
echo "🔍 Probando el token con Envia.com..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://api.envia.com/ship/rate/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"origin":{"name":"test","street":"test","number":"1","district":"Santiago","city":"Santiago","state":"Region Metropolitana","country":"CL","postalCode":"","phone":"999999999"},"destination":{"name":"test","street":"test","number":"1","district":"Santiago","city":"Santiago","state":"Region Metropolitana","country":"CL","postalCode":"","phone":"999999999"},"packages":[{"content":"test","amount":1,"type":"box","weight":1,"weightUnit":"KG","lengthUnit":"CM","dimensions":{"length":10,"width":10,"height":10}}],"shipment":{"carrier":"chilexpress"}}')

if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  echo "❌ Envia.com respondió HTTP $CODE — ese token no sirve."
  echo ""
  echo "   $CODE significa que está vencido, revocado, o que lo que copiaste"
  echo "   no es el token (a veces se copia el ID de cuenta por error)."
  echo ""
  echo "   Recibí ${#TOKEN} caracteres. El token anterior de Fodor tenía 64,"
  echo "   así que si copiaste mucho menos, probablemente sea otro campo."
  echo ""
  echo "   NO se guardó nada en el Llavero (para no dejar una credencial mala)."
  echo ""
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

if [ "$CODE" = "000" ]; then
  echo "⚠️  No hubo respuesta de Envia.com (¿sin internet?)."
  echo "   NO se guardó nada. Revisa la conexión e intenta de nuevo."
  echo ""
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

echo "✅ Token aceptado por Envia.com (HTTP $CODE)"
echo ""

security delete-generic-password -a "$USER" -s fodor-envia-token >/dev/null 2>&1
security add-generic-password -a "$USER" -s fodor-envia-token -w "$TOKEN"

if [ $? -eq 0 ]; then
  echo "✅ Guardado en el Llavero como 'fodor-envia-token'"
  echo ""
  echo "   Ya puedes iniciar:"
  echo "   • iniciar-envia-sync.command  (generación de guías)"
else
  echo "❌ No pude guardar en el Llavero."
  echo "   Puede que macOS haya pedido permiso y se cancelara."
fi
echo ""
read -p "Presiona Enter para cerrar..."
