# ESTADO ACTUAL — Fodor SpA Panel de Cobranzas y Envíos
**Última actualización:** 2026-07-29 (18:30 aprox.)
**Carpeta de trabajo:** ~/fodor-deploy

---

## 1. Objetivo del proyecto

Sistema profesional de cobranzas, facturación y gestión de envíos para Fodor SpA.
**Clasificación:** PRODUCTO VENDIBLE a otras empresas (no herramienta interna).
**Estándar:** OEGS (Open Engineering Governance) — código empresarial, trazabilidad auditable, cero regresiones.

---

## 2. Funcionalidades operativas (NO TOCAR)

### Panel Principal (index.html)
- ✅ Cobranza: D26 (2026), D25 (2025), D24 (2024) con estado de pago
- ✅ Transferencias bancarias, GetNet, WebPay, MercadoPago
- ✅ Cruce Diario: cruza transferencias vs facturas, permite descartes
- ✅ Alertas: detecta pagos de cliente incorrecto (payment cross-validation, v27T+)
- ✅ Restaurar factura borrada: recupera vinculación TRF sin reconciliador revival (v27Q+)
- ✅ "📊 Ventas": KPIs por vendedor con CODVENDEDOR (atribución correcta)
- ✅ localStorage + Firebase Realtime (sincronización bidireccional)

### Cotizador de Envíos (envios.html — dos copias: raíz y public/)
- ✅ Carriers: Starken, Chilexpress, Correos de Chile, Blue Express, Varmontt
- ✅ Peso volumétrico: factor 4000 confirmado (19/20 productos manda el volumen)
- ✅ Medidas por producto: L×A×H, peso, volumen, peso cobrable mostrados
- ✅ Catálogo unificado: fodor-envios.js (compartido, evita desincronización)
- ✅ Integración Kommo: extension Chrome abre cotizador con ciudad preargada

---

## 3. Arquitectura y herramientas

**Firebase Realtime Database:**
- `odfor-bae97-default-rtdb.firebaseio.com` nodo `/estado`
- Escritura: `_fbSetEstado({campos})`
- Lectura: listener `_fbDb.ref('estado').on('value')`
- Autenticación anónima (anonymous auth)

**Persistencia local:**
- `localStorage` key: `fodorspa_cobranza_v1` (nucleo: EST, BORRADAS, BITACORA, METAS, TRF_DESCARTES, etc.)
- Cachés por tabla: `fodorspa_trf_v1` (transferencias, ~4MB), `fodorspa_wp_v1`, `fodorspa_gn_v1`, etc.

**Integraciones externas:**
- **Envia.com API:** generación de guías de envío (v/s carrier directo)
- **Kommo CRM:** lectura de leads, escritura de tracking en campos personalizados
- **envia-sync.js:** proceso Node en Mac, sincroniza pending→Firebase→Envia.com, corre cada 2 min

**Validación de deploy:**
- `validar-deploy.js`: freno de sintaxis, aborta si .js o .html no compilan
- `deploy-panel.command`: ejecuta validador, luego `firebase deploy --only hosting,database`

---

## 4. Archivos críticos

| Ruta | Propósito | Tamaño | Estado |
|------|-----------|--------|--------|
| `index.html` | Panel principal | 3273 KB | ✅ Operativo |
| `public/index.html` | Copia publicada en Firebase | 3273 KB | ⚠️ Puede estar desincronizada |
| `envios.html` (raíz) | Cotizador raíz | 32 KB | ✅ Operativo |
| `public/envios.html` | Copia publicada | 32 KB | ⚠️ Puede estar desincronizada |
| `fodor-envios.js` | Catálogo + Varmontt tariffs | 18 KB | ✅ Operativo |
| `envia-sync.js` | Proceso Node para crear guías | 37 KB | ⚠️ Corre código viejo en Mac |
| `firebase-rules.json` | Reglas de seguridad Firebase | — | ✅ Configurado |
| `deploy-panel.command` | Script deploy | — | ✅ Valida + publica |
| `validar-deploy.js` | Validador sintaxis | — | ✅ Freno activo |

---

## 5. Último trabajo realizado

**Sesión anterior (resumida):** Payment cross-validation + Varmontt en envíos + CODVENDEDOR fix + Ventas tab.

**Sesión actual (29-07):**

### A. Fix guía generation stuck (PARCIAL)
- ✅ Diagnosticado: 3 bugs en `envia-sync.js`
  - Bug 1: leadId con prefijo `kommo-` yendo a API Kommo (esperaba número limpio)
  - Bug 2: Fetch innecesario a Kommo cuando pending ya trae todo
  - Bug 3: Polling timeout muy corto (30 polls × 2s = 60s; sync corre cada 2 min)
- ✅ Código ESCRITO en `fodor-deploy/envia-sync.js` (líneas 448-525)
- ✅ Código ESCRITO en `public/envios.html` (polling extendido a 90 × 2s)
- ❌ NUNCA validado con `validar-deploy.js`
- ❌ NUNCA publicado (quedó pisado por deploy de `sanitizado`)
- ❌ NUNCA reiniciado el proceso en Mac

