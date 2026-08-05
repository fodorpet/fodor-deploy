#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   VALIDADOR PRE-DEPLOY  ·  freno de sintaxis
   ──────────────────────────────────────────────────────────────────────
   Por que existe:
     El 27-07-2026 se publico un index.html con un `});` huerfano. Un solo
     error de sintaxis hace que el navegador DESCARTE el bloque <script>
     COMPLETO: el panel abre en blanco y ninguna funcion existe. El deploy
     no validaba nada, asi que el archivo roto llego a produccion.

   Que hace:
     1. Lee firebase.json y averigua QUE CARPETA se publica (no lo asume).
     2. En cada .html de esa carpeta extrae los <script> en linea y los
        compila con vm.Script - el mismo parseo que hace un navegador.
     3. Compara cada archivo publicado con su copia en la raiz y avisa si
        difieren (editar uno y publicar el otro es un error silencioso).

   Salida: codigo 0 = se puede publicar | codigo 1 = ABORTAR.

   Nada aqui esta atado a Fodor SpA: funciona en cualquier proyecto
   Firebase Hosting que tenga firebase.json.
   ════════════════════════════════════════════════════════════════════ */

'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = process.argv[2] || process.cwd();
const C = { rojo:'\x1b[31m', verde:'\x1b[32m', ama:'\x1b[33m', gris:'\x1b[90m', neg:'\x1b[1m', off:'\x1b[0m' };

let errores = [];
let avisos  = [];

// -- 1. Que carpeta se publica? ----------------------------------------
let carpetaPublica = 'public';
try {
  const fbj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firebase.json'), 'utf8'));
  if (fbj.hosting && fbj.hosting.public) carpetaPublica = fbj.hosting.public;
} catch (e) {
  errores.push('No pude leer firebase.json: ' + e.message);
}

const dirPub = path.join(RAIZ, carpetaPublica);
if (!fs.existsSync(dirPub)) {
  errores.push('La carpeta que se publica ("' + carpetaPublica + '") no existe.');
}

// -- 2. Extraer bloques <script> en linea, con su linea real en el HTML --
function bloquesScript(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = (m[1] || '').toLowerCase();
    const tipo = (attrs.match(/type\s*=\s*["']?([^"'\s>]+)/) || [])[1] || '';
    const esJS = !tipo || /javascript|module|ecmascript/.test(tipo);
    if (!esJS) continue;
    const hastaCodigo = m.index + (m[0].length - m[2].length - m[0].match(/<\/script\s*>$/i)[0].length);
    out.push({
      codigo: m[2],
      linea: html.slice(0, hastaCodigo).split('\n').length,
      modulo: /module/.test(tipo)
    });
  }
  return out;
}

// -- 3. Validar cada .html publicado ------------------------------------
const htmls = fs.existsSync(dirPub)
  ? fs.readdirSync(dirPub).filter(f => f.toLowerCase().endsWith('.html'))
  : [];

// -- 3b. Archivos .js sueltos de la carpeta publicada ---------------------
// Agregado 28-07-2026: al sacar el catalogo a fodor-envios.js, un error de
// sintaxis ahi romperia LAS DOS pantallas y este freno no lo veia, porque
// solo miraba HTML.
const jss = fs.existsSync(dirPub)
  ? fs.readdirSync(dirPub).filter(f => f.toLowerCase().endsWith('.js'))
  : [];
for (const archivo of jss) {
  const ruta = path.join(dirPub, archivo);
  const codigo = fs.readFileSync(ruta, 'utf8');
  try {
    new vm.Script(codigo, { filename: carpetaPublica + '/' + archivo });
    console.log('  ' + C.verde + 'OK' + C.off + '  ' + archivo + '  ' + C.gris + '(' + (codigo.length/1024).toFixed(0) + ' KB)' + C.off);
  } catch (e) {
    console.log('  ' + C.rojo + 'FALLA' + C.off + '  ' + archivo);
    errores.push(carpetaPublica + '/' + archivo + ' - ERROR DE SINTAXIS\n      ' + e.message);
  }
  const enRaiz = path.join(RAIZ, archivo);
  if (fs.existsSync(enRaiz) && !fs.readFileSync(enRaiz).equals(fs.readFileSync(ruta))) {
    avisos.push(archivo + ': la copia de la raiz y la de "' + carpetaPublica + '" son DISTINTAS.');
  }
}

if (fs.existsSync(dirPub) && htmls.length === 0 && jss.length === 0) {
  errores.push('No hay ningun .html dentro de "' + carpetaPublica + '". Nada que publicar.');
}

console.log(C.neg + 'Validando lo que se va a publicar (carpeta "' + carpetaPublica + '")' + C.off + '\n');

for (const archivo of htmls) {
  const ruta = path.join(dirPub, archivo);
  const html = fs.readFileSync(ruta, 'utf8');
  const bloques = bloquesScript(html);
  let fallos = 0;

  for (const b of bloques) {
    try {
      // lineOffset hace que el error se reporte con la linea REAL del HTML
      new vm.Script(b.codigo, {
        filename: carpetaPublica + '/' + archivo,
        lineOffset: b.linea - 1
      });
    } catch (e) {
      fallos++;
      const ln = (e.stack || '').match(/:(\d+)\n/);
      errores.push(
        carpetaPublica + '/' + archivo + ' - ERROR DE SINTAXIS' +
        (ln ? ' en la linea ' + ln[1] + ' del archivo' : '') +
        '\n      ' + e.message +
        '\n      (bloque <script> que empieza en la linea ' + b.linea + ')'
      );
    }
  }

  const kb = (html.length / 1024).toFixed(0);
  console.log(
    fallos === 0
      ? '  ' + C.verde + 'OK' + C.off + '  ' + archivo + '  ' + C.gris + '(' + bloques.length + ' bloques <script>, ' + kb + ' KB)' + C.off
      : '  ' + C.rojo + 'FALLA' + C.off + '  ' + archivo + '  ' + C.rojo + fallos + ' bloque(s) no compilan' + C.off
  );

  // -- 4. La copia de la raiz es igual a la publicada? ------------------
  const enRaiz = path.join(RAIZ, archivo);
  if (fs.existsSync(enRaiz)) {
    if (!fs.readFileSync(enRaiz).equals(fs.readFileSync(ruta))) {
      avisos.push(
        archivo + ': la copia de la raiz y la de "' + carpetaPublica + '" son DISTINTAS.\n' +
        '      Se publica la de "' + carpetaPublica + '". Si editaste la de la raiz, ese cambio NO sube.'
      );
    }
  }
}

// -- 5. Veredicto ------------------------------------------------------
console.log('');
if (avisos.length) {
  console.log(C.ama + C.neg + 'AVISOS' + C.off);
  avisos.forEach(a => console.log('  ' + C.ama + '!' + C.off + ' ' + a));
  console.log('');
}

if (errores.length) {
  console.log(C.rojo + C.neg + 'DEPLOY ABORTADO - ' + errores.length + ' problema(s)' + C.off + '\n');
  errores.forEach(e => console.log('  ' + C.rojo + 'X' + C.off + ' ' + e + '\n'));
  console.log(C.rojo + 'No se subio nada. Produccion sigue exactamente como estaba.' + C.off);
  console.log(C.gris + 'Corrige el error indicado y vuelve a hacer doble clic.' + C.off + '\n');
  process.exit(1);
}

console.log(C.verde + C.neg + 'Validacion OK - el codigo compila. Se puede publicar.' + C.off + '\n');
process.exit(0);
