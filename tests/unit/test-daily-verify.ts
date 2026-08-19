/**
 * El verificador de la nota diaria, probado sobre los casos que de verdad fallan.
 *
 *   npx tsx tests/unit/test-daily-verify.ts
 *
 * No toca la base ni la red. Corre en `npm test`.
 */
import { claimedNumbers, verifyDaily } from "../../shared/daily/verify";
import type { IDailyFact, IDailyText } from "../../shared/types/daily-investigation";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NORM_CITE = "TOCAF, artículo 33 — define qué procedimiento de contratación corresponde según el monto.";

const FACTS: IDailyFact[] = [
  { label: "Adjudicado en los últimos 30 días", value: "$ 185,3 millones", raw: 185316878, provenance: "releases.amount.primaryAmount" },
  { label: "Mediana mensual de los 24 meses previos", value: "$ 12,4 millones", raw: 12400000, provenance: "mediana de 24 meses" },
  { label: "Veces la mediana", value: "14,9×", raw: 14.9, provenance: "cociente" },
  { label: "Adjudicaciones en la ventana", value: "37", raw: 37, provenance: "ocid distintos" },
];

function baseText(over: Partial<IDailyText> = {}): IDailyText {
  return {
    title: "La Dirección Nacional de Vivienda adjudicó 14,9 veces su mediana mensual",
    dek: "El organismo adjudicó 185.316.878 pesos en treinta días, contra una mediana mensual de 12.400.000 en los dos años previos.",
    measured: "Entre el 18 de julio y el 17 de agosto de 2026 la Dirección Nacional de Vivienda adjudicó 185.316.878 pesos en 37 compras. Su mediana mensual de los 24 meses previos es 12.400.000 pesos. El mes equivale a 14,9 veces esa mediana.",
    contexto: "La Dirección Nacional de Vivienda es la unidad ejecutora del Ministerio de Vivienda que financia y contrata programas habitacionales en todo el país.",
    norm: "Ninguna norma se incumple por concentrar gasto en un mes. Lo que el salto abre es una pregunta sobre el procedimiento elegido para la compra más grande.",
    normCite: NORM_CITE,
    missing: "Saber qué contiene el mes. Un salto puede reflejar una obra anual, una compra plurianual firmada en una fecha, o una emergencia. Nada de eso se deduce del monto y hay que leer los expedientes.",
    answers: "La Dirección Nacional de Vivienda, sobre qué explica la concentración del mes.",
    ...over,
  };
}

function run(es: IDailyText, en?: IDailyText, facts: IDailyFact[] = FACTS) {
  return verifyDaily({
    lane: "pico-organismo",
    laneNormCite: NORM_CITE,
    facts,
    sources: [],
    reproduce: "npx tsx src/jobs/daily-investigation.ts --lane=pico-organismo --dry-run",
    es,
    en: en ?? { ...baseText(), title: "Housing directorate awarded 14,9 times its monthly median" },
  });
}

console.log("\nverificador de la nota diaria\n");

// 1. El caso bueno pasa.
{
  const r = run(baseText());
  check("una nota bien formada pasa", r.ok, r.reasons.join(" | "));
}

// 2. La regla que más importa: un número inventado no pasa.
{
  const r = run(baseText({
    measured: "La Dirección Nacional de Vivienda adjudicó 185.316.878 pesos en 37 compras, un 320% más que el promedio del sector.",
  }));
  check("rechaza un número que no está en los hechos medidos", !r.ok);
  check("y dice cuál era", r.reasons.some(x => x.includes("320")), r.reasons.join(" | "));
}

// 3. Palabra que dicta un fallo.
{
  const r = run(baseText({ missing: "Falta el expediente para probar que la compra fue irregular y que hubo un delito de por medio." }));
  check("rechaza una palabra que dicta un fallo", !r.ok);
}

// 4. Adjetivo de venta.
{
  const r = run(baseText({ dek: "Un salto impactante de 185.316.878 pesos en treinta días contra 12.400.000 de mediana." }));
  check("rechaza un adjetivo de venta", !r.ok);
}

// 5. `missing` recortado — el campo que más se va a querer achicar.
{
  const r = run(baseText({ missing: "Falta información." }));
  check("rechaza un «missing» recortado", !r.ok);
  check("y lo nombra", r.reasons.some(x => x.includes("missing")), r.reasons.join(" | "));
}

// 6. El modelo reescribió la cita legal.
{
  const r = run(baseText({ normCite: "TOCAF, artículo 47 — contrataciones directas por excepción." }));
  check("rechaza que el modelo reescriba la cita legal", !r.ok);
  check("y lo dice", r.reasons.some(x => x.includes("cita legal")), r.reasons.join(" | "));
}

// 7. Menos de tres hechos.
{
  const r = run(baseText(), undefined, FACTS.slice(0, 2));
  check("rechaza menos de tres hechos medidos", !r.ok);
}

// 8. Fuente que no carga.
{
  const r = verifyDaily({
    lane: "pico-organismo",
    laneNormCite: NORM_CITE,
    facts: FACTS,
    sources: [{ outlet: "la diaria", title: "Nota", url: "https://x.uy/a", checkedAt: new Date(), httpStatus: 404 }],
    reproduce: "cmd",
    es: baseText(),
    en: { ...baseText(), title: "Housing directorate awarded 14,9 times its monthly median" },
  });
  check("rechaza una fuente que contestó 404", !r.ok);
}

