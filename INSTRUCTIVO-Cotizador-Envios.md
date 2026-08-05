# Cotizador de Envíos Fodor — Instalación

Para vendedores. Se hace **una sola vez** y toma unos 3 minutos.

Sirve igual en Windows y en Mac.

---

## Antes de empezar

Necesitás un navegador: **Chrome**, **Edge** o **Brave**. Cualquiera de los tres sirve.

---

## Paso 1 — Instalar Tampermonkey

Tampermonkey es la aplicación que hace aparecer el botón dentro de Kommo.

1. Andá a: **https://www.tampermonkey.net**
2. Apretá el botón de descarga de tu navegador (Chrome, Edge o Brave)
3. Te lleva a la tienda oficial del navegador → **Agregar a Chrome** → **Agregar extensión**

Cuando termine vas a ver un ícono negro con dos círculos arriba a la derecha del navegador.

---

## Paso 2 — Instalar el cotizador

1. Con Tampermonkey ya instalado, andá a esta dirección:

   ```
   https://odfor-bae97.web.app/fodor-envios.user.js
   ```

2. Se abre solo una pantalla de Tampermonkey que dice **Fodor Envíos — Cotizador en Kommo**
3. Apretá **Instalar**

**Listo.** No hay paso 3.

---

## Cómo se usa

1. Entrá a Kommo y abrí la ficha de cualquier cliente
2. Abajo a la derecha aparece el botón **🚚 Cotizar Envío**
3. Apretalo: se abre el cotizador con la ciudad del cliente ya cargada

El botón aparece **solo en las fichas de cliente**. En otras pantallas de Kommo no se muestra — es a propósito, para no estorbar.

---

## Las actualizaciones llegan solas

Esto es lo importante y lo que cambia respecto de antes: **no hay que reinstalar nunca más**.

Cuando se corrige algo o se agregan tarifas nuevas, Tampermonkey lo baja solo. Podés seguir trabajando sin enterarte.

Si querés forzar la actualización en el momento: ícono de Tampermonkey → **Panel de control** → pestaña **Utilidades** → **Buscar actualizaciones**.

---

## Cómo usar el cotizador

### Cargar el pedido

Apretá **+** en cada producto según las cajas que lleve el pedido.

Debajo de cada producto vas a ver algo así:

```
Vaso 500cc Natural Liso
📐 69×42×50 cm · 0,145 m³
⚖️ real 23,0 kg · volumétrico 36,2 kg → cobran 36,2 kg
```

**Por qué importa:** los couriers no cobran por lo que pesa la caja, sino por lo que **ocupa**. Cobran el mayor de los dos pesos. En casi todos nuestros productos manda el volumen. Cuando eso pasa, la línea sale **en amarillo**.

Ese dato sirve para explicarle al cliente por qué el flete cuesta lo que cuesta.

### Leer los totales

Arriba aparece:

```
4 cajas · 92,0 kg reales · 0,580 m³ · cobran 144,9 kg (manda el volumen)
```

El número que importa para el precio es el de **"cobran"**, no el peso real.

### Elegir courier

Escribí la ciudad y apretá **Buscar Tarifas**:

- **Chilexpress, Starken, Correos de Chile, Blue Express** — cotizados en vivo
- **Varmontt** — fondo café, etiqueta **CONTRATO DIRECTO**

**Diferencia con Varmontt:** es contrato directo de Fodor, no pasa por el sistema de los otros couriers. El cotizador te muestra el precio para comparar, pero **la etiqueta se pide por el canal de siempre con Varmontt**. Por eso al elegirlo no aparece el formulario de generar envío.

### Precio al cliente

El campo **% de ganancia** recalcula todos los precios al toque. El número verde es el que le pasás al cliente.

---

## Problemas frecuentes

**No aparece el botón en Kommo**
Recargá con **Ctrl + F5** (Windows) o **Cmd + Shift + R** (Mac). Si sigue sin aparecer, revisá que estés en la ficha de un cliente y no en la lista general.

**La ciudad no aparece / no encuentra tarifa Varmontt**
Podés escribirla sin tilde: `concepcion`, `valparaiso`, `vina del mar` funcionan igual. Si dice que no hay tarifa, esa ciudad no está en el convenio Varmontt — igual cotiza con los otros couriers.

**Dice "Sin tarifas disponibles para esa ciudad"**
Revisá que la ciudad esté bien escrita y que hayas cargado al menos un producto.

**Veo precios distintos a los de un compañero**
Ícono de Tampermonkey → Panel de control → Utilidades → **Buscar actualizaciones**.

**Se queda en "Generando guía..."**
El generador de guías corre en el computador de administración. Si esa máquina está apagada, las guías no se emiten. Avisá para que lo revisen — la cotización igual funciona.

---

## Si tenías la versión anterior instalada

Si en tu computador ya habías cargado la carpeta `fodor-kommo-extension` en modo desarrollador, **desactivala** para no tener dos botones encima:

1. Escribí `chrome://extensions` en la barra de direcciones
2. Buscá la tarjeta **Fodor Envíos**
3. Apagá el interruptor (o apretá **Quitar**)

Ya no la vas a necesitar: el userscript hace lo mismo y se actualiza solo.

---

*Documento actualizado el 1 de agosto de 2026*
