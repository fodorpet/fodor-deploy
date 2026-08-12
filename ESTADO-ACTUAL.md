# ESTADO ACTUAL — Fodor SpA Panel de Cobranzas y Envíos
**Última actualización:** 2026-08-11
**Carpeta de trabajo:** ~/fodor-deploy
**Último commit:** `e82089f` — Fix generación de guías + persistencia de descartes

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
| `fodor-envios.user.js` | Botón de Kommo (userscript, auto-actualiza) | 6 KB | ✅ Reemplaza la extensión |
| `empresa.config.json` | Datos de despacho — NO hardcodear en código | 1 KB | ✅ Catedral 2515 |
| `guardar-token-envia.command` | Guarda el token de Envia en el Llavero | 3 KB | ✅ Usado |
| `envia-sync.js` | Proceso Node para crear guías | 37 KB | ⚠️ Corre código viejo en Mac |
| `firebase-rules.json` | Reglas de seguridad Firebase | — | ✅ Configurado |
| `deploy-panel.command` | Script deploy | — | ✅ Valida + publica |
| `validar-deploy.js` | Validador sintaxis | — | ✅ Freno activo |

---

## 5. Último trabajo realizado

**Sesión 11-08 (más reciente) — Bug de contrato de campos: `alertaCobranza` no detectaba deuda de NINGÚN cliente desde el 10-08 (RESUELTO):**

- 🔍 **Origen:** usuaria reportó "A36797 el aviso de facturas impagas no está funcionando" para EVENTOS E.M.LTDA (RUT 77.675.924-4) — el sistema de facturación mostraba 2 facturas impagas ($927.605), pero nunca llegó aviso a Kommo ni WhatsApp.
- 🔍 **Investigado en el Panel:** el cliente en realidad tiene 10 facturas pendientes según `D26/D25/D24/D26_EXTRA+EST` (no 2), por $8.206.716, con folios 42835 y 37623 **duplicados** en el cálculo (aparecen dos veces cada uno) — señal de registros duplicados en los datos de origen. **Deuda técnica registrada, sin resolver todavía** — probablemente afecta a más clientes, no solo a este.
- ✅ **Bug real #1 encontrado y corregido:** `notificarAlertaWhatsapp` consultaba `deuda_por_rut/rut/${aviso.rut}` con el RUT tal cual ("77.675.924-4", con puntos), pero Firebase RTDB prohíbe "." en las rutas → la función tronaba en silencio para cualquier cliente con RUT en ese formato (la mayoría). Corregido: ahora usa `rutNorm(aviso.rut)`, igual que la clave con la que se guarda el nodo.
- ✅ **Bug real #2 encontrado y corregido — el que de verdad explica el reporte, y es MUCHO más grave de lo que parecía:** revisado el código fuente real de `alertaCobranza` (Cloud Run, `us-central1-odfor-bae97.cloudfunctions.net/alertaCobranza`, vía consola de Google Cloud → pestaña "Fuente"). Esa función lee de `deuda_por_rut/rut/{rut}` los campos `total`, `vencido`, `nVenc`, `masViejo`, `n`, `empresa` — pero `recalcularDeudaPorRut` (construida el 10-08 para reemplazar el nodo huérfano) publicaba otros nombres: `total_pendiente`, `dias_mas_antigua`, `cantidad_facturas`. Como no coincidían, `if (!d || !(d.total > 0)) return "sin_deuda"` se cumplía SIEMPRE — **desde el 10-08, `alertaCobranza` no detectaba deuda de ningún cliente**, no solo de EVENTOS E.M.LTDA. Los 46 avisos vistos en `cobranza_avisos` son todos anteriores a esa fecha.
  - **Causa raíz del bug:** al reconstruir `deuda_por_rut` el 10-08 no se revisó el contrato exacto de campos que su consumidor (`alertaCobranza`) necesitaba — se asumió un esquema propio en vez de verificar el real.
  - **Corrección aplicada (11-08-2026):** `calcularYPublicarDeudaPorRut` ahora escribe AMBOS conjuntos de campos — los que espera `alertaCobranza` (`total`, `vencido`, `nVenc`, `masViejo`, `n`) y los propios del Panel (`total_pendiente`, `dias_mas_antigua`, `cantidad_facturas`, `folios`) — sin quitar nada, sin tocar `listarAlertasDelDia` ni `notificarAlertaWhatsapp`, que siguen usando sus campos de siempre.
  - **Validado:** recálculo manual disparado (`recalcularDeudaPorRutManual` → 5.160 clientes, 16.232 facturas procesadas), confirmado con el caso EVENTOS E.M.LTDA que ahora `deuda_por_rut` trae `total:8.206.716, vencido:8.206.716, nVenc:10, masViejo:495, n:10` — contrato completo.
  - **Pendiente de validación real:** falta que llegue un mensaje entrante nuevo de un cliente con deuda para confirmar que `alertaCobranza` efectivamente postea la nota con los datos ya corregidos (no se puede simular el webhook de Kommo sin riesgo desde acá).
