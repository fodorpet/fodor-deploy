#!/bin/bash
# ============================================================
#  Apaga el sitio publico odfor-bae97.web.app
#
#  Por que: ese sitio sirve index.html, que lleva dentro la
#  cartera completa (4.518 RUT, 823 correos, saldos) en texto
#  plano. Cualquiera con la direccion la descargaba entera.
#
#  El Panel NO se ve afectado: se abre desde tu Mac con
#  ABRIR-PANEL-LOCAL.command, en http://localhost:8788
#
#  PARA VOLVER A PUBLICARLO algun dia:
#     cd ~/fodor-deploy && npx firebase-tools deploy --only hosting
#  Los archivos siguen en la carpeta public/, no se borran.
# ============================================================
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 1

echo "Se va a apagar https://odfor-bae97.web.app"
echo "Tu Panel local en localhost:8788 seguira funcionando igual."
echo ""
read -p "Escribe SI (en mayusculas) para continuar: " R
if [ "$R" != "SI" ]; then echo "Cancelado. No se hizo nada."; read -p "Enter para cerrar..."; exit 0; fi

echo ""
npx firebase-tools hosting:disable -f
echo ""
echo "Si dice 'disabled' o 'Hosting has been disabled', quedo apagado."
echo ""
read -p "Presiona Enter para cerrar..."
