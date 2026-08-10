---
version: 1
slug: "app-pages-about-vue"
primary_target: "app/pages/about.vue"
related_targets: []
---

MODE
Read. El visitante entiende de dónde salen los datos, qué significa la barra
dorada y por qué no hay un total; se va con la fuente o con una consulta.

THESIS
Una nota metodológica del expediente público: columna de artículo con reglas
estructurales y un índice fijo que mantiene el mapa del documento a la vista.

OWN-WORLD
Datos abiertos OCDS, escala logarítmica del dinero, registros oficiales con
cantidades corruptas, límites declarados, autoría independiente.

STORY
Leer de arriba a abajo o saltar por el índice; ver la escala funcionando en
montos reales; entender la admisión sobre el total; salir al explorador o a la
fuente oficial.

FIRST VIEWPORT
Eyebrow + título + lead; el índice de secciones; el primer bloque de evidencia
("La fuente"); a ≥1280px el índice ocupa el riel derecho a ras del header.

FORM
Evolución del mundo visual existente, sin seed alternativo.

LAYOUT CONTRACT (load-bearing — this surface exists because it was broken)
- La página es una grilla de dos pistas: riel de artículo (`.prose`, max 780px)
  + índice de 240px a ras del borde derecho del header, desde 1280px.
- El cap en `ch` es MEDIDA DE LECTURA y va sólo en los elementos de texto
  (`.sec p`, `.sec h2`). NUNCA en `.prose` ni en `.sec`: capear el envoltorio
  arrastró la tabla de escala, las filas de enlaces y el CTA a un riel de 550px
  pegado a la izquierda de un contenedor de 1400px.
- El artículo usa `--t-md` (un paso por encima del body de controles) porque es
  una superficie de lectura, no de operación.
- El índice nunca se oculta: bajo 1280px se convierte en una banda de enlaces
  reglada arriba y abajo, con altura de toque real en punteros gruesos.
- `activeId` es sólo una ayuda: la página se lee igual si el
  IntersectionObserver no corre (SSR, sin soporte).
