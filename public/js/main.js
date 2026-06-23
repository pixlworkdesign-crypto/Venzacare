/* Venza Care UK — public + admin interactions */
(function () {
  'use strict';

  /* ---------- Floating CTA: reveal after scrolling past the hero ---------- */
  var cta = document.querySelector('.mobile-cta');
  if (cta) {
    var syncCta = function () {
      if (window.scrollY > 320) cta.classList.remove('is-hidden');
      else cta.classList.add('is-hidden');
    };
    cta.classList.add('is-hidden');
    syncCta();
    window.addEventListener('scroll', syncCta, { passive: true });
  }

  /* ---------- Call handling: dial on mobile, transfer-to-phone on desktop ---------- */
  var callModal = document.getElementById('callModal');
  if (callModal) {
    var numEl = document.getElementById('callModalNum');
    var qrEl = document.getElementById('callModalQr');
    var copyBtn = document.getElementById('callModalCopy');
    var closeC = document.getElementById('callModalClose');
    var isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    function openCall() {
      var tel = (numEl.getAttribute('href') || '').replace('tel:', '');
      if (qrEl) qrEl.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=' + encodeURIComponent('tel:' + tel);
      callModal.classList.add('open');
      callModal.setAttribute('aria-hidden', 'false');
    }
    function closeCall() {
      callModal.classList.remove('open');
      callModal.setAttribute('aria-hidden', 'true');
    }
    closeC && closeC.addEventListener('click', closeCall);
    callModal.addEventListener('click', function (e) { if (e.target === callModal) closeCall(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && callModal.classList.contains('open')) closeCall();
    });
    copyBtn && copyBtn.addEventListener('click', function () {
      var t = (numEl.textContent || '').trim();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(t).then(function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () { copyBtn.textContent = 'Copy number'; }, 1500);
        });
      }
    });

    // On desktop (no touch), intercept phone links and offer to transfer to a phone.
    // On mobile, leave tel: links alone so they open the dialler.
    if (!isTouch) {
      document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
        if (a.closest('.call-modal')) return;
        a.addEventListener('click', function (e) { e.preventDefault(); openCall(); });
      });
    }
  }

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('navlinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- AI chat assistant ---------- */
  var chatBtn = document.getElementById('venzaChatBtn');
  var chatPanel = document.getElementById('venzaChat');
  if (chatBtn && chatPanel) {
    var log = document.getElementById('venzaChatLog');
    var form = document.getElementById('venzaChatForm');
    var input = document.getElementById('venzaChatInput');
    var closeBtn = document.getElementById('venzaChatClose');
    var history = [];
    var greeted = false;
    var isFile = location.protocol === 'file:';

    function add(role, text) {
      var row = document.createElement('div');
      row.className = 'venza-msg venza-msg--' + role;
      row.textContent = text;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      return row;
    }

    function openChat() {
      chatPanel.classList.add('open');
      chatPanel.setAttribute('aria-hidden', 'false');
      chatBtn.setAttribute('aria-expanded', 'true');
      if (!greeted) {
        add('bot', "Hello! I'm the Venza Care assistant. Ask me about our homes, the types of care we offer, visiting, fees or our current jobs.");
        greeted = true;
      }
      setTimeout(function () { input && input.focus(); }, 50);
    }
    function closeChat() {
      chatPanel.classList.remove('open');
      chatPanel.setAttribute('aria-hidden', 'true');
      chatBtn.setAttribute('aria-expanded', 'false');
    }
    chatBtn.addEventListener('click', function () {
      chatPanel.classList.contains('open') ? closeChat() : openChat();
    });
    closeBtn && closeBtn.addEventListener('click', closeChat);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && chatPanel.classList.contains('open')) closeChat();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (input.value || '').trim();
      if (!text) return;
      add('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';

      if (isFile) {
        add('bot', 'The live assistant runs on the published website. This is a static preview, so I can’t answer here — but everything I’d use is on these pages.');
        return;
      }

      var typing = add('bot', '…');
      typing.classList.add('venza-msg--typing');

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          typing.remove();
          var msg = res.d && (res.d.reply || res.d.error) || 'Sorry, something went wrong.';
          add('bot', msg);
          if (res.ok && res.d && res.d.reply) history.push({ role: 'assistant', content: res.d.reply });
        })
        .catch(function () {
          typing.remove();
          add('bot', 'Sorry, I could not reach the assistant. Please try again, or call us.');
        });
    });
  }

  /* ---------- Home gallery lightbox ---------- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.gallery-item'));
  var lightbox = document.getElementById('lightbox');
  if (items.length && lightbox) {
    var img = lightbox.querySelector('.lightbox__img');
    var btnClose = lightbox.querySelector('.lightbox__close');
    var btnPrev = lightbox.querySelector('.lightbox__prev');
    var btnNext = lightbox.querySelector('.lightbox__next');
    var current = 0;

    function show(i) {
      current = (i + items.length) % items.length;
      img.src = items[current].getAttribute('data-full');
    }
    function open(i) {
      show(i);
      lightbox.classList.add('open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    items.forEach(function (el, i) {
      el.addEventListener('click', function () { open(i); });
    });
    btnClose && btnClose.addEventListener('click', close);
    btnPrev && btnPrev.addEventListener('click', function () { show(current - 1); });
    btnNext && btnNext.addEventListener('click', function () { show(current + 1); });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) close();
    });
    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
  }
})();
