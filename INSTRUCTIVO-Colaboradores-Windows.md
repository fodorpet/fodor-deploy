# Cotizador de Envíos Fodor — Instalación en Windows

Guía para vendedores. Toma unos 10 minutos y se hace **una sola vez**.

---

## Antes de empezar

Necesitás **Google Chrome**. Si no lo tenés, descargalo de `google.com/chrome` e instalalo.

Hay dos partes:

- **Parte 1 — El cotizador.** Es lo mínimo indispensable. No se instala nada.
- **Parte 2 — El botón dentro de Kommo.** Opcional pero muy recomendado: te ahorra copiar y pegar la ciudad en cada cotización.

---

## PARTE 1 — El cotizador de envíos

### Paso 1. Abrí el cotizador

En Chrome, andá a esta dirección:

```
https://odfor-bae97.web.app/envios.html
```

Escribila tal cual, sin espacios. No pide usuario ni contraseña.

### Paso 2. Dejalo a mano

Para no escribir la dirección cada vez:

1. Con la página abierta, presioná **Ctrl + D**
2. Ponele de nombre **Cotizador Envíos**
3. Elegí guardarlo en la **Barra de marcadores**
4. Aceptar

Si no ves la barra de marcadores, presioná **Ctrl + Shift + B** para mostrarla.

### Paso 3. Probá que funcione

1. Escribí una ciudad de destino, por ejemplo `Puerto Montt`
2. Agregá cantidad a algún producto con el botón **+**
3. Apretá **Buscar Tarifas**

Deberías ver la lista de couriers ordenada de más barato a más caro.

**Listo. Con esto ya podés cotizar.**

---

## PARTE 2 — El botón dentro de Kommo

Esto agrega un botón flotante **🚚 Cotizar Envío** en cada ficha de cliente en Kommo. Al apretarlo abre el cotizador con la ciudad ya cargada.

### Paso 1. Descomprimí la carpeta

1. Guardá el archivo **Cotizador-Envios-Fodor.zip** que te enviaron
2. Clic derecho sobre el archivo → **Extraer todo...**
3. **Importante:** elegí una carpeta donde vaya a quedar para siempre. Por ejemplo:
   ```
   C:\Fodor\Cotizador
   ```
   **No la dejes en Descargas ni en el Escritorio.** Si después borrás esa carpeta, el botón deja de funcionar.
4. Extraer

Adentro vas a ver una carpeta llamada **fodor-kommo-extension**. Esa es la que importa.

### Paso 2. Abrí las extensiones de Chrome

Escribí esto en la barra de direcciones y presioná Enter:

```
chrome://extensions
```

### Paso 3. Activá el modo desarrollador

Arriba a la derecha hay un interruptor que dice **Modo de desarrollador**. Activalo.

Van a aparecer tres botones nuevos arriba a la izquierda.

### Paso 4. Cargá la extensión

1. Apretá **Cargar descomprimida**
2. Buscá y seleccioná la carpeta **fodor-kommo-extension**
   (la que está adentro de donde extrajiste, por ejemplo `C:\Fodor\Cotizador\fodor-kommo-extension`)
3. Aceptar

Tiene que aparecer una tarjeta que dice **Fodor Envíos**.

> **Ojo:** hay que elegir la carpeta `fodor-kommo-extension`, no el ZIP ni la carpeta que la contiene. Si Chrome dice que no encuentra el manifiesto, entraste una carpeta de más o una de menos.

### Paso 5. Probalo

1. Abrí Kommo y entrá a la ficha de cualquier cliente
2. Abajo a la derecha tiene que aparecer el botón **🚚 Cotizar Envío**
3. Apretalo: abre el cotizador con la ciudad del cliente ya puesta

Si no aparece, recargá la página de Kommo con **Ctrl + F5**.

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

Arriba del todo aparece:

```
4 cajas · 92,0 kg reales · 0,580 m³ · cobran 144,9 kg (manda el volumen)
```

El número que importa para el precio es **el de "cobran"**, no el peso real.

### Elegir courier

Escribí la ciudad y apretá **Buscar Tarifas**. Vas a ver:

- **Chilexpress, Starken, Correos de Chile, Blue Express** y otros — cotizados en vivo
- **Varmontt** — con fondo café y la etiqueta **CONTRATO DIRECTO**

**Diferencia importante con Varmontt:** es contrato directo de Fodor, no pasa por el sistema de los otros couriers. El cotizador te muestra el precio para que puedas compararlo, pero **la etiqueta se pide por el canal de siempre con Varmontt**. Por eso al elegirlo no aparece el formulario de generar envío.

### Precio al cliente

El campo **% de ganancia** de arriba recalcula todos los precios al toque. El número verde es el que le pasás al cliente.

---

## Problemas frecuentes

**La ciudad no aparece / no encuentra tarifa Varmontt**
Podés escribirla sin tilde: `concepcion`, `valparaiso`, `vina del mar` funcionan igual. Si te dice que no hay tarifa, esa ciudad no está en el convenio Varmontt — igual te va a cotizar con los otros couriers.

**Dice "Sin tarifas disponibles para esa ciudad"**
Revisá que la ciudad esté bien escrita y que hayas cargado al menos un producto.

**El botón de Kommo desapareció**
Casi siempre es porque se movió o borró la carpeta de la extensión. Volvé a hacer la Parte 2 desde el Paso 1.

**Veo precios o productos distintos a los de un compañero**
Recargá con **Ctrl + F5**. Eso fuerza a Chrome a bajar la última versión en vez de usar la que tiene guardada.

---

## Si algo no funciona

Antes de avisar, probá estas dos cosas:

1. Recargar con **Ctrl + F5**
2. Cerrar Chrome por completo y volver a abrirlo

Si sigue igual, avisá indicando:

- Qué paso estabas haciendo
- La ciudad y los productos que cargaste
- Una captura de pantalla

---

*Documento actualizado el 28 de julio de 2026 · versión del panel v2026-07-28D*
