#!/bin/bash
# ============================================================
#  Prueba 4 — buscar correos [COB] en las bandejas
#
#  La carpeta COBRANZA/RESPUESTA no es visible por AppleScript
#  (probado 3 veces el 09-09-2026). Esta prueba mira las
#  bandejas que SI son visibles y cuenta cuantos mensajes
#  llevan [COB] en el asunto.
#  No modifica ni borra nada.
# ============================================================
echo ""
echo "  Revisando los correos mas recientes de cada bandeja..."
echo "  (puede tardar un minuto)"
echo ""

osascript 2>&1 <<'APPLESCRIPT'
tell application "Microsoft Outlook"
    set salida to ""
    repeat with f1 in mail folders
        try
            set n1 to name of f1
            if n1 is not missing value then
                set total to count of messages of f1
                if total > 0 then
                    set msgs to messages of f1
                    set tope to 200
                    if total < 200 then set tope to total
                    set hallados to 0
                    set ejemplos to ""
                    repeat with i from 1 to tope
                        try
                            set s to subject of (item i of msgs)
                            if s contains "[COB]" then
                                set hallados to hallados + 1
                                if hallados <= 3 then set ejemplos to ejemplos & "      - " & s & linefeed
                            end if
                        end try
                    end repeat
                    if hallados > 0 then
                        set salida to salida & n1 & ": " & hallados & " con [COB] entre los " & tope & " mas recientes (de " & total & ")" & linefeed & ejemplos
                    else
                        set salida to salida & n1 & ": 0 con [COB] (revise " & tope & " de " & total & ")" & linefeed
                    end if
                end if
            end if
        end try
    end repeat
    if salida is "" then set salida to "No pude leer ninguna carpeta con mensajes."
    return salida
end tell
APPLESCRIPT

echo ""
echo "  ================================================"
echo "   Copiale a Claude TODO el texto de arriba."
echo "  ================================================"
echo ""
read -p "  Enter para cerrar..."
