# Estado del proyecto — automatización contable

Documento de traspaso. Recoge qué se construyó, qué se verificó de verdad, qué
quedó sin verificar y qué falta. Escrito para que otra persona pueda continuar
sin reconstruir el contexto.

**Última actualización:** sesión del 15/11/2026, segunda pasada, sobre el commit
`17109ff` (ya desplegado) más los cambios de esta sesión.

---

## 1. Qué es esto

Herramienta interna para **Sánchez Delgado & Asociados**, un estudio contable
peruano. No es un SaaS para clientes: la usan los asistentes del estudio para
llevar los libros de terceros que no inician sesión.

Stack: Vite + React, funciones serverless en Vercel, Neon Postgres.

Restricción que gobierna todas las decisiones: **planes gratuitos**. Vercel
Hobby permite 12 funciones serverless, y ese es el recurso más escaso del
proyecto. Por eso todo va por un router catch-all (`api/[...ruta].ts`), que
consume **una sola** función.

- Producción: `https://estudio-contable-web-chi.vercel.app`
- Proyecto Vercel: `estudio-contable-web`, org `iamisma326-5717s-projects`, región `iad1`
- Neon: proyecto `solitary-hat-63168346`, rama `production`, `aws-us-east-1`

---

## 2. Qué está construido y funcionando

### 2.1 Roles

Tres roles en `api/_auth/guard.ts`: `admin`, `asistente`, `cliente`.
`requireStaff` = admin o asistente. El asistente ve y opera; no administra
usuarios.

### 2.2 Base de datos (`db/schema.sql`)

Tablas del dominio contable, todas aplicadas en producción:

| Tabla | Notas |
|---|---|
| `clientes` | `regimen`, `is_active`, `datos_anuales jsonb` (por año) |
| `periodos` | `UNIQUE(cliente_id, anio, mes)`, `saldo_a_favor_igv` |
| `comprobantes` | `UNIQUE(cliente_id, ruc_emisor, serie, numero)`, `razon_receptor` |
| `asientos` | cabecera del asiento |
| `asiento_lineas` | debe/haber por cuenta |

La identidad vive en el esquema gestionado `neon_auth`, no en `public`.

Migrador: `scripts/db-migrate.mjs`. **Aviso:** parte el SQL por `;` sin
entender comentarios. Por eso las columnas nuevas se añaden con
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (que `CREATE TABLE IF NOT EXISTS` no
añade columnas a tablas existentes y es una trampa fácil).

### 2.3 Validación SUNAT — `api/_lib/comprobante.ts`

`rucValido`, `digitoVerificador`, `serieCoherente`, `periodoDeFecha`,
`validarComprobante`, `tieneErrores`, `claveDuplicado`.

### 2.4 Asientos de doble partida — `api/_lib/asientos.ts`

Catálogo PCGE (`CUENTAS`), `generarAsiento`, `asientoCostoVenta`, `cuadra`,
`exigirCuadre`. Un comprobante que no cuadra **no genera asiento**: aritmética
correcta con contabilidad falsa es peor que no registrar.

### 2.5 Parser XML UBL 2.1 — `api/_lib/xml-ubl.ts`

Basado en expresiones regulares, tolerante, **nunca lanza excepción**. La
afectación del IGV vive dentro de `cac:TaxCategory/cbc:ID`; si se pone
directamente en `cac:TaxSubtotal` el IGV se lee `null` y la validación lo marca
como error (no entra silencioso con crédito cero).

### 2.6 Conversión de moneda — `api/_lib/moneda.ts`

Criterio SUNAT: compras al tipo de cambio **venta**, ventas al **compra**.

### 2.7 Ingesta — `api/_lib/ingesta.ts`

`ingerirDesdeXML`, `ingerirDesdePDF`, `decidirEstado`, `resumenComprobante`.
Campos: `ComprobanteIngerido` incluye `razonEmisor` y `razonReceptor`.
XML llega como máximo a `revisado`; PDF siempre `pendiente`. **No hay
autoconfirmación en v1.**

### 2.8 Persistencia — `api/_db/comprobantes.ts`

CTE atómica, doble verificación de cuadre.

### 2.9 Endpoints

Todos bajo el router catch-all, con `requireStaff`:

