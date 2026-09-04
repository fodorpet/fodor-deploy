# Panel Fodor — Modo Offline Automático

## ¿Qué cambió?

El Panel ha sido mejorado para detectar rápidamente si Firebase está disponible.

### Antes (v2026-09-03)
- Se quedaba en "⏳ Conectando..." indefinidamente
- Mostraba modal de login incluso sin conexión
- No funcionaba sin Firebase

### Ahora (v2026-09-04)
- Detecta conexión en **3 segundos**
- Si no hay conexión: **activa automáticamente modo offline**
- Muestra "🔌 Modo offline" en el indicador de sincronización
- El Panel funciona completamente con datos locales

---

## ¿Cómo sé si estoy en modo offline?

Mira el indicador de sincronización (arriba a la derecha):

- ✅ **🟢 Sincronizado** = Conectado a Firebase
- ⏳ **🟡 Conectando...** = Intentando conectar (máx 3 segundos)
- 🔌 **🔌 Modo offline** = Sin conexión a Firebase
- ❌ **🔌 Offline (error)** = Error de conexión

---

## ¿Funciona igual en offline?

**SÍ**, casi completamente:

✅ **FUNCIONA en offline:**
- Ver todas las facturas (2025, 2026)
- Ver pagos y transferencias
- Crear notas y comentarios
- Asignar folios
- Cambiar estado de gestión
- Exportar datos
- TODO se guarda en el navegador automáticamente

❌ **NO funciona en offline:**
- Sincronizar cambios con otros usuarios
- Recibir actualizaciones en tiempo real de otros usuarios
- Deshacer acciones de otros usuarios

---

## Cuándo regresa la sincronización

Cuando se restaura la conexión a Firebase, el Panel:
1. Mostrará "🟢 Sincronizado"
2. Sincronizará automáticamente todos los cambios locales
3. Descargará datos nuevos de otros usuarios

---

## ¿Qué pasa con mis datos en offline?

**Todos tus cambios se guardan localmente:**
- En tu navegador (IndexedDB)
- En tu computadora (caché del navegador)
- No se pierden

**Cuando se conecte:**
- Se sincronizarán automáticamente a Firebase
- Otros usuarios verán tus cambios
- Todo queda en la nube

**IMPORTANTE:** No cierres el navegador ni limpies el caché mientras estés en offline.

---

## Solución de problemas

### "Sigue mostrando 'Conectando...' después de 3 segundos"

Significa que hay un problema con Firebase. Opciones:
1. Recarga la página (Cmd+R en Mac, Ctrl+F5 en Windows)
2. Verifica tu conexión a Internet
3. Espera un minuto y recarga

### "Entré en offline pero quiero sincronizar ahora"

Recarga la página. El Panel intentará conectar de nuevo.

### "Los datos de julio, agosto, septiembre no aparecen"

Es normal en offline: solo ves lo que estaba guardado localmente antes de perder la conexión.

Cuando Firebase se conecte, descargará automáticamente toda la data.

---

## Próximos pasos

### 1. Verifica que estés en offline
Mira el indicador. Debe decir "🔌 Modo offline".

### 2. Intenta trabajar normalmente
- Abre diferentes pestañas (2026, 2025, etc.)
- Cambia estados
- Crea notas
- El Panel responde localmente

### 3. Verifica que se guardan los cambios
- Recarga la página (F5)
- Los cambios siguen ahí = está funcionando

### 4. Cuando se conecte Firebase
- El indicador pasará a "✅ Sincronizado"
- Automáticamente subirá todos tus cambios
- Descargará datos de otros usuarios

---

## ¿Preguntas técnicas?

El Panel ahora:
- Detecta `.info/connected` de Firebase con timeout de 3 segundos
- Si no responde: activa `_FB_OFFMODE = true`
- No intenta login modal en offline
- No configura listeners en offline
- Todos los datos se guardan con `LS` (IndexedDB wrapper)

---

**Versión:** 2026-09-04
**Status:** Panel mejorado con detección automática de offline
