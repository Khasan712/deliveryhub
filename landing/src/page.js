(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = reduceMotion.matches;
  const stages = [];  // the scroll-driven stages (see the end): the sticky "Ariza qoldirish" bar keeps out of them
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
  const IMG = { osh: '{{img:osh}}', shashlik: '{{img:shashlik}}', somsa: '{{img:somsa}}', choy: '{{img:choy}}' };
  const PRICES = { osh: 45000, shashlik: 22000, somsa: 12000, choy: 8000 };

  /* The words of the script, in the language of the page (build.mjs puts them in #i18n). The site has one
     language per address (/ and /ru); the preview artifact carries both and switches in place. */
  const I18N = JSON.parse($('#i18n').textContent);
  let lang = I18N.lang;
  let T = I18N.strings[lang];
  const sum = (n) => fill(T.money, { n: money(n) });
  const plural = (n, forms) => forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;
  const onLanguage = [];
  // The preview switches language in place: keep the Uzbek of the template before anything below renders into it.
  const original = I18N.markup ? new Map($$('[data-t]').map((el) => [el, el.innerHTML])) : null;
  const originalAttrs = I18N.markup ? new Map($$('[data-t-attr]').map((el) => [el, el.dataset.tAttr.split(',').map(
    (pair) => el.getAttribute(pair.split(':')[0]))])) : null;

  /* nav border */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* gentle entrance, only for what starts below the first screen */
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.rv, #versus').forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('armed'); io.observe(el); }
    });
  }

  /* problem: the chat grows step by step */
  const P = { step: 5, played: false, run: 0, shown: { t: 360, m: 9 } };
  const pMsgs = $$('#pchat [data-s]');
  const pSteps = $$('.pstep');
  const SECONDS = [0, 45, 120, 180, 285, 360];
  const COUNTS = [0, 2, 5, 7, 8, 9];
  const ptime = $('#ptime');
  const pmsgs = $('#pmsgs');
  const preplay = $('#preplay');
  const pchat = $('#pchat');
  const pcap = $('.pcap');
  const clock = (seconds) => {
    const whole = Math.round(seconds);  // round first: 359.6 s is 06:00, not 05:60
    return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
  };
  function countTo(t, m, instant) {
    const from = { ...P.shown };
    const start = performance.now();
    const run = ++P.run;
    const frame = (now) => {
      if (run !== P.run) return;
      const k = instant ? 1 : Math.min(1, (now - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      P.shown = { t: from.t + (t - from.t) * e, m: from.m + (m - from.m) * e };
      ptime.textContent = clock(P.shown.t);
      pmsgs.textContent = Math.round(P.shown.m);
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function showStep(n, instant) {
    P.step = n;
    pMsgs.forEach((m) => m.classList.toggle('shown', +m.dataset.s <= n));
    pSteps.forEach((b, i) => {
      b.classList.toggle('done', i + 1 < n);
      b.classList.toggle('active', i + 1 === n);
      if (i + 1 === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    countTo(SECONDS[n], COUNTS[n], instant);
    requestAnimationFrame(() => pchat.scrollTo({ top: pchat.scrollHeight, behavior: instant || reduce ? 'auto' : 'smooth' }));
    // The step it is on, over the phone, when one column has no room for the list beside it.
    const active = pSteps[n - 1];
    pcap.querySelector('.num').textContent = n;
    pcap.querySelector('b').innerHTML = active.querySelector('b').innerHTML;
    pcap.querySelector('small').innerHTML = active.querySelector('small').innerHTML;
    if (!instant) { pcap.classList.remove('swap'); void pcap.offsetWidth; pcap.classList.add('swap'); }
  }
  let playing = false;
  async function playProblem() {
    playing = true; P.played = true; preplay.hidden = true;
    for (let n = 1; n <= 5 && playing; n++) {
      showStep(n, n === 1 && P.step === 1);
      await wait(2600);
    }
    playing = false; preplay.hidden = false;
  }
  pSteps.forEach((b) => b.addEventListener('click', () => {
    if (P.scroll) { problemStage.scrollTo(+b.dataset.step - 1); return; }  // the page's scroll is the player there
    playing = false; showStep(+b.dataset.step); preplay.hidden = false;
  }));
  preplay.addEventListener('click', () => { P.shown = { t: 0, m: 0 }; showStep(1, true); playProblem(); });
  if (reduce || !('IntersectionObserver' in window)) {
    showStep(5, true);
    preplay.hidden = false;
  } else {
    P.shown = { t: 0, m: 0 };
    showStep(1, true);
    const pio = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !P.played && !P.scroll) { pio.disconnect(); playProblem(); }
    }, { threshold: 0.45 });
    pio.observe($('#problem'));
  }

  /* calculator */
  const cOrders = $('#cOrders');
  const cMinutes = $('#cMinutes');
  const decimal = (x) => (Math.round(x * 10) / 10).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-Latn-UZ');
  function calc() {
    const orders = +cOrders.value;
    const minutes = +cMinutes.value;
    const perDay = orders * minutes;
    $('#oOrders').textContent = fill(T.calc.orders, { n: orders });
    $('#oMinutes').textContent = fill(T.calc.minutes, { n: minutes });
    if (perDay < 60) {
      $('#cNum').textContent = perDay;
      $('#cUnit').textContent = plural(perDay, T.calc.minuteWords);
    } else {
      const hours = Math.round(perDay / 6) / 10;
      $('#cNum').textContent = decimal(hours);
      $('#cUnit').textContent = plural(hours, T.calc.hourWords);
    }
    const month = Math.round(perDay * 30 / 60);
    const days = Math.max(1, Math.round(month / 8));
    $('#cMonth').innerHTML = fill(T.calc.month, {
      hours: month, hourWord: plural(month, T.calc.hourWords), days, dayWord: plural(days, T.calc.dayWords),
    });
  }
  cOrders.addEventListener('input', calc);
  cMinutes.addEventListener('input', calc);
  calc();
  onLanguage.push(calc);

  /* the turn: words light up while the question scrolls by */
  const turnQ = $('#turnQ');
  let words = [];
  function splitWords() {
    words = [];
    (function split(node) {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const w = document.createElement('span');
            w.className = 'w'; w.textContent = part; words.push(w); frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) split(child);
      });
    })(turnQ);
    turnQ.classList.add('split');
    light();
  }
  function light() {
    if (reduce) return;
    const r = turnQ.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (r.height + vh * 0.35)));
    const lit = Math.round(p * words.length * 1.15);
    words.forEach((w, i) => w.style.setProperty('--o', i < lit ? 1 : 0.2));
  }
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; light(); }); }
  }, { passive: true });
  splitWords();
  onLanguage.push(splitWords);

  /* waveform */
  const H = [30, 55, 80, 45, 95, 70, 40, 85, 60, 100, 50, 75, 35, 90, 65, 45, 80, 55, 30, 70, 50, 85, 40, 60];
  $('#wave').innerHTML = H.map((h, k) => `<i style="--h:${h};--k:${k}"></i>`).join('');

  /* brand swatches */
  const brandv = $('#brandv');
  $$('.swatches button').forEach((b) => b.addEventListener('click', () => {
    $$('.swatches button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    brandv.style.setProperty('--b', b.style.getPropertyValue('--s'));
    brandv.style.setProperty('--bi', b.dataset.ink);
  }));

  /* the language sample of a menu line */
  $$('[data-lang-sample]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-lang-sample]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $$('.lrow [data-uz]').forEach((el) => { el.textContent = el.dataset[b.dataset.langSample]; });
  }));

  /* ------------------------------------------------------------------
     Try it: the shop on the customer's phone and the staff bot, one order
     ------------------------------------------------------------------ */
  const PRODUCT_IDS = ['osh', 'shashlik', 'somsa', 'choy'];
  const products = () => PRODUCT_IDS.map((id) => ({ id, price: PRICES[id], ...T.demo.products[id] }));
  const TIMES = { accepted: '19:43', on_the_way: '19:58', completed: '20:21', rejected: '19:43' };

  const demo = $('#demo');
  const shopMain = $('#shopMain');
  const staffBody = $('#staffBody');
  const bannerSlot = $('#bannerSlot');
  const toastSlot = $('#toastSlot');
  const mirror = $('#mirror');
  const hint = $('#dhint');
  const ddone = $('#ddone');
  const tabClient = $('#tabClient');
  const tabStaff = $('#tabStaff');
  const paneClient = $('#paneClient');
  const paneStaff = $('#paneStaff');
  const playBtn = $('#dplay');
  const narrow = window.matchMedia('(max-width: 899px)');

  let D;
  let bannerTimer;
  let toastTimer;

  const items = () => products().filter((p) => D.cart[p.id]).map((p) => ({ ...p, q: D.cart[p.id] }));
  const count = () => Object.values(D.cart).reduce((a, b) => a + b, 0);
  const total = () => items().reduce((s, p) => s + p.q * p.price, 0);

  function rowHTML(p) {
    const q = D.cart[p.id] || 0;
    const a = T.demo.aria;
    const ctl = q
      ? `<span class="stepper"><button type="button" data-act="dec" data-id="${p.id}" aria-label="${fill(a.dec, p)}">−</button><output>${q}</output><button type="button" data-act="inc" data-id="${p.id}" aria-label="${fill(a.inc, p)}">+</button></span>`
      : `<button type="button" class="add" data-act="inc" data-id="${p.id}" aria-label="${fill(a.add, p)}">+</button>`;
    return `<div class="prow"><div><b>${p.name}</b><small>${p.desc}</small><div class="pfoot"><span class="price">${sum(p.price)}</span>${ctl}</div></div><img src="${IMG[p.id]}" alt="" width="72" height="72"></div>`;
  }

  function orderHTML() {
    const st = D.status;
    const o = T.demo.order;
    const at = { new: 0, accepted: 0, on_the_way: 1, completed: 2 }[st];
    const steps = o.steps.map((label, i) => {
      const cls = st === 'rejected' ? '' : i < at || (i === at && st === 'completed') ? 'on' : i === at ? 'on now' : '';
      return `<div class="${cls}"><i></i>${label}</div>`;
    }).join('');
    const lines = items().map((p) => `<div><span>${p.name} × ${p.q}</span><b>${money(p.q * p.price)}</b></div>`).join('');
    return `<div class="order">
      <div class="ohead"><b>${o.title}</b><small><i></i>${o.live}</small></div>
      ${st === 'rejected' ? '' : `<div class="otrack">${steps}</div>`}
      <div class="ostatus${st === 'rejected' ? ' bad' : ''}">${T.demo.statusText[st]}</div>
      <div class="olines">${lines}<div class="tot"><span>${o.total}</span><span>${sum(total())}</span></div></div>
    </div>`;
  }

  function sheetHTML() {
    const c = T.demo.sheet;
    return `<button type="button" class="dim" data-act="back" aria-label="${c.close}" tabindex="-1"></button>
    <div class="sheet" role="dialog" aria-label="${c.title}">
      <span class="grab"></span>
      <div class="sheet-h"><b>${c.title}</b><button type="button" class="x" data-act="back" aria-label="${c.close}">✕</button></div>
      <div class="seg2"><span class="on">${c.delivery}</span><span>${c.pickup}</span></div>
      <div class="minimap"><span class="pin"></span></div>
      <div class="kv"><span>${c.address}</span><b>${c.addressValue}</b></div>
      <div class="kv"><span>${c.name}</span><b>Dilshod</b></div>
      <div class="kv"><span>${c.phone}</span><b>+998 90 123 45 67</b></div>
      <div class="seg2"><span class="on">${c.cash}</span><span>${c.card}</span></div>
      <button type="button" class="shopcta" data-act="place">${fill(c.place, { total: sum(total()) })}</button>
    </div>`;
  }

  function renderShop(enterBar) {
    if (D.phase === 'placed') { shopMain.innerHTML = orderHTML(); return; }
    const n = count();
    let html = `<div class="schips">${T.demo.chips.map((c, i) => `<span${i ? '' : ' class="on"'}>${c}</span>`).join('')}</div>
      <div class="slist">${products().map(rowHTML).join('')}</div>`;
    if (n) html += `<button type="button" class="cartbar${enterBar ? ' enter' : ''}" data-act="checkout"><span class="cn">${n}</span>${T.demo.cart}<span class="ct">${sum(total())}</span></button>`;
    if (D.phase === 'checkout') html += sheetHTML();
    const list = shopMain.querySelector('.slist');
    const keep = list ? list.scrollTop : 0;
    shopMain.innerHTML = html;
    const fresh = shopMain.querySelector('.slist');
    if (fresh) fresh.scrollTop = keep;
  }

  function cardText() {
    const st = D.status;
    const c = T.demo.card;
    const status = st === 'new' ? c.statusNew : fill(c.by, { status: c.status[st], time: TIMES[st] });
    return [
      st === 'new' ? c.titleNew : c.title, c.meta, '',
      ...items().map((p) => `• ${p.name} × ${p.q} — ${money(p.q * p.price)}`), '',
      c.who, c.place, c.how, '',
      fill(c.total, { total: sum(total()) }), status,
    ].join('\n');
  }

  function keyboardHTML() {
    const k = T.demo.buttons;
    const b = (act, label) => `<button type="button" data-act="${act}">${label}</button>`;
    const row = (...bs) => `<div class="ikb-row">${bs.join('')}</div>`;
    if (D.confirm) return row(b('reject', k.rejectYes), b('keep', k.back));
    if (D.status === 'new') return row(b('accept', k.accept), b('ask', k.reject));
    if (D.status === 'accepted') return row(b('go', k.go), b('done', k.done)) + row(b('ask', k.cancel));
    if (D.status === 'on_the_way') return row(b('done', k.done)) + row(b('ask', k.cancel));
    return '';
  }

  function renderStaff(freshCard) {
    let html = `<div class="tmsg">${T.demo.staffHint}<time>19:30</time></div>`;
    if (D.status) html += `<div class="tmsg${freshCard ? ' fresh' : ''}">${cardText()}<time>19:42</time></div><div class="ikb${freshCard ? ' fresh' : ''}">${keyboardHTML()}</div>`;
    staffBody.innerHTML = html;
    staffBody.scrollTop = staffBody.scrollHeight;
  }

  function stage() {
    if (D.phase === 'shop') return 1;
    if (D.phase === 'checkout') return 2;
    return { new: 3, accepted: 4, on_the_way: 5, completed: 6, rejected: 4 }[D.status];
  }

  function renderSteps() {
    const s = stage();
    $$('#dsteps li').forEach((li, i) => {
      const n = i + 1;
      const ok = D.status === 'rejected' ? n <= 2 : n < s;
      li.classList.toggle('ok', ok);
      li.classList.toggle('on', !ok && n === s && D.status !== 'rejected');
      li.querySelector('.n').textContent = ok ? '✓' : n;
      if (!ok && n === s) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const key = D.confirm ? 'confirm' : D.phase === 'shop' ? (count() ? 'cart' : 'empty') : D.phase === 'checkout' ? 'checkout' : D.status;
    if (!D.auto && !D.scroll) hint.textContent = T.demo.hint[key];  // a played demo says who pressed what instead
    ddone.hidden = D.status !== 'completed';
    $('#ddTaps').textContent = D.taps;
  }

  function setTab(which) {
    D.tab = which;
    const client = which === 'client';
    tabClient.setAttribute('aria-selected', String(client));
    tabStaff.setAttribute('aria-selected', String(!client));
    paneClient.toggleAttribute('data-off', !client);
    paneStaff.toggleAttribute('data-off', client);
    (client ? tabClient : tabStaff).querySelector('.dot')?.remove();
    if (!client) staffBody.scrollTop = staffBody.scrollHeight;  // a chat opens at its newest message
  }
  function flag(tab) {
    if (!narrow.matches || D.tab === tab) return;
    const el = tab === 'client' ? tabClient : tabStaff;
    if (!el.querySelector('.dot')) el.insertAdjacentHTML('beforeend', '<span class="dot" aria-hidden="true"></span>');
  }

  function notifyClient(kind) {
    clearTimeout(bannerTimer);
    const b = T.demo.banner;
    bannerSlot.innerHTML = `<div class="banner" role="status"><span class="tgi"><svg><use href="#plane"/></svg></span><div><small><span>${b.app}</span><span>${b.now}</span></small><b>Navro‘z Choyxona</b><p>${T.demo.botText[kind]}</p></div></div>`;
    bannerTimer = setTimeout(() => {
      const el = bannerSlot.firstElementChild;
      if (!el) return;
      el.classList.add('out');
      bannerTimer = setTimeout(() => { bannerSlot.innerHTML = ''; }, 350);
    }, 3600);
    mirror.textContent = kind === 'new' ? '' : fill(T.demo.mirror, { text: T.demo.botText[kind] });
    flag('client');
  }

  function toast(text) {
    clearTimeout(toastTimer);
    toastSlot.innerHTML = `<div class="toast">${text}</div>`;
    toastTimer = setTimeout(() => { toastSlot.innerHTML = ''; }, 1300);
  }

  function packet(dir, text) {
    const el = dir === 'r' ? $('#pkR') : $('#pkL');
    el.textContent = text;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  function act(a, id, quiet = false) {
    const before = count();
    switch (a) {
      case 'inc':
        D.cart[id] = (D.cart[id] || 0) + 1;
        renderShop(before === 0);
        break;
      case 'dec':
        D.cart[id] = (D.cart[id] || 0) - 1;
        if (D.cart[id] <= 0) delete D.cart[id];
        renderShop(false);
        break;
      case 'checkout':
        D.phase = 'checkout';
        renderShop(false);
        break;
      case 'back':
        D.phase = 'shop';
        renderShop(false);
        break;
      case 'place':
        D.phase = 'placed';
        D.status = 'new';
        renderShop(false);
        renderStaff(true);
        if (quiet) break;
        notifyClient('new');
        packet('r', T.demo.packet.order);
        flag('staff');
        if (narrow.matches && !D.auto && !D.scroll) setTimeout(() => { if (D.status === 'new' && D.tab === 'client') setTab('staff'); }, 1500);
        break;
      case 'ask':
        D.taps++; D.confirm = true; renderStaff(false);
        break;
      case 'keep':
        D.taps++; D.confirm = false; renderStaff(false);
        break;
      case 'accept': case 'go': case 'done': case 'reject': {
        const next = { accept: 'accepted', go: 'on_the_way', done: 'completed', reject: 'rejected' }[a];
        D.taps++;
        D.confirm = false;
        D.status = next;
        renderStaff(false);
        renderShop(false);
        if (quiet) break;
        toast(T.demo.saved);
        notifyClient(next);
        packet('l', T.demo.packet[next]);
        if (next === 'completed' && narrow.matches && !D.scroll) setTimeout(() => { if (D.status === 'completed') setTab('client'); }, 1400);
        break;
      }
    }
    renderSteps();
  }

  function reset() {
    D = { cart: {}, phase: 'shop', status: null, confirm: false, taps: 0, tab: 'client', auto: false, scroll: D?.scroll ?? false };
    clearTimeout(bannerTimer);
    bannerSlot.innerHTML = '';
    toastSlot.innerHTML = '';
    mirror.textContent = '';
    renderShop(false);
    renderStaff(false);
    renderSteps();
    setTab('client');
    $$('.dtabs .dot').forEach((d) => d.remove());
    playBtn.textContent = T.demo.play;
  }

  demo.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !demo.contains(el)) return;
    if (D.auto) stopAuto();
    act(el.dataset.act, el.dataset.id);
  });
  tabClient.addEventListener('click', () => setTab('client'));
  tabStaff.addEventListener('click', () => setTab('staff'));
  $('#dreset').addEventListener('click', () => { stopAuto(); reset(); });

  /* The played demo — by the page's scroll, or by "▶ O‘zi ko‘rsatsin": one state of the order at a time. Moving one
     state on, a touch comes to each button, presses it and says whose finger it is (Mijoz / Xodim); then the button
     does what it does. A jump (a fast scroll, going back) puts the state in place quietly. */
  const STORY = [[], [['inc', 'osh']], [['inc', 'osh'], ['inc', 'choy']], [['checkout']], [['place']], [['accept']], [['go']], [['done']]];
  const STAFF_MOVES = ['accept', 'go', 'done', 'ask', 'reject', 'keep'];
  const touch = $('#touch');
  const whoOf = (a) => (STAFF_MOVES.includes(a) ? 'staff' : 'client');
  const targetOf = (a, id) => $$(id ? `[data-act="${a}"][data-id="${id}"]` : `[data-act="${a}"]`, whoOf(a) === 'staff' ? paneStaff : paneClient).pop();
  function pressLabel(a) {
    const b = T.demo.buttons;
    return { inc: '+', checkout: T.demo.cart, place: T.demo.sheet.place.split(' · ')[0], accept: b.accept, go: b.go, done: b.done }[a];
  }
  /** Under the steps: whose finger and which buttons — shown as the touch sets off — and, once pressed, what they
      did. Nothing before the first press. */
  function caption(k, pressed = true) {
    const moves = STORY[k];
    if (!moves.length) { hint.textContent = ''; return; }
    const who = whoOf(moves[0][0]);
    hint.innerHTML = `<span class="who ${who}">${T.demo.who[who]}</span> ${T.demo.pressed}: ` +
      moves.map(([a]) => `<span class="press">${pressLabel(a)}</span>`).join(' ') +
      ` <span class="result${pressed ? '' : ' wait'}">${T.demo.result[k]}</span>`;
    hint.classList.remove('played'); void hint.offsetWidth; hint.classList.add('played');
  }
  function hideTouch() {
    touch.classList.remove('on', 'press');
    paneClient.classList.remove('acting');
    paneStaff.classList.remove('acting');
  }
  /** A list or a chat in a phone scrolls the button into sight first (not the page). */
  async function reveal(el) {
    const box = el.closest('.slist, .tg-body');
    if (!box) return;
    const cover = box.matches('.slist') ? 84 : 0;  // the cart bar covers the bottom of the shop's list
    const br = box.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top >= br.top && er.bottom <= br.bottom - cover) return;
    const by = er.top < br.top ? er.top - br.top - 24 : er.bottom - br.bottom + cover + 12;
    box.scrollTo({ top: box.scrollTop + by, behavior: reduce ? 'auto' : 'smooth' });
    await wait(320);
  }
  /** The touch comes to the button and presses it; false when something newer took over meanwhile. */
  async function tap(a, id, run) {
    const who = whoOf(a);
    if (narrow.matches) setTab(who);
    const el = targetOf(a, id);
    if (!el) return run === storyRun;
    await reveal(el);
    if (run !== storyRun) return false;
    const box = demo.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const first = !touch.classList.contains('on');
    // A new touch appears at the button; a following one glides over to it.
    touch.className = `touch on ${who}${first ? ' jump' : ''}`;
    touch.style.setProperty('--x', `${Math.round(r.left + r.width / 2 - box.left)}px`);
    touch.style.setProperty('--y', `${Math.round(r.top + r.height / 2 - box.top)}px`);
    touch.querySelector('.touch-who').textContent = T.demo.who[who];
    paneClient.classList.toggle('acting', who === 'client');
    paneStaff.classList.toggle('acting', who === 'staff');
    await wait(first ? 380 : 480);
    if (run !== storyRun) return false;
    touch.classList.remove('jump');
    touch.classList.add('press');
    el.classList.add('tap');  // the button goes down under the touch, then does what it does
    setTimeout(() => el.classList.remove('tap'), 500);
    await wait(260);
    return run === storyRun;
  }

  let storyAt = -1;
  let storyRun = 0;
  let inflight = null;  // the state being shown and its presses still to come
  /** Finishes a state being shown at once (quietly), so a newer one starts from a whole state. */
  function flush() {
    if (!inflight) return;
    inflight.moves.forEach(([a, id]) => act(a, id, true));
    storyAt = inflight.k;
    inflight = null;
  }
  /** After a state: what it did in the caption, and the screen to look at on a phone. */
  function settle(k, run, pressed = false) {
    if (pressed) hint.querySelector('.result')?.classList.remove('wait'); else caption(k);
    setTimeout(() => { if (run === storyRun) hideTouch(); }, 700);
    if (!narrow.matches) return;
    // The order goes to the staff after the customer's press; the customer sees "delivered" after the staff's.
    const tab = k >= 4 && k <= 6 ? 'staff' : 'client';
    if (D.tab === tab) return;
    setTimeout(() => { if (run === storyRun) setTab(tab); }, k === 4 || k === 7 ? 900 : 0);
  }
  async function story(k, animate = true) {
    const run = ++storyRun;
    flush();
    if (storyAt < 0 || k < storyAt) { reset(); storyAt = 0; hideTouch(); }
    if (k !== storyAt + 1 || !animate) {
      while (storyAt < k) {
        storyAt += 1;
        STORY[storyAt].forEach(([a, id]) => act(a, id, true));
      }
      hideTouch();
      settle(k, run);
      return;
    }
    inflight = { k, moves: [...STORY[k]] };
    caption(k, false);
    while (inflight && inflight.moves.length) {
      const [a, id] = inflight.moves[0];
      if (!(await tap(a, id, run)) || !inflight || run !== storyRun) return;
      inflight.moves.shift();
      act(a, id, inflight.moves.length > 0);  // the last press of a state brings its message, toast and arrow
    }
    if (run !== storyRun) return;
    storyAt = k;
    inflight = null;
    settle(k, run, true);
  }

  function stopAuto() {
    D.auto = false;
    storyRun += 1;  // a state being shown stops where it is: from here on the visitor presses
    inflight = null;
    hideTouch();
    playBtn.textContent = T.demo.play;
    if (!D.scroll) renderSteps();  // the hint for pressing by hand again
  }
  async function autoplay() {
    reset();
    storyAt = 0;
    D.auto = true;
    const mine = D;
    playBtn.textContent = T.demo.stop;
    for (let k = 1; k < STORY.length; k += 1) {
      await wait(k === 1 ? 300 : 1100);
      if (!mine.auto || D !== mine) return;
      await story(k);
      if (!mine.auto || D !== mine) return;
    }
    mine.auto = false;
    playBtn.textContent = T.demo.play;
  }
  playBtn.addEventListener('click', () => { if (D.auto) stopAuto(); else autoplay(); });
  narrow.addEventListener?.('change', () => setTab(D.tab));
  reset();

  /* ------------------------------------------------------------------
     The application: POST /api/v1/leads on this host (docs/api.md, "Applications")
     ------------------------------------------------------------------ */
  const form = $('#leadForm');
  const done = $('#leadDone');
  const send = $('#leadSend');
  const status = $('#leadStatus');
  const nameInput = $('#leadName');
  const phoneInput = $('#leadPhone');
  const FIELDS = { name: [nameInput, $('#leadNameErr')], phone: [phoneInput, $('#leadPhoneErr')] };

  /** +998 90 123 45 67 while typing; the server takes any spacing, this only reads well. */
  function formatPhone(value) {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('998')) digits = digits.slice(3);
    digits = digits.slice(0, 9);
    const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
    return digits ? `+998 ${parts.join(' ')}` : '';
  }
  phoneInput.addEventListener('input', () => {
    const at = phoneInput.selectionStart === phoneInput.value.length;
    phoneInput.value = formatPhone(phoneInput.value);
    if (at) phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
    showError('phone', '');
  });
  phoneInput.addEventListener('focus', () => { if (!phoneInput.value) phoneInput.value = '+998 '; });
  phoneInput.addEventListener('blur', () => { if (phoneInput.value.trim() === '+998') phoneInput.value = ''; });
  nameInput.addEventListener('input', () => showError('name', ''));

  function showError(field, text) {
    const [input, error] = FIELDS[field];
    error.textContent = text;
    error.hidden = !text;
    input.setAttribute('aria-invalid', String(Boolean(text)));
  }
  function check() {
    const errors = {};
    if (!nameInput.value.trim()) errors.name = T.form.nameRequired;
    if (phoneInput.value.replace(/\D/g, '').replace(/^998/, '').length !== 9) errors.phone = T.form.phoneInvalid;
    Object.keys(FIELDS).forEach((field) => showError(field, errors[field] || ''));
    const first = Object.keys(FIELDS).find((field) => errors[field]);
    if (first) FIELDS[first][0].focus();
    return !first;
  }
  function setSending(on) {
    send.disabled = on;
    send.textContent = on ? T.form.sending : T.form.send;
  }
  function finish() {
    form.hidden = true;
    done.hidden = false;
    $('#leadPreview').hidden = !I18N.preview;
    done.focus({ preventScroll: true });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    if (!check()) return;
    const data = new FormData(form);
    const body = {
      name: nameInput.value.trim(), phone: phoneInput.value, business: String(data.get('business') || '').trim(),
      kind: String(data.get('kind') || ''), comment: String(data.get('comment') || '').trim(), lang,
      website: String(data.get('website') || ''),
    };
    if (I18N.preview) { finish(); return; }  // the preview artifact: there is no server behind it
    setSending(true);
    try {
      const response = await fetch('/api/v1/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
      });
      if (response.ok) { finish(); return; }
      const answer = await response.json().catch(() => ({}));
      if (answer.error === 'validation' && answer.fields) {
        if (answer.fields.name) showError('name', T.form.nameRequired);
        if (answer.fields.phone) showError('phone', T.form.phoneInvalid);
        if (answer.fields.name || answer.fields.phone) return;
      }
      status.textContent = response.status === 429 ? T.form.tooMany : T.form.failed;
      status.hidden = false;
    } catch {
      status.textContent = T.form.failed;
      status.hidden = false;
    } finally {
      setSending(false);
    }
  });

  /* The live sample shop, chosen in our panel (GET /api/v1/landing/config): none chosen → no link at all. */
  function showSample(sample) {
    const note = $('#sampleNote');
    const shop = $('#sampleShop');
    note.hidden = !sample;
    shop.hidden = !sample;
    if (!sample) return;
    const link = $('#sampleLink');
    link.href = sample.url;
    shop.href = sample.url;
    link.textContent = new URL(sample.url).host;
    link.title = sample.name;
  }
  if (I18N.preview) {
    showSample(I18N.sample ?? null);
  } else {
    fetch('/api/v1/landing/config', { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => showSample(config?.sample ?? null))
      .catch(() => showSample(null));
  }

  /* the "Ariza qoldirish" bar on phones: after the first screen, until the form is in view; never over a pinned stage */
  const sticky = $('#stickyCta');
  const seen = { hero: true, form: false };
  const updateSticky = () => sticky.classList.toggle('on', !seen.hero && !seen.form && !stages.some((stage) => stage.pinned()));
  if ('IntersectionObserver' in window) {
    const sio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { seen[e.target === $('.hero') ? 'hero' : 'form'] = e.isIntersecting; });
      updateSticky();
    });
    sio.observe($('.hero'));
    sio.observe($('#ariza'));
  }

  /* theme: light until the visitor switches to dark (kept in localStorage; build.mjs applies it before paint) */
  const root = document.documentElement;
  const themeToggle = $('#themeToggle');
  const darkDevice = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : darkDevice.matches);
  function showTheme() {
    themeToggle.setAttribute('aria-pressed', String(isDark()));
    $$('meta[name="theme-color"]').forEach((meta) => { meta.content = isDark() ? '#0E0F11' : '#F6F5F2'; });
  }
  themeToggle.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('dh-theme', root.dataset.theme); } catch { /* the page works without it */ }
    showTheme();
  });
  darkDevice.addEventListener?.('change', showTheme);
  showTheme();

  /* ------------------------------------------------------------------
     Scroll-driven stages: while the page scrolls through a .scrolly wrapper, its stage stays in place
     (position: sticky — the page's own scroll, nothing is hijacked) and each stretch of scroll is one step; scrolling
     back goes back. Only when the stage fits the screen and motion is welcome: with "reduce motion", on a screen too
     short for the stage (a phone on its side) or without the script, the parts work as before.
     ------------------------------------------------------------------ */
  const MIN_ZOOM = 0.66;  // a phone any smaller and its text no longer reads: the stage is not pinned then
  const PHONE = 640;  // a phone's full height (.phone: up to 320px wide, 1:2); a smaller one may be narrower than its column
  function scrollStage(wrapper, { steps, onMode, onStep }) {
    const pin = wrapper.querySelector('.scrolly-pin');
    const stage = { on: false, step: -1, progress: 0, hidesNav: false };
    const pinTop = () => parseFloat(wrapper.style.getPropertyValue('--pin-top')) || 80;
    const distance = () => wrapper.offsetHeight - pin.offsetHeight;
    stage.layout = () => {
      let on = false;
      stage.hidesNav = false;
      if (!reduceMotion.matches) {
        // Measure the stage as it would be pinned, then fit it into the screen. Its phone keeps a phone's shape and only
        // gets smaller as a whole; where the menu would make it much smaller, the menu steps aside while the stage is
        // pinned (a phone, a low laptop screen).
        wrapper.classList.add('on');
        wrapper.classList.remove('compact');
        wrapper.style.removeProperty('--phone-zoom');
        const phone = [...pin.querySelectorAll('.phone')].find((each) => each.offsetParent !== null);
        const natural = phone.offsetHeight;
        const rest = pin.offsetHeight - natural;
        const navH = nav.getBoundingClientRect().height;
        // Shrunk, a phone takes its full width again (its width is a share of its column), so it is scaled from that.
        const zoomFor = (fits) => (fits - rest >= natural ? 1 : (fits - rest) / PHONE);
        let fits = window.innerHeight - navH - 24;
        if (zoomFor(fits) < 0.92) {
          fits = window.innerHeight - 24;
          stage.hidesNav = true;
        }
        const zoom = zoomFor(fits);
        if (zoom >= MIN_ZOOM) {
          if (zoom < 1) wrapper.style.setProperty('--phone-zoom', zoom.toFixed(3));
          on = pin.offsetHeight <= fits + 1;  // the whole stage, the list beside the phone too
          if (!on) {
            wrapper.classList.add('compact');  // only the step it is on keeps its text
            on = pin.offsetHeight <= fits + 1;
          }
        }
        if (on) {
          const above = stage.hidesNav ? 0 : navH;
          const top = above + Math.max(12, (window.innerHeight - above - pin.offsetHeight) / 2);
          wrapper.style.setProperty('--pin-top', `${Math.round(top)}px`);
        } else {
          stage.hidesNav = false;
          wrapper.classList.remove('on', 'compact');
          wrapper.style.removeProperty('--phone-zoom');
        }
      }
      if (on !== stage.on) { stage.on = on; stage.step = -1; onMode(on); }
      stage.update();
    };
    stage.update = () => {
      if (!stage.on) { stage.progress = 0; return; }
      const passed = pinTop() - wrapper.getBoundingClientRect().top;
      stage.progress = Math.min(1, Math.max(0, passed / distance()));
      const step = Math.min(steps - 1, Math.floor(stage.progress * steps));
      if (step !== stage.step) { stage.step = step; onStep(step); }
    };
    stage.pinned = () => stage.on && stage.progress > 0 && stage.progress < 1;
    stage.scrollTo = (step) => {
      const y = window.scrollY + wrapper.getBoundingClientRect().top - pinTop() + ((step + 0.5) / steps) * distance();
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    };
    stages.push(stage);
    return stage;
  }

  const problemStage = scrollStage($('#problemScroll'), {
    steps: 5,
    onMode(on) {
      P.scroll = on;
      if (on) { playing = false; preplay.hidden = true; }
      else { showStep(5, true); preplay.hidden = false; }
    },
    onStep: (step) => showStep(step + 1),
  });
  const demoStage = scrollStage($('#demoScroll'), {
    steps: STORY.length,
    onMode(on) {
      stopAuto();
      D.scroll = on;
      $('#sinab').classList.toggle('mode-scroll', on);
      $('.stage', demo).inert = on;  // the scroll plays it: nothing to press in the phones
      storyAt = -1;
      reset();
    },
    onStep: story,
  });
  onLanguage.push(() => {
    if (demoStage.on) { storyAt = -1; story(Math.max(0, demoStage.step)); } else { stopAuto(); reset(); }
  });

  // The menu steps aside while a stage that needs the whole screen is pinned.
  const updateNav = () => nav.classList.toggle('away', stages.some((stage) => stage.hidesNav && stage.pinned()));
  let frame = 0;
  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; stages.forEach((stage) => stage.update()); updateSticky(); updateNav(); });
  }, { passive: true });
  // A phone's address bar coming and going changes the height a little on every scroll: only a real change re-fits.
  let size = [window.innerWidth, window.innerHeight];
  let resizeTimer;
  const refit = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const [w, h] = [window.innerWidth, window.innerHeight];
      if (w === size[0] && Math.abs(h - size[1]) < 120) return;
      size = [w, h];
      stages.forEach((stage) => stage.layout());
      updateNav();
    }, 150);
  };
  window.addEventListener('resize', refit);
  window.screen?.orientation?.addEventListener?.('change', refit);  // a phone turned on its side
  const relayout = () => { stages.forEach((stage) => stage.layout()); updateNav(); };
  reduceMotion.addEventListener?.('change', relayout);
  relayout();
  document.fonts?.ready.then(relayout);

  /* language: links between / and /ru on the site; the preview artifact switches in place */
  function markLanguage() {
    $$('.langs [data-lang]').forEach((a) => a.setAttribute('aria-current', String(a.dataset.lang === lang)));
  }
  markLanguage();
  if (I18N.markup) {
    const apply = (next) => {
      lang = next;
      T = I18N.strings[next];
      document.documentElement.lang = next;
      original.forEach((uz, el) => { el.innerHTML = next === 'uz' ? uz : I18N.markup[el.dataset.t] ?? uz; });
      originalAttrs.forEach((uz, el) => {
        el.dataset.tAttr.split(',').forEach((pair, i) => {
          const [attr, key] = pair.split(':');
          el.setAttribute(attr, next === 'uz' ? uz[i] : I18N.attrs[key] ?? uz[i]);
        });
      });
      send.textContent = T.form.send;
      showStep(P.step, true);
      onLanguage.forEach((run) => run());
      markLanguage();
      try { localStorage.setItem('dh-lang', next); } catch { /* the page works without it */ }
    };
    $$('.langs [data-lang]').forEach((a) => a.addEventListener('click', (event) => {
      event.preventDefault();
      if (a.dataset.lang !== lang) apply(a.dataset.lang);
    }));
    let saved = null;
    try { saved = localStorage.getItem('dh-lang'); } catch { /* private window */ }
    const wanted = window.location.hash === '#ru' ? 'ru' : saved;
    if (wanted && wanted !== lang && I18N.strings[wanted]) apply(wanted);
  }
})();