| Ruta | Qué hace |
|---|---|
| `GET/POST/PATCH /api/comprobantes` | bandeja de revisión |
| `GET /api/clientes` | lista de contribuyentes |
| `GET /api/periodos` | períodos de un cliente |
| `GET /api/ple` | libro 14.1 / 8.1 (JSON o `.TXT`) |
| `GET /api/liquidacion` | IGV del mes + pago a cuenta |
| `GET /api/libro` | Excel del mes |
| `GET/POST /api/renta-ejercicio` | DJ 710 del año |
| `GET /api/renta-anual` | cronograma SUNAT (otra cosa, nombre parecido) |

### 2.10 PLE — `api/_lib/ple.ts`

Formatos **14.1 ventas** (34 campos) y **8.1 compras** (41 campos), separador
`|`, sin comas de miles, CRLF.

Nombre de archivo, 37 caracteres:
`LE + RUC(11) + AAAA + MM + '00' + '140100'|'080100' + '00' + conOps + '1' + moneda + '1' + '.TXT'`

**Solo se exportan comprobantes confirmados.** El campo 12 es la razón social
del cliente en ventas y el 13 la del proveedor en compras.

### 2.11 IGV mensual — `api/_lib/igv-mensual.ts`

`liquidarIGV`, `pagoACuenta`, `ingresosNetosDeVentas`. Nota de crédito **resta**
base e IGV. El pago a cuenta se calcula sobre ingresos netos sin IGV.

### 2.12 Excel — `api/_lib/zip.ts` + `xlsx.ts` + `libro-excel.ts`

ZIP + OOXML escritos a mano, sin dependencias nuevas. ExcelJS pesa 21 MB y el
presupuesto de la función ya está en ~1,9 MB.

Cinco hojas: Ventas, Compras, Diario, Resumen, Pendientes. **Totales
calculados, no fórmulas**: quien recibe el archivo no debería pulsar F9.

Dos requisitos que costaron caro descubrir:
- `<cellStyles><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` en `styles.xml`.
- Referencias de celda A1 explícitas: sin ellas una columna vacía desplaza toda la tabla.

### 2.13 Renta anual (DJ 710) — `api/_lib/renta-anual.ts`

Liquidación línea por línea según el esquema del formulario: renta bruta →
gastos → renta neta → adiciones → pérdidas → renta neta imponible → impuesto →
créditos → por regularizar / saldo a favor.

Reglas confirmadas en `renta.sunat.gob.pe`:
- **General:** 29,5 % plano sobre renta neta anual.
- **RMT:** escala **progresiva acumulativa** — 10 % hasta 15 UIT (S/ 82 500) y
  29,5 % sobre el exceso. Aplicar el 29,5 % a todo lo que pasa de 15 UIT es un
  error caro y frecuente.
- **Gastos recreativos:** menor entre 0,5 % de ingresos netos y 40 UIT (inciso
  ll, art. 37 TUO LIR).

Los ingresos salen de los comprobantes confirmados del año, reutilizando la
misma `liquidarIGV` que el panel mensual, para que ambos no puedan divergir.

Los datos que aporta el contador (gastos deducibles, adiciones, pérdidas, pagos
a cuenta, retenciones, saldo anterior, recreativos) se guardan por año en
`clientes.datos_anuales` jsonb.

**El módulo no decide deducibilidad.** Recibe importes ya clasificados. Adivinar
qué gasto es deducible es exactamente lo que convierte una declaración en una
reparatoria.

### 2.14 UI

`src/pages/AdminPage.tsx` con pestañas: Resumen, Usuarios, Comprobantes,
Liquidación, Renta anual, Recursos, Editor PDF.

- **`ComprobantesPanel.tsx`** — selector de cliente, `input type="month"`,
  subida individual con vista previa y subida por lote, tabla del período con
  Confirmar/Descartar, dos tarjetas de resumen PLE con descarga.
- **`LiquidacionPanel.tsx`** — tarjetas de total a pagar, tabla del IGV, avisos,
  botón "Descargar Excel del mes".
- **`RentaAnualPanel.tsx`** — selector de cliente y año, tres tarjetas de
  resumen, lista de avisos y faltantes, tabla de determinación, siete campos
  manuales.

