# Gasto público en políticas de género y diversidad — diseño

**Fecha:** 2026-08-11
**Estado:** implementado y verificado contra la DB en vivo
**Rama:** `feat/gasto-genero`

## Qué es

Una investigación con datos vivos sobre el gasto del Estado uruguayo en políticas de
género y diversidad: cuánto, qué organismo lo compra, a qué proveedor va, bajo qué
administración, y qué se está licitando ahora. Se refresca semanalmente.

Se construye como el **primer tema** de un motor genérico de "temas de gasto", para que
el segundo tema (publicidad oficial, ambiental, etc.) sea un objeto literal y no un
sprint entero.

## Lo que el dato realmente aguanta

Sondeo sobre la colección `releases` en vivo (2,17M documentos) antes de diseñar:

| Hecho | Valor |
|---|---|
| Releases que matchean los términos del tema | 541 |
| De ésos, con `amount.primaryAmount > 0` | **120 (22%)** |
| Total medible | 112,8M UYU |
| Comprador dominante | Intendencia de Montevideo — 93,7M (n=200) |
| Segundo | MIDES / Dirección de Desarrollo Social — 18,2M (n=69) |
| Concentración por programa | "ComunaMujer" = 90,0M de 112,8M (**80%**) |
| Llamados abiertos al momento del sondeo | 6 |
| Artículos del catálogo SICE del tema | 3 (77276, 75847; 4812 es textil → excluido) |

Top proveedores medidos: Instituto Mujer y Sociedad 45,0M · Fundación Plenario de
Mujeres del Uruguay 32,3M · Casa de la Mujer de la Unión 20,8M · Iniciativa
Latinoamericana 10,9M · Otras Manos 8,4M. Cinco organizaciones concentran ~106M de 112,8M.

### Consecuencias de diseño

1. **El total publicado subestima el gasto real** porque el 78% de los registros del feed
   no traen monto. La página lo dice arriba, no en letra chica. Es una falla de carga del
   Estado, no una estimación nuestra.
2. **`buyer.name` no tiene unidades de género propias.** Inmujeres no es un comprador
   separado; aparece dentro del texto de contratos de MIDES. El eje de detección es
   texto + rubro, nunca organismo.
3. **La serie por año no es comparable antes de 2021**: los montos casi no se cargaban.
   El corte se marca en el gráfico.

## Falsos positivos confirmados (y su regla)

| Trampa | Evidencia | Regla |
|---|---|---|
| `equidad` sola | matchea "Plan de Equidad" (transferencia MIDES 2008-11) y "Equidad Racial" | exigir "equidad **de género**" |
| `género` = tela | "ESTERILLA DE GENERO", rubro textil; compras viejas de ropa | excluir contexto textil/rubro de prendas |
| `trans` como substring | 14.417 matches (transporte, transferencia) | sólo términos completos con límite de palabra |
| ítems inocentes arrastrados | clavos, pincel, pastina dentro de una obra de ComunaMujer | el match es a nivel release; el ítem no se cuenta como "producto de género" |

## Arquitectura

```
shared/spending-topics.ts   definición declarativa del tema (términos, exclusiones,
                            categorías, copy es/en, fuentes)
        │
src/jobs/refresh-topic-spending.ts   (semanal, lunes)
        │  1. reglas → candidatos
        │  2. Gemini flash-lite → { inTopic, category, confidence, reason }
        │     persistido por dataVersion (no re-cobra un contrato estable)
        │  3. rollup
        ▼
topic_contracts   (1 doc por release clasificado; habilita listado + novedades)
topic_spending    (1 doc por tema; totales, series, rankings, llamados abiertos)
        │
app/server/api/analytics/topics/[key].get.ts
app/server/api/analytics/topics/[key]/contracts.get.ts
        │
/analytics/genero                    explorador filtrable
/investigaciones/gasto-en-genero     narrativa sobre las mismas cifras vivas
```

### Taxonomía del tema `genero-diversidad`

Términos incluidos (cada uno con nota de por qué, publicada en la página):
género · perspectiva/violencia/equidad/igualdad/identidad de género · violencia basada
en género · Inmujeres · Instituto Nacional de las Mujeres · ComunaMujer · Comuna Mujer ·
masculinidades · diversidad sexual · LGBT/LGBTI/LGBTQ · afrodescendiente/afrodescendencia ·
transversalización de género · trata con fines de explotación sexual · más campañas y
publicidad ligadas a lo anterior.

Exclusiones: `equidad` sola · "Plan de Equidad" · "Equidad Racial" · esterilla/rubro
textil · `trans` como substring.

Categorías de clasificación: `vbg-atencion` · `comuna-mujer` · `capacitacion` ·
`campana-publicidad` · `obra-infraestructura` · `lgbt-diversidad` · `afrodescendencia` ·
`consultoria-estudio` · `insumo-generico` · `falso-positivo`.

Sólo `inTopic: yes` entra a los totales. Los descartados quedan guardados y contados; la
página informa cuántos descartó y por qué.

### Escrituras y swap

