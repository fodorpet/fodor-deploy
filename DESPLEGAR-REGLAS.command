#!/bin/bash
# ============================================================
#  Despliega SOLO las reglas de seguridad de la base.
#  No toca el sitio web ni el Panel.
#
#  Antes de usarlo hay que haber probado el login en el Panel
#  local. Si las reglas suben antes, el Panel pierde la
#  sincronizacion (los datos locales siguen intactos).
# ============================================================
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 1
echo "Desplegando reglas en el proyecto odfor-bae97..."
echo ""
npx firebase-tools deploy --only database
echo ""
echo "Si dice 'released successfully', las reglas quedaron activas."
echo "Si pide 'firebase login', avisa a Claude antes de continuar."
echo ""
read -p "Presiona Enter para cerrar..."
