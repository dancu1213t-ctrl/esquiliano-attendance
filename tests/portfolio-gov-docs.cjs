const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  { JSDOM } = require('../tmp/test-runtime/node_modules/jsdom');
const dom = new JSDOM('<form><section id="customer"></section></form>', {
    runScripts: 'outside-only',
  }),
  w = dom.window;
w.dayKey = () => '2026-11-17';
w.eval(fs.readFileSync(__dirname + '/../portfolio-gov-docs.js', 'utf8'));
const form = w.document.querySelector('form'),
  gov = w.PortfolioGovDocs.create(w.document.querySelector('#customer'));
const input = (name, value) => {
  const n = form.elements.namedItem(name);
  n.value = value;
  n.dispatchEvent(new w.Event('change', { bubbles: true }));
  return n;
};
const fillIds = (i) => {
  for (const person of ['applicant', 'mother', 'father']) {
    input('gov_' + i + '_' + person + '_id_status', 'available');
    input('gov_' + i + '_' + person + '_id_reference', 'TEST-' + person + i);
  }
};
gov.setCategory({ slug: 'marketing' });
assert.equal(gov.read(), null);
assert(form.checkValidity());
assert.equal(new w.FormData(form).has('gov_0_full_name'), false);
gov.setCategory({ slug: 'government' });
fillIds(0);
assert.equal(gov.read().certificate_count, 1);
assert(!form.checkValidity());
for (const [key, value] of Object.entries({
  full_name: 'Person One',
  address: 'Street 1',
  town: 'Orange Walk',
  marital_status: 'single',
  mother_name: 'Mother One',
  father_name: 'Father One',
  documents_status: 'available',
}))
  input('gov_0_' + key, value);
assert(form.checkValidity());
input('gov_certificate_count', '3');
assert(!form.checkValidity());
for (let i = 1; i < 3; i++)
  for (const [key, value] of Object.entries({
    full_name: 'Person ' + (i + 1),
    address: 'Street ' + i,
    town: 'Belize City',
    marital_status: 'married',
    mother_name: 'Mother ' + i,
    father_name: 'Father ' + i,
    documents_status: 'available',
  }))
    input('gov_' + i + '_' + key, value);
fillIds(1);
fillIds(2);
assert(form.checkValidity());
for (const [key, , price] of w.PortfolioGovDocs.services) {
  input('gov_document_type', key);
  if (price === null) {
    assert(!form.checkValidity());
    assert.equal(gov.pricing().total, null);
    input('gov_quote', '175.50');
    assert.equal(gov.pricing().total, 526.5);
    input('gov_quote', '');
  } else assert.equal(gov.pricing().total, price * 3);
}
input('gov_document_type', 'birth_certificate');
input('gov_0_mother_id_status', 'missing');
assert(!form.checkValidity());
input('gov_0_mother_id_reason', 'ID unavailable');
input('gov_2_applicant_id_status', 'missing');
input('gov_2_applicant_id_reason', 'ID unavailable');
assert.equal(gov.pricing().declarations, 2);
assert.equal(gov.pricing().total, 430);
input('gov_certificate_count', '2');
assert.equal(gov.read().applicants.length, 2);
assert.equal(gov.pricing().total, 280);
input('gov_certificate_count', '3');
let data = gov.read();
assert.equal(data.applicants.length, 3);
assert.equal(data.applicants[0].full_name, 'Person One');
assert.equal(data.applicants[2].full_name, 'Person 3');
input('gov_1_mother_status', 'deceased');
assert(form.elements.namedItem('gov_1_mother_reason').required);
assert(!form.checkValidity());
input('gov_1_mother_reason', 'Information unavailable; parent deceased.');
input('gov_2_documents_status', 'unavailable');
assert(!form.checkValidity());
input('gov_2_documents_reason', 'Documents have not been located.');
assert(form.checkValidity());
input('gov_certificate_count', '1');
assert.equal(gov.read().applicants.length, 1);
assert.equal(new w.FormData(form).has('gov_2_full_name'), false);
input('gov_certificate_count', '3');
data = gov.read();
assert.equal(data.applicants[1].mother_reason, 'Information unavailable; parent deceased.');
assert.equal(data.applicants[2].documents_reason, 'Documents have not been located.');
assert(w.PortfolioGovDocs.details(data).textContent.includes('Person 3'));
gov.setCategory({ slug: 'accounting' });
assert.equal(gov.read(), null);
assert(form.checkValidity());
assert.equal(new w.FormData(form).has('gov_0_full_name'), false);
console.log(
  'Gov Docs passed: 1/2/3 applicants, separate values, conditional reasons, count-change preservation, category isolation and saved details.',
);
dom.window.close();