Las clases CSS reales están en `src/styles/AdminPage.module.css`
(`panel`, `cards`, `card`, `filters`, `form`, `formRow`, `fileField`, `table`…).
Inventar nombres no da error de compilación: simplemente la pantalla sale sin
estilo.

---

## 3. Verificación real (no solo tests)

Superficie de pruebas: **908 casos, 0 fallos**.

| Suite | Casos |
|---|---|
| `npm run test` (lógica) | 691 |
| `test:api` | 46 |
| `test:clientes` | 14 |
| `test:ple-api` | 35 |
| `test:liquidacion` | 27 |
| `test:libro` | 38 |
| `test:persistencia` | 29 |
| `test:renta-ejercicio` | 28 |

Además: `tsc --noEmit` limpio y `npm run build` limpio.

### 3.1 Flujo completo ejecutado en producción, desde el navegador

Se creó el cliente `20100010004` y el período `2026-10`, y **desde la UI en
producción** se subieron tres XML, se confirmaron y se descargaron los archivos.
No se usó ni un solo atajo por API para la parte de UI.

Documentos:

| Archivo | Tipo | Base | IGV | Exonerado | Total |
|---|---|---|---|---|---|
| `F001-00000123.xml` | factura venta | 2 500 | 450 | 0 | 2 950 |
| `FC01-00000045.xml` | nota de crédito | 500 | 90 | 0 | 590 |
| `F002-00000456.xml` | factura compra | 1 200 | 216 | 300 | 1 716 |

Resultados, todos coincidentes con el cálculo a mano:

| Salida | Resultado |
|---|---|
| PLE ventas 14.1 | base 3 000, IGV 540, total 3 540, 2 registros |
| PLE compras 8.1 | base 1 200, IGV 216, exonerado 300, total 1 716, 1 registro |
| Liquidación IGV | ventas netas 2 000, IGV 360, compras 216, **a pagar 144** |
| Pago a cuenta renta | 2 000 × 1,5 % = **30** |
| Renta anual 2026 | ingresos 2 000, al 29,5 % = **590** |

La diferencia entre base 3 000 (PLE) y 2 000 (liquidación) **no es un error**:
el PLE lista cada documento con su propio signo, la liquidación calcula el
resultado neto del período.

Los dos `.TXT` descargados de la UI real se pasaron por un auditor
independiente de los anexos de SUNAT: **sin incumplimientos**, 34 y 41 campos,
CRLF, fechas en su sitio.

El Excel descargado desde el panel de Liquidación
(`libro-20100010004-2026-10.xlsx`) abre con `openpyxl`, `unzip -t` limpio,
5 hojas y las cifras correctas.

### 3.2 Bugs que solo aparecieron al probar de verdad

Esta es la parte que importa. **Ninguno lo detectó la batería de tests.**

**a) El campo 12 del PLE declaraba que la empresa se facturó a sí misma.**
Se escribía `razonEmisor` (uno mismo) donde va el nombre del cliente. Causa de
fondo: `ingerirDesdeXML` descartaba `razonSocialReceptor`, así que el dato de la
contraparte se perdía antes de llegar al PLE. Se añadió `razonReceptor` a
`ComprobanteIngerido` y la columna `razon_receptor` a la tabla.

**b) El campo 4 (fecha de emisión) salía vacío en el archivo presentado.**
Los endpoints hacían `String(f.fecha_emision).slice(0, 10)`. Con un `date` que
el driver devuelve como objeto `Date`, eso produce `"Thu Oct 15"`, no
`"2026-10-15"`. Ningún test lo veía porque las filas de prueba se armaban con
texto, nunca con el `Date` real.

Se unificó en `api/_lib/fecha-iso.ts` (`fechaISO()`), compartida por
`/api/ple` y `/api/libro`. Usa `getFullYear/getMonth/getDate` y **no**
`toISOString()`, porque al oeste de Greenwich una fecha a medianoche se correría
un día.

**c) Fecha inválida mostrada como "Invalid Date" en las tablas.**
Mismo origen: `new Date(valor + 'T00:00:00')` sobre un valor que ya traía hora.
Se corrigió con comprobación de ida y vuelta, porque `2026-13-01` pasaba la
expresión regular y JavaScript lo corregía en silencio al año siguiente.

