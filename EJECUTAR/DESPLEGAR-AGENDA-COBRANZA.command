#!/bin/bash
# Fodor SpA — Despliega SOLO las dos funciones nuevas de la agenda de cobranza.
# No toca alertaCobranza, ni recalcularDeudaPorRut, ni ninguna otra funcion.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
clear
echo "═══════════════════════════════════════════════"
echo "  📅 Fodor SpA — Desplegar Agenda de Cobranza"
echo "═══════════════════════════════════════════════"
echo ""
echo "Se despliegan SOLO estas dos funciones nuevas:"
echo "  · agendaCobranzaDiaria    (programada 08:30, lun a vie)"
echo "  · agendaCobranzaPreview   (vista previa, no envia nada)"
echo ""
echo "Las funciones existentes NO se tocan."
echo ""
npx firebase-tools deploy --only functions:agendaCobranzaDiaria,functions:agendaCobranzaPreview
echo ""
read -p "Listo. Presiona Enter para cerrar..."