- 🔧 **Función temporal de diagnóstico** (`diagRutTemp`) creada, usada y borrada en la misma sesión (`firebase functions:delete diagRutTemp --force`); el código también se quitó de `functions/index.js`.
- 🔲 **Pendiente commitear a git:** el archivo `functions/index.js` tiene estos cambios sin commitear — hacerlo en el próximo `deploy-panel.command` (responder "S" cuando pregunte).
- 🔲 **Pendiente:** investigar el origen de los folios duplicados (42835 y 37623 aparecen 2 veces en el cálculo de deuda) — probablemente el mismo folio está presente en más de una fuente (`D26_EXTRA` + `D25`/`D24`) sin dedup.

**Sesión 10-08 — Alerta "DEUDA VENCIDA" en Kommo con datos incorrectos → Webhook DESACTIVADO (mitigación de emergencia, investigación abierta):**

- 🔍 **Origen:** llegó a un lead de Kommo una nota automática ">>> DEUDA VENCIDA <<< $208.250 - RAPA NUI... 2 facturas vencidas, la mas antigua de 312 dias" — la usuaria no reconocía esos números.
- 🔍 **Rastreado hasta:** Cloud Function `alertaCobranza` (Cloud Run, proyecto `odfor-bae97`, `https://alertacobranza-rwi2a436vq-uc.a.run.app`), disparada por un Webhook de Kommo en el evento "Mensaje entrante recibido". Lee el RUT del lead, consulta el nodo Firebase `deuda_por_rut/rut/{rut}` y postea la nota si hay deuda.
- ⚠️ **Hallazgo grave:** el nodo `deuda_por_rut` da NÚMEROS DISTINTOS en cada consulta y ninguno coincide con la factura real verificada directamente (comprobado en 2 lecturas separadas, mismo cliente: 2 facturas/$208.250/312 días en la alerta real → 1 factura/$65.450/315 días en una lectura de caché → 3 facturas/$408.170/284 días en la fuente real). No es solo un dato desactualizado: hay un error de cálculo real en lo que sea que llena ese caché.
- 🔍 **Búsqueda exhaustiva del origen de `deuda_por_rut` — SIN ÉXITO:** revisado el repo git completo, las 4 Cloud Functions de `odfor-bae97` (ninguna lo escribe), Cloud Scheduler (API deshabilitada), los 5 Terminal abiertos en el Mac, `launchctl list`, los otros 3 proyectos de Google Cloud de la cuenta (`fenix-pruebas` → es el sistema real pero no relacionado "Canal Ciego"; `cobranzas-57610` → pertenece a KANKAT, otro negocio, no Fodor; "Muebles para convivir..." → tampoco relacionado), y 19 nombres de archivo probados en Firebase Hosting (todos 404). **Sigue pendiente:** revisar `crontab -l` en el Mac — único lugar no verificado todavía.
- ✅ **Mitigación aplicada (10-08-2026, reversible, sin tocar código ni producción):** eliminado el Webhook de Kommo que dispara `alertaCobranza` (Ajustes → Integración → Web Hooks, contador bajó de 6 a 5). La función Cloud Run sigue existiendo intacta — no se tocó código ni se hizo ningún deploy — pero ya no recibe el evento que la activa, así que no puede volver a postear una alerta con datos incorrectos. Reversible: basta con volver a agregar el webhook `https://alertacobranza-rwi2a436vq-uc.a.run.app?k=9b1a8f834173242b165d7d9f7895b3b6` en el evento "Mensaje entrante recibido".
- 🔍 **Búsqueda cerrada (10-08-2026, con evidencia):** `crontab -l` → sin resultados. Tampermonkey → solo el userscript de envíos, nada de cobranza. `fodor-deploy-sanitizado` sí existe en disco (corrige nota del 31-07 que decía lo contrario) pero no contiene `deuda_por_rut`. **Conclusión: `deuda_por_rut` era un nodo huérfano — nada lo mantenía actualizado.** El comentario en el código de `alertaCobranza` decía "se consulta la tabla deuda_por_rut que publica el Panel", pero esa pieza nunca se construyó.
- ✅ **Pieza faltante construida (10-08-2026):** función `recalcularDeudaPorRut` + endpoint manual `recalcularDeudaPorRutManual`, agregadas a `functions/index.js` (Firebase Functions, no tocan `kommoProxy`). Calcula deuda pendiente por RUT desde la única fuente de verdad real (`D26`+`D25`+`D24`+`D26_EXTRA`, cruzadas con `EST`) y escribe `deuda_por_rut/rut/{rut}`. Se dispara sola cada vez que el Panel guarda `/estado/EST`.
  - 3 bugs encontrados y corregidos durante el despliegue: (1) memoria insuficiente (256MB) para cargar ~16.176 facturas — subida a 1GB; (2) uso de `Object.values()` en nodos con claves dispersas puede inflar memoria (Firebase reconstruye arreglos con huecos) — corregido usando decodificación directa; (3) causa raíz real: `D26`/`D25`/`D24`/`D26_EXTRA`/`EST` se guardan como **string JSON doble-codificado**, no como nodos con hijos — sin decodificar, la función leía todo vacío. Corregido con `JSON.parse` doble antes de procesar.
  - **Validado contra el caso real:** RUT 78.142.889-2 (Rapa Nui) → 1 factura pendiente, folio 42388, $65.450, 316 días vencida. Coincide exacto con lo verificado a mano contra el Panel.
