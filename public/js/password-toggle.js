/* Venza Care — adds a "Show" button to every password box so people can check what they've typed */
(function () {
  'use strict';
  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    if (input.closest('.pw-wrap')) return;
    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    if (input.id) btn.setAttribute('aria-controls', input.id);
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
    });

    // Never submit (or let the browser remember) the password as plain text.
    if (input.form) input.form.addEventListener('submit', function () { input.type = 'password'; });
  });
})();
