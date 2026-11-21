/* Audio routes reflect browser-supported outputs; mobile routing stays with the OS. */
window.LoopAudio = (() => {
  let sink = '',
    media,
    root,
    trigger,
    list,
    version = 0,
    open = false;
  const make = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  const glyphs = {
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
    speaker: '<path d="m11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  };
  function icon(key) {
    const n = make('span');
    n.className = 'loop-audio-glyph';
    n.setAttribute('aria-hidden', 'true');
    n.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      glyphs[key] +
      '</svg>';
    return n;
  }
  const kind = (label) =>
    /bluetooth|airpods|buds|headset|headphones/i.test(label) ? 'bluetooth' : 'speaker';
  async function choose(id, label, type) {
    const v = version;
    try {
      await media.setSinkId(id);
      if (v !== version) return;
      sink = id;
      trigger.replaceChildren(icon(type), make('span', label));
      open = false;
      root.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    } catch {
      if (v === version)
        list.replaceChildren(
          make(
            'p',
            'This output could not be selected. Check that it is connected, then try again.',
          ),
        );
    }
  }
  function option(id, label, type) {
    const b = make('button');
    b.type = 'button';
    b.className = 'loop-audio-option';
    b.setAttribute('aria-pressed', String(id === sink));
    const text = make('span', label);
    b.append(icon(type), text);
    if (id === sink) b.append(make('span', '✓'));
    b.onclick = () => choose(id, label, type);
    return b;
  }
  async function refresh() {
    const v = ++version;
    list.replaceChildren();
    if (typeof media.setSinkId !== 'function') {
      const categories = make('div');
      categories.className = 'loop-audio-types';
      for (const [key, label] of [
        ['phone', 'Phone'],
        ['speaker', 'Speaker'],
        ['bluetooth', 'Bluetooth'],
      ]) {
        const item = make('span');
        item.append(icon(key), make('small', label));
        categories.append(item);
      }
      list.append(
        categories,
        make(
          'p',
          'Audio follows your device. Use your phone’s audio controls to choose speaker or connected earphones.',
        ),
      );
      return;
    }
    list.append(option('', 'System default', 'phone'));
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (v !== version) return;
      if (!sink) {
        const current = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === 'default');
        if (current?.label)
          trigger.replaceChildren(
            icon(kind(current.label)),
            make('span', current.label.replace(/^Default - /i, '')),
          );
      }
      for (const d of devices.filter(
        (d) =>
          d.kind === 'audiooutput' &&
          d.deviceId &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications',
      ))
        list.append(option(d.deviceId, d.label || 'Audio output', kind(d.label)));
    } catch {
      if (v === version) list.append(make('p', 'Available outputs could not be listed.'));
    }
    if (v !== version) return;
    if (navigator.mediaDevices.selectAudioOutput) {
      const b = make('button', 'Choose another device…');
      b.type = 'button';
      b.className = 'loop-audio-option';
      b.onclick = async () => {
        try {
          const selected = await navigator.mediaDevices.selectAudioOutput();
          if (v === version)
            await choose(
              selected.deviceId,
              selected.label || 'Selected device',
              kind(selected.label),
            );
        } catch (e) {
          if (v === version && e.name !== 'NotAllowedError')
            list.append(make('p', 'Connect your earphones and try again.'));
        }
      };
      list.append(b);
    }
  }
  function mount(audio, button, panel) {
    media = audio;
    trigger = button;
    root = panel;
    list = make('div');
    root.append(list);
    root.hidden = true;
    trigger.append(icon('speaker'), make('span', 'Audio · System default'));
    trigger.setAttribute('aria-expanded', 'false');
    trigger.onclick = () => {
      open = !open;
      root.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) refresh();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      if (open) refresh();
    });
  }
  function reset() {
    version++;
    open = false;
    if (root) root.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
  }
  return { mount, reset, refresh };
})();
