# Configuración de credenciales — Monitor de Llamados

Guía paso a paso para obtener y configurar **todas** las credenciales que faltan para
que el sistema de alertas funcione de punta a punta (cuentas + envío de emails).

Lo que ya está configurado y **no** hay que tocar: `MONGODB_URI` (base de datos) y
`GEMINI_API_KEY` (resúmenes de pliegos con IA). Lo que falta son dos servicios:
**Firebase** (autenticación de usuarios) y **Resend** (envío de emails).

| Servicio | Para qué | Variables | Costo |
|---|---|---|---|
| **Firebase** | login (email/contraseña, Google, enlace mágico) | `FIREBASE_*` (3) + `NUXT_PUBLIC_FIREBASE_*` (4) | Gratis (plan Spark) |
| **Resend** | enviar alertas / recordatorios por email | `RESEND_API_KEY`, `ALERTS_FROM_EMAIL` | Gratis hasta 3.000 emails/mes |
| App | links en los emails | `APP_BASE_URL` | — |

> ⚠️ **Nunca subas el archivo `.env` a git.** Ya está en `.gitignore`. Contiene secretos
> (clave privada de Firebase, API key de Resend, credenciales de Mongo).

---

## 1. Firebase (autenticación)

Firebase se usa **solo para autenticar**. Los datos de los usuarios viven en MongoDB.
Necesitás dos conjuntos de credenciales del mismo proyecto:

- **Admin SDK** (secreto, lado servidor): verifica el token y crea la cookie de sesión.
- **Web SDK** (público, lado navegador): maneja el login en el frontend.

### 1.1 Crear el proyecto y la app web

1. Entrá a **https://console.firebase.google.com** → **Agregar proyecto** (o "Add project").
   Ponele un nombre (ej. `proveedor-uy`). Podés desactivar Google Analytics.
2. Dentro del proyecto, tocá el ícono **`</>`** ("Web") para registrar una **app web**.
   Ponele un apodo (ej. `web`). **No** hace falta Firebase Hosting.
3. Firebase te muestra el objeto `firebaseConfig`. Anotá estos 4 valores:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",              // → NUXT_PUBLIC_FIREBASE_API_KEY
     authDomain: "TU-PROYECTO.firebaseapp.com", // → NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN
     projectId: "tu-proyecto",       // → NUXT_PUBLIC_FIREBASE_PROJECT_ID
     appId: "1:1234567890:web:abc123" // → NUXT_PUBLIC_FIREBASE_APP_ID
   }
   ```
   (Si cerraste esa pantalla: **⚙️ Configuración del proyecto → General → Tus apps → SDK
   de configuración**.) Estos 4 son **públicos**, no pasa nada si se ven en el navegador.

### 1.2 Habilitar los métodos de login

En el menú lateral: **Authentication → Comenzar** (Get started) → pestaña
**Sign-in method / Método de acceso**. Habilitá:

- **Correo electrónico/contraseña** → activar. **Además**, dentro de esa misma opción,
  activá **"Vínculo de correo electrónico (acceso sin contraseña)"** — esto habilita el
  **enlace mágico**.
- **Google** → activar. Te va a pedir un **correo de asistencia** (elegí el tuyo) y guardar.

### 1.3 Dominios autorizados

En **Authentication → Settings / Configuración → Dominios autorizados**, asegurate de que
estén:
- `localhost` (ya viene por defecto — para desarrollo).
- Tu dominio de producción (ej. `proveedoruy.com`) cuando salgas a producción.

Esto es necesario para Google y para el enlace mágico (`/auth/callback`).

### 1.4 Credenciales del Admin SDK (service account)

1. **⚙️ Configuración del proyecto → Cuentas de servicio** (Service accounts).
2. **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json`.
3. Ese JSON tiene estos tres campos, que mapean a las variables:

   | Campo en el JSON | Variable de entorno |
   |---|---|
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

> 🔑 **Cuidado con `FIREBASE_PRIVATE_KEY`.** En el JSON es un texto largo que empieza con
> `-----BEGIN PRIVATE KEY-----\n` y contiene `\n` (barra + n) como separadores. Copialo
> **tal cual, con los `\n` literales**, y pegalo entre comillas dobles en el `.env`:
>
> ```
> FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...largo...\n-----END PRIVATE KEY-----\n"
> ```
> El código ya convierte esos `\n` en saltos de línea reales. **No** lo edites, **no** le
> saques las comillas, **no** partas la clave en varias líneas.

---

## 2. Resend (envío de emails)

Sin esto configurado, el sistema **no rompe** — simplemente no manda emails (los registra
en el log). Para que las alertas lleguen de verdad:

### 2.1 API key

1. Entrá a **https://resend.com** y creá una cuenta.
2. **API Keys → Create API Key**. Copiá la clave (empieza con `re_...`) → `RESEND_API_KEY`.
   Solo se muestra una vez.

### 2.2 Verificar tu dominio (obligatorio para enviar a cualquiera)

Con el sandbox de Resend solo podés enviarte emails a vos mismo. Para mandar alertas a los
usuarios necesitás un dominio verificado:

1. **Domains → Add Domain** → escribí tu dominio (ej. `proveedoruy.com` o un subdominio
   como `mail.proveedoruy.com`).
2. Resend te da varios registros DNS (**SPF/TXT**, **DKIM/CNAME**, y un **MX** para el
   return-path). Agregalos en tu proveedor de DNS.
