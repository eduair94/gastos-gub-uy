# Lo que el Estado paga por perder juicios — diseño

Fecha: 2026-08-16. Estado: implementado.

## El pedido

Un lector preguntó si existe una lista de las indemnizaciones que el Estado paga por sentencia
judicial. El caso disparador: el Tribunal de Apelaciones confirmó que el Hospital de Ojos operó a
una paciente con un lente distinto al acordado, y ASSE debe indemnizarla.

No existe esa lista. Esta página es lo más cerca que se puede llegar con datos abiertos.

## Qué hay y qué no

| Fuente | Qué tiene | Sirve |
|---|---|---|
| BJN (Poder Judicial) | +100.000 sentencias, texto completo | El monto vive en la prosa, no en un campo. Sin API. |
| TCA | Anula actos administrativos | No fija indemnizaciones. |
| RUJE (Decreto 98/019, MEC) | Todos los juicios del Estado con montos | **No es público.** Búsqueda lo obtuvo por acceso a la información. |
| OPP — crédito presupuestal | Crédito y ejecución por objeto del gasto, 2011-2021 | **Sí.** Es la base de esta página. |

## La fuente

OPP publica el crédito presupuestal abierto por objeto del gasto. El portal
`transparenciapresupuestaria.opp.gub.uy` responde 403 a todo cliente no-navegador, desde cualquier
IP que probamos. La misma tabla vive en el datastore de CKAN, con API SQL y sin WAF:

```
https://catalogodatos.gub.uy/api/3/action/datastore_search_sql?sql=...
```

El loader resuelve los `resource_id` en tiempo de ejecución con `package_show` sobre
`opp-credito-presupuestal-detallado-a-partir-de-2011`. Nunca los hardcodea.

## Qué objeto del gasto cuenta como judicial

Esta es la decisión que carga con todo. La regla es determinística y vive en
[shared/judicial-objects.ts](../../../shared/judicial-objects.ts).

Son siete objetos en el titular y uno aparte. El censo completo — los 30 objetos cuyo nombre trae
una palabra judicial entre 2011 y 2021 — vive en
[tests/unit/test-judicial-objects.ts](../../../tests/unit/test-judicial-objects.ts) y el test falla
si aparece uno sin decidir.

| Código | Nombre publicado | Categoría | ¿Titular? |
|---|---|---|---|
| 711 | Sentencias Judiciales A52 L17930 | `sentencia` | sí |
| 45.7 | Reparación p/Sentencias Judiciales y complemento A21L16736 | `sentencia` | sí |
| 42.614 / 42.617 | Pago sentencia c/condena a futuro | `sentencia` | sí |
| 714 | Acuerdo o Convenio Judicial | `acuerdo` | sí |
| 152.2 | Medicamentos oncológicos por amparos judiciales | `amparo` | sí |
| 194.1 | Artículos médico-quirúrgicos p/ gastos por amparos judicial | `amparo` | sí |
| 793 | Indemnizaciones | `indemnizacion` | **no** |

El 793 no entra al titular: el presupuesto no le declara causa. Puede ser una condena o puede ser
una expropiación. Va en su propia fila y con la salvedad escrita.

### Los que quedan afuera y por qué

Once objetos comparten palabra y no cuentan. Tres familias:

- **Nómina del Poder Judicial** (42.126, 42.128, 48.35, 513.9, 749.4, 749.5). Sueldos, jubilaciones
  de magistrados y convenios colectivos. Sumarlos convertiría el salario de los jueces en el costo
  de perder juicios.
- **Prestaciones por ley, sin juicio** (522.2 fondo sanitario del MGAP, 578.5 despido, 793.1 pasivos
  militares, 513.26 reparación a familiares por violencia doméstica). El Estado las paga porque una
  ley se lo manda, no porque haya perdido.
- **Reparaciones edilicias** (279, 794.1). «Reparación» de un techo, no de un daño.

### Las dos trampas

**«al amparo de» no es un amparo.** El objeto 152.27 se llama «Medicamentos al amparo Ordenanza
692/16 MSP». Ahí «amparo» es la preposición jurídica «bajo», no la acción de amparo. Queda afuera.
La regla exige una palabra judicial explícita — `sentencia`, `judicial`, `condena`, `indemniz` —, y
`amparo` sola nunca alcanza.

**«Acontecimientos Graves o Imprevistos» (713) no es judicial.** Comparte subgrupo con el 711
(«Sent.Judic.y Acontecimientos Graves o Imprevistos»), y son 4.500 millones por año. Filtrar por
subgrupo multiplicaría la cifra por diez. El filtro va por objeto del gasto, nunca por subgrupo.

## La trampa de cobertura

Los archivos anuales de OPP no cubren lo mismo. Medido sobre el datastore:

