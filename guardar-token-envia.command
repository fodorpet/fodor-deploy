#!/bin/bash
# Fodor SpA — Guarda el token de Envia.com en el Llavero de macOS
# Mismo patrón que guardar-token-kommo.command: el token nunca queda escrito
# en el código ni en un archivo de texto, solo en el Llavero.
clear
echo "═══════════════════════════════════════════════"
echo "  🔐 Fodor SpA — Guardar token de Envia.com"
echo "═══════════════════════════════════════════════"
echo ""

# El token de Envia.com es una cadena larga tipo hash (el anterior tenia 64
# caracteres hexadecimales). Se valida por largo, no por prefijo, porque
# Envia.com no usa un prefijo fijo como el 'eyJ' de Kommo.
validar() { [[ ${#1} -ge 30 ]]; }

TOKEN=$(pbpaste | tr -d '[:space:]')

if validar "$TOKEN"; then
  echo "📋 Token encontrado en el portapapeles (${#TOKEN} caracteres)"
  echo ""
else
  echo "El portapapeles no trae un token válido."
  echo ""
  echo "  Dónde encontrarlo:"
  echo "  Envia.com → inicia sesión → Configuración / Settings"
  echo "  → API / Integraciones → Token de producción"
  echo ""
  echo "  Cópialo y PÉGALO aquí abajo con Cmd+V, luego presiona Enter."
  echo "  (no se va a ver mientras lo pegas, es normal — es por seguridad)"
  echo ""
  read -s -p "  Pega el token: " TOKEN_IN
  echo ""
  echo ""
  TOKEN=$(echo "$TOKEN_IN" | tr -d '[:space:]')
  if ! validar "$TOKEN"; then
    echo "❌ Eso no parece un token de Envia.com."
    echo "   Debe ser una cadena larga (30 caracteres o más)."
    echo "   Recibí ${#TOKEN} caracteres."
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
  echo "❌ Envia.com respondió HTTP $CODE — el token no sirve."
  echo ""
  echo "   $CODE significa que el token está vencido o revocado."
  echo "   Genera uno nuevo en Envia.com y vuelve a intentar."
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
