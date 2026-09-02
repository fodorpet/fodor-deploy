#!/bin/bash
# ============================================================
#  Panel Fodor SpA — apertura LOCAL (no publica nada)
#
#  Sirve ~/fodor-deploy/public en http://localhost:8788
#  Se usa localhost y no doble-clic sobre el archivo porque
#  Firebase rechaza el origen "file://" y se perderia la
#  sincronizacion. localhost si esta autorizado por defecto.
#
#  Para cerrar: cierra esta ventana de Terminal.
# ============================================================
PUERTO=8788
RAIZ="$HOME/fodor-deploy/public"

if [ ! -f "$RAIZ/index.html" ]; then
  echo "ERROR: no encuentro $RAIZ/index.html"
  read -p "Enter para cerrar..."; exit 1
fi

# Si ya hay un servidor en ese puerto, solo abre el navegador.
if curl -s -o /dev/null --max-time 2 "http://localhost:$PUERTO/"; then
  echo "Ya habia un servidor corriendo en el puerto $PUERTO."
  open "http://localhost:$PUERTO/"
  exit 0
fi

cd "$RAIZ" || exit 1
echo "Sirviendo $RAIZ en http://localhost:$PUERTO"
echo ""

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PUERTO" >/dev/null 2>&1 &
  SERVIDOR=$!
elif command -v php >/dev/null 2>&1; then
  php -S "localhost:$PUERTO" >/dev/null 2>&1 &
  SERVIDOR=$!
else
  echo "No hay python3 ni php. Usando http-server de Node (puede tardar la 1a vez)."
  npx --yes http-server -p "$PUERTO" -c-1 >/dev/null 2>&1 &
  SERVIDOR=$!
fi

sleep 2
if ! curl -s -o /dev/null --max-time 5 "http://localhost:$PUERTO/"; then
  echo "ERROR: el servidor no respondio."
  read -p "Enter para cerrar..."; kill $SERVIDOR 2>/dev/null; exit 1
fi

open "http://localhost:$PUERTO/"
echo "Panel abierto. NO cierres esta ventana mientras lo uses."
echo "Para terminar: cierra esta ventana de Terminal."
wait $SERVIDOR
