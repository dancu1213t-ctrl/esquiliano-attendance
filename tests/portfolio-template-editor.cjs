const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  { JSDOM } = require('../tmp/test-runtime/node_modules/jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://example.test', runScripts: 'outside-only' }),
  w = dom.window;
let current = { id: 'admin', role: 'admin' },
  saved;
w.HTMLDialogElement.prototype.close = function () {
  this.dispatchEvent(new w.Event('close'));
};
w.HTMLDialogElement.prototype.showModal = function () {};
Object.assign(w, {
  currentProfile: () => current,
  clientForProfile: () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: {
          title: 'Sample template',
          header_text: 'Header',
          body: 'Body',
          footer_text: 'Footer',
        },
      }),
    }),
    rpc: async (name, args) => {
      saved = { name, args };
      return { data: null };
    },
  }),
  check: (r) => {
    if (r.error) throw r.error;
    return r.data;
  },
  toast: () => {},
});
w.eval(fs.readFileSync(__dirname + '/../portfolio-template-editor.js', 'utf8'));
(async () => {
  assert.equal(
    w.PortfolioTemplateEditor.normalizeBlanks('____ {{body_blank_1}} ____', 'body'),
    '{{body_blank_2}} {{body_blank_1}} {{body_blank_3}}',
  );
  await w.PortfolioTemplateEditor.open({ id: 'marketing', name: 'Marketing' });
  const f = w.document.querySelector('form');
  for (const [name, value] of Object.entries({
    header_text: 'Header ____.',
    body: 'Customer {{customer_name}}. Reference {{custom_1}}.',
    footer_text: 'Footer ____.',
  }))
    f.elements.namedItem(name).value = value;
  await f.onsubmit({ preventDefault() {} });
  assert.equal(saved.name, 'pf_template_save_v2');
  assert.equal(saved.args.data.header_text, 'Header {{header_text_blank_1}}.');
  assert.equal(saved.args.data.footer_text, 'Footer {{footer_text_blank_1}}.');
  assert(saved.args.data.body.includes('{{custom_1}}'));
  current = { id: 'worker', role: 'employee' };
  await w.PortfolioTemplateEditor.open({ id: 'marketing' });
  assert(!w.document.querySelector('dialog'));
  console.log(
    'Admin template editor passed: header/body/footer editing, automatic underscore blanks, custom fields, and staff restriction.',
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  dom.window.close();
});
