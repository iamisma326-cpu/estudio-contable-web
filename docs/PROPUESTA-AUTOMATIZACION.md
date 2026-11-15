# Propuesta: Automatización del registro contable de facturas

> **Proyecto:** Sánchez Delgado & Asociados — intranet para asistentes contables
> **Fecha:** 2025
> **Estado:** propuesta — pendiente de decisiones (punto 8)

---

## 0. Resumen ejecutivo

La herramienta que necesita el estudio convierte las facturas mensuales de un
cliente en:

| Salida | Qué es | De dónde sale |
|---|---|---|
| **Libro diario** | Cada comprobante como asiento de doble partida (fecha, glosa, debe, haber) | Uno por factura |
| **Libro del mes** (ventas y compras) | Un renglón por factura: fecha, serie-número, RUC, base, IGV, total | Uno por factura |
| **Impuesto a las ventas (IGV)** | IGV ventas − IGV compras = a pagar (o saldo a favor) | Agregado del libro |
| **Impuesto a la renta** | Pago a cuenta mensual + regularización anual según régimen | Del libro + régimen del cliente |
| **Excel de la empresa** | Todo lo anterior exportado, en una hoja por libro + resumen | Salida final |

**La clave:** el Excel es la *última milla*, no el sistema. Si se rellena a
mano, no se está automatizando nada. El sistema debe producir el Excel desde
un registro auditable.

---

## 1. El cuello de botella real

No es el libro diario ni los impuestos — eso es aritmética determinista y ya
está parametrizado en el proyecto (`src/data/regimenes.ts`: UIT 5500, RER
1.5%, RMT 10%/29.5%, General 29.5%).

El cuello de botella es **convertir cientos de PDFs/fotos en datos
correctos**:

- Automatizar el 100% es imposible hoy.
- Automatizar el **85–95%** es realista.
- El 5–15% restante debe caer en una **bandeja de revisión humana**.

Sin esa bandeja, un libro de compras con un RUC inventado es un problema
legal para el estudio, no un bug.

---

## 2. Cómo se automatiza (flujo)

```
ENTRADA (por orden de fiabilidad)
  XML UBL      ────────►  exacto, sin IA, confianza 99%      ← SIEMPRE preferirlo
  PDF vectorial ────────►  texto + coordenadas, regex+layout, 90–95%
  PDF escaneado ────────►  visión (Gemini) → JSON, 70–85%
  Foto/WhatsApp ────────►  visión → JSON, 60–80%

        ↓ normalización a un único esquema
  {tipo, serie, numero, fecha, RUC emisor, RUC receptor, base, IGV, total,
   moneda, tipo de cambio}

        ↓ validación SUNAT (reglas duras)
  RUC de 11 dígitos + dígito verificador · serie F/E o B · base + IGV = total
  IGV = 18% de la base · fecha dentro del período · no duplicado

        ↓ estado
  pendiente → revisado → CONFIRMADO        (nada entra al libro sin confirmar)

        ↓ al confirmar
  partida de doble partida (12/40/70 venta — 60/40/42 compra)

        ↓ agregación
  Libro Ventas / Libro Compras del mes (yyyy-mm)

        ↓ cálculo
  IGV: 18% × (ventas netas) − IGV crédito fiscal
  Renta: pago a cuenta según régimen + anual

        ↓
  EXCEL (una hoja por libro + una de resumen + una de pendientes)
```

---

## 3. Motor de extracción por tipo de entrada

### 3.1 XML UBL — la vía fiable (no cuesta tokens)

SUNAT obliga a todo emisor electrónico a entregar el XML junto al PDF.
Los campos (RUC, serie, número, importes, moneda, tipo de cambio) vienen
exactos del propio facturador.

- **Parser regex por forma fija** (los comprobantes UBL son pequeños y
  estándar), sin DOM.
- **Confianza 0.99** por construcción — autoritativo.
- **Regla:** si hay XML, se ignora el PDF.

### 3.2 PDF vectorial — texto seleccionable

Reutiliza el extractor que ya existe en el proyecto
(`api/_pdf/text.ts`, con coordenadas, incluye Form XObjects, que es lo que
usan los generadores de facturas electrónicas).

- **Regex + layout por coordenadas** (la fila "TOTAL", el RUC junto a
  "RUC:", la serie junto a "FACTURA ELECTRÓNICA"…).
- Sin LLM, determinista, auditable.
- **Confianza 0.90–0.95** cuando aparecen total + RUC + serie.

### 3.3 PDF escaneado / foto — visión

Se necesita el LLM de visión. El proyecto ya tiene el patrón exacto en
`api/pdf-edit.ts` (failover Gemini → Groq con JSON forzado); aquí se
replica solo que para *leer* en vez de *editar*.

- **Prompt con esquema JSON fijo** y temperatura 0.
- **Confianza 0.60–0.85** según cuántos campos clave se leyeron.
- **Estricto:** no inventa RUC ni importes; los omite y baja la confianza.

---

## 4. Reglas de validación SUNAT (bloquean al confirmar)

| Regla | Nivel |
|---|---|
| RUC emisor de 11 dígitos con dígito verificador válido (inicio 10/15/17/20) | Error |
| Serie de 4 caracteres (F/B/E…) coherente con el tipo | Error/Aviso |
| `base + IGV = total` (tolerancia 5 céntimos) | Error |
| IGV = 18% de la base cuando está gravado (código 10) | Aviso |
| Fecha dentro del período que se está registrando | Aviso |
| Duplicado: misma `(cliente, RUC emisor, serie, número)` | Error |
| Nota de crédito con importes negativos/positivos según corresponda | Aviso |
| Retención ≤ total del comprobante | Error |

La confirmación queda **bloqueada** si hay errores; los avisos solo fuerzan
revisión humana.

