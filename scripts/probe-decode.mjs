import { readFileSync } from 'node:fs';
import { PDFDocument, PDFRawStream, PDFName, PDFArray, decodePDFRawStream } from 'pdf-lib';

const buf = readFileSync(process.argv[2] ?? '/tmp/pdf-test/texto-normal.pdf');
const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
const page = doc.getPage(0);
const contents = page.node.get(PDFName.of('Contents'));
console.log('Contents clase:', contents?.constructor?.name);
// aquí el dict lo mete como ref?
console.log('toString:', contents?.toString?.().slice(0, 80));
const stream = contents instanceof PDFRawStream ? contents : doc.context.lookup(contents);
console.log('stream clase:', stream?.constructor?.name);
if (stream instanceof PDFRawStream) {
  console.log('Filter:', stream.dict.get(PDFName.of('Filter'))?.toString());
  try {
    const decoded = decodePDFRawStream(stream).decode();
    console.log('decoded bytes:', decoded.length);
    console.log(JSON.stringify(Buffer.from(decoded).toString('latin1').slice(0, 300)));
  } catch (e) {
    console.log('decode LANZÓ:', e.message);
  }
}