// 9. Los años y los artículos de ley NO cuentan como cifras afirmadas.
{
  const nums = claimedNumbers("En 2026 el artículo 33 del TOCAF y la ley 18.159 rigen 37 compras.");
  check("ignora el año 2026", !nums.includes("2026"), nums.join(","));
  check("ignora «artículo 33»", !nums.includes("33"), nums.join(","));
  check("ignora «ley 18.159»", !nums.includes("18.159"), nums.join(","));
  check("sí toma 37", nums.includes("37"), nums.join(","));
}

// 10. El redondeo que la prosa usa de verdad se acepta.
{
  const r = run(baseText({
    measured: "La Dirección Nacional de Vivienda adjudicó $ 185,3 millones en 37 compras, contra una mediana mensual de $ 12,4 millones. Es 14,9 veces esa mediana.",
  }));
  check("acepta el redondeo «185,3 millones» de 185.316.878", r.ok, r.reasons.join(" | "));
}

// 11. Punto decimal a la inglesa — el modelo lo produjo dos veces en producción.
{
  const r = run(baseText({ dek: "El organismo adjudicó $ 185.3 millones contra una mediana de 12.400.000." }));
  check("rechaza el punto decimal a la inglesa", !r.ok);
  check("y nombra la cifra", r.reasons.some(x => x.includes("185.3")), r.reasons.join(" | "));
}

// 12. El separador de miles con punto NO se confunde con un decimal.
{
  const r = run(baseText());
  check("acepta «185.316.878» como separador de miles", r.ok, r.reasons.join(" | "));
}

// 13. «N veces más» son N+1 veces.
{
  const r = run(baseText({ dek: "El organismo adjudicó 185.316.878 pesos, 14,9 veces más que su mediana mensual." }));
  check("rechaza «veces más» sobre un cociente", !r.ok);
}

// 14. «veces mayor» sí se acepta.
{
  const r = run(baseText({ dek: "El organismo adjudicó 185.316.878 pesos: 14,9 veces mayor que su mediana mensual de 12.400.000." }));
  check("acepta «veces mayor»", r.ok, r.reasons.join(" | "));
}

// 15. La coma de una enumeración no es parte del número.
{
  const nums = claimedNumbers("Se midieron 37, y de esos ninguno superó el rango.");
  check("no captura «37,» con la coma pegada", nums.includes("37") && !nums.includes("37,"), nums.join(","));
}

// 16. La NORMA del carril puede usar una palabra prohibida para NEGARLA.
//     Medido: la norma de `reiteracion-nueva` dice «Observado no quiere decir ilegal», y eso
//     dejaba ese carril imposible de publicar para siempre.
{
  const r = run(baseText({
    norm: "Reiterar un gasto observado es un acto previsto por la ley. Observado no quiere decir ilegal.",
  }));
  check("la norma del carril puede decir «no quiere decir ilegal»", r.ok, r.reasons.join(" | "));
}

// 17. Pero el MODELO no puede meter la palabra en su propio texto.
{
  const r = run(baseText({ measured: "La Dirección adjudicó 185.316.878 pesos en 37 compras de forma ilegal." }));
  check("el texto del modelo sigue sin poder decir «ilegal»", !r.ok);
}

// 18. La misma cifra escrita con otra magnitud es la misma cifra.
{
  const facts: IDailyFact[] = [
    { label: "Monto de la compra reiterada", value: "$ 12,3 mil millones", raw: 12265830000, provenance: "reiteracion_docs.primaryAmount" },
    { label: "Organismo", value: "UTE", provenance: "reiteracion_docs.buyerName" },
    { label: "Resolución", value: "1234/2026", provenance: "reiteracion_docs.resolutionNumber" },
  ];
  const es = baseText({
    title: "UTE reiteró un gasto observado por 12.300 millones de pesos",
    dek: "El organismo reiteró un gasto observado por 12.300 millones de pesos, según el documento oficial.",
    measured: "La Administración Nacional de Usinas y Trasmisiones Eléctricas reiteró un gasto observado por 12.300 millones de pesos. El documento declara la resolución que lo dispuso.",
  });
  const r = run(es, { ...es, title: "UTE overrode an objection worth 12,300 million pesos" }, facts);
  check("acepta «12.300 millones» contra un hecho de «$ 12,3 mil millones»", r.ok, r.reasons.join(" | "));
}

// 19. Una cifra realmente distinta sigue cayendo.
{
  const facts: IDailyFact[] = [
    { label: "Monto de la compra reiterada", value: "$ 12,3 mil millones", raw: 12265830000, provenance: "reiteracion_docs.primaryAmount" },
    { label: "Organismo", value: "UTE", provenance: "reiteracion_docs.buyerName" },
    { label: "Resolución", value: "1234/2026", provenance: "reiteracion_docs.resolutionNumber" },
  ];
  const es = baseText({
    measured: "La Administración reiteró un gasto observado por 45.900 millones de pesos, según el documento oficial del organismo.",
  });
  const r = run(es, undefined, facts);
  check("rechaza «45.900 millones» contra el mismo hecho", !r.ok);
}

console.log(failures === 0 ? "\nTODO OK\n" : `\n${failures} FALLA(S)\n`);
process.exit(failures === 0 ? 0 : 1);
