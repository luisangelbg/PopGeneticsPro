# Manual de usuario de PopGeneticsPro

El manual se escribe por partes, en HTML. Primero se hace en español y luego en inglés. Cuando esté completo, las partes se unen en un solo documento y se imprime a PDF.

```
manual/
  manual.css           hoja común: tamaño carta y marco de la portada
  interior.css         estilo de las páginas interiores: hojas blancas, vivos en azul marino y negro, un color por bloque
  paginar.js           reparte el contenido en hojas tamaño carta (encabezados, números de página, índice)
  img/                 capturas de pantalla de la app
  herramientas/
    captura.html       abre la app, ejecuta una receta de pasos y deja la vista lista para la captura
    datos-con-errores.csv   matriz de práctica con seis errores sembrados (capítulo del Bloque 2)
    plantilla-llena.csv     plantilla de 3 poblaciones × 8 plantas × 5 loci con dos filas vacías
    agave-regiones.csv      el ejemplo de agave con una columna Region (Oaxaca · Puebla-Guerrero), para las capturas del AMOVA jerárquico
    otu/                    ilustraciones originales (SVG) de los seis géneros inventados, para los árboles con imágenes del Bloque 6
    generar-demografia.pl   genera los dos archivos siguientes con semillas fijas: perl generar-demografia.pl . (unos 7 minutos)
    ssr-demografia.csv      3 poblaciones × 40 plantas × 20 microsatélites: estable, con cuello de botella (N_e ≈ 40) y autógama (s = 0.6)
    ssr-espacial.csv        200 plantas con coordenadas de un rodal simulado con dispersión restringida (σ² = 78 m², Nb = 39)
    reunir-reglas.pl        reescribe el apéndice B con las reglas de decisión de los capítulos: perl herramientas/reunir-reglas.pl es (desde manual/)
    unir-manual.pl          une portada y partes en es/manual-completo.html para imprimir el manual completo (ver "Cómo obtener el PDF")
  PopGeneticsPro_Manual_de_usuario_ES.pdf   el manual completo en español
  es/
    00-portada.html    portada blanca: título en español e inglés, doble hélice de ADN que se abre en un árbol filogenético hacia maíz, jitomate, uva, chayote, mariposa monarca, catarina y abeja; hoja con puntos de referencia, diagrama floral y árbol circular (todo dibujado con gráficos vectoriales originales)
    00-portada.pdf     vista previa impresa de la portada
    01-introduccion.html  créditos, índice general, cómo leer el manual y capítulo 1
    02-bloque1.html    capítulo 2 · Bloque 1: portada, simulador, cinco prácticas, teoría y cómo citar
    03-bloque2.html    capítulo 3 · Bloque 2: formatos, hoja de datos, plantillas, interpretación, control de calidad, seis ejemplos
    04-bloque3.html    capítulo 4 · Bloque 3: teoría de la diversidad, índices y fórmulas, reglas de decisión, ajustes y figuras, maíz con microsatélites, agave, razas con ISSR, pino y morfología
    05-bloque4.html    capítulo 5 · Bloque 4: Hardy–Weinberg, F_IS y alelos nulos, ligamiento, pruebas múltiples, ajustes y figuras, maíz (con la endogamia simulada como referencia) y agave
    06-bloque5.html    capítulo 6 · Bloque 5: F_ST, G_ST, G′_ST y D; AMOVA jerárquico; pares y Nm; reglas de decisión; maíz, agave con regiones y pino
    07-bloque6.html    capítulo 7 · Bloque 6: distancias (con ejemplo numérico), PCoA y Lingoes, árboles NJ/UPGMA con bootstrap, árboles con imágenes de las OTU, Mantel y aislamiento por distancia, razas con ISSR
    08-bloque7.html    capítulo 8 · Bloque 7: modelo de mezcla, elección de K (ΔK, Ln P(D), Puechmaille, H′), DAPC con validación dejando uno fuera, asignación y migrantes; agave, maíz con estructura débil y razas ISSR
    09-bloque8.html    capítulo 9 · Bloque 8: diversidad de secuencias, pruebas de neutralidad y mismatch, N_ST frente a G_ST, red median-joining, fechado con fósiles y tasas (LSD y MCMC); pino y cinco géneros
    10-bloque9.html    capítulo 10 · Bloque 9: cuellos de botella, N_e por desequilibrio de ligamiento, estructura genética espacial y Sp, autofecundación, P_ST frente a F_ST; poblaciones simuladas, un rodal, agave y morfología del maíz
    11-bloque10.html   capítulo 11 · Bloque 10: editor de figuras (contenido y estilo, paletas), exportación (formatos, píxeles, dpi y tamaño impreso de las letras), informe HTML/PDF, párrafo de métodos y paquete ZIP; el informe del maíz
    12-apendices.html  apéndices A–F: formatos de archivo (entrada y salida, con ejemplos), las 43 reglas de decisión reunidas, glosario (siglas, términos y símbolos), solución de problemas, 109 referencias verificadas y componentes de terceros
  en/                  versión en inglés (pendiente)
```