`topic_spending` se reescribe con compute-then-swap por `dataVersion`: se escribe la
generación nueva y **luego se borran las generaciones anteriores conocidas por su
`dataVersion` exacto** — nunca `{ dataVersion: { $ne: nueva } }`, que es el patrón que
vació `sice_catalog` cuando dos corridas se solaparon.

`topic_contracts` es acumulativo (no se borra): conserva `firstSeenAt`, que es lo que
alimenta "novedades de la semana", y conserva el veredicto AI para no re-cobrarlo.

## Cruce con partido

Usa el resolver existente [`shared/political-mandates.ts`](../../../shared/political-mandates.ts)
(`buyer.id` + `sourceYear`). Dos presentaciones:

- **Chip de mandato por contrato** — contexto electoral, nunca atribución causal.
- **Comparativa normalizada**: share del gasto del propio organismo, no total absoluto
  por partido.

Razón: la IM concentra el 83% del gasto medible y Montevideo fue FA en todo el período,
así que un ranking crudo por partido mide quién gobierna Montevideo, no política de
género. La página lo explica. Entes autónomos, Poder Judicial y demás organismos
autogobernados quedan **sin chip** (el resolver ya los deja en blanco a propósito).

## Ciclo semanal

- **Job** `refresh-topic-spending`, cron lunes (America/Montevideo), antes del newsletter.
- **Bloque "Novedades"**: contratos con `firstSeenAt` dentro de los últimos 7 días.
- **Llamados abiertos**: panel leído de `open_calls` con cierre y link al pliego.
- **Alerta opt-in**: preset de `watches` (el modelo ya soporta `keywords` + `keywordMode`),
  fan-out multicanal existente (push / Telegram / inbox / email).
- **Newsletter**: bloque en el digest semanal con las novedades del tema.

## Voz editorial

Título: **"Gasto público en políticas de género y diversidad"**. Neutral y verificable:
cifras, organismos, proveedores, partido gobernante y cada contrato linkeado a su
expediente oficial (URL derivada del `ocid`, nunca del `id` del release). El lector juzga.

La página no afirma que este gasto sea bueno ni malo. Lo que sí afirma, porque el dato lo
prueba: la concentración en una red y cinco proveedores, y que el 78% de los registros no
tiene monto cargado.

## Verificación

Repo sin framework de tests. Plan:

1. `npx tsc --noEmit` en la raíz (compila `src/` + `shared/`).
2. `npx eslint src shared scripts tests`.
3. Script de aserciones `tests/unit/test-spending-topics.ts` sobre el matcher: cada
   trampa de la tabla de falsos positivos es un caso (`equidad` sola no matchea,
   `transporte` no matchea `trans`, "esterilla de género" no matchea, "violencia basada
   en género" sí).
4. `--dry-run` del job: cuenta candidatos y estima costo sin llamar a la API ni escribir.
5. Corrida real del job contra la DB en vivo.
6. `curl` a los endpoints en el dev server (`:3600`) y revisión visual de ambas páginas.
7. `npm --prefix app run build` antes del deploy.

## Resultado medido (corrida real, 2026-08-11)

| | |
|---|---|
| Candidatos tras el pre-filtro | 584 releases → 555 tras las guardas → **533 compras distintas** |
| Clasificados dentro del tema | **527** |
| Descartados por el modelo | 6 |
| Total medible | **120,8M UYU** |
| Cobertura | **20,3%** (107 de 527 con monto) |
| Comprador principal | Intendencia de Montevideo, 77,5% del total |
| Concentración | 5 proveedores = 98,3% · VBG + ComunaMujer = 96,2% |
| Peso relativo | **1,40 de cada 10.000 pesos** que esos 28 organismos gastaron en todo |
| Costo del modelo | USD 0,0497 la primera corrida; 0 en las siguientes (veredictos cacheados) |

Descartes que confirman que la segunda etapa hace falta: una compra de lombrices
«(GENERO EISENIA FOETIDA)», un aire acondicionado para un sector llamado «Género» dentro
de una dirección de RRHH, y bolsas de tela.

## Dos defectos encontrados al verificar (y corregidos)

1. **Doble conteo por `ocid`.** Varios releases comparten compra (el ajuste y la
   aclaración además de la adjudicación) y cada versión trae su propio
   `primaryAmount`. El upsert quedaba a «último gana», así que el total publicado
   dependía del orden del cursor. Ahora se deduplica por `ocid` quedándose con el
   monto mayor —el reconciliado—, de forma determinística.
2. **El upsert pisaba el veredicto del modelo.** `inTopic`/`category` se volvían a
   escribir con la respuesta de las reglas en cada corrida, descartando el veredicto
   cacheado: el total se movía un 22% sólo por volver a correr el job. Ahora las
   reglas sólo siembran en el insert y un paso de reconciliación decide el veredicto
   final en un único lugar. Verificado: dos corridas seguidas dan 120.822.417 exacto.

## Fuera de alcance

- Segundo tema (publicidad oficial, ambiental): el motor queda listo, el tema no se carga.
- Métricas de resultado de las políticas (no están en datos de compras).
- Cualquier juicio sobre la eficacia del gasto.
