#!/bin/bash
# Fodor SpA — Guarda el token de Kommo en el Llavero de macOS
# Toma el token del portapapeles; si no lo encuentra, te deja pegarlo a mano.
clear
echo "═══════════════════════════════════════════════"
echo "  🔐 Fodor SpA — Guardar token de Kommo"
echo "═══════════════════════════════════════════════"
echo ""

validar() { [[ ${#1} -ge 100 && "$1" == eyJ* ]]; }

TOKEN=$(pbpaste | tr -d '[:space:]')

if validar "$TOKEN"; then
  echo "📋 Token encontrado en el portapapeles (${#TOKEN} caracteres)"
  echo ""
else
  echo "El portapapeles no trae un token válido."
  echo ""
  echo "  Dónde encontrarlo:"
  echo "  Kommo → Ajustes → Integraciones → Plataforma de Administración"
  echo "  → pestaña 'Llaves y alcances' → Token de larga duración"
  echo ""
  echo "  Cópialo y PÉGALO aquí abajo con Cmd+V, luego presiona Enter."
  echo "  (no se va a ver mientras lo pegas, es normal — es por seguridad)"
  echo ""
  read -s -p "  Pega el token: " TOKEN_IN
  echo ""
  echo ""
  TOKEN=$(echo "$TOKEN_IN" | tr -d '[:space:]')
  if ! validar "$TOKEN"; then
    echo "❌ Eso no parece un token de Kommo."
    echo "   Debe empezar con 'eyJ' y ser muy largo (más de 1000 caracteres)."
    echo "   Recibí ${#TOKEN} caracteres."
    echo ""
    read -p "Presiona Enter para cerrar..."
    exit 1
  fi
  echo "📋 Token recibido (${#TOKEN} caracteres)"
  echo ""
fi

# Probar ANTES de guardar, para no dejar una credencial mala en el Llavero
echo "🔍 Probando el token con Kommo..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "https://marcelofodorcl.kommo.com/api/v4/account")

if [ "$CODE" != "200" ]; then
  echo "❌ Kommo respondió HTTP $CODE — el token no sirve."
  echo ""
  if [ "$CODE" = "401" ]; then
    echo "   401 significa que el token está vencido o revocado."
    echo "   Genera uno nuevo en Kommo y vuelve a intentar."
  else
    echo "   Revisa tu conexión a internet e intenta de nuevo."
  fi
  echo ""
  echo "   NO se guardó nada en el Llavero (para no dejar una credencial mala)."
  echo ""
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

echo "✅ Token válido (HTTP 200)"
echo ""

security delete-generic-password -a "$USER" -s fodor-kommo-token >/dev/null 2>&1
security add-generic-password -a "$USER" -s fodor-kommo-token -w "$TOKEN"

if [ $? -eq 0 ]; then
  echo "✅ Guardado en el Llavero como 'fodor-kommo-token'"
  echo ""
  echo "   Ya puedes iniciar:"
  echo "   • kommo-sync.command        (alertas de pago + apagar toggles)"
  echo "   • iniciar-envia-sync.command (cotizador de envíos)"
else
  echo "❌ No pude guardar en el Llavero."
  echo "   Puede que macOS haya pedido permiso y se cancelara."
fi
echo ""
read -p "Presiona Enter para cerrar..."
