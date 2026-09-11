#!/bin/bash
# ============================================================
#  Panel Fodor SpA — este es el que hay que usar
#
#  Abre el Panel en http://localhost:8788 y habilita la
#  creacion de borradores de cobranza en Outlook.
#
#  Se encarga solo de cerrar cualquier Panel que haya quedado
#  abierto antes, asi no hay que andar cerrando Terminales.
#
#  Para cerrar: cierra esta ventana de Terminal.
# ============================================================
PUERTO=8788
SERVIDOR="$HOME/fodor-deploy/cobranza-masiva/servidor-cobranza.py"

if [ ! -f "$SERVIDOR" ]; then
  echo "ERROR: no encuentro $SERVIDOR"; read -p "Enter para cerrar..."; exit 1
fi

codigo() { curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$1" 2>/dev/null; }

# Si ya esta corriendo el servidor CORRECTO, solo abre el navegador.
if [ "$(codigo http://localhost:$PUERTO/cobranza/token)" = "200" ]; then
  echo "  El Panel ya estaba corriendo. Abriendo el navegador."
  open "http://localhost:$PUERTO/"
  echo "  (esta ventana la puedes cerrar; la otra Terminal es la que sirve el Panel)"
  sleep 3; exit 0
fi

# Si el puerto lo ocupa otra cosa (el Panel antiguo, o uno que quedo colgado),
# se cierra sola. Solo mata procesos que escuchan en ESTE puerto.
PIDS=$(lsof -ti tcp:$PUERTO -sTCP:LISTEN 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "  Cerrando el Panel anterior que estaba abierto..."
  kill $PIDS 2>/dev/null
  sleep 1
  PIDS=$(lsof -ti tcp:$PUERTO -sTCP:LISTEN 2>/dev/null)
  [ -n "$PIDS" ] && kill -9 $PIDS 2>/dev/null
  sleep 1
fi

python3 "$SERVIDOR" &
SRV=$!
sleep 2
if [ "$(codigo http://localhost:$PUERTO/cobranza/token)" != "200" ]; then
  echo ""
  echo "  ERROR: el servidor no arranco."
  echo "  Copiale a Claude lo que aparezca arriba."
  kill $SRV 2>/dev/null
  read -p "  Enter para cerrar..."; exit 1
fi
open "http://localhost:$PUERTO/"
wait $SRV