---

## 5. Contabilidad: partida doble automática (PCGE)

| Operación | Debe | Haber | Cuentas |
|---|---|---|---|
| **Venta** | 12 CxC | 40 IGV + 70 Ventas | `12` (total) · `4011` (IGV) · `70` (base) |
| **Compra** | 60 Compras + 4011 IGV crédito | 42 CxP (total − retención) | `60` · `4011` · `42` |
| **Nota de crédito** | Invierte la venta | | `70` al debe, `40` al debe, `12` al haber |
| Con **retención/detracción** | | el neto a pagar ≠ total | `total − retención` |

Regla de la casa: **toda partida debe cuadrar** (Σ debe = Σ haber) antes de
persistir; una partida descuadrada no llega a la base de datos.

### Niveles de clasificación

- **Nivel 1 (simple, recomendado para empezar):** 4–6 cuentas fijas por tipo
  de operación. Suficiente para RER y MYPE, nunca falla, siempre cuadra.
- **Nivel 2 (contable, fase posterior):** rutear el gasto por descripción del
  ítem (63 servicios, 65 otros, 33 inmuebles…). Esto sí requiere un LLM de
  clasificación y se implementa después del nivel 1.

---

## 6. Tributos

### 6.1 IGV mensual (FD 0621)

```
IGV a pagar = IGV ventas del mes − IGV crédito fiscal (compras) del mes
```

Soportar **afectaciones** (no todo es 18%):

| Código | Afectación | IGV |
|---|---|---|
| 10 | Gravado | 18% (u 8% retenciones, tasas especiales 10/4% en rubros específicos) |
| 20 | Exonerado | 0 |
| 30 | Inafecto | 0 |

### 6.2 Impuesto a la renta (mensual y anual, son dos cosas distintas)

| Régimen | Pago a cuenta mensual | Renta anual |
|---|---|---|
| RER | 1.5% de ingresos netos (definitivo) | no aplica: el pago mensual es definitivo |
| RMT | 1% hasta 300 UIT, 1.5% exceso | 10% hasta 15 UIT + 29.5% exceso |
| General | 1.5% o coeficiente, el mayor | 29.5% de la renta neta |

La herramienta emite **ambos** cálculos, no uno.

---

## 7. Excel de salida

No un volcado de BD: presentable para el contador y reutilizable para SUNAT.

| Hoja | Contenido | Formato |
|---|---|---|
| **Ventas** | fecha, tipo, serie, número, RUC/DNI, nombre, base, IGV, exonerado, total | orden del **Formato 14.1 del PLE** |
| **Compras** | ídem | orden del **Formato 8.1 del PLE** |
| **Diario** | n°, fecha, glosa, cuenta, nombre de cuenta, debe, haber | libro diario clásico |
| **Resumen** | totales, IGV ventas, IGV compras, resultado IGV del mes, pago a cuenta renta | — |
| **Pendientes** | las facturas en estado pendiente que NO entraron al libro | imprescindible: evita olvidos |

Un Excel sin la hoja de pendientes está mintiendo por omisión.

---

## 8. Decisiones pendientes (bloquean el diseño final)

1. **¿XML UBL disponible o solo PDF/fotos?** — define si el motor principal es
   parser o visión.
2. **¿Multi-cliente (estudio con varios contribuyentes) o una sola empresa?** —
   cambia el esquema (tabla `clientes`) y la regla venta/compra.
3. **¿Régimen típico de los clientes?** — RER / MYPE / General cambia el
   cálculo de renta.
4. **¿Clasificación de gasto por cuenta (nivel 2) es requisito o basta el nivel
   simple?**
5. **¿El Excel debe seguir el formato PLE de SUNAT o uno interno del estudio?**
6. **¿Quién confirma?** — ¿el asistente puede auto-confirmar lo que tenga
   confianza alta (≥0.9, sin errores) o siempre revisa todo?

---

## 9. Orden de construcción recomendado

1. **Esquema + ingesta XML** (lo más fiable, cero IA).
   *Verificable:* subir un XML y ver el JSON correcto.
2. **Ingesta PDF vectorial** con las reglas de validación SUNAT.
3. **Bandeja de revisión** (UI) y confirmación.
4. **Generador de asientos + libro del mes.**
5. **Cálculo IGV y renta (mensual + anual).**
6. **Export Excel.**
7. **Visión para fotos** al final — es el camino más caro y frágil y no debe
   bloquear los anteriores.

El punto de mayor retorno está en **1 y 2**: si la lectura de facturas es
buena, todo lo demás es aritmética. Si la lectura es mala, el mejor libro
diario del mundo es basura.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Duplicados**: la misma factura re-subida dos veces | Clave única `(cliente, RUC emisor, serie, número)` |
| **Notas de crédito** leídas como factura → IGV inflado | Validar tipo/serie y signo del importe |
| **Fecha fuera de período** (factura de junio anotada en julio) | Advertir, no bloquear: el contador decide el criterio de devengado |
| **RUC inventado por la IA** | Dígito verificador obligatorio + confianza < 0.7 fuerza revisión |
| **Importes que no cuadran** (base + IGV ≠ total) | Error duro, no se puede confirmar |
| **Excel hecho a mano por el asistente** | Es el enemigo: si el Excel es la fuente de verdad, nada se audita |

---

## 11. Lo que ya existe en el proyecto y sirve

- `src/data/regimenes.ts` — parámetros IGV/renta verificados.
- `api/_pdf/text.ts` — extracción de texto **con coordenadas**, incluido Form
  XObjects.
- `api/pdf-edit.ts` — patrón LLM + failover Gemini→Groq con JSON forzado.
- `api/_db/db.ts`, `api/_auth/guard.ts`, `api/_storage/s3.ts` — persistencia,
  auth y adjuntos.