- ✅ **Webhook reactivado (10-08-2026):** vuelto a agregar en Kommo (Ajustes → Integración → Web Hooks) apuntando a `https://alertacobranza-rwi2a436vq-uc.a.run.app?k=9b1a8f834173242b165d7d9f7895b3b6`, evento "Mensaje entrante recibido" — mismo evento que tenía antes. `alertaCobranza` vuelve a estar activa, ahora consultando un `deuda_por_rut` que se recalcula solo y correctamente.
- ✅ **Nuevo: aviso a WhatsApp (10-08-2026).** A pedido de la usuaria, cada alerta de "DEUDA VENCIDA" que se manda en Kommo ahora también llega a su WhatsApp personal ("Mensaje para mí"). Diseño: función `notificarAlertaWhatsapp` (Firebase Functions, agregada a `functions/index.js`) escucha `/cobranza_avisos/{leadId}` — el mismo nodo que `alertaCobranza` ya usaba internamente para su control de no repetir aviso antes de 24h — cruza el RUT contra `deuda_por_rut/rut/{rut}` (ya corregido) para sacar empresa/monto/días, y deja el mensaje armado en `/alertas_whatsapp_deborah`. `whatsapp-watcher.js` (proceso en el Mac, ya usado para lo de los retiros) revisa ese nodo cada 20s y manda el WhatsApp. **No se tocó `alertaCobranza` en absoluto** — cero riesgo sobre la función crítica ya reactivada.
  - Regla de Firebase agregada: `alertas_whatsapp_deborah` con `auth != null` (mismo patrón que `estado`), desplegada vía `firebase deploy --only database` — NUNCA se tocó la consola.
  - Bug encontrado y resuelto en el camino: `@whiskeysockets/baileys` desactualizado hacía que WhatsApp rechazara la conexión (código de cierre 405 en loop, sin mostrar QR). Se resolvió con `npm install @whiskeysockets/baileys@latest`. Sin relación con los cambios de esta sesión — era una deuda técnica preexistente.
  - Probado extremo a extremo con un caso simulado (Rapa Nui) y confirmado: llegó el WhatsApp correctamente.
  - **Importante — limitación conocida:** el WhatsApp solo se manda si `whatsapp-watcher.js` está corriendo en el Mac de Deborah. Si el Mac está apagado o el proceso no está corriendo, el aviso queda encolado en `alertas_whatsapp_deborah` con `enviado:false` y se manda apenas el watcher vuelva a conectarse — no se pierde, pero puede llegar tarde.
