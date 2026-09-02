#!/bin/bash
# ============================================================
#  Respaldo del estado de Firebase — Fodor SpA
#
#  Descarga /estado completo a backups-firebase/ y conserva
#  los ultimos 30. Esa carpeta esta excluida de git porque
#  contiene RUT, saldos y correos de clientes.
#
#  Uso:  ./respaldar-firebase.sh
# ============================================================
set -u
# La carpeta del script, sea cual sea su ubicacion.
DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$DEPLOY/backups-firebase"
DB="https://odfor-bae97-default-rtdb.firebaseio.com"
CONSERVAR=30

mkdir -p "$DESTINO"
cd "$DEPLOY" || exit 1

# La apiKey se lee del propio Panel: es un identificador publico, no un secreto.
KEY=$(grep -oE 'apiKey: *"[^"]+"' index.html | head -1 | sed 's/.*"\(.*\)"/\1/')
if [ -z "$KEY" ]; then echo "ERROR: no encontre la apiKey en index.html"; exit 1; fi

# TODO Fase 1: cuando exista la cuenta real, cambiar por signInWithPassword
# con credenciales leidas de un archivo fuera del repositorio.
TOKEN=$(curl -s --max-time 30 -H 'Content-Type: application/json' \
  -d '{"returnSecureToken":true}' \
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" \
  | grep -oE '"idToken": *"[^"]+"' | sed 's/.*"\(.*\)"/\1/')
if [ -z "$TOKEN" ]; then echo "ERROR: no pude autenticarme contra Firebase"; exit 1; fi

ARCHIVO="$DESTINO/estado_$(date '+%Y-%m-%d_%H-%M').json"
curl -s --max-time 180 "$DB/estado.json?auth=$TOKEN" -o "$ARCHIVO"

# Un respaldo que no se verifica no es un respaldo.
if ! python3 -c "import json,sys; d=json.load(open('$ARCHIVO')); sys.exit(0 if isinstance(d,dict) and len(d)>=10 else 1)" 2>/dev/null; then
  echo "ERROR: el archivo descargado no es valido. Se descarta."
  rm -f "$ARCHIVO"; exit 1
fi

BYTES=$(wc -c < "$ARCHIVO" | tr -d ' ')
echo "OK  $ARCHIVO  ($((BYTES/1024/1024)) MB)"

# Rotacion: conservar los mas recientes.
ls -1t "$DESTINO"/estado_*.json 2>/dev/null | tail -n +$((CONSERVAR+1)) | while read -r v; do
  rm -f "$v" && echo "    rotado: $(basename "$v")"
done
