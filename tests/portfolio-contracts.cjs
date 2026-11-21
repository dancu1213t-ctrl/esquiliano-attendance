const assert = require('node:assert/strict'),
  fs = require('node:fs');
const { JSDOM } = require('../tmp/test-runtime/node_modules/jsdom');
const dom = new JSDOM(
    '<section id="profileView"><div class="profile-grid"></div></section><section id="portfolioView"><button id="pfNewSale">New sale</button></section>',
    { url: 'https://example.test/?view=portfolio', runScripts: 'outside-only' },
  ),
  w = dom.window;
let current = { id: 'staff-one', role: 'admin', name: 'Staff One' },
  calls = [],
  fail = false,
  saved = 0;
const categories = [
  'Marketing',
  'Accounting',
  'Government Documents',
  'HR',
  'Business Intelligence',
  'IT',
].map((name, i) => ({ id: 'cat-' + i, name }));
const templates = categories.map((c) => ({
  category_id: c.id,
  title: c.name + ' mock',
  body:
    '1. PARTIES\n{{customer_name}} represents {{business}}. Address: {{client_address}}.\n\n2. SERVICE\n' +
    c.name +
    ' services. Reference: {{reference}}.\n\n3. PERIOD\nFrom {{start_date}} to {{end_date}}.\n\n4. PAYMENT\nCharge: {{amount}}. MOCK TEMPLATE - FOR REVIEW ONLY',
  header_text: 'ESQUILIANO {{office_reference}}',
  footer_text: 'Approved contact: {{footer_note}}',
  version: 1,
}));
const signature = {
  image:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
};
const client = {
  from(table) {
    const q = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      maybeSingle: async () => ({ data: current.id === 'staff-one' ? signature : null }),
      then: (resolve) => Promise.resolve({ data: templates }).then(resolve),
    };
    return q;
  },
  rpc: async (name, args) => {
    calls.push({ name, args });
    if (fail) throw Error('Temporary network failure');
    return { data: args.data?.id };
  },
};
Object.assign(w, {
  currentProfile: () => current,
  clientForProfile: () => client,
  preview: false,
  dayKey: () => '2026-11-17',
  check: (r) => {
    if (r.error) throw r.error;
    return r.data;
  },
  toast: () => {},
  scrollTo: () => {},
});
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.eval(fs.readFileSync(__dirname + '/../portfolio-gov-docs.js', 'utf8'));
w.eval(fs.readFileSync(__dirname + '/../portfolio-contracts.js', 'utf8'));
const opts = {
  categories,
  selected: 'cat-0',
  client,
  allowed: (id) => id !== 'cat-5',
  onSaved: () => saved++,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  await tick();
  await w.PortfolioContracts.open(opts);
  let form = w.document.querySelector('#pfSaleForm');
  assert(form);
  assert.equal(w.document.querySelector('dialog#pfSaleDialog'), null);
  assert.equal(w.document.querySelectorAll('[name=category_id] option').length, 6);
  assert(w.document.querySelector('[name=category_id] option[value="cat-5"]').disabled);
  assert(w.location.search.includes('sale=new'));
  assert.equal(form.querySelector('[name=use_signature]').checked, false);
  for (const [name, value] of Object.entries({
    customer_name: 'Test Customer',
    business: 'Test Company',
    email: 'test@example.test',
    phone: '5015550100',
    contract_reference: 'Project 001',
    amount: '450',
  }))
    form.querySelector('[name=' + name + ']').value = value;
  const select = form.querySelector('[name=category_id]');
  select.value = 'cat-1';
  select.onchange();
  assert.equal(form.querySelector('[name=contract_reference]').value, 'Project 001');
  assert.equal(form.querySelectorAll('.pf-contract-document textarea').length, 0);
  assert(form.querySelector('.pf-contract-document'));
  assert.equal(form.querySelector('[data-contract-key=customer_name]').value, 'Test Customer');
  assert.equal(form.querySelector('h4').textContent, 'Accounting mock');
  form.querySelector('[name=use_signature]').checked = true;
  const customerBlank = form.querySelector('[data-contract-key=customer_name]');
  customerBlank.value = 'Edited Customer';
  customerBlank.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(form.querySelector('[name=customer_name]').value, 'Edited Customer');
  for (const n of form.querySelectorAll('[data-contract-key]')) assert(!n.readOnly && !n.disabled);
  form.querySelector('[data-contract-key=office_reference]').value = 'HEAD-001';
  form.querySelector('[data-contract-key=footer_note]').value = 'Footer detail';
  fail = true;
  await form.onsubmit({ preventDefault() {} });
  assert(w.document.querySelector('#pfSaleError').textContent.includes('network'));
  assert.equal(form.querySelector('[name=customer_name]').disabled, false);
  const request = calls.at(-1).args.data.id;
  fail = false;
  await form.onsubmit({ preventDefault() {} });
  assert.equal(calls.at(-1).args.data.id, request);
  assert.equal(calls.at(-1).args.data.category_id, 'cat-1');
  assert.equal(calls.at(-1).args.data.contract_date, '2026-11-17');
  assert.equal(calls.at(-1).args.data.contract_fields.reference, 'Project 001');
  assert.equal(calls.at(-1).args.data.customer_name, 'Edited Customer');
  assert.equal(calls.at(-1).args.data.contract_fields.office_reference, 'HEAD-001');
  assert.equal(calls.at(-1).args.data.contract_fields.footer_note, 'Footer detail');
  assert.equal(saved, 1);
  assert(w.document.querySelector('#pfSalePage').classList.contains('hidden'));
  assert(!w.location.search.includes('sale='));
  await w.PortfolioContracts.open(opts);
  current = { id: 'staff-two', role: 'employee', name: 'Staff Two' };
  w.PortfolioContracts.sync();
  await tick();
  assert(w.document.querySelector('#pfSalePage').classList.contains('hidden'));
  assert.equal(w.document.querySelectorAll('#pfSignatureCard img').length, 0);
  assert(!w.document.querySelector('#pfSaleForm'));
  console.log(
    'Sale page, six services/access, draft preservation, retry, save return, signature consent and account-switch privacy passed.',
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  dom.window.close();
});
