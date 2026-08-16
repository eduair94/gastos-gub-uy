# Casos a escala: mil fichas más en /investigaciones

Fecha: 2026-08-16. Estado: especificación aprobada, pendiente de plan.

## Qué se pide

Sumar 1.000 fichas a `/investigaciones`. Mantener la consistencia editorial.
Reutilizar los componentes que ya existen. No repetir código.

## Qué hay hoy

- 141 casos en 14 temas. Viven en `app/server/utils/casos/dossiers/*.ts`. Son 7.320 líneas.
- 35 hallazgos en `app/data/investigaciones-hallazgos.ts`.
- 14 investigaciones largas en `app/pages/investigaciones/*.vue`.
- Renderizadores: `casos/[slug].vue`, `casos/index.vue`, `temas/[tema].vue`, `InvSection`, `InvLinkCard`.
- API: `/api/casos` (índice sin base de datos) y `/api/casos/[slug]` (cruce en vivo).

## El límite que manda sobre el diseño

No existen 1.000 casos de prensa uruguayos sin cubrir. Las 141 fichas actuales ya
toman los casos grandes. Escribir 1.000 más con fuentes de prensa daría relleno.
El relleno rompe el contrato editorial de `types.ts`.

**Decisión:** la escala sale de documentos oficiales del Estado, no de la prensa.
Un documento oficial es una fuente más fuerte que una crónica.

## Los pozos, medidos el 16-08-2026

| Pozo | Volumen | Grano publicable |
|---|---|---|
| `releases` con documento `reiteracionGasto` | 5.825 contratos | 81 organismos, 754 proveedores, 727 pares (con ≥3) |
| `tcr_resolutions` atadas a una compra | 452 atadas, 238 ambiguas | ids 36.251–44.205 barridos de ~44.000 |
| `anomalies` con veredicto de IA | 6.329 | por proveedor y por organismo |
| `integrity_signals` | 268 organismos, 47 en nivel `high` | 5 señales por organismo |
| `udeco_sanctions` | 1.482 sanciones, 381 proveedores del Estado | por proveedor |
| `jutep_omisos` | 2.387 | por organismo |
| `call_bidders` | 7.098 | oferente único por llamado |
| `tender_forecast` | 19.356 | recurrencia por organismo y rubro |

## El hallazgo que habilita la escala

El PDF de reiteración declara la observación con todas sus letras. Ejemplo real,
`reiter_1186812.pdf` de UTE:

> RESULTANDO que la contratación fue observada por el Tribunal de Cuentas de la
> República por Resolución 1151/2025 en sesión de fecha 21/05/2025, por no contar
> con disponibilidad presupuestal. […] ATENTO a lo establecido en el artículo 114
> del TOCAF

De ahí salen cinco datos sin usar un modelo de lenguaje: el hecho de la
observación, el motivo, el número de resolución, la fecha y la norma invocada.
Una expresión regular alcanza.

**Trampa medida:** 4 de 6 PDF de la muestra son escaneados y dan 0 caracteres. La
capa de texto ronda un tercio. El trabajo debe medir la cobertura real y publicar
el motivo sólo cuando lo leyó.

**Vía descartada:** los PDF del propio Tribunal de Cuentas (`tcr.gub.uy`) son
escaneados sin excepción en la muestra. Leer el fallo exigiría OCR. Queda fuera.

## Arquitectura: tres carriles, un renderizador

### Carril A — Casos de prensa (+150)

Igual que hoy. Módulos TS en git. Mínimo 3 fuentes verificadas por HTTP. Temas
nuevos: agro, justicia, INAU, seguridad social, aduanas, migración e intendencias
del interior.

### Carril B — Gasto observado y reiterado (+600)

Sale de los 5.825 documentos de reiteración. Emite `CasoDef` con
`statusKind: 'auditoria'`. La fuente es el PDF oficial.

Cuatro granos, en este orden de prioridad:

1. Por organismo. 81 candidatos con ≥3 reiteraciones.
2. Por proveedor. 754 candidatos con ≥3; se publican los que ordena el monto.
3. Por motivo de observación. Agrupa por la causal que declara el documento.
4. Por contrato singular. Los de monto mayor, uno por ficha.

### Carril C — Hallazgos medidos (+250)

Familias de indicador aplicadas a cada entidad que supera un umbral. Cada familia
se diseña una vez. Cada instancia lleva su `tests/unit/hallazgo-*.verify.ts`.

## Almacenamiento y recursos

Ésta es la parte que el pedido nombra: pocos recursos, sin repetir código.

- Lo curado (carril A) sigue en TS y en git. Es texto que un humano revisa.
- Lo derivado (carriles B y C) va a Mongo. 1.141 casos en módulos TS serían unas
  60.000 líneas residentes en el bundle de Nitro, por cada worker de pm2.
- `/api/casos` pagina del lado del servidor. Hoy devuelve la lista entera: con
  1.141 fichas serían unos 2 MB de JSON por render.
- Los dossiers curados **siguen** con import estático. El import dinámico por tema
  se evaluó y se descartó: una vez que lo derivado sale del bundle, quedan 7.320
  líneas curadas, y partirlas en catorce trozos complica el lector para ahorrar
  poco. Se reabre si lo curado pasa de unas 500 fichas.
- El lector se unifica. `listCasoDefs()` pasa a ser asíncrono y consulta las dos
  fuentes. Las páginas y los componentes no cambian.

## Contrato editorial de lo derivado

Una ficha derivada obedece las mismas reglas que una escrita a mano, más tres:

1. Nunca decir «irregular» ni «delito». Una reiteración es un acto previsto por el
   artículo 114 del TOCAF. Es legal.
2. Citar el documento oficial y enlazarlo siempre.
3. Declarar qué falta para afirmar más. Es el campo `missing` de los hallazgos, y
   pasa a ser obligatorio en las fichas derivadas.

## Verificación

- `npm run verify:casos` cubre los casos curados. Se extiende a los derivados.
- Cada familia del carril C lleva un script `tsx` que la vuelve a medir.
- `npm run check:layout` corre antes del build.
- Prueba de 360 px en las rutas nuevas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Fichas derivadas repetitivas | Umbrales por grano; se publica lo que los supera |
| Lector confunde reiteración con delito | Texto fijo que cita el artículo 114 del TOCAF |
| El bundle de Nitro crece | Lo derivado vive en Mongo, no en TS |
| El índice se vuelve pesado | Paginación del lado del servidor |
| Cobertura de texto baja en los PDF | Publicar el motivo sólo cuando se leyó |
