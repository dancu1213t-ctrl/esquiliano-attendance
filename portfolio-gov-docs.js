window.PortfolioGovDocs = (() => {
  'use strict';
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const isGovernment = (c) => c?.slug === 'government';
  const services = [
    ['birth_certificate', 'Birth Certificate', 130],
    ['death_certificate', 'Death Certificate', 130],
    ['marriage_certificate', 'Marriage Certificate', 150],
    ['birth_registration', 'Birth Registration', 130],
    ['death_registration', 'Death Registration', 130],
    ['marriage_registration', 'Marriage Registration', 150],
    ['late_registration', 'Late Registration', null],
    ['apostille', 'Apostille', null],
    ['translation', 'Translation', null],
    ['visa_application', 'Visa Application', 100],
  ];
  const marital = [
    ['', 'Choose marital status'],
    ['single', 'Single'],
    ['married', 'Married'],
    ['divorced', 'Divorced'],
    ['widowed', 'Widowed'],
    ['separated', 'Separated'],
    ['not_applicable', 'Not applicable'],
    ['not_provided', 'Not provided'],
  ];
  const parents = [
    ['available', 'Details available'],
    ['deceased', 'Parent deceased'],
    ['unavailable', 'Information unavailable'],
    ['unknown', 'Unknown / not provided'],
  ];
  function create(container, onChange = () => {}) {
    let active = false;
    const root = el('fieldset', undefined, 'pf-gov-docs hidden');
    root.disabled = true;
    root.append(
      el('legend', 'Gov Docs'),
      el(
        'p',
        'Choose a service and complete separate details for each request. Each missing applicant or parent ID requires a declaration at BZD 20.',
        'muted',
      ),
    );
    container.append(root);
    const controls = new Map(),
      boxes = [];
    function field(
      label,
      name,
      { type = 'text', required = false, max = 150, options, value = '' } = {},
      index,
    ) {
      const l = el('label', label),
        n = el(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
      n.name = name;
      if (options) {
        for (const [v, t] of options) {
          const o = el('option', t);
          o.value = v;
          n.append(o);
        }
      } else if (type === 'textarea') n.rows = 3;
      else n.type = type;
      n.value = value;
      n.required = required;
      n.maxLength = max;
      n.setAttribute(
        'aria-label',
        label + (index !== undefined ? ' · Request ' + (index + 1) : ''),
      );
      if (type === 'date') n.max = dayKey();
      l.append(n);
      controls.set(name, n);
      return l;
    }
    const setup = el('div', undefined, 'pf-contract-grid');
    setup.append(
      field('Gov Docs service', 'gov_document_type', {
        options: services.map(([key, name, price]) => [
          key,
          name + (price === null ? ' · Ask for a quote' : ' · BZD ' + price),
        ]),
        value: 'birth_certificate',
      }),
      field('Number of requests', 'gov_certificate_count', {
        options: [
          ['1', '1 request'],
          ['2', '2 requests'],
          ['3', '3 requests'],
        ],
        value: '1',
      }),
    );
    root.append(setup);
    const quote = field('Agreed quote per request (BZD, before declarations)', 'gov_quote', {
      type: 'number',
    });
    const quoteInput = controls.get('gov_quote');
    quoteInput.min = '0.01';
    quoteInput.max = '999999999.99';
    quoteInput.step = '.01';
    root.append(quote);
    const summary = el('p', undefined, 'pf-gov-price');
    summary.setAttribute('aria-live', 'polite');
    function identity(box, prefix, person, title, index) {
      const section = el('div', undefined, 'pf-gov-parent');
      const statusField = field(
        title + ' ID',
        prefix + person + '_id_status',
        {
          required: true,
          options: [
            ['', 'Choose ID availability'],
            ['available', 'ID available'],
            ['missing', 'ID unavailable — declaration + BZD 20'],
          ],
        },
        index,
      );
      const reference = field(
        title + ' ID number / reference',
        prefix + person + '_id_reference',
        { max: 100 },
        index,
      );
      const reasonField = field(
        'Reason ' + title.toLowerCase() + ' ID is unavailable',
        prefix + person + '_id_reason',
        { type: 'textarea', max: 1000 },
        index,
      );
      const status = controls.get(prefix + person + '_id_status');
      const ref = controls.get(prefix + person + '_id_reference');
      const reason = controls.get(prefix + person + '_id_reason');
      const update = () => {
        const available = status.value === 'available',
          missing = status.value === 'missing';
        reference.classList.toggle('hidden', !available);
        ref.disabled = !available;
        ref.required = available;
        reasonField.classList.toggle('hidden', !missing);
        reason.disabled = !missing;
        reason.required = missing;
      };
      status.addEventListener('change', update);
      update();
      section.append(statusField, reference, reasonField);
      box.append(section);
    }
    for (let i = 0; i < 3; i++) {
      const prefix = 'gov_' + i + '_',
        box = el('fieldset', undefined, 'pf-gov-applicant');
      box.append(el('legend', 'Request ' + (i + 1)));
      const grid = el('div', undefined, 'pf-contract-grid');
      for (const [key, label, opts] of [
        ['full_name', 'Full name', { required: true }],
        ['date_of_birth', 'Date of birth', { type: 'date' }],
        ['place_of_birth', 'Place of birth', {}],
        ['phone', 'Phone number', { type: 'tel', max: 60 }],
        ['address', 'Address', { required: true, max: 300 }],
        ['town', 'Town / village / city', { required: true, max: 100 }],
        ['marital_status', 'Marital status', { options: marital, required: true }],
      ])
        grid.append(field(label, prefix + key, opts, i));
      box.append(grid);
      identity(box, prefix, 'applicant', 'Applicant', i);
      for (const [key, title] of [
        ['mother', 'Mother'],
        ['father', 'Father'],
      ]) {
        const section = el('div', undefined, 'pf-gov-parent'),
          g = el('div', undefined, 'pf-contract-grid');
        g.append(
          field(title + '’s full name', prefix + key + '_name', { required: true }, i),
          field(
            title + '’s information',
            prefix + key + '_status',
            { options: parents, value: 'available' },
            i,
          ),
        );
        const why = field(
            'Reason / notes for unavailable ' + title.toLowerCase() + '’s information',
            prefix + key + '_reason',
            { type: 'textarea', max: 1000 },
            i,
          ),
          status = controls.get(prefix + key + '_status'),
          reason = controls.get(prefix + key + '_reason'),
          name = controls.get(prefix + key + '_name');
        const update = () => {
          const missing = status.value !== 'available';
          why.classList.toggle('hidden', !missing);
          reason.disabled = !missing;
          reason.required = missing;
          name.required = !missing;
        };
        status.addEventListener('change', update);
        update();
        section.append(g, why);
        box.append(section);
        identity(box, prefix, key, title, i);
      }
      const docs = el('div', undefined, 'pf-gov-parent');
      docs.append(
        field(
          'Supporting documents',
          '' + prefix + 'documents_status',
          {
            options: [
              ['', 'Choose document status'],
              ['available', 'Documents available'],
              ['unavailable', 'Documents missing / unavailable'],
            ],
            required: true,
          },
          i,
        ),
      );
      const why = field(
          'Reason documents are missing / unavailable',
          prefix + 'documents_reason',
          { type: 'textarea', max: 1000 },
          i,
        ),
        status = controls.get(prefix + 'documents_status'),
        reason = controls.get(prefix + 'documents_reason');
      const update = () => {
        const missing = status.value === 'unavailable';
        why.classList.toggle('hidden', !missing);
        reason.disabled = !missing;
        reason.required = missing;
      };
      status.addEventListener('change', update);
      update();
      docs.append(why);
      box.append(docs);
      root.append(box);
      boxes.push(box);
    }
    root.append(summary);
    function pricing() {
      const service = services.find((s) => s[0] === controls.get('gov_document_type').value);
      const count = Number(controls.get('gov_certificate_count').value);
      let declarations = 0;
      for (let i = 0; i < count; i++)
        for (const person of ['applicant', 'mother', 'father'])
          if (controls.get('gov_' + i + '_' + person + '_id_status').value === 'missing')
            declarations++;
      const unit =
        service[2] === null ? (quoteInput.value ? Number(quoteInput.value) : null) : service[2];
      return {
        unit,
        declarations,
        total: unit === null ? null : Math.round((unit * count + declarations * 20) * 100) / 100,
      };
    }
    function refresh() {
      const service = services.find((s) => s[0] === controls.get('gov_document_type').value);
      const quoted = service[2] === null;
      quote.classList.toggle('hidden', !quoted);
      quoteInput.disabled = !quoted;
      quoteInput.required = quoted;
      boxes.forEach((box, i) => {
        box.querySelector('legend').textContent = service[1] + ' · Request ' + (i + 1);
      });
      const price = pricing();
      summary.textContent =
        price.total === null
          ? 'Ask for a quote. Enter the agreed quote before saving. Declarations: BZD ' +
            price.declarations * 20
          : 'Service: BZD ' +
            (price.unit * Number(controls.get('gov_certificate_count').value)).toFixed(2) +
            ' + ' +
            price.declarations +
            ' declaration(s) × BZD 20 = BZD ' +
            price.total.toFixed(2);
      onChange();
    }
    function showCount() {
      const count = Number(controls.get('gov_certificate_count').value);
      boxes.forEach((box, i) => {
        box.classList.toggle('hidden', i >= count);
        box.disabled = i >= count;
      });
    }
    controls.get('gov_certificate_count').addEventListener('change', showCount);
    root.addEventListener('input', refresh);
    root.addEventListener('change', refresh);
    showCount();
    refresh();
    function setCategory(category) {
      active = isGovernment(category);
      root.classList.toggle('hidden', !active);
      root.disabled = !active;
      showCount();
    }
    function read() {
      if (!active) return null;
      const count = Number(controls.get('gov_certificate_count').value),
        applicants = [];
      for (let i = 0; i < count; i++) {
        const applicant = {};
        for (const key of [
          'full_name',
          'date_of_birth',
          'place_of_birth',
          'phone',
          'address',
          'town',
          'marital_status',
          'mother_name',
          'mother_status',
          'mother_reason',
          'father_name',
          'father_status',
          'father_reason',
          'documents_status',
          'documents_reason',
        ])
          applicant[key] = controls.get('gov_' + i + '_' + key).value.trim();
        for (const parent of ['mother', 'father'])
          if (applicant[parent + '_status'] === 'available') applicant[parent + '_reason'] = '';
        if (applicant.documents_status === 'available') applicant.documents_reason = '';
        for (const person of ['applicant', 'mother', 'father']) {
          for (const suffix of ['status', 'reference', 'reason'])
            applicant[person + '_id_' + suffix] = controls
              .get('gov_' + i + '_' + person + '_id_' + suffix)
              .value.trim();
          if (applicant[person + '_id_status'] === 'available')
            applicant[person + '_id_reason'] = '';
          else applicant[person + '_id_reference'] = '';
        }
        applicants.push(applicant);
      }
      return {
        version: 2,
        document_type: controls.get('gov_document_type').value,
        certificate_count: count,
        applicants,
        quote:
          services.find((s) => s[0] === controls.get('gov_document_type').value)[2] === null
            ? quoteInput.value
            : null,
        pricing: {
          currency: 'BZD',
          unit_price: pricing().unit,
          declaration_count: pricing().declarations,
          declaration_unit_price: 20,
          total: pricing().total,
        },
      };
    }
    return { setCategory, read, pricing: () => (active ? pricing() : null) };
  }
  function details(data) {
    const service = services.find((s) => s[0] === data?.document_type);
    if (!service || !Array.isArray(data.applicants)) return null;
    const section = el('section', undefined, 'pf-gov-sale-details');
    section.append(
      el(
        'h3',
        service[1] +
          ' · ' +
          data.applicants.length +
          (data.applicants.length === 1 ? ' request' : ' requests'),
      ),
    );
    if (data.pricing)
      section.append(
        el(
          'p',
          'BZD ' +
            Number(data.pricing.total).toFixed(2) +
            ' · ' +
            data.pricing.declaration_count +
            ' declaration(s) at BZD 20 each',
          'pf-gov-price',
        ),
      );
    for (const [i, a] of data.applicants.entries()) {
      const box = el('section', undefined, 'pf-gov-applicant');
      box.append(el('h4', service[1] + ' · Request ' + (i + 1)));
      const dl = el('dl', undefined, 'pf-detail');
      for (const [key, label] of [
        ['full_name', 'Full name'],
        ['date_of_birth', 'Date of birth'],
        ['place_of_birth', 'Place of birth'],
        ['phone', 'Phone'],
        ['address', 'Address'],
        ['town', 'Town / village / city'],
        ['marital_status', 'Marital status'],
        ['mother_name', 'Mother’s name'],
        ['mother_status', 'Mother’s information'],
        ['mother_reason', 'Mother’s information — reason'],
        ['father_name', 'Father’s name'],
        ['father_status', 'Father’s information'],
        ['father_reason', 'Father’s information — reason'],
        ['documents_status', 'Supporting documents'],
        ['documents_reason', 'Documents — reason'],
      ]) {
        const value = a[key];
        if (!value && key.endsWith('_reason')) continue;
        const choices =
          key === 'marital_status'
            ? marital
            : key.endsWith('_status')
              ? key === 'documents_status'
                ? [
                    ['available', 'Documents available'],
                    ['unavailable', 'Documents missing / unavailable'],
                  ]
                : parents
              : [];
        dl.append(
          el('dt', label),
          el('dd', choices.find((v) => v[0] === value)?.[1] || value || '—'),
        );
      }
      box.append(dl);
      for (const person of ['applicant', 'mother', 'father']) {
        if (!a[person + '_id_status']) continue;
        dl.append(
          el('dt', person[0].toUpperCase() + person.slice(1) + ' ID'),
          el(
            'dd',
            a[person + '_id_status'] === 'available'
              ? a[person + '_id_reference']
              : 'Declaration required (+ BZD 20): ' + a[person + '_id_reason'],
          ),
        );
      }
      section.append(box);
    }
    return section;
  }
  return { create, details, isGovernment, services };
})();
