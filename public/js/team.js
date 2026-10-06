/* Meet the team page: role filter menu and the reviews row. */
(function () {
  'use strict';
  if (document.getElementById('fmenu')) (function () {
  // ---------- Role filter menu ----------
  var fwrap = document.getElementById('fmenu'), fbtn = document.getElementById('fbtn'), flist = document.getElementById('fmenu-list');
  var fclear = document.getElementById('fclear'), flabel = document.getElementById('fbtn-label');
  var items = Array.prototype.slice.call(flist.querySelectorAll('[role="menuitemradio"]'));
  var cards = document.querySelectorAll('#team-grid > li[data-dept]');
  var status = document.getElementById('grid-status');
  function openMenu(focusIdx) {
    flist.hidden = false; fbtn.setAttribute('aria-expanded', 'true');
    var idx = typeof focusIdx === 'number' ? focusIdx : items.findIndex(function (b) { return b.getAttribute('aria-checked') === 'true'; });
    items[(idx + items.length) % items.length].focus();
  }
  function closeMenu(refocus) {
    if (flist.hidden) return;
    flist.hidden = true; fbtn.setAttribute('aria-expanded', 'false');
    if (refocus) fbtn.focus();
  }
  function applyFilter(f) {
    var shown = 0, item = items.filter(function (b) { return b.getAttribute('data-filter') === f; })[0];
    var name = item.textContent.replace(/\d+/g, '').trim();
    items.forEach(function (b) { b.setAttribute('aria-checked', b === item ? 'true' : 'false'); });
    cards.forEach(function (c) {
      var match = f === 'all' || c.getAttribute('data-dept') === f;
      c.hidden = !match; c.classList.remove('is-in');
      if (match) { void c.offsetWidth; c.classList.add('is-in'); shown++; }
    });
    var active = f !== 'all';
    fwrap.classList.toggle('is-active', active);
    fclear.hidden = !active;
    flabel.textContent = active ? 'Filter: ' + name : 'Filter by role';
    status.textContent = 'Showing ' + (active ? shown + ' in ' + name : 'all ' + shown + ' team members');
  }
  fbtn.addEventListener('click', function () { if (flist.hidden) openMenu(); else closeMenu(false); });
  fbtn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(e.key === 'ArrowUp' ? items.length - 1 : undefined); }
  });
  fclear.addEventListener('click', function () { applyFilter('all'); fbtn.focus(); });
  items.forEach(function (b, i) {
    b.addEventListener('click', function () { applyFilter(b.getAttribute('data-filter')); closeMenu(true); });
    b.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (k === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (k === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (k === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (k === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (k === 'Tab') { closeMenu(false); }
    });
  });
  document.addEventListener('click', function (e) { if (!fwrap.contains(e.target)) closeMenu(false); });

  })();

  // ---------- Review carousels ----------
  document.querySelectorAll('.rv-wrap').forEach(function (w) {
    var row = w.querySelector('.rv-row'), prev = w.querySelector('.rv-btn--prev'), next = w.querySelector('.rv-btn--next');
    function step() { var c = row.querySelector('.rv-card'); return c ? c.getBoundingClientRect().width + 16 : 300; }
    function update() {
      prev.disabled = row.scrollLeft < 8;
      next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
    }
    next.addEventListener('click', function () { row.scrollBy({ left: step(), behavior: 'smooth' }); });
    prev.addEventListener('click', function () { row.scrollBy({ left: -step(), behavior: 'smooth' }); });
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    new MutationObserver(update).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    update();
  });

})();
