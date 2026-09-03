#!/bin/bash
# Fodor SpA — Lista los leads de Kommo que NO tienen el RUT cargado.
# SOLO LECTURA: no modifica nada en Kommo, Firebase ni el Panel.
cd "$(dirname "$0")"
clear
echo "═══════════════════════════════════════════════"
echo "  🔎 Fodor SpA — Leads de Kommo sin RUT"
echo "═══════════════════════════════════════════════"
echo ""
echo "Esto SOLO LEE. No cambia nada."
echo "Puede tardar unos minutos segun cuantos leads tengas."
echo ""
node leads-sin-rut.js
echo ""
read -p "Listo. Presiona Enter para cerrar..."