## Ver una parte

Abre el HTML con doble clic. `paginar.js` arma las hojas en cuanto cargan las tipografías y las imágenes. Sin conexión a internet, el navegador usa tipografías del sistema; la paginación se ajusta sola.

## Colores por bloque

| Bloque | Color | Variable |
|---|---|---|
| Preliminares y capítulo 1 | azul marino `#14213d` | `--b0` |
| 1 Inicio | azul acero `#3b5b92` | `--b1` |
| 2 Datos | verde azulado `#0f766e` | `--b2` |
| 3 Diversidad | verde hoja `#3f7d20` | `--b3` |
| 4 HWE y LD | ocre `#b7791f` | `--b4` |
| 5 AMOVA | naranja tostado `#c2410c` | `--b5` |
| 6 Distancias | carmín `#b4234a` | `--b6` |
| 7 Agrupamiento | púrpura `#7e3fb0` | `--b7` |
| 8 Secuencias | azul cielo profundo `#1d74b5` | `--b8` |
| 9 Demografía | café tierra `#8a5a2b` | `--b9` |
| 10 Informe | grafito `#334155` | `--b10` |
| Apéndices | negro `#111111` | `--bx` |

## Cómo escribir la siguiente parte

- **Un capítulo es una sección.** Cada capítulo va en `<section class="capitulo" id="cap-bN" data-pestana="BN" data-orden="N+1" style="--acento: var(--bN)">`. El atributo `data-orden` fija la altura de la pestaña de color en el borde de la hoja: 1 para el capítulo 1, 2 para el Bloque 1, y así sucesivamente.
- **Secciones.** Los identificadores siguen el índice general: `s2-1` … `s11-3` y `ap-a` … `ap-f`. Así, al unir las partes, el índice encuentra sus páginas.
- **Recuadros disponibles:** `caja nota`, `caja importante`, `caja teoria`, `caja ejemplo`, `caja regla` (con tabla) y `caja dato`. Para los pasos se usa `ol.pasos`, y para texto de la app `span.ui` y `span.ruta`.
- **Evitar `columns:`.** Las listas en dos columnas se hacen con rejilla (`display: grid`).
- **Capturas a menor ancho.** Una captura que no necesita todo el ancho de la hoja va en `<figure class="media">`, al 84 %. Los capítulos 6 en adelante definen además `figure.chica` (70 %), y del 7 en adelante `figure.mini` (50 %), en su propio `<style>`. Para las capturas que van chicas conviene recortar también a lo ancho, al borde de la tarjeta, para que el texto de la app se lea.
- **Figuras flotantes.** Si una figura no cabe al pie de una hoja, `paginar.js` sube a ese hueco hasta tres bloques siguientes (texto, recuadros o tablas; nunca títulos, otras figuras ni una `ul.leyenda-marcas`) y la figura abre la hoja siguiente. Los bloques movidos quedan marcados con `data-adelantado`. Por eso el texto no debe decir "la figura de abajo": se cita por número.
- **Capturas sin controles.** Recorta la altura de la ventana para que la captura termine antes de la fila de exportación de la figura (Format, Resolution, Download). Si debajo de la figura sigue algo que sí va en la captura (por ejemplo la tabla de soportes de un árbol), oculta los controles con `hide:.fig-editor;hide:.fig-tools`.
- **Revisar cada captura.** Ábrela antes de citarla: una receta puede terminar antes de tiempo y dejar otra parte de la página en la imagen.
- **Cálculos largos: una captura alta y recortes.** Para no repetir un MCMC de varios minutos en cada imagen, se toma una sola captura alta del bloque (por ejemplo `--window-size=1400,6620`) y se recorta por secciones. Oculta `#structTiming`: con el tiempo virtual del navegador sin ventana diría "18 runs in 0.2 s".
- **Validar los números.** Los valores que se citan como resultados de la app se comprueban antes de escribirlos. Por ejemplo, las prácticas del simulador usan el promedio de 500 repeticiones del mismo modelo.
- **Si cambias una regla de decisión** en un capítulo, vuelve a generar el apéndice B con `herramientas/reunir-reglas.pl`; lo que va entre las marcas `reglas: inicio` y `reglas: fin` de `12-apendices.html` no se edita a mano.
- **Citas.** En el texto se escribe «y colaboradores» (no «et al.») y «y» entre dos autores. Toda obra citada debe estar en el apéndice E; si el título original nombra un programa, ese nombre se sustituye por […].
- **Ejemplos de archivo.** Un título de ejemplo y su `pre.archivo` van juntos dentro de `<div class="ejemplo-archivo">` para que no se separen entre hojas.