3. Tocá **Verify**. Puede tardar unos minutos hasta unas horas en propagar.
4. Definí el remitente:
   - `ALERTS_FROM_EMAIL=alertas@proveedoruy.com` (tiene que ser del dominio verificado).
   - Opcional: `ALERTS_REPLY_TO=contacto@proveedoruy.com`.

> 📬 **Entregabilidad:** verificá SPF + DKIM + DMARC antes de mandar en volumen, y empezá
> de a poco (warm-up) para no caer en spam. Plan gratis: 3.000 emails/mes, 100/día.

---

## 3. Lo que ya tenés (no tocar)

| Variable | Estado |
|---|---|
| `MONGODB_URI` | ✅ ya configurada (base en vivo) |
| `GEMINI_API_KEY` | ✅ ya configurada (resúmenes de pliegos + triage de anomalías) |

`APP_BASE_URL` sí hay que definirla: es la URL pública del sitio, usada en los links de los
emails (páginas de llamados y el link de baja). En desarrollo: `http://localhost:3600`.
En producción: `https://tudominio`.

---

## 4. Dónde poner cada variable

Hay **dos** archivos `.env` según qué proceso lea cada variable:

- **`.env`** (raíz del repo) → lo lee el **cron server** (que hace el sync + manda los emails)
  y los scripts (`ensure-indexes`, `backfill`).
- **`app/.env`** → lo lee el **servidor web Nuxt** (el que valida el login y sirve la API).
  ⚠️ Importante: el servidor de desarrollo (`npm run dev`) lee **`app/.env`**, no el de la
  raíz.

Para no equivocarte, poné **todo en `.env` (raíz)** y **duplicá en `app/.env`** solo lo que
necesita el web. Plantillas listas para pegar:

### `.env` (raíz del repo)

```bash
# --- Ya configurado ---
MONGODB_URI=mongodb://usuario:pass@host:27017/gastos_gub?authSource=admin
GEMINI_API_KEY=tu_clave_gemini

# --- Firebase Admin (servidor) ---
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# --- Firebase Web (público) ---
NUXT_PUBLIC_FIREBASE_API_KEY=AIza...
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
NUXT_PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
NUXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123

# --- Email (Resend) ---
RESEND_API_KEY=re_...
ALERTS_FROM_EMAIL=alertas@tudominio
# ALERTS_REPLY_TO=contacto@tudominio

# --- App ---
APP_BASE_URL=http://localhost:3600
WATCH_CAP_FREE=10
```

### `app/.env` (lo que necesita el web)

```bash
MONGODB_URI=mongodb://usuario:pass@host:27017/gastos_gub?authSource=admin

# Firebase Admin (para verificar la sesión en SSR)
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase Web (para el login en el navegador)
NUXT_PUBLIC_FIREBASE_API_KEY=AIza...
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
NUXT_PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
NUXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123

WATCH_CAP_FREE=10
APP_BASE_URL=http://localhost:3600
```

---

## 5. Aplicar y probar

Con los dos `.env` completos:

```bash
# 1. Crear los índices de las colecciones nuevas (idempotente, seguro)
npx tsx scripts/ensure-indexes.ts

# 2. Cargar los llamados abiertos actuales (ya se corrió una vez; es re-ejecutable)
npm run backfill-open-calls

# 3. Reiniciar el cron server para tomar los jobs nuevos (sync horario + alertas)
npm run cronserver:restart

# 4. Levantar el web
cd app && npm run dev        # desarrollo, en http://localhost:3600
# o en producción:  npm run build  &&  reiniciar el proceso PM2 gastos-gub-dashboard
```

### Prueba de humo (5 minutos)

1. Entrá a `http://localhost:3600/registro` y creá una cuenta (email/contraseña o Google).
2. Andá a **Mis alertas → Nueva alerta**. Poné una categoría o una palabra clave.
   Fijate que aparezca el contador **"Coincide con N llamados abiertos ahora"**.
3. Guardá. En el próximo ciclo del cron (o disparándolo a mano con
   `GET http://localhost:3002/cron/open-calls`, o el puerto de `CRON_SERVER_PORT`) vas a
   recibir el email cuando aparezca un
   llamado nuevo que coincide.
4. Verificá que **no** llegue un email duplicado por el mismo llamado en el ciclo siguiente.

> Nota: para **activar** las alertas de un usuario, su email tiene que estar **verificado**
> (Firebase manda el email de verificación al registrarse). Google ya viene verificado.

---

## 6. Checklist final

- [ ] Proyecto Firebase creado + app web registrada
- [ ] Métodos habilitados: Email/contraseña, **Enlace de correo (sin contraseña)**, Google
- [ ] Dominios autorizados: `localhost` (+ dominio de prod)
- [ ] Clave privada del service account generada y pegada en `FIREBASE_PRIVATE_KEY` (con `\n`)
- [ ] 4 variables `NUXT_PUBLIC_FIREBASE_*` cargadas
- [ ] `RESEND_API_KEY` creada
- [ ] Dominio verificado en Resend (SPF/DKIM) + `ALERTS_FROM_EMAIL` de ese dominio
- [ ] `APP_BASE_URL` apuntando a la URL correcta
- [ ] `.env` (raíz) y `app/.env` completos, **sin** subirlos a git
- [ ] `ensure-indexes` corrido, cron server reiniciado, prueba de humo OK
