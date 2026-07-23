#!/bin/bash
# ══════════════════════════════════════════════════════
#  Fodor SpA — Iniciar WhatsApp Watcher
#  Doble clic para arrancar el monitor de retiros
# ══════════════════════════════════════════════════════

# Ir a la carpeta del script
cd "$(dirname "$0")"

echo ""
echo "══════════════════════════════════════════"
echo "  📱 Fodor SpA — WhatsApp Watcher"
echo "══════════════════════════════════════════"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js no está instalado."
  echo "   Descarga desde: https://nodejs.org"
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

echo "✅ Node.js: $(node --version)"

# Detectar si estamos usando la versión antigua (whatsapp-web.js) o la nueva (baileys)
if [ -d "node_modules/whatsapp-web.js" ] && [ ! -d "node_modules/@whiskeysockets" ]; then
  echo ""
  echo "🔧 Actualizando a Baileys (sin Chrome, compatible con Node.js v24)..."
  rm -rf node_modules package-lock.json
fi

# Instalar dependencias si faltan
if [ ! -d "node_modules/@whiskeysockets/baileys" ]; then
  echo ""
  echo "📦 Instalando dependencias (solo la primera vez)..."
  echo "   Esto puede tomar 2-3 minutos..."
  echo ""
  npm install @whiskeysockets/baileys pino --save --legacy-peer-deps 2>&1
  echo ""
fi

# Verificar instalación
if [ ! -d "node_modules/@whiskeysockets/baileys" ]; then
  echo "❌ Error al instalar dependencias."
  echo "   Intenta correr manualmente:"
  echo "   cd ~/fodor-deploy && npm install @whiskeysockets/baileys pino --legacy-peer-deps"
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

echo "✅ Dependencias listas"
echo ""
echo "🚀 Iniciando WhatsApp Watcher..."
echo "   (Mantén esta ventana abierta mientras usas el panel)"
echo ""

node whatsapp-watcher.js

echo ""
echo "⚠️  WhatsApp Watcher se detuvo."
read -p "Presiona Enter para cerrar..."
