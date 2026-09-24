/* Venza Care staff hub — small page helpers (everything works without them) */
(function () {
  'use strict';

  // Ask before destructive actions: <form data-confirm="Are you sure?">
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // Copy buttons: <button data-copy="#inputId">
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var input = document.querySelector(btn.getAttribute('data-copy'));
    if (!input) return;
    input.select();
    var done = function () { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  });

  // "+ New post" / "+ Invite" buttons open their <details> panel.
  document.querySelectorAll('[data-open]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var d = document.getElementById(a.getAttribute('data-open'));
      if (!d) return;
      e.preventDefault();
      d.open = true;
      d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = d.querySelector('input, textarea, select');
      if (first) first.focus({ preventScroll: true });
    });
  });
  if (location.hash) { var target = document.querySelector('details' + location.hash); if (target) target.open = true; }

  // Whole company / specific homes: only show the home ticks when relevant.
  document.querySelectorAll('[data-scope]').forEach(function (group) {
    var homes = group.parentElement.querySelector('[data-homes]');
    if (!homes) return;
    function sync() {
      var some = group.querySelector('input[value="some"]');
      homes.hidden = !(some && some.checked);
    }
    group.addEventListener('change', sync);
    sync();
  });

  // Access level picker fills in the per-area choices.
  var preset = document.getElementById('preset');
  if (preset && preset.dataset.presets) {
    var presets = JSON.parse(preset.dataset.presets);
    preset.addEventListener('change', function () {
      var p = presets[preset.value];
      if (!p) return;
      Object.keys(p).forEach(function (area) {
        var r = document.querySelector('input[name="perm_' + area + '"][value="' + p[area] + '"]');
        if (r) r.checked = true;
      });
    });
  }

  // Type-the-name-to-confirm: enable the button only when it matches.
  var match = document.querySelector('[data-match]');
  var go = document.querySelector('[data-enable-on-match]');
  if (match && go) {
    var want = match.getAttribute('data-match').trim().toLowerCase();
    var check = function () { go.disabled = match.value.trim().toLowerCase() !== want; };
    match.addEventListener('input', check);
    check();
  }

  // Phone layout: the menu button opens and closes the side menu.
  var toggle = document.querySelector('.hub-menu');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('hub-nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
})();