- 🔲 **Pendiente:** retomar el feature original que motivó esta investigación — mostrar la deuda directamente en la ficha de lead de Kommo.

**Sesión 06-08 — Hueco de importación ene-abr 2026 (COMPLETO Y ESCRITO EN PRODUCCIÓN):**

- 🔍 **Origen:** usuaria reportó que el folio 46698 no aparecía en el panel pese a existir y estar pagado en el sistema de facturación.
- 🔍 **Causa raíz confirmada con evidencia:** el proceso de importación usado para enero-abril 2026 solo traía facturas PENDIENTES de pago (cartera). Cualquier factura ya pagada al momento de esa importación nunca entró a `D26_EXTRA` — ni como pagada ni como pendiente, no existía en absoluto. Verificado comparando 3 archivos de detalle completo (marzo, junio, julio) + 1 archivo de todo el año contra la base real de Firebase. Junio y julio dieron 0% de hueco (proceso de importación posterior, correcto); enero-abril dieron 76-89% de hueco.
- 📊 **Tamaño real del problema:** 2.261 facturas pagadas ausentes, $1.120.162.299, concentradas 100% en enero-abril 2026.
- ✅ **Corrección aplicada (06-08-2026):**
  - `D26_EXTRA`: 11.093 → 13.354 filas (+2.261, con nota explicando origen y motivo en cada una)
  - `EST`: 542 → 2.799 folios (+2.257 marcadas `pagoTipo:"IMPORT_HISTORICO"`; los 4 folios restantes del lote ya tenían pago real conciliado por la usuaria el 05-08 — esos NO se tocaron)
  - Backups previos a la escritura: `BACKUP_D26_EXTRA_*.json` y `BACKUP_EST_*.json` (fuera del repo, en carpeta de trabajo de la sesión — pedir si se necesita rollback)
  - Verificado post-escritura: conteos coinciden exactamente, folio 46698 confirmado con factura + pago.
- ⚠️ **Riesgo identificado y evitado:** casi se rompe otra vez la cuota de localStorage (ver Deuda Técnica Mayor abajo). Se evitó usando registros `EST` livianos (sin `docSnap`/`historial`, ~370 KB en vez de ~1480 KB) en lugar de tocar la arquitectura de guardado — **NO se sacó `EST` del bloque cifrado local**, eso sigue prohibido (ver punto 9).
- 📄 **Herramienta nueva:** `informe-impagas.html` — informe en vivo de facturas impagas con detalle factura por factura, buscador, y export CSV. Publicado en `https://odfor-bae97.web.app/informe-impagas.html`.
- 🔲 **Pendiente:** revisar si el mismo patrón de "cartera pendiente en vez de detalle completo" se usó en años anteriores (2024, 2025) — no se verificó.

**Sesión anterior (resumida):** Payment cross-validation + Varmontt en envíos + CODVENDEDOR fix + Ventas tab.

**Sesión 29-07:**

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

### Guías de envío — CÓDIGO TERMINADO (03-08). Falta saldo en Envia.com.

**Se corrigieron SEIS errores encadenados.** Cada uno solo se veía después de
arreglar el anterior, porque Envia valida campo por campo y corta en el primero
que falla. En orden de aparición:

1. `envia-sync.js` leía el token parseando `kommo-sync.js` con una regex que
   buscaba un literal que el commit de seguridad `90820c6` (23-07) había borrado.
   El proceso moría al arrancar. → Ahora lee del Llavero de macOS.
2. El `leadId` iba con prefijo `kommo-` a la API de Kommo, que espera solo el
   número → HTTP 404. Además se consultaba Kommo aunque el pendiente ya trajera
   todos los datos.