### B. Fix descartes Cruce Diario perdidos (COMPLETO pero NO publicado)
- ✅ Diagnosticado: 2 causas
  - Causa 1: `TRF_DESCARTES` se escribía en Firebase, listener NUNCA lo leía (campo huérfano)
  - Causa 2: localStorage.setItem fallaba en silencio por cuota llena (4MB TRF blob)
- ✅ Código ESCRITO en `index.html` (4 fixes: listener lector, try/catch núcleo, prioridad estado, renderVistaCruces)
- ✅ Código ESCRITO en `public/index.html` (sincronizado manualmente)
- ✅ Validador dice "OK - el codigo compila"
- ❌ NUNCA se ejecutó Firebase deploy desde `fodor-deploy`
- ❌ Deploy de `sanitizado` (viejo) pisó estos cambios

---

## 6. Estado exacto de la tarea actual

### Guía generation (`envia-sync.js`)
- **Completado:** Análisis causa raíz + código escrito
- **Incompleto:** Validación oficial, deploy, reinicio Mac
- **Fallando en producción:** HTTP 404 `Kommo lead kommo-31169399` (código viejo)

### Descartes Cruce Diario
- **Completado:** Análisis + código + validación parcial
- **Incompleto:** Deploy oficial
- **Fallando en usuario:** Descartes reaparecen al recargar (sin fix en producción)

### Sincronización raíz ↔ public/
- **Completado:** Ambas copias sincronizadas para index.html + envios.html
- **Nota:** El validador avisa si divergen; deploy-panel NO las copia automáticamente

---

## 7. Decisiones ya tomadas

1. **Estándar OEGS obligatorio:** No se dispensa, cada cambio requiere PRE/POST report
2. **El panel es producto, no parche:** Prohibido cosmético; todo de raíz
3. **Una fuente de verdad por operación:** p.ej., `registrarPago()` canónica, no 18 versiones
4. **Catálogo unificado:** `fodor-envios.js` compartido entre index.html y envios.html
5. **Firebase = lectura + escritura en listener:** Cada campo nuevo en `_fbSetEstado()` DEBE agregarse al listener
6. **NUNCA editar Firebase Console:** Solo via `firebase-rules.json` + deploy
7. **Deploy NO copia raíz → public/:** Si editas raíz sin copiar, cambio no sube

---

## 8. Restricciones

### NO MODIFICAR
- El catálogo hardcodeado en `_R26`, `_R25`, `_R24` (están embebidos)
- Las funciones reconciliadores (`INIT-REC`, `TRF-EST-SYNC`) — sistema frágil
- Firebase Rules (via JSON + deploy, nunca Console)
- Estructura de D26 en localStorage (muchos consumidores)

### NO ELIMINAR
- Campos en EST, BORRADAS, TRF_DESCARTES (son canales de Firebase)
- La lógica de descartes en Cruce Diario (auditoría)
- Las funciones de cross-validation (alertas de pagos mal aplicados)

### NO REEMPLAZAR
- El archivo único (`cobranzas_fodorspa.html` viejo está archivado; trabajamos con `index.html`)
- El panel por otra tecnología sin análisis previo (está en producción)

---

## 9. Problemas pendientes

### 🔴 BLOQUEADORES
1. **`fodor-deploy-sanitizado` en Git pisó el deploy:** La versión publicada NO tiene los fixes de hoy
2. **`envia-sync.js` en Mac corre código viejo:** HTTP 404 persiste, proceso no reiniciado
3. **localStorage lleno:** TRF_DATA de 4MB ya causó un fallo real (descartes perdidos)

### 🟡 RIESGOS ABIERTOS
1. **TRF_DATA blob 4MB:** Guardado futuro puede fallar sin aviso (mitigado, no resuelto)
2. **CARTOLA_DATA huérfano:** Se escribe en Firebase, listener no lo lee (deuda técnica anotada)
3. **Dos carpetas en Git:** `fodor-deploy` y `fodor-deploy-sanitizado` pueden desincronizarse
4. **Tarea 10AM:** Reporte diario falla (401 anónimo a /estado) — defecto de diseño abierto
5. **envia-sync.js en Mac:** Depende de que esté prendido; si se reinicia, hay gap de sincronización

### ❓ PENDIENTE DE CONFIRMAR
- ¿Cuál es el propósito de `fodor-deploy-sanitizado`? (backup, rama, descartada)
- ¿Se debe archivar o eliminar?
- ¿Hay algún proceso automático que ejecute deploy desde `sanitizado`?

---

## 10. Próximo paso

**Inmediato (orden estricto):**
1. Confirmar que `fodor-deploy` es la fuente de verdad oficial
2. Archivar o eliminar `fodor-deploy-sanitizado` para evitar más conflictos
3. Ejecutar `validar-deploy.js` desde `fodor-deploy` (valida mis cambios)
4. Ejecutar `deploy-panel.command` desde `fodor-deploy` (publica fixes)
5. Reiniciar `envia-sync.js` en Mac (carga código nuevo)
6. Probar guía generation + descartes Cruce Diario

**Después (diferido):**
- Resolver TRF_DATA 4MB (rediseño de persistencia — trabajo grande)
- Cerrar Tarea 10AM (reporte diario)
- Sincronizar Git: confirmar rama maestra
