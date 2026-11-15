/**
 * Banco de pruebas de las reglas SUNAT (src/lib/comprobante.ts).
 *
 * Se ejecuta con `node --experimental-strip-types` o con tsx; no depende de
 * Vitest porque el proyecto no lo tiene. Uso: npm run test:comprobante
 */

import {
  rucValido,
  digitoVerificador,
  serieCoherente,
  periodoDeFecha,
  validarComprobante,
  tieneErrores,
  claveDuplicado,
  type ComprobanteAValidar,
  type Hallazgo,
} from '../src/lib/comprobante.ts';

let ok = 0;
let fallo = 0;

function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) {
    ok++;
    console.log(`OK     ${desc}`);
  } else {
    fallo++;
    console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`);
  }
}

function codigos(h: Hallazgo[]): string[] {
  return h.map((x) => x.codigo);
}

// ---------------------------------------------------------------
// 1. RUC: algoritmo módulo 11, con RUCs reales y públicos
// ---------------------------------------------------------------
console.log('\n--- RUC ---');
// SUNAT: suma 94, resto 6, 11-6 = 5.
check('SUNAT 20131312955 válido', rucValido('20131312955'));
check('RENIEC 20131312955-1 dígito alterado se rechaza', !rucValido('20131312956'));
check('RUC con letras se rechaza', !rucValido('2013131295A'));
check('RUC de 10 dígitos se rechaza', !rucValido('2013131295'));
check('RUC de 12 dígitos se rechaza', !rucValido('201313129555'));
check('RUC vacío se rechaza', !rucValido(''));
check('RUC null se rechaza', !rucValido(null));
// Prefijos: 10, 15, 17, 20 son válidos; 16 y 30 no.
check('prefijo 16 (legado) se rechaza', !rucValido('16131312955'));
check('prefijo 30 se rechaza', !rucValido('30131312955'));

// La excepción 10 -> 0 y 11 -> 1 es donde fallan las implementaciones.
check('digitoVerificador calcula 5 para SUNAT', digitoVerificador('2013131295') === 5);
check('digitoVerificador rechaza 9 dígitos', digitoVerificador('201313129') === null);

// RUCs de persona natural (prefijo 10): 10 + 8 dígitos + verificador.
const dni = '40402701';
const diezPN = '10' + dni;
const verificadorPN = digitoVerificador(diezPN);
const rucPN = diezPN + String(verificadorPN);
check('RUC persona natural construido mide 11', rucPN.length === 11, rucPN);
check('RUC persona natural generado es válido', rucValido(rucPN), rucPN);
check('RUC persona natural con dígito alterado se rechaza', !rucValido(diezPN + String((verificadorPN! + 1) % 10)));

// ---------------------------------------------------------------
// 2. Serie
// ---------------------------------------------------------------
console.log('\n--- Serie ---');
check('F001 factura ok', serieCoherente('factura', 'F001').ok);
check('B001 boleta ok', serieCoherente('boleta', 'B001').ok);
check('B001 como factura se rechaza', !serieCoherente('factura', 'B001').ok);
check('F001 como boleta se rechaza', !serieCoherente('boleta', 'F001').ok);
check('nota de crédito acepta F', serieCoherente('nota_credito', 'F001').ok);
check('nota de crédito acepta B', serieCoherente('nota_credito', 'B001').ok);
check('serie vacía se rechaza', !serieCoherente('factura', '').ok);
check('serie de 2 caracteres se rechaza', !serieCoherente('factura', 'F1').ok);
check('minúsculas se normalizan', serieCoherente('factura', 'f001').ok);

// ---------------------------------------------------------------
// 3. Fecha / período
// ---------------------------------------------------------------
console.log('\n--- Fecha ---');
check('2026-11-15 -> 2026-11', periodoDeFecha('2026-11-15') === '2026-11');
check('mes 13 se rechaza', periodoDeFecha('2026-13-01') === null);
check('formato incorrecto se rechaza', periodoDeFecha('15/11/2026') === null);
check('mes 00 se rechaza', periodoDeFecha('2026-00-01') === null);

// ---------------------------------------------------------------
// 4. Validación completa
// ---------------------------------------------------------------
console.log('\n--- Comprobante completo ---');

const base: ComprobanteAValidar = {
  tipo: 'factura',
  serie: 'F001',
  numero: '123',
  fechaEmision: '2026-11-10',
  rucEmisor: '20131312955',
  base: 100,
  igv: 18,
  exonerado: 0,
  total: 118,
  afectacion: '10',
  periodo: '2026-11',
};

const limpio = validarComprobante(base);
check('factura correcta no da errores', !tieneErrores(limpio), codigos(limpio).join(','));
check('factura correcta no da avisos', limpio.length === 0, codigos(limpio).join(','));

// RUC inventado
const rucMalo = validarComprobante({ ...base, rucEmisor: '20131312999' });
check('RUC inválido bloquea', tieneErrores(rucMalo));
check('RUC inválido usa el código correcto', codigos(rucMalo).includes('ruc_emisor_invalido'));

// Importes que no cuadran
const noCuadra = validarComprobante({ ...base, total: 130 });
check('base+igv != total bloquea', tieneErrores(noCuadra));
check('usa importes_no_cuadran', codigos(noCuadra).includes('importes_no_cuadran'));

// Tolerancia de 5 céntimos (S/ 0.05): el redondeo de los facturadores no cuadra al céntimo.
check('diferencia de 4 céntimos pasa', !tieneErrores(validarComprobante({ ...base, total: 118.04 })));
check('diferencia de 5 céntimos pasa', !tieneErrores(validarComprobante({ ...base, total: 118.05 })));
check('diferencia de 6 céntimos falla', tieneErrores(validarComprobante({ ...base, total: 118.06 })));

// IGV que no es 18% -> aviso, no error
const igvRaro = validarComprobante({ ...base, igv: 10, total: 110 });
check('IGV distinto de 18% es aviso', igvRaro.some((x) => x.codigo === 'igv_no_es_18' && x.gravedad === 'aviso'));
check('IGV distinto de 18% NO bloquea por sí solo', !igvRaro.some((x) => x.codigo === 'igv_no_es_18' && x.gravedad === 'error'));

// Exonerado: IGV 0 y total = base + exonerado
const exonerada = validarComprobante({
  ...base, afectacion: '20', base: 0, igv: 0, exonerado: 100, total: 100,
});
check('factura exonerada válida', !tieneErrores(exonerada), codigos(exonerada).join(','));

// Fecha fuera de período -> aviso
const otroMes = validarComprobante({ ...base, fechaEmision: '2026-10-05' });
check('fecha de otro mes es aviso', otroMes.some((x) => x.codigo === 'fecha_fuera_periodo' && x.gravedad === 'aviso'));
check('fecha de otro mes NO bloquea', !tieneErrores(otroMes));

// Retención mayor al total
const ret = validarComprobante({ ...base, retencion: 200 });
check('retención > total bloquea', tieneErrores(ret));
check('usa retencion_excede_total', codigos(ret).includes('retencion_excede_total'));

// Campos faltantes (comprobante recién leído por visión)
const vacio = validarComprobante({
  tipo: 'factura', periodo: '2026-11',
});
check('todo vacío bloquea', tieneErrores(vacio));
check('detecta RUC faltante', codigos(vacio).includes('ruc_emisor_falta'));
check('detecta importes incompletos', codigos(vacio).includes('importes_incompletos'));
check('detecta fecha faltante', codigos(vacio).includes('fecha_falta'));

// Nota de crédito
const nc = validarComprobante({ ...base, tipo: 'nota_credito', serie: 'F001', numero: '45' });
check('nota de crédito válida', !tieneErrores(nc), codigos(nc).join(','));
const ncNeg = validarComprobante({ ...base, tipo: 'nota_credito', total: -118, base: -100, igv: -18 });
check('nota de crédito negativa es aviso', ncNeg.some((x) => x.codigo === 'nota_credito_negativa'));

// Total negativo en factura
const factNeg = validarComprobante({ ...base, total: -118 });
check('factura con total negativo bloquea', tieneErrores(factNeg));

// Receptor inválido
const rec = validarComprobante({ ...base, rucReceptor: '20131312999' });
check('receptor inválido bloquea', tieneErrores(rec));
check('receptor válido pasa', !tieneErrores(validarComprobante({ ...base, rucReceptor: '20131312955' })));

// ---------------------------------------------------------------
// 5. Clave de duplicado
// ---------------------------------------------------------------
console.log('\n--- Duplicado ---');
const k1 = claveDuplicado('cli-1', '20131312955', 'F001', '0001');
const k2 = claveDuplicado('cli-1', '20131312955', 'f001 ', '1');
check('misma factura normaliza igual', k1 === k2, `${k1} vs ${k2}`);
check('distinto cliente no colisiona', k1 !== claveDuplicado('cli-2', '20131312955', 'F001', '1'));
check('distinto número no colisiona', k1 !== claveDuplicado('cli-1', '20131312955', 'F001', '2'));
check('distinto emisor no colisiona', k1 !== claveDuplicado('cli-1', '20100070970', 'F001', '1'));
check('sin número devuelve null', claveDuplicado('cli-1', '20131312955', 'F001', null) === null);

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
