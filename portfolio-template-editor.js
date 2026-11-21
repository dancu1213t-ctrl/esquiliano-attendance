window.PortfolioTemplateEditor = (() => {
  'use strict';
  const el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const field = (label, name, value, rows) => {
    const l = el('label', label),
      n = el(rows ? 'textarea' : 'input');
    n.name = name;
    n.value = value || '';
    if (rows) n.rows = rows;
    l.append(n);
    return l;
  };
  function normalizeBlanks(text, section) {
    let i = 0;
    return text.replace(/_{3,}/g, () => {
      let token;
      do {
        token = '{{' + section + '_blank_' + ++i + '}}';
      } while (text.includes(token));
      return token;
    });
  }
  async function open(category, onSaved) {
    const owner = currentProfile()?.id,
      client = clientForProfile();
    if (currentProfile()?.role !== 'admin') return;
    const same = () => currentProfile()?.id === owner;
    const d = el('dialog');
    d.className = 'pf-dialog pf-template-editor';
    d.setAttribute('aria-label', 'Edit contract template');
    d.setAttribute('data-pf-template-dialog', '');
    document.body.append(d);
    d.append(el('h2', category.name + ' contract template'));
    const error = el('p');
    error.className = 'error';
    error.setAttribute('role', 'alert');
    d.append(error);
    d.showModal();
    try {
      const template = check(
        await client
          .from('pf_contract_templates')
          .select('*')
          .eq('category_id', category.id)
          .maybeSingle(),
      );
      if (!same()) {
        d.close();
        return;
      }
      const form = el('form');
      const title = field(
          'Contract title',
          'title',
          template?.title || category.name + ' service agreement',
        ),
        header = field(
          'Header',
          'header_text',
          template?.header_text ?? 'ESQUILIANO\nCONSULTING & BOOKKEEPING',
          4,
        ),
        body = field('Contract body', 'body', template?.body, 14),
        footer = field('Footer', 'footer_text', template?.footer_text ?? '', 4);
      title.querySelector('input').required = true;
      title.querySelector('input').maxLength = 150;
      header.querySelector('textarea').maxLength = 4000;
      body.querySelector('textarea').maxLength = 12000;
      body.querySelector('textarea').required = true;
      footer.querySelector('textarea').maxLength = 4000;
      const help = el(
        'p',
        'Edit all wording here, including the header and footer. Insert a blank anywhere using {{field_name}}, or type an underscore line (____). Every blank becomes editable on the contract.',
      );
      help.className = 'muted';
      form.append(help, title, header, body, footer);
      const tools = el('div');
      tools.className = 'pf-template-blank-tools';
      const name = field('New blank name', 'new_blank_name', ''),
        target = field('Place blank in', 'blank_target', '');
      const choice = el('select');
      for (const [value, label] of [
        ['header_text', 'Header'],
        ['body', 'Body'],
        ['footer_text', 'Footer'],
      ]) {
        const o = el('option', label);
        o.value = value;
        choice.append(o);
      }
      choice.value = 'body';
      target.querySelector('input').replaceWith(choice);
      const add = el('button', 'Insert blank');
      add.type = 'button';
      add.className = 'secondary';
      add.onclick = () => {
        const key = name
          .querySelector('input')
          .value.trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, '_');
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || ['constructor', 'prototype'].includes(key)) {
          error.textContent =
            'Use a blank name starting with a letter, such as customer_reference.';
          return;
        }
        const input = form.elements.namedItem(choice.value);
        input.value += (input.value ? ' ' : '') + '{{' + key + '}}';
        error.textContent = '';
        input.focus();
      };
      tools.append(name, target, add);
      form.append(tools);
      const hints = el('details');
      hints.append(el('summary', 'Customer and sale details'));
      hints.append(
        el(
          'p',
          'These blanks start with details from the sale and remain editable: {{customer_name}}, {{business}}, {{email}}, {{phone}}, {{service}}, {{amount}}, {{contract_date}}, {{sale_date}}, {{staff_name}} and {{payment_method}}. Use {{start_date}} and {{end_date}} for dates. Repeating a blank name keeps its values in sync.',
        ),
      );
      form.append(hints);
      const actions = el('div');
      actions.className = 'pf-actions';
      const cancel = el('button', 'Cancel');
      cancel.type = 'button';
      cancel.className = 'secondary';
      cancel.onclick = () => d.close();
      const save = el('button', 'Save template');
      save.type = 'submit';
      save.className = 'primary';
      actions.append(cancel, save);
      form.append(actions);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!same() || save.disabled) return;
        const data = Object.fromEntries(new FormData(form));
        for (const section of ['header_text', 'body', 'footer_text'])
          data[section] = normalizeBlanks(data[section], section);
        delete data.new_blank_name;
        const keys = new Set(
          [
            ...data.header_text.matchAll(/{{([a-z][a-z0-9_]{0,63})}}/g),
            ...data.body.matchAll(/{{([a-z][a-z0-9_]{0,63})}}/g),
            ...data.footer_text.matchAll(/{{([a-z][a-z0-9_]{0,63})}}/g),
          ].map((m) => m[1]),
        );
        if (keys.size > 100) {
          error.textContent = 'Use no more than 100 distinct blanks per contract.';
          return;
        }
        save.disabled = cancel.disabled = true;
        try {
          check(await client.rpc('pf_template_save_v2', { category: category.id, data }));
          if (same()) {
            d.close();
            toast('Contract header, body and footer saved');
            onSaved?.();
          }
        } catch (e) {
          if (same()) error.textContent = e.message;
        } finally {
          save.disabled = cancel.disabled = false;
        }
      };
      d.append(form);
    } catch (e) {
      error.textContent = e.message;
      const close = el('button', 'Close');
      close.type = 'button';
      close.onclick = () => d.close();
      d.append(close);
    }
    d.addEventListener('close', () => d.remove(), { once: true });
  }
  return { open, normalizeBlanks };
})();
