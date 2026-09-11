#!/bin/bash
# ============================================================
#  Prueba 1 — ¿Tu Outlook acepta automatización?
#
#  No manda ningun correo. Solo intenta crear UN borrador
#  dirigido a ti misma. Si aparece en Borradores, seguimos.
#  Si falla, el error dice por que y probamos otra via.
# ============================================================
echo ""
echo "  Probando si Outlook acepta automatizacion..."
echo ""

RESULTADO=$(osascript <<'APPLESCRIPT' 2>&1
tell application "Microsoft Outlook"
    set nuevoMensaje to make new outgoing message with properties {subject:"[COB] PRUEBA - no enviar", content:"Esto es una prueba del envio masivo de cobranza. Si ves este borrador, la automatizacion funciona. Puedes borrarlo."}
    make new recipient at nuevoMensaje with properties {email address:{address:"dfodor@fodor.cl"}}
    open nuevoMensaje
    return "OK"
end tell
APPLESCRIPT
)

echo "  Resultado: $RESULTADO"
echo ""
if [ "$RESULTADO" = "OK" ]; then
  echo "  ✅ FUNCIONA. Se abrio un borrador en Outlook."
  echo "     Revisalo, cierralo sin enviar, y avisale a Claude."
else
  echo "  ❌ NO funciono. Copia el texto de arriba y mandaselo a Claude."
  echo "     Probablemente tienes el Outlook nuevo, que no acepta"
  echo "     automatizacion. Hay otra via, no es un callejon sin salida."
fi
echo ""
read -p "  Enter para cerrar..."