## Capturas de pantalla

Con el servidor local de la app en el puerto 9000:

```
msedge --headless=new --hide-scrollbars --window-size=1400,900 --force-device-scale-factor=2 --virtual-time-budget=30000 --screenshot=img/nombre.png "http://localhost:9000/manual/herramientas/captura.html?w=1400&h=900&do=ex:1;build;step:3;run:btnRunDiversity;scroll:%23fig3Div,24"
```

Los pasos de la receta van separados por `;`: `ex:N` (ejemplo N, desde 0), `build`, `step:N`, `run:idBoton`, `wait:ms`, `scroll:selector,desfase`, `click:selector`, `open:selector`, `select:selector=valor`, `csv:archivo.csv` (pega un CSV de herramientas/ en la hoja de datos y lo analiza), `img:Nombre=otu/archivo.svg` (asigna una ilustración a una OTU y la confirma, con crédito "Original illustration of an invented genus" y licencia "Own work"), `cfg:figura.clave=valor` (cambia una opción del editor de una figura, por ejemplo `cfg:fig6Tree.layout=circular`, y la redibuja), `hide:selector` (oculta los elementos que coinciden), `frame:selector` (un iframe de la app, como la vista previa del informe, crece a la altura de su página; sin él, la captura no sigue el desplazamiento dentro del iframe), `scrollin:iframe|elemento,desfase` (como `scroll`, para un elemento dentro de ese iframe, por ejemplo un título del informe), `report` (va al final; la página se vuelve el informe del Bloque 10 con las opciones marcadas, para imprimirlo con `--print-to-pdf` y revisar cómo sale en hojas), `noworker` (va al principio de la receta; sin él, el navegador sin ventana no espera al hilo de fondo del MCMC del Bloque 7 ni del fechado del Bloque 8) y `top`. El paso `run` espera hasta 20 minutos a que el botón se vuelva a habilitar. En la dirección, `#` se escribe `%23`, la coma dentro de un valor `%2C` y los espacios `%20`.

Ejemplo, el árbol de los cinco géneros con imágenes (figura 7.7):

