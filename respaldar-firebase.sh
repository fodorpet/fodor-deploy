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

# Credenciales: archivo fuera del repositorio (esta en .gitignore).
# Formato, dos lineas:
#   correo
#   contrasena
CRED="$DEPLOY/credenciales-panel.txt"
if [ ! -f "$CRED" ]; then
  echo "ERROR: falta el archivo de credenciales."
  echo "Crealo en: $CRED"
  echo "con dos lineas: el correo en la primera y la contrasena en la segunda."
  exit 1
fi
CORREO=$(sed -n '1p' "$CRED" | tr -d '\r\n')
CLAVE=$(sed -n '2p' "$CRED" | tr -d '\r\n')
if [ -z "$CORREO" ] || [ -z "$CLAVE" ]; then echo "ERROR: credenciales incompletas en $CRED"; exit 1; fi

TOKEN=$(python3 -c "
import json,urllib.request,sys
d=json.dumps({'email':sys.argv[1],'password':sys.argv[2],'returnSecureToken':True}).encode()
r=urllib.request.Request('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+sys.argv[3],
                         data=d, headers={'Content-Type':'application/json'})
try:
    print(json.load(urllib.request.urlopen(r,timeout=30)).get('idToken',''))
except Exception:
    print('')
" "$CORREO" "$CLAVE" "$KEY")
if [ -z "$TOKEN" ]; then echo "ERROR: no pude autenticarme. Revisa el correo y la contrasena en $CRED"; exit 1; fi

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