3. La dirección de origen nunca se completó: tenía `EDITAR_NOMBRE_CALLE` y
   número `000`. Solo avisaba en amarillo y seguía igual. → `empresa.config.json`,
   y ahora el proceso NO ARRANCA si falta un campo.
4. **`zipCode` vs `postalCode`** — el campo se mandaba con el nombre equivocado.
   Envia respondía "Required property missing: postalCode" mostrando el dato
   presente bajo el otro nombre. La función que cotiza tarifas SÍ usaba el
   nombre correcto: por eso las tarifas siempre funcionaron y las guías nunca.
5. `state: "Región Metropolitana"` → Envia exige código de 2 letras: `"RM"`.
6. `printSize: "CARTA"` → no está en el enum. El válido es `"PAPER_LETTER"`.
7. `destination.postalCode` iba vacío y Envia lo exige (mínimo 3 caracteres).
   El cotizador nunca lo capturaba. → `envia-geo.js` lo resuelve contra
   `geocodes.envia.com`, que además devuelve la región de 2 letras.

**Bug encontrado de paso:** la tabla `ESTADOS` de `envios.html` tiene ~50 comunas
y para cualquier otra caía a `'RM'` en silencio — un envío a Puerto Montt salía
marcado como Región Metropolitana. Ahora la región sale del servicio de Envia.

**Estado actual:** el payload pasa la validación completa. La llamada llega hasta
el cobro y devuelve `code 1170 "Not Enough money"`. **Confirmado con la usuaria
el 03-08: la cuenta de Envia no tiene saldo.** Al cargarlo, la guía sale.

**Para probar:** doble clic en `probar-guia.command` — herramienta de un solo
tiro que toma el pedido más viejo de la cola, muestra el payload y la respuesta
completos, y si sale bien guarda la guía y limpia la cola. No modifica nada si
falla. Reemplaza el ciclo de 2 minutos de `envia-sync` para diagnosticar.

### (histórico) Guía generation — notas previas
- **Completado y commiteado (`e82089f`):**
  - Credenciales desde variable de entorno o Llavero de macOS (ya no parsea `kommo-sync.js`)
  - Prefijo `kommo-` limpiado antes de consultar la API de Kommo
  - Usa los datos del pendiente cuando están completos (sin viaje inútil a Kommo)
  - Respeta los packages reales del cotizador y el courier elegido
  - Compila OK (`node -c`)
- **Bloqueado por:** falta guardar el token de Envia.com en el Llavero.
  Ejecutar `guardar-token-envia.command` (doble clic).
- **Historia del bug:** el commit `90820c6` (23-07, "Retira credenciales expuestas")
  endureció `kommo-sync.js` para leer del Llavero pero **no tocó `envia-sync.js`**,
  que seguía buscando el token literal recién borrado. Quedó roto de forma latente
  ese día; se manifestó el 31-07 al intentar arrancarlo.

### Descartes Cruce Diario — CÓDIGO LISTO, FALTA PUBLICAR
- **Completado y commiteado (`e82089f`):** los 4 fixes en `index.html` y `public/index.html`
- **Validado:** `validar-deploy.js` dice OK
- **Incompleto:** falta ejecutar `deploy-panel.command` **desde el Mac** (el sandbox
  de Claude no tiene las credenciales de Firebase; `firebase login` es interactivo)

### Sincronización raíz ↔ public/
- **Completado:** ambas copias sincronizadas para `index.html` y `envios.html`
- **Nota:** el validador avisa si divergen; `deploy-panel.command` NO las copia automáticamente

---

## 7. Decisiones ya tomadas

1. **Estándar OEGS obligatorio:** No se dispensa, cada cambio requiere PRE/POST report
2. **El panel es producto, no parche:** Prohibido cosmético; todo de raíz
3. **Una fuente de verdad por operación:** p.ej., `registrarPago()` canónica, no 18 versiones
4. **Catálogo unificado:** `fodor-envios.js` compartido entre index.html y envios.html
5. **Firebase = lectura + escritura en listener:** Cada campo nuevo en `_fbSetEstado()` DEBE agregarse al listener
6. **NUNCA editar Firebase Console:** Solo via `firebase-rules.json` + deploy
7. **Deploy NO copia raíz → public/:** Si editas raíz sin copiar, cambio no sube
8. **El botón de Kommo se distribuye como userscript, no como extensión** (01-08).
   La extensión descomprimida exigía Modo Desarrollador y que la carpeta no se
   moviera nunca; actualizar obligaba a reinstalar en cada equipo. El userscript
   se aloja en Firebase y se actualiza solo vía `@updateURL`.
   **Al publicar un cambio hay que SUBIR el `@version`** o nadie lo recibe.