| Año | Filas | Crédito vigente | Ejecutado |
|---|---|---|---|
| 2011 | 43.343 | 239,7 MM | 222,6 MM |
| 2012 | 44.436 | 269,5 MM | 255,1 MM |
| 2013-2015 | ~15.700 | ~60 MM | parcial |
| 2016 | 44.527 | 457,1 MM | 427,5 MM |
| 2017-2018 | ~4.600 | ~30 MM | parcial |
| 2019 | 36.862 | 582,7 MM | **0** |
| 2020-2021 | 32.534 / 22.077 | — | **0** |

2019, 2020 y 2021 no traen ejecución. 2013-2015 y 2017-2018 son fragmentos.

**Regla de publicación:** el titular es el **crédito vigente**, que está en todos los años. El
ejecutado se muestra sólo donde el año lo trae, con la etiqueta puesta. Cada año lleva su propia
cobertura medida (filas, organismos, si hay ejecución) y la página la muestra. Nunca se dibuja una
serie que mezcle un año completo con un fragmento sin decirlo.

**Por qué el crédito vigente es una medida honesta acá:** en los años con ejecución, la partida 711
se gasta entera. 2011: 369.270.154 vigente == 369.270.154 ejecutado. 2012: 366.357.600 == 366.357.600.
2016: 565.768.748 == 565.768.748. El loader recomputa esa igualdad en cada corrida y la publica como
`fullySpentRows / rowsWithExecution`. Si algún año deja de cumplirse, la página lo dice sola.

## Comparación entre años

Los montos son pesos nominales de años distintos. Se deflactan por Unidad Indexada, como todo el
sitio ([shared/utils/real-value.ts](../../../shared/utils/real-value.ts)). El loader guarda el
promedio anual de UI (`uiYearAvg`) en el documento del año; la API convierte a pesos de hoy contra
la última UI, en tiempo de lectura. No se guarda un valor real: quedaría viejo al mes siguiente.

## Forma

- `shared/judicial-objects.ts` — clasificador puro. Sin I/O. Test en `tests/unit/`.
- `shared/models/judicial_spending.ts` — `judicial_spending` (una fila por año × organismo × unidad
  ejecutora × objeto) y `judicial_spending_years` (cobertura y totales por año).
- `src/jobs/load-judicial-spending.ts` — descarga, normaliza el drift de esquema, clasifica, upsert.
- `app/server/api/analytics/sentencias.get.ts` — serie por año, corte por categoría, ranking de
  organismos, filas, cobertura.
- `app/pages/analytics/sentencias.vue` — la página.

### El drift de esquema

Cada archivo anual trae otros nombres de columna y otro tipo de dato:

| Años | Columnas | Montos |
|---|---|---|
| 2011-2019 | `AÑO`, `ORG_NOMBRE`, `ODGYAUX_ID`, `MONTO_VIGENTE` | número |
| 2020 | iguales a las anteriores | texto `"1234,00"` |
| 2021 | `año`, `organismo_nombre`, `odgyaux_codigo`, `credito` | texto `"1234,00"` |

El normalizador acepta las tres formas. Un año con columnas que no reconoce falla ruidoso; no
escribe cero filas en silencio.

## Lo que quedó medido

Crédito para causas judiciales, en pesos de hoy:

| | 2011 | 2016 | 2021 |
|---|---|---|---|
| Crédito judicial | 1.103 millones | 1.561 millones | 3.065 millones |

Creció ×2,8 entre 2011 y 2021, ya descontada la inflación. Acumulado de los once años: 12.442
millones de pesos de hoy. Por motivo: sentencias 7.924 millones, amparos de salud 3.494 millones,
acuerdos judiciales 1.024 millones, indemnizaciones sin causa declarada 350 millones.

Dos cuerpos concentran casi todo. «Diversos Créditos · Dir. Gral. de Secretaría (M.E.F.)» son 8.063
millones: es la caja desde la que el MEF paga las condenas contra el Estado por el art. 52 de la Ley
17.930. El Ministerio de Salud Pública son 3.494 millones, y son todos amparos — medicamentos
oncológicos e insumos que el Estado compra porque un paciente le ganó un amparo.

En los años con ejecución publicada, 56 de 64 partidas judiciales se gastaron enteras.

«Diversos Créditos» es un organismo-bolsa, no un cuerpo. La API lo muestra junto a su unidad
ejecutora; a secas no le dice nada al lector.

## Lo que la página no dice

No dice que el Estado indemnizó a nadie en particular. El presupuesto no nombra causas ni personas.
Dice cuánto dinero se reservó y se gastó bajo objetos cuyo nombre oficial es una sentencia, un
acuerdo judicial, una indemnización o un amparo. El caso a caso está en el BJN, en prosa, y en el
RUJE, que no es público.