**d) Excel y pantalla daban cifras distintas para el mismo mes (234 vs 184).**
`/api/libro` pasaba `0` en lugar de consultar el saldo anterior. Se movió la
lógica a `api/_lib/saldo-anterior.ts`, usada por ambos endpoints, y se añadió un
test que compara las dos respuestas.

**e) Los avisos del PLE estaban invertidos.**
"Esta es una compra, no va en el registro de ventas" aparecía en la tarjeta de
ventas, siendo lo normal. Ahora solo se avisa cuando el libro quedaría vacío.

**f) El lote anunciaba "3 de 3 guardados" sin guardar ninguno.**
`subirLote` no enviaba `guardar: true`, y encima contaba por `r.ok`, así que un
200 con `guardado: false` se leía como éxito. Un mensaje de éxito falso es peor
que un error: el asistente da el trabajo por hecho.

**g) El arreglo del Excel quedó a medias: la columna salía vacía.**
El commit anterior corrigió el generador para que la hoja Ventas tomara la
contraparte, pero `/api/libro` no seleccionaba `razon_receptor` en su constante
`CAMPOS` (`api/_rutas/libro.ts`). El generador recibía `null` y escribía vacío:
el síntoma pasó de "nombre equivocado" a "columna en blanco", que se nota menos.
Lo delató `test:libro` en cuanto el fixture se corrigió. Lección: arreglar quien
escribe sin revisar quién lo alimenta deja el defecto en otra capa.

**h) El resumen del PLE no se refrescaba.**
Tras confirmar, la tabla decía `CONFIRMADO` y las tarjetas seguían diciendo "No
hay comprobantes confirmados en este período". `accion()` solo volvía a llamar a
`cargarLista()`. El mismo olvido estaba en la subida individual y en la subida
por lote: el resumen también se quedaba viejo al guardar. Ahora los tres llaman
a `refrescar()`, que recarga lista y resumen juntos.

---

## 4. Pendientes

### 4.1 Verificaciones que nunca se hicieron

Estas son las que más peso tienen, y no las puede hacer un agente solo:

1. **El `.txt` nunca se pasó por el validador oficial de SUNAT PLE.** Requiere
   Clave SOL. Ese validador además comprueba que el RUC exista y esté habido,
   que los comprobantes existan en SUNAT, y que el período coincida con lo
   declarado. Todo lo que se verificó aquí es formato contra los anexos, no
   aceptación por SUNAT.

2. **Ninguna liquidación de IGV ni de renta se cotejó contra una declaración
   real ya presentada por un contador.** La aritmética está probada contra el
   ejemplo resuelto de la cartilla oficial (ingresos 24 270 980, recreativos
   132 055, UIT 5 150 → límite 121 354,90, exceso 10 700,10: coincide exacto),
   pero eso no es lo mismo que un ejercicio cerrado.

3. **No hay datos de un cliente real.** Todo se probó con XML escritos a mano
   siguiendo el formato UBL 2.1, con RUC de dígito verificador válido. Sirven
   para validar el flujo, pero no son operaciones reales.

4. **No consta que se haya mirado el Excel de producción después de desplegar.**
   La columna "Razón social" de la hoja Ventas salía vacía por el defecto g), y
   eso solo se descubrió con `test:libro`, no con el archivo real. Descargarlo y
   revisar esa columna es lo único que cierra el punto.

### 4.2 Funcionalidad que falta

- **Detracciones (SPOT).** Los campos 31-32 del registro de compras van vacíos.
  Es una obligación real para ciertos servicios y bienes.
- **Libro Diario en formato PLE 5.1.** Hoy el Diario solo existe en el Excel.
  El 5.1 es el Libro Diario; no es una variante de 14.1/8.1.
- **Visión para fotos de facturas.** El paso 7 de la propuesta, deliberadamente
  al final: es lo más fácil de equivocar y lo más difícil de auditar.
- **Alta de clientes por UI.** Hoy se hace con SQL directo. Aceptable mientras
  el alta sea un acto administrativo puntual, no operación diaria.
- **Autoconfirmación.** Deliberadamente no existe en v1.

### 4.3 Higiene del repositorio

- Ramas ya fusionadas sin borrar: `refactor/router-api` e `ismael/periwinkle`
  (esta última con un worktree en `../orca/workspaces/…/periwinkle`).