9. **Credenciales y datos de empresa nunca en el código:** tokens en el Llavero
   de macOS, dirección de despacho en `empresa.config.json`.

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
1. **Saldo en Envia.com** — único pendiente para que salgan las guías. No es técnico.
2. **localStorage lleno:** TRF_DATA de 4MB ya causó un fallo real (descartes perdidos).
   Mitigado, no resuelto de fondo. La alerta "⚠️ NO SE GUARDÓ" ya avisa en vez de
   fallar en silencio, pero el rediseño de la persistencia sigue pendiente.
3. **Commit pendiente:** todo el trabajo del 01 y 03-08 está en disco sin commitear —
   quedó un `.git/HEAD.lock` que el sandbox no puede borrar.
   Desde el Mac: `cd ~/fodor-deploy && rm -f .git/HEAD.lock .git/index.lock && git add -A && git commit -m "envios: seis fixes + config empresa + userscript"`
4. **Userscript sin instalar:** está publicado y vivo en
   `https://odfor-bae97.web.app/fodor-envios.user.js` pero nadie lo instaló todavía.

### 🩺 PANTALLA DE SALUD — mirar acá ANTES de reportar un problema

```
https://odfor-bae97.web.app/salud.html
```

Responde en una pantalla: ¿se está guardando? ¿cuánto falta para el techo?
¿coinciden nube y navegador? ¿está corriendo `envia-sync`? ¿qué versión está
publicada? Cada tarjeta dice **qué hacer** si algo está mal.

Nació el 04-08 porque diagnosticar exigía pedirle capturas a la usuaria y que
abriera la consola del navegador. Cada vuelta costaba minutos y varias
terminaron en diagnósticos equivocados por datos incompletos.

### 🏷 SELLO DE VERSIÓN AUTOMÁTICO (04-08-2026)

`deploy-panel.command` ahora escribe el sello `vAAAA-MM-DD_HH:MM` en el HTML al
publicar. Antes estaba a mano y no se tocaba desde el 29-07: se publicaban
arreglos sin poder confirmar si el navegador corría el código nuevo o una copia
en caché. **Si el panel muestra un sello distinto al de `salud.html`, hay que
recargar con Cmd+Shift+R.**

El deploy también avisa si hay cambios sin commitear y ofrece guardarlos: el
31-07 se perdieron los arreglos de `envia-sync.js` justamente por eso.

### 🔴 DEUDA TÉCNICA MAYOR — persistencia local (04-08-2026)

**Es la deuda más grave del proyecto. Antes que cualquier función nueva.**

**Qué pasó:** el panel dejó de guardar en el navegador durante más de una semana,
sin avisar. Se perdían las importaciones de WebPay, las de GetNet y los borrados
de facturas. Cada vez que se cerraba la pestaña volvía al estado del 27 de julio.

**Causa raíz medida:** todo el estado se serializa en UN bloque cifrado
(`fodorspa_crypt_v1`). Ese bloque llegó a **5594 KB** y `localStorage` tiene un
límite duro de **~5 MB**. No entraba ni con la memoria vacía. El error real era:

```
QuotaExceededError: Setting the value of 'fodorspa_crypt_v1' exceeded the quota
```

Estaba oculto tras un `.catch` que lo reportaba como "Error cifrando" en la
consola — cuando el cifrado funcionaba perfecto; lo que fallaba era guardarlo.

**Mitigación aplicada (v2026-08-04A) — NO ES LA SOLUCIÓN:**
- `D26_EXTRA` (10.579 facturas ≈ 2900 KB cifrados) sale del bloque. Queda en
  ~2800 KB. Mismo precedente que `TRF_DATA`, que ya estaba excluido por lo mismo.
- El guardado avisa en pantalla cuando falla, con el error crudo, en vez de
  fallar callado.
