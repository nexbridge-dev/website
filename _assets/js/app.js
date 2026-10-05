/*!
 * NexBridge v4 — site interactions
 * Classic script (no modules) so the built site also works when opened from disk.
 * Every feature is isolated: if one fails, the rest keep working and content stays visible.
 */
(function () {
  'use strict';
  window.__nxBoot = true; // tells the fail-safe in <head> that we are alive

  var d = document;
  var root = d.documentElement;
  var reduced = root.classList.contains('rm');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var hasGsap = !!(gsap && ST);
  var lenis = null;

  function safe(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.warn('[NexBridge] ' + name + ':', e); }
  }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); }
  function headerH() { return parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 72; }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  if (hasGsap) {
    safe('gsap', function () {
      gsap.registerPlugin(ST);
      if (window.SplitText) gsap.registerPlugin(window.SplitText);
      ST.config({ ignoreMobileResize: true });
    });
  }

  // ── 1 · Smooth scrolling (desktop pointers only) ─────────────────────
  safe('lenis', function () {
    if (reduced || !fine || !window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.105, smoothWheel: true, wheelMultiplier: 1, autoRaf: !hasGsap });
    if (hasGsap) {
      lenis.on('scroll', ST.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  });

  // ── 2 · Header: glass after scrolling, hides on the way down ────────
  var header = d.querySelector('[data-header]');
  safe('header', function () {
    if (!header) return;
    var lastY = window.scrollY, hidden = false, ticking = false;
    function set(h) { if (h !== hidden) { hidden = h; header.classList.toggle('is-hidden', h); } }
    function update() {
      ticking = false;
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      if (!root.classList.contains('menu-open')) {
        if (y > lastY + 6 && y > 180) set(true);
        else if (y < lastY - 6 || y <= 180) set(false);
      }
      lastY = y;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    header.addEventListener('focusin', function () { set(false); });
    update();
  });

  // ── 3 · Mobile menu ────────────────────────────────────────────────
  var closeMenu = function () {};
  safe('menu', function () {
    var burger = d.querySelector('[data-burger]');
    var menu = d.getElementById('site-menu');
    if (!burger || !menu) return;
    burger.setAttribute('role', 'button');
    var open = false;
    function focusables() { return $all('a[href], button:not([disabled])', menu); }
    function lock(on) {
      root.style.overflow = on ? 'hidden' : '';
      if (lenis) { on ? lenis.stop() : lenis.start(); }
    }
    function openMenu() {
      open = true;
      root.classList.add('menu-open');
      menu.removeAttribute('inert');
      menu.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', burger.getAttribute('data-label-close') || 'Close');
      lock(true);
      setTimeout(function () { var f = focusables()[0]; if (f) f.focus({ preventScroll: true }); }, 60);
    }
    closeMenu = function (returnFocus) {
      if (!open) return;
      open = false;
      root.classList.remove('menu-open');
      menu.setAttribute('inert', '');
      menu.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', burger.getAttribute('data-label-open') || 'Menu');
      lock(false);
      if (returnFocus) burger.focus({ preventScroll: true });
    };
    burger.addEventListener('click', function (e) {
      e.preventDefault();
      open ? closeMenu(true) : openMenu();
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) closeMenu(false);
    });
    d.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { closeMenu(true); return; }
      if (e.key === 'Tab') {
        var f = focusables(); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); burger.focus(); }
        else if (e.shiftKey && d.activeElement === first) { e.preventDefault(); burger.focus(); }
        else if (!e.shiftKey && d.activeElement === burger) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('resize', debounce(function () { if (window.innerWidth >= 1100) closeMenu(false); }, 150));
    window.addEventListener('pageshow', function (e) { if (e.persisted) closeMenu(false); });
  });

  // ── 4 · Scroll reveals (IntersectionObserver + CSS transitions) ──────
  safe('reveal', function () {
    var els = $all('[data-reveal], [data-stagger], [data-compare]');
    if (!('IntersectionObserver' in window) || reduced) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    // siblings sitting on the same row cascade in
    var groups = new Map();
    $all('[data-reveal]').forEach(function (el) {
      var p = el.parentElement; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(el);
    });
    groups.forEach(function (list) {
      if (list.length < 2) return;
      var rowTop = null, idx = 0;
      list.forEach(function (el) {
        var top = Math.round(el.getBoundingClientRect().top);
        if (rowTop !== null && Math.abs(top - rowTop) < 6) idx++; else { idx = 0; rowTop = top; }
        if (idx) el.style.setProperty('--delay', Math.min(idx, 4) * 0.09 + 's');
      });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0 });
    els.forEach(function (el) { io.observe(el); });
    // safety net: anything above the fold after load, or skipped past by a jump, is shown
    function sweep() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        if (!el.classList.contains('is-in') && el.getBoundingClientRect().top < vh) el.classList.add('is-in');
      });
    }
    window.addEventListener('load', function () { setTimeout(sweep, 300); });
    window.addEventListener('scroll', debounce(sweep, 400), { passive: true });
  });

  // ── 5 · Split-line heading reveals (GSAP SplitText) ──────────────────
  safe('split', function () {
    var heads = $all('[data-split]');
    if (!heads.length) return;
    if (reduced || !hasGsap || !window.SplitText) { heads.forEach(function (h) { h.classList.add('is-split'); }); return; }
    heads.forEach(function (el) {
      var isHero = el.getAttribute('data-split') === 'hero';
      try {
        window.SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          autoSplit: true,
          onSplit: function (self) {
            el.classList.add('is-split');
            return gsap.from(self.lines, {
              yPercent: 112,
              duration: isHero ? 1.35 : 1.15,
              ease: 'expo.out',
              stagger: isHero ? 0.11 : 0.085,
              delay: isHero ? 0.2 : 0,
              scrollTrigger: isHero ? undefined : { trigger: el, start: 'top 90%', once: true }
            });
          }
        });
      } catch (e) {
        el.classList.add('is-split');
      }
    });
    // never leave a heading hidden
    setTimeout(function () { heads.forEach(function (h) { h.classList.add('is-split'); }); }, 2500);
  });

  // ── 6 · Hero entrance + chip decode ──────────────────────────────────
  safe('hero', function () {
    var items = $all('[data-hero]');
    items.forEach(function (el, i) { el.style.setProperty('--delay', (reduced ? 0 : 0.5 + i * 0.12) + 's'); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { items.forEach(function (el) { el.classList.add('is-in'); }); }); });

    var el = d.querySelector('[data-scramble]');
    if (!el || reduced) return;
    var final = el.textContent;
    var ja = root.lang === 'ja';
    var pool = ja ? '０１２３４５６７８９＃＄％＋－＝／＜＞￥' : '01#$%+-=/<>¥ABCDEFGHJKLMNPRSTUVWXYZ';
    el.style.display = 'inline-block';
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    var start = null, dur = 1100, delayMs = 650;
    function tick(now) {
      if (start === null) start = now;
      var p = Math.min(1, Math.max(0, (now - start - delayMs) / dur));
      var n = Math.floor(p * final.length), out = '';
      for (var i = 0; i < final.length; i++) {
        var ch = final[i];
        out += i < n || ch === ' ' || ch === '　' ? ch : pool[Math.floor(Math.random() * pool.length)];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick); else { el.textContent = final; el.style.minWidth = ''; }
    }
    requestAnimationFrame(tick);
  });

  // ── 7 · Count-up for numeric stats ───────────────────────────────────
  safe('count', function () {
    if (reduced || !('IntersectionObserver' in window)) return;
    $all('[data-count]').forEach(function (el) {
      var node = el.firstChild;
      if (!node || node.nodeType !== 3) return;
      var text = node.textContent;
      if (!/\d/.test(text) || /[A-Za-z぀-ヿ一-龯]/.test(text)) return;
      var nums = text.match(/\d+(\.\d+)?/g).map(Number);
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        var t0 = performance.now(), dur = 1500;
        function step(now) {
          var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4), k = 0;
          node.textContent = text.replace(/\d+(\.\d+)?/g, function () { var v = nums[k++] * e; return String(Math.round(v)); });
          if (p < 1) requestAnimationFrame(step); else node.textContent = text;
        }
        requestAnimationFrame(step);
      }, { rootMargin: '0px 0px -10% 0px' });
      io.observe(el);
    });
  });

  // ── 8 · Pointer effects: magnetic buttons, tilt, card spotlight ─────
  safe('pointer', function () {
    if (!fine || reduced) return;
    $all('.card--glow').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
    if (!hasGsap) return;
    $all('[data-magnetic]').forEach(function (btn) {
      var xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
      var yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.32);
      });
      btn.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
    });
    $all('[data-tilt]').forEach(function (card) {
      gsap.set(card, { transformPerspective: 1200 });
      var rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      var ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        rx(-((e.clientY - r.top) / r.height - 0.5) * 5);
        ry(((e.clientX - r.left) / r.width - 0.5) * 6);
      });
      card.addEventListener('pointerleave', function () { rx(0); ry(0); });
    });
  });

  // ── 9 · Stacking module cards (desktop, only when every card fits) ──
  safe('stack', function () {
    var list = d.querySelector('[data-stack]');
    if (!list) return;
    var triggers = [];
    function evaluate() {
      triggers.forEach(function (t) { t.kill(); });
      triggers = [];
      var items = $all('.stack-cards__item', list);
      var cards = items.map(function (li) { return li.querySelector('.stack-card'); });
      if (hasGsap) gsap.set(cards, { clearProps: 'transform' });
      $all('.stack-card__shade', list).forEach(function (s) { s.style.opacity = ''; });
      var ok = !reduced && hasGsap && window.innerWidth >= 1024 && window.innerHeight >= 680;
      if (ok) {
        var avail = window.innerHeight - (headerH() + 20 + items.length * 15) - 20;
        cards.forEach(function (c) { if (c.offsetHeight > avail) ok = false; });
      }
      list.setAttribute('data-stack', ok ? 'on' : 'off');
      if (!ok) { if (hasGsap) ST.refresh(); return; }
      items.forEach(function (li, i) {
        if (i === items.length - 1) return;
        var next = items[i + 1], card = cards[i], shade = card.querySelector('.stack-card__shade');
        var topPx = headerH() + 20 + (i + 1) * 14.4;
        var tw = gsap.timeline({
          scrollTrigger: { trigger: next, start: 'top bottom', end: 'top ' + topPx + 'px', scrub: true, invalidateOnRefresh: true }
        });
        tw.to(card, { scale: 0.94 - (items.length - 2 - i) * 0.0, ease: 'none' }, 0)
          .to(shade, { opacity: 0.55, ease: 'none' }, 0);
        triggers.push(tw.scrollTrigger);
      });
      ST.refresh();
    }
    evaluate();
    window.addEventListener('resize', debounce(evaluate, 250));
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(evaluate);
  });

  // ── 10 · Security layers ↔ ring labels ───────────────────────────────
  safe('layers', function () {
    var layers = $all('[data-layers] .layer');
    if (!layers.length) return;
    var labels = $all('[data-rings] .rings__label');
    function activate(i) {
      layers.forEach(function (l, k) { l.classList.toggle('is-active', k === i); });
      labels.forEach(function (lab) { lab.classList.toggle('is-active', +lab.getAttribute('data-ring') === i); });
    }
    layers.forEach(function (l, i) { l.addEventListener('pointerenter', function () { activate(i); }); });
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) activate(layers.indexOf(en.target)); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    layers.forEach(function (l) { io.observe(l); });
  });

  // ── 11 · News: cursor-following preview (desktop) ────────────────────
  safe('newsPreview', function () {
    var box = d.querySelector('[data-news-preview]');
    if (!box || !fine || reduced) return;
    var items = $all('[data-preview-item]', box);
    var x = 0, y = 0, tx = 0, ty = 0, vis = false, raf = 0;
    function loop() {
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      var rot = Math.max(-8, Math.min(8, (tx - x) * 0.05));
      box.style.transform = 'translate3d(' + (x + 28) + 'px,' + (y - 120) + 'px,0) rotate(' + rot + 'deg) scale(' + (vis ? 1 : 0.85) + ')';
      if (vis || Math.abs(tx - x) > 0.5) raf = requestAnimationFrame(loop); else raf = 0;
    }
    $all('[data-preview]').forEach(function (link) {
      link.addEventListener('pointerenter', function (e) {
        if (window.innerWidth < 1024) return;
        var id = link.getAttribute('data-preview');
        items.forEach(function (it) { it.classList.toggle('is-active', it.getAttribute('data-preview-item') === id); });
        if (!vis) { x = tx = e.clientX; y = ty = e.clientY; }
        vis = true; box.classList.add('is-visible');
        if (!raf) raf = requestAnimationFrame(loop);
      });
      link.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; });
      link.addEventListener('pointerleave', function () { vis = false; box.classList.remove('is-visible'); if (!raf) raf = requestAnimationFrame(loop); });
    });
    window.addEventListener('scroll', function () { if (vis) { vis = false; box.classList.remove('is-visible'); } }, { passive: true });
  });

  // ── 12 · Copy to clipboard ───────────────────────────────────────────
  safe('copy', function () {
    var live = d.querySelector('[data-live]');
    function fallback(text) {
      return new Promise(function (res, rej) {
        try {
          var ta = d.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
          d.body.appendChild(ta); ta.select();
          var ok = d.execCommand('copy'); d.body.removeChild(ta);
          ok ? res() : rej();
        } catch (e) { rej(e); }
      });
    }
    function copy(text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { return fallback(text); });
      return fallback(text);
    }
    d.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!b) return;
      var text = b.getAttribute('data-copy');
      copy(text).then(function () {
        b.classList.add('is-copied');
        if (live) live.textContent = (b.getAttribute('data-copied') || 'Copied') + ': ' + text;
        setTimeout(function () { b.classList.remove('is-copied'); }, 1800);
      }, function () { window.location.href = 'mailto:' + text; });
    });
  });

  // ── 13 · Reading progress ────────────────────────────────────────────
  safe('progress', function () {
    var bar = d.querySelector('[data-progress]');
    if (!bar) return;
    var ticking = false;
    function update() {
      ticking = false;
      var max = d.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', debounce(update, 100));
    update();
  });

  // ── 14 · In-page anchors (smooth, header-aware, accessible) ──────────
  safe('anchors', function () {
    d.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href*="#"]') : null;
      if (!a || a.hasAttribute('data-burger')) return;
      var url;
      try { url = new URL(a.getAttribute('href'), window.location.href); } catch (err) { return; }
      if (url.pathname !== window.location.pathname || !url.hash) return;
      var id = decodeURIComponent(url.hash.slice(1));
      var target = id === 'top' ? d.body : d.getElementById(id);
      if (!target) return;
      e.preventDefault();
      closeMenu(false);
      var offset = -(headerH() + 12);
      if (lenis) lenis.scrollTo(id === 'top' ? 0 : target, { offset: id === 'top' ? 0 : offset, duration: 1.4 });
      else if (id === 'top') window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (id !== 'top') {
        try { history.pushState(null, '', '#' + id); } catch (err) {}
        var focusEl = target.matches('section, article, div, header, footer, main, nav, ul, ol, dl') ? target : null;
        if (focusEl) { if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1'); focusEl.focus({ preventScroll: true }); }
      }
    });
  });

  // ── 15 · Footer wordmark + misc scroll effects ───────────────────────
  safe('scrollfx', function () {
    if (!hasGsap || reduced) return;
    var mark = d.querySelector('[data-footer-mark]');
    if (mark) {
      gsap.fromTo(mark, { yPercent: 38, opacity: 0.2 }, {
        yPercent: 0, opacity: 0.9, ease: 'none',
        scrollTrigger: { trigger: mark, start: 'top bottom', end: 'bottom bottom', scrub: true }
      });
    }
    $all('[data-parallax]').forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-parallax')) || 12;
      gsap.fromTo(el, { yPercent: -amt / 2 }, { yPercent: amt / 2, ease: 'none', scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  });

  // ── 16 · Pause marquees when off screen ──────────────────────────────
  safe('marquee', function () {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) { var tr = x.target.querySelector('.marquee__track'); if (tr) tr.style.animationPlayState = x.isIntersecting ? '' : 'paused'; });
    });
    $all('.marquee').forEach(function (m) { io.observe(m); });
  });

  // ── 17 · Particle field ──────────────────────────────────────────────
  safe('particles', function () {
    var canvas = d.querySelector('canvas[data-fx]');
    if (!canvas || !window.NXParticles) {
      if (canvas) root.classList.add('no-webgl');
      return;
    }
    var start = function () {
      window.NXParticles.create(canvas, {
        mode: canvas.getAttribute('data-fx') === 'narrative' ? 'narrative' : 'hero',
        reduced: reduced,
        scene: parseFloat(canvas.getAttribute('data-fx-scene') || '0') || 0
      });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 500 });
    else setTimeout(start, 80);
  });

  // ── 18 · Keep ScrollTrigger in sync with late layout changes ─────────
  safe('refresh', function () {
    if (!hasGsap) return;
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { ST.refresh(); });
    window.addEventListener('load', function () { ST.refresh(); });
    var jp = d.querySelector('link[data-jp-font]');
    if (jp) jp.addEventListener('load', function () { setTimeout(function () { ST.refresh(); }, 400); });
  });
})();