- Sin seguimiento en git (nunca se han commiteado, y `git add -A` los
  arrastraría): `.agents/`, `promo-video/`, `refs/`, `scripts/gen-dj-test.mjs`,
  `scripts/probe-regression-locate.mjs`, `skills-lock.json`.
  **Siempre hay que preparar rutas explícitas al hacer `git add`.**

---

## 5. Cómo trabajar con este proyecto

### Levantar

```bash
npm install
npm run dev
```

Login de admin: usuario `admin`, contraseña `admin#1`. Se siembra con
`scripts/seed-admin.mjs` (hash `<saltHex>:<scryptHex>`).

### Probar

```bash
npm run test          # lógica: comprobante, asientos, xml, moneda, ingesta, pdf, ple,
                      #   igv, excel, fechas, ple-validador, ple-carpeta, renta-anual, fecha-iso
npm run test:api      # endpoints con autenticación real
npm run test:clientes
npm run test:ple-api
npm run test:liquidacion
npm run test:libro
npm run test:persistencia
npm run test:renta-ejercicio
```

Los tests son de Node con `--experimental-strip-types` y los resolutores
`scripts/_resolver-ts*.mjs`, que traducen `.js` → `.ts` para que los imports
funcionen igual en test y en producción.

### Preparar un período sin tocar la base

```bash
npm run ple:desde -- <carpeta> <aaaa-mm> <RUC> [salida]
```

Lee XML, ingiere, excluye lo que no corresponde con motivo escrito, y escribe
los dos `.TXT` más un `informe.txt`. No escribe en la base ni despliega: sirve
justo para validar con SUNAT antes de registrar nada.

### Trampas del entorno

- **Vercel solo empaqueta lo que se alcanza por imports relativos dentro de
  `api/`.** La fuente de verdad es `api/_lib/`; `src/lib/` solo reexporta. Los
  imports de runtime necesitan `.js` explícito.
- **`curl` directo a producción devuelve 403** ("Vercel Security Checkpoint").
  Usar `npx vercel curl` o Playwright.
- El módulo de renta lee sus datos de `req._recurso`, no parseando `req.url`:
  Vercel reescribe las URLs.
- Para QA visual: Playwright en `/tmp/pwtest`. El lanzador headless descarga
  incompleto; hay que apuntar `executablePath` al Chromium completo. El campo de
  usuario no es `type="email"`. El período es `input type="month"`, no un
  `select`.

---

## 6. Decisiones que conviene no revertir sin motivo

- **Solo se exportan y liquidan comprobantes confirmados.** Un borrador en el
  libro es un borrador presentado a SUNAT.
- **La validación bloquea la generación del asiento.** Un documento mal leído
  produce aritmética correcta y contabilidad falsa.
- **El auditor del PLE no comparte código con el generador.** Compartirlo deja
  que un mismo criterio equivocado pase dos veces.
- **Excel con totales calculados, no fórmulas.**
- **Los campos que faltan se reportan (`faltantes`, avisos), nunca se rellenan
  con ceros silenciosos.** Un cero sin explicación se confunde con un dato.
- **Datos del contador guardados en bloque, no campo por campo.** Los importes
  de la DJ 710 dependen unos de otros; guardar a medias deja una declaración
  que no suma.
- **`renta-ejercicio` y `renta-anual` son rutas distintas.** La segunda es el
  cronograma de vencimientos de SUNAT; cosas distintas, URLs distintas.
- **La subida por lote va secuencial.** En paralelo, dos facturas del mismo
  proveedor chocan con la restricción de duplicados.

---

## 7. Por dónde seguir

En orden de valor:

1. **Desplegar los arreglos de esta sesión** y descargar el Excel de producción
   para mirar la columna "Razón social" de la hoja Ventas (§4.1, punto 4).
2. **Conseguir XML de un cliente real** y pasarlos por
   `npm run ple:desde`, luego subir los `.TXT` al validador de SUNAT con Clave
   SOL. Es el único paso que puede convertir "formato correcto" en "SUNAT lo
   acepta".
3. **Cotejar una liquidación mensual contra una declaración ya presentada.** Un
   contador con un período cerrado basta.
4. Detracciones (SPOT) en el registro de compras.
5. Libro Diario 5.1.
6. Visión para fotos, el último.