```
ex:5;step:6;wait:9000;img:Fictaria=otu/Fictaria.svg;…;img:Exterocarpus=otu/Exterocarpus.svg;select:%23treeShown=indNJ;wait:4000;cfg:fig6Tree.rooting=outgroup;cfg:fig6Tree.outgroup=Exterocarpus_borealis%2CExterocarpus_palustris;cfg:fig6Tree.images=groups;cfg:fig6Tree.italic=true;hide:.fig-editor;hide:.fig-tools;scroll:%23fig6Tree,12
```

Ejemplo, la sección del AMOVA en la vista previa del informe del maíz (figura 11.7), con una ventana alta (`--window-size=1400,2200`) que después se recorta:

```
ex:1;build;step:3;step:4;step:5;step:6;wait:4000;step:9;wait:4000;step:10;wait:800;select:%23rpTitle=Diversity%20and%20structure%20of%20three%20maize%20landraces;click:%23rpPreview;wait:1500;frame:%23rpFrame;scrollin:%23rpFrame|%23s4,30
```

Para ver el informe impreso, la misma receta hasta `step:10` termina en `report` y se imprime con la orden de "Cómo obtener el PDF".

Los ejemplos FASTA (pino y los cinco géneros) traen su propia estructura y no muestran el botón de construir: su receta omite `build` (por ejemplo `ex:3;step:3`).

- **Espacio fijo antes de %.** En el texto se escribe `95&nbsp;%` para que el número y el signo no queden en renglones distintos.
- **Subíndices dentro de SVG.** Se hacen con `<tspan dy="3" font-size="8">` y se regresa con `dy="-3"`; `baseline-shift` se imprime desplazado.

## Cómo obtener el PDF

**Manual completo.** Primero se unen las partes en un solo documento y después se imprime de una vez, con el servidor local en marcha:

```
perl herramientas/unir-manual.pl es
msedge --headless=new --no-pdf-header-footer --virtual-time-budget=300000 --print-to-pdf=C:\ruta\sin\espacios\manual-es.pdf "http://localhost:9000/manual/es/manual-completo.html"
```

- `unir-manual.pl` escribe `es/manual-completo.html` con la portada, las 15 secciones de `01-introduccion.html` a `12-apendices.html` y los estilos propios de cada parte. Una regla que un capítulo define distinto (por ejemplo `td.f` del capítulo 4) se limita a las hojas de ese capítulo. Ese archivo no se edita: se corrigen las partes y se vuelve a generar.
- Hay que imprimirlo de una sola vez. Unir PDF sueltos pierde los enlaces del índice y reinicia la numeración.
- Edge no escribe el PDF si la ruta de `--print-to-pdf` tiene espacios; imprime en una carpeta sin espacios y copia el archivo.
- El resultado va en `manual/PopGeneticsPro_Manual_de_usuario_ES.pdf`: 249 hojas (portada, 5 preliminares con números romanos y 243 numeradas), 102 enlaces en el índice. Tarda unos 20 segundos.

**Una parte sola**, para revisarla:

```
msedge --headless=new --no-pdf-header-footer --virtual-time-budget=20000 --print-to-pdf=salida.pdf "http://localhost:9000/manual/es/03-bloque2.html"
```

Desde el cuadro de impresión del navegador: destino **Guardar como PDF**, márgenes **Ninguno** y **Gráficos de fondo** activado.

## Componentes de terceros

- **Cormorant**, de Christian Thalmann. Licencia SIL Open Font License 1.1.
- **Crimson Pro**, de Jacques Le Bailly. Licencia SIL Open Font License 1.1.
- **Jost**, de Owen Earl. Licencia SIL Open Font License 1.1.

Las tres se cargan desde el servicio público de fuentes web.

Todo lo demás es original: ilustraciones (incluidas las de los géneros inventados en `herramientas/otu/`), diagramas, el paginador y la herramienta de capturas. No se usan imágenes de terceros.
