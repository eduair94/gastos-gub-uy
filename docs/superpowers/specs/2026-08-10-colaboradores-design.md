# Página de colaboradores y créditos — diseño

**Fecha:** 2026-08-10
**Ruta:** `/colaboradores`
**Estado:** aprobado, para implementar

## Problema

El sitio no acredita a nadie. Hay un enlace al repo en el footer y una página `/about`
sobre quién está detrás, pero:

- El primer colaborador externo (Nahuel Lopez, ago-2026) no figura en ninguna parte
  de la interfaz, sólo en el historial de git.
- Las fuentes de datos de las que vive el sitio (Compras Estatales, BCU, MIEM/DEI,
  geoBoundaries, SICE) se citan sueltas, cada página por su cuenta, sin un índice.
- El software libre sobre el que corre no se atribuye en ningún lado, y un par de
  piezas lo piden explícitamente por licencia (MDI, geoBoundaries CC-BY).

Un sitio cuyo tema es la transparencia no acreditando a quien lo hace posible es una
incoherencia barata de resolver.

## Qué se construye

Una página de créditos con cuatro secciones, alimentada por **un solo archivo JSON**
que se edita a mano y se publica con un push. Sin API, sin red, sin build step extra.

### 1. Datos — `app/data/contributors.json`

Import estático desde la página. Elegido sobre un endpoint Nitro o la API de GitHub
porque agregar una persona tiene que costar seis líneas y un push, y porque una página
de créditos no debería poder fallar en runtime.

Todo texto humano es bilingüe con la forma `Bi { es, en }`, la misma que ya usa
`app/data/comparativa-alertas.ts`. Consecuencia deliberada: **agregar una persona no
toca los archivos de locale** — el JSON es la única edición.

```jsonc
{
  "people": [
    {
      "name": "Eduardo Airaudo",
      "github": "eduair94",
      "role": "maintainer",          // enum, no texto libre
      "since": "2025-08",            // YYYY-MM, del primer commit
      "blurb": { "es": "…", "en": "…" }
    }
  ],
  "dataSources": [
    { "name": "…", "url": "https://…", "note": { "es": "…", "en": "…" } }
  ],
  "software": [
    { "name": "Nuxt", "url": "https://…", "license": "MIT" }
  ]
}
```

`role` es un enum (`maintainer` | `contributor`) cuya etiqueta sale de i18n
(`colaboradores.role.*`). Un rol nuevo sí requiere tocar los locales; una persona
nueva con un rol existente, no.

**Tipado:** una interfaz en `app/utils/contributors.ts` más un `satisfies` sobre el
import, para que un JSON malformado sea un error de tipo y no una página rota. El
`tsconfig` raíz ya tiene `resolveJsonModule`; hay que confirmar que Nuxt lo herede.

### 2. Página — `app/pages/colaboradores.vue`

Cuatro secciones apiladas:

| Sección | Forma | Por qué |
| --- | --- | --- |
| Personas | Tarjetas: monograma, nombre, chip de rol, blurb, enlace a GitHub | Es el motivo de la página; se lleva el peso visual |
| Datos | Lista de definición densa | Material de referencia, no debe competir con las personas |
| Software | Lista densa con licencia | Ídem, más la atribución que exigen algunas licencias |
| Colaborar | Banda de cierre | Enlaces a repo e issues |

**Paleta:** celeste y neutros. **Nada de dorado** — `app/DESIGN.md` lo reserva para
dinero y en esta página no hay ninguno. Mismo criterio que `/analytics/errores-carga`.

**Nota de IA:** una sola frase al pie de *Personas* — el desarrollo se hace con
asistencia de IA, la revisión y la responsabilidad son humanas. Va en la página y no
escondida porque es verificable en el historial público (`Co-Authored-By: Claude` en
la mayoría de los commits): callarlo en la página de créditos es la única opción que
puede envejecer mal.

### 3. Monograma — `app/components/ContributorMonogram.vue`

~30 líneas. Iniciales sobre un fondo cuyo tono sale de un hash del handle, así que es
estable por persona y distinto entre personas. Sin imágenes y sin red.

Elegido sobre el avatar de GitHub porque **hoy el sitio no hace un solo request a un
tercero**. Un avatar remoto sería el primero: DNS+TLS extra, la IP de cada visitante
llegando a GitHub, y un hueco en la página si GitHub falla. No vale la cara.

### 4. Cableado

- Entrada en el grupo `recursos` ("Ayuda") de `app/utils/nav.ts`.
- Enlace en el footer, junto a *Cómo funciona*.
- `nav.colaboradores` + el chrome de la página en **ambos** locales.
- `useSeo` con un nodo JSON-LD `Person` por humano.
- El ícono MDI nuevo exige `npm run build:mdi-subset` y commitear el resultado, o el
  `prebuild --check` voltea el build.

## Qué NO se hace

- **Cantidad de commits.** 393 contra 4 se lee como un marcador y el número no
  significa nada: entre esos 4 commits está la reestructuración completa de la
  navegación del sitio.
- **API de GitHub** para avatar, bio o estadísticas. Rate limit de 60 req/h sin token
  y una página que puede quedar vacía, a cambio de nada que importe.
- **Enlace a CONTRIBUTING.md**: no existe en el repo. La banda de cierre enlaza el
  repo y los issues; inventar un enlace a un archivo ausente es un 404.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El JSON crece y alguien mete texto sólo en `es` | La interfaz exige `Bi`; falta un idioma = error de tipo |
| El ícono nuevo no está en el subset MDI commiteado | El `prebuild --check` falla el build antes de deployar |
| Se acredita a alguien que no quiere figurar | Sólo autores de commits públicos, sin correos, sin fotos |

## Verificación

- `npx eslint` sobre los archivos tocados.
- `vue-tsc` sin errores nuevos respecto de master.
- `npm --prefix app run build` en Node 22.
- Smoke sobre el dev server: `/colaboradores` y `/en/colaboradores` 200, el nombre de
  cada persona presente en el HTML servido, y el enlace a GitHub de Nahuel resolviendo.
- Post-deploy: las mismas rutas 200 en producción.
