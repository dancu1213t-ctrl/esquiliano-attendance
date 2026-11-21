window.PortfolioSignaturePad = (() => {
  'use strict';

  function attach(canvas, onInk) {
    const ctx = canvas.getContext('2d');
    let pointer = null;
    let last = null;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#19382f';
    canvas.style.touchAction = 'none';

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) * canvas.width) / rect.width,
        ((event.clientY - rect.top) * canvas.height) / rect.height,
      ];
    }

    function draw(event) {
      const next = point(event);
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(...next);
      ctx.stroke();
      last = next;
      onInk();
    }

    function finish(event) {
      if (pointer !== event.pointerId) return;
      if (event.type === 'pointerup') draw(event);
      const previous = pointer;
      pointer = null;
      last = null;
      if (canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
    }

    canvas.onpointerdown = (event) => {
      if (pointer !== null || event.isPrimary === false || event.button !== 0) return;
      event.preventDefault();
      pointer = event.pointerId;
      last = point(event);
      canvas.setPointerCapture(pointer);
      ctx.beginPath();
      ctx.arc(...last, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      onInk();
    };
    canvas.onpointermove = (event) => {
      if (pointer !== event.pointerId) return;
      event.preventDefault();
      const points = event.getCoalescedEvents?.() || [];
      for (const sample of points.length ? points : [event]) draw(sample);
    };
    canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = finish;
  }

  function lockBackground(dialog) {
    const x = window.scrollX;
    const y = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const bodyStyle = body.getAttribute('style');
    const htmlStyle = html.getAttribute('style');
    const gap = window.innerWidth - html.clientWidth;
    body.style.position = 'fixed';
    body.style.top = -y + 'px';
    body.style.left = -x + 'px';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = gap + 'px';
    html.style.overflow = 'hidden';
    let released = false;
    function release() {
      if (released) return;
      released = true;
      if (bodyStyle === null) body.removeAttribute('style');
      else body.setAttribute('style', bodyStyle);
      if (htmlStyle === null) html.removeAttribute('style');
      else html.setAttribute('style', htmlStyle);
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    }
    dialog.addEventListener('close', release, { once: true });
    return release;
  }

  return { attach, lockBackground };
})();
