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

| Código | Nombre publicado | Categoría |
|---|---|---|
| 711 | Sentencias Judiciales A52 L17930 | `sentencia` |
| 45.7 | Reparación p/Sentencias Judiciales y complemento A21L16736 | `sentencia` |
| 42.614 / 42.617 | Pago sentencia c/condena a futuro | `sentencia` |
| 714 | Acuerdo o Convenio Judicial | `acuerdo` |
| 793 | Indemnizaciones | `indemnizacion` |
| 793.1 | Pasivos Militares — Indemnización L17.949 | `indemnizacion` |
| 522.2 | Fondo Permanente de Indemnización — MGAP | `indemnizacion` |
| 578.5 | Indemnización p/despido y seguro de desempleo No Func.Pub. | `indemnizacion` |
| 152.2 | Medicamentos oncológicos por amparos judiciales | `amparo` |
| 194.1 | Artículos médico-quirúrgicos p/ gastos por amparos judicial | `amparo` |

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

## Lo que la página no dice

No dice que el Estado indemnizó a nadie en particular. El presupuesto no nombra causas ni personas.
Dice cuánto dinero se reservó y se gastó bajo objetos cuyo nombre oficial es una sentencia, un
acuerdo judicial, una indemnización o un amparo. El caso a caso está en el BJN, en prosa, y en el
RUJE, que no es público.