- El tamaño del bloque queda a la vista, en ámbar si supera 4000 KB.
- El respaldo `_fsp_d26bk` (3,5 MB) dejó de escribirse: llenaba la memoria.

**Por qué la mitigación no alcanza:** el bloque vuelve a crecer con el uso. El
siguiente candidato a sacar sería `EST` — una entrada por cada una de las 11.465
facturas — y **ese no se puede sacar**, es el estado de cobranza en sí.

**Diseño correcto pendiente: migrar la persistencia local a IndexedDB.**
`localStorage` topa en ~5 MB por diseño y no se amplía. IndexedDB da cientos de
MB. La aplicación creció más allá de la tecnología que está usando.

**Va junto con el bloque de 4 MB de `TRF_DATA`** (abierto desde el 27-07): son el
mismo problema — datos que crecen sin límite contra un almacenamiento que no.

Requiere análisis previo, plan de migración de los datos existentes y reversión.
**No se hace de contrabando dentro de otro pedido.**

### 🟠 DEUDA TÉCNICA ANOTADA (auditoría del 03-08)
- **El token de Envia está expuesto en el frontend** de `envios.html` (línea ~401).
  Va contra la regla de CLAUDE.md de no poner secretos en el frontend. La cotización
  debería pasar por el backend que ya tiene el token en el Llavero.
- `envios.html` pide tarifas a `'correoschile'` (s minúscula); el identificador real
  es `correosChile`. Ese courier probablemente nunca devolvió tarifas.
- `envios.html` hace `carrier: rate.carrier || rate.service` — si falta uno manda el
  otro en su lugar. Debería fallar en vez de degradar.
- `crearGuia` usa `'normal'` como servicio por defecto: solo vale para Starken, y el
  `carrierPorDefecto` del config es chilexpress. Combinación inexistente.
- El comentario de `formatoEtiqueta` en `empresa.config.json` lista tres valores que
  NO están en el enum de Envia (`PAPER_8.5X11`, `STOCK_4X4`, `STOCK_4X8`). Los únicos
  válidos: `PAPER_4X6`, `PAPER_7X4.75`, `STOCK_4X6`, `PAPER_LETTER`.

### ✅ RESUELTO EL 31-07 (CORREGIDO 10-08)
- La nota original decía "`fodor-deploy-sanitizado` no existe en el disco — solo en Git" — **eso era incorrecto**. La carpeta sí existe en disco (confirmado por captura de Finder, 10-08-2026), junto a `fodor-deploy`. Se corrige acá para no repetir el error.
- Búsqueda real 10-08-2026: `grep -rn "deuda_por_rut" ~/fodor-deploy-sanitizado` → sin resultados. No contiene código relacionado a la investigación de `deuda_por_rut`.
- Los cambios de `fodor-deploy` (el repo activo) están **commiteados** (`e82089f`), así que un `restore` los recupera en vez de borrarlos. Antes se perdieron justamente por estar sin commitear.

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

**1. Cargar saldo en Envia.com** — es lo único que separa al sistema de funcionar.

**2. Probar:** doble clic en `probar-guia.command`. Hay pedidos esperando en la
cola. Si el saldo alcanza, sale el tracking y el PDF, y la guía queda guardada
en el panel sola.

**3. Instalar el userscript** en Chrome: entrar a
`https://odfor-bae97.web.app/fodor-envios.user.js` y aceptar en Tampermonkey.
Después apagar la extensión vieja "Fodor Envíos" en `chrome://extensions` y el
userscript "Atlas Envíos" (maqueta con la dirección escrita a mano), para no
tener tres botones encima.

**4. Commitear** (ver bloqueador 3).

**5. Repartir** `INSTRUCTIVO-Cotizador-Envios.md` a los vendedores.

**Después (diferido):**
- Rediseñar la persistencia de TRF_DATA (el bloque de 4 MB)
- Sacar el token de Envia del frontend de `envios.html`
- LaunchAgent para que `envia-sync` se levante solo y no dependa de una ventana abierta

**Después (diferido):**
- Resolver TRF_DATA 4MB (rediseño de persistencia — trabajo grande)
- Cerrar Tarea 10AM (reporte diario)
- Sincronizar Git: confirmar rama maestra
