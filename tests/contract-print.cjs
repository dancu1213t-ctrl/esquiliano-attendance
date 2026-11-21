const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  lib = require('../vendor/pdf-lib.min.js'),
  { build, buildPrint } = require('../portfolio-contract-pdf.js');
const sale = {
  id: '00000000-0000-4000-8000-000000000001',
  customer_name: 'Sample Customer',
  business: 'Sample Company',
  email: 'customer@example.test',
  phone: '501-555-0100',
  service: 'Marketing',
  amount: 3500,
  currency: 'BZD',
  sale_date: '2026-11-17',
  contract_date: '2026-11-17',
  payment_method: 'IFT',
  contract_snapshot: {
    layout: 'document-v1',
    title: 'Marketing service agreement',
    version: 3,
    header_text: '',
    footer_text: '',
    body: 'Customer {{customer_name}}, representing {{business}}.\n\nThe recorded charge is {{amount}}.\n\nContract reference {{reference}}. Date {{contract_date}}.\n\nMock - ECB admin can replace this.',
    fields: { reference: 'Sample reference' },
    signer_name: 'Sample Staff',
    confirmed_at: '2026-11-17T20:00:00Z',
  },
};
(async () => {
  const logo = fs.readFileSync(path.join(__dirname, '../assets/favicon.png')),
    editable = await build(sale, lib, logo),
    bytes = await buildPrint(sale, lib, logo),
    print = await lib.PDFDocument.load(bytes),
    source = await lib.PDFDocument.load(editable);
  assert(source.getForm().getFields().length > 0);
  assert(!print.catalog.has(lib.PDFName.of('AcroForm')));
  for (const page of print.getPages())
    for (const ref of page.node.Annots()?.asArray() || []) {
      const a = print.context.lookup(ref);
      assert.notEqual(a.get(lib.PDFName.of('Subtype'))?.toString(), '/Widget');
    }
  assert.equal(print.getPageCount(), source.getPageCount());
  const out = path.join(__dirname, '../tmp/pdfs');
  fs.writeFileSync(path.join(out, 'print-ready-contract.pdf'), bytes);
  fs.writeFileSync(path.join(out, 'editable-contract.pdf'), editable);
  console.log(
    'Print-ready PDF has no form tree/widgets; editable copy remains fillable and page counts match.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
