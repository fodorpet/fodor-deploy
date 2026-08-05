#!/bin/bash
# Fodor SpA — Prueba de guía de un solo tiro
# Doble clic: toma el pedido que está esperando en la cola, arma la guía,
# la manda a Envia.com y muestra TODO lo que pasa. Termina solo.
cd "$(dirname "$0")"
clear
node probar-guia.js
echo ""
read -p "Presiona Enter para cerrar..."
