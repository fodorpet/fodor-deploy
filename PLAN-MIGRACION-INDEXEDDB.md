# Plan — Migración de persistencia local: localStorage → IndexedDB

**Fecha de este plan:** 2026-08-26
**Estado:** PLANIFICADO, NO IMPLEMENTADO
**Clasificación:** CIC-4 (toca la persistencia de datos de cobranza en todo el Panel)

---

## 1. Causa raíz (confirmada, no hipótesis)

El navegador da un límite de almacenamiento de **~5 MB por origen (sitio)**, no por clave.
Hoy el Panel guarda en ~15 claves separadas de `localStorage`:

- `fodorspa_crypt_v1` (2071 KB) — EST, BORRADAS, BORRADAS25, WEBPAY_DATA, GETNET_DATA,
  GETNET_ELIMINADO, CARTOLA_DATA, METAS, PROV_DATA, INV_DATA, INV_HIST, INV_MAPEO
- `fodorspa_bit_v1` (942 KB) — BITACORA
- `fodorspa_cot_v1` (802 KB) — COT_DATA
- `fodorspa_trf_v1`, `fodorspa_cart_v1`, `fodorspa_wp_v1`, `fodorspa_gn_v1`,
  `fodorspa_mp_v1`, `fodorspa_prov_v1`, `fodorspa_fcl_v1`, `fodorspa_ot_v1`,
  `fodorspa_ff_v1`, y otras menores.

Separarlas (hecho en agosto, en varias etapas) **no soluciona el problema de fondo** —
solo evita que UNA clave sola exceda su propio guardado. La suma de todas ya está en
**5075 de 5120 KB (99%)**. El siguiente candidato natural a sacar sería `EST`, y ese
**no se puede sacar**: es el estado de pago de cada factura, el dato más importante
del sistema.

## 2. Por qué no alcanza con más "mitigaciones" tipo las de agosto

Cada vez que crece el negocio (más facturas, más transferencias, más historial),
se vuelve a chocar contra el mismo techo de 5 MB. Ya no queda ningún bloque grande
que se pueda sacar sin tocar datos críticos. Es una pared de arquitectura, no de código.

## 3. Solución propuesta

Reemplazar `localStorage` por `IndexedDB` (sin techo práctico para este uso — cientos
de MB) **sin reescribir los ~60 puntos del código que hoy llaman a
`localStorage.getItem`/`localStorage.setItem` directamente.**

### Cómo, sin tocar cada punto de llamada:

Se construye un objeto puente con la misma forma que `localStorage`
(`getItem(key)`, `setItem(key,val)`, `removeItem(key)`) que:

1. Al abrir el Panel, carga TODO desde IndexedDB una sola vez a un mapa en memoria
   (operación async, se hace antes de `cargarEstado()`).
2. `getItem`/`setItem`/`removeItem` siguen siendo **síncronos** para el resto del
   código (leen/escriben ese mapa en memoria al instante — nada se rompe ni cambia
   de comportamiento visible).
3. Cada `setItem` además dispara, en segundo plano y sin bloquear, una escritura real
   a IndexedDB (asíncrona, con reintento si falla).
4. Mientras se prueba, `localStorage` real se mantiene como respaldo secundario en
   paralelo (no se borra), para poder revertir sin pérdida si algo falla.

### Qué NO cambia
- Ningún nombre de variable, función, ni los ~60 call-sites de `localStorage.*`.
- El formato de los datos guardados (mismo JSON, mismo cifrado donde ya existe).
- El comportamiento de la app tal como la ve la usuaria.

## 4. Riesgos identificados
- IndexedDB no está disponible en modo incógnito/privado en algunos navegadores —
  hay que verificar y dar un mensaje claro si pasa (no fallar en silencio, mismo
  error que motivó el fix del 04-08).
- Migración de los datos ya existentes en `localStorage` hacia IndexedDB la primera
  vez que se abra la versión nueva — debe ser automática y verificada (no perder
  nada de lo que ya está guardado hoy).
- Requiere probar en Chrome, Safari y el navegador real que usa Deborah, con datos
  reales de tamaño similar al actual (14.000+ facturas).

## 5. Plan de pruebas antes de publicar
1. Cargar el Panel con datos actuales, confirmar que migra sin pérdida (comparar
   antes/después con un export completo).
2. Simular más de 5 MB de datos (superar el techo viejo a propósito) y confirmar
   que ya no aparece `QuotaExceededError`.
3. Cerrar/reabrir la pestaña varias veces, confirmar persistencia.
4. Confirmar que el respaldo a Firebase (que ya funciona aparte) sigue intacto.
5. Rollback: si algo falla, revertir el objeto puente y seguir usando
   `localStorage` tal como está hoy (los datos no se tocan, solo la capa que los
   guarda).

## 6. Cuándo se implementa
No implementado todavía. Se agenda como tarea propia, no se mezcla con pedidos
puntuales. Requiere sesión dedicada con pruebas antes de publicar a producción.
