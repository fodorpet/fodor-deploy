#!/bin/bash
# ============================================================
#  Prueba 2 — crear borradores SIN que se abra la ventana
#
#  Tu Outlook rechazo "save". Esto prueba 3 formas alternativas
#  y dice cual funciona. Crea hasta 3 borradores de prueba
#  dirigidos a ti misma. No envia nada.
# ============================================================
echo ""
echo "  Probando 3 formas de crear el borrador..."
echo ""

probar () {
  echo "  --- $1 ---"
  R=$(osascript - "$2" 2>&1 <<APPLESCRIPT
on run argv
    tell application "Microsoft Outlook"
        set m to make new outgoing message with properties {subject:("[COB] PRUEBA " & (item 1 of argv)), content:"<div>Prueba<br>segunda linea</div>"}
        make new recipient at m with properties {email address:{address:"dfodor@fodor.cl"}}
        $3
        return "OK"
    end tell
end run
APPLESCRIPT
)
  echo "      $R"
  echo ""
}

probar "A) solo crear, sin save ni open" "A" ""
probar "B) open y despues cerrar la ventana" "B" 'open m
        delay 1
        close front window saving yes'
probar "C) save con sintaxis alternativa" "C" 'save m in drafts mail folder'

echo "  ================================================"
echo "  Ahora anda a Outlook -> Borradores."
echo "  Dile a Claude cuales de las pruebas A, B o C"
echo "  aparecieron ahi, y cuales abrieron ventana."
echo "  ================================================"
echo ""
read -p "  Enter para cerrar..."
