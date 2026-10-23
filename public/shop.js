// The customer page: menu, cart, checkout with M-Pesa Till, then the order goes to every admin and to WhatsApp.
(() => {
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let items = [], settings = null, group = "All", query = "";
  // Cart lines: { key, id, qty, choices: { "Size": ["Large"] } }. Prices always come from the menu.
  let cart = store.get("tb_cart", []);
  const byId = id => items.find(i => i.id === id);
  const isOpen = () => settings && settings.state.open;

  // ---------- prices ----------
  function unitPrice(it, choices) {
    let p = it.price;
    for (const g of it.options) for (const c of g.choices) if ((choices[g.name] || []).includes(c.name)) p += c.price;
    return p;
  }
  const lineText = (it, choices) => it.options.flatMap(g => (choices[g.name] || [])).join(", ");
  function cartLines() {
    return cart.map(l => ({ ...l, item: byId(l.id) })).filter(l => l.item)
      .map(l => ({ ...l, unit: unitPrice(l.item, l.choices), extra: lineText(l.item, l.choices) }));
  }
  const foodTotal = () => cartLines().reduce((a, l) => a + l.unit * l.qty, 0);
  // Big orders: items above the number included add a little to the delivery (the shop works it out the same way)
  const itemCount = () => cartLines().reduce((a, l) => a + l.qty, 0);
  const bigFee = n => settings.bigOn ? Math.max(0, n - settings.bigIncluded) * settings.bigPerItem : 0;
  const tooBig = n => settings.maxItems && n > settings.maxItems;
  const bigText = n => `Big order: ${n} items (${settings.bigIncluded} included in the delivery), + ${money(bigFee(n))}`;
  const tooBigText = n => `That is a big order (${n} items). The most we can take online is ${settings.maxItems}. Please call or WhatsApp us on ${settings.whatsapp} and we will arrange it.`;
  function saveCart() {
    store.set("tb_cart", cart);
    const lines = cartLines(), n = lines.reduce((a, l) => a + l.qty, 0);
    $("#cartCount").textContent = n;
    $("#cartCount").classList.toggle("hidden", !n);
    $("#cartBar").classList.toggle("hidden", !n);
    $("#cartBarCount").textContent = `View cart (${n} item${n === 1 ? "" : "s"})`;
    $("#cartBarTotal").textContent = money(foodTotal());
  }

  // ---------- menu ----------
  function foodCard(it) {
    const tag = !it.available ? `<span class="tag out">Finished for today</span>` : it.deal ? `<span class="tag deal">Hot Deal</span>` : it.oldPrice ? `<span class="tag">Offer</span>` : "";
    return `<article class="food${it.available ? "" : " off"}" data-id="${esc(it.id)}">
      <div class="ph">${it.image ? `<img src="${esc(it.image)}" alt="${esc(it.name)}" loading="lazy">` : `<span class="none">${esc(it.name.slice(0, 1))}</span>`}${tag}
        ${it.oldPrice && it.available ? `<span class="off-pct">-${pctOff(it)}%</span>` : ""}${photoDots(it)}</div>
      <div class="body"><h3>${esc(it.name)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ""}
        ${it.available && it.orderedToday ? `<span class="buzz">${it.orderedToday} ordered today</span>` : ""}
        <div class="foot"><span class="price">${money(it.price)}${it.oldPrice ? `<s>${money(it.oldPrice)}</s>` : ""}</span>
        <button class="add" aria-label="Add ${esc(it.name)}" ${it.available ? "" : "disabled"}>+</button></div>
      </div></article>`;
  }
  function renderMenu() {
    const groups = settings.categories.filter(c => items.some(i => i.category === c));
    for (const i of items) if (!groups.includes(i.category)) groups.push(i.category);
    $("#chips").innerHTML = ["All", ...groups].map(g => `<button class="chip${g === group ? " on" : ""}" data-g="${esc(g)}">${esc(g)}</button>`).join("");
    const q = query.trim().toLowerCase();
    const shown = items.filter(i => (group === "All" || i.category === group) && (!q || (i.name + " " + i.description + " " + i.category).toLowerCase().includes(q)));
    if (!shown.length) {
      $("#menu").innerHTML = `<p class="empty">${items.length ? "No food matches your search." : "The menu is being prepared. Please check again soon."}</p>`;
      return;
    }
    // Foods still available come first in every group
    $("#menu").innerHTML = groups.filter(g => shown.some(i => i.category === g)).map(g =>
      `<h2 class="group-title">${esc(g)}</h2><div class="grid">${shown.filter(i => i.category === g)
        .sort((a, b) => b.available - a.available).map(foodCard).join("")}</div>`).join("");
  }
  function renderShop() {
    $("#logo").innerHTML = logoHtml(settings);
    $("#notice").textContent = settings.notice;
    $("#notice").classList.toggle("hidden", !settings.notice);
    const pill = $("#openPill");
    pill.className = "pill " + (isOpen() ? "open" : "closed");
    pill.textContent = isOpen() ? "Open" : "Closed";
    $("#closedBar").textContent = settings.state.text + (!isOpen() && laterSlots().length ? " You can still order for later." : "");
    $("#closedBar").classList.toggle("hidden", isOpen());
    $("#busyBar").textContent = `We are very busy right now. Delivery may take ${settings.busyTime}. Thank you for your patience.`;
    $("#busyBar").classList.toggle("hidden", !(isOpen() && settings.busy));
    $("#dTime").textContent = settings.deliveryTime ? `Delivery in about ${settings.deliveryTime}.` : "";
    renderDeals();
    renderHeroVis();
    renderMenu();
    saveCart();
    const mine = store.get("tb_orders", []).filter(o => Date.now() - o.at < 3 * 864e5);
    renderFoot();
    $("#myOrders").innerHTML = mine.length ? "Your recent orders: " + mine.map(o => `<a href="/t/${esc(o.token)}">${esc(o.no)}</a>`).join(", ") : "";
  }

  // ---------- contact strip at the bottom ----------
  function renderFoot() {
    const t = v => { const [h, m] = v.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
    const tel = settings.whatsapp;
    $("#siteFoot").innerHTML = `<div class="foot-in">
      <div class="foot-brand">${settings.logo ? `<span class="foot-logo">${logoHtml(settings)}</span>` : `<span class="foot-full">${FULL_LOGO}</span>`}
        <p>Fast food from Wote's best hotels, delivered to your door. Pay on M-Pesa Till ${esc(settings.till)}.</p></div>
      <div class="foot-col"><h4>Contact us</h4>
        <a class="btn wa small" target="_blank" rel="noopener" href="${esc(waLink(tel, "Hello Tuye Bites, "))}">WhatsApp ${esc(tel)}</a>
        <a class="btn light small" href="tel:${esc(tel)}">Call ${esc(tel)}</a></div>
      <div class="foot-col"><h4>When and where</h4>
        <p>${settings.mode === "closed" ? "Closed for now" : settings.mode === "open" ? "Open now" : `Every day, ${t(settings.open)} to ${t(settings.close)}`}</p>
        <p>Delivering in Wote town: ${settings.deliveryAreas.map(a => esc(a.name)).join(", ")}</p></div>
      </div>
      <div class="foot-bottom"><a href="/policy.html">Privacy and refunds</a><span>Tuye Bites, Wote</span></div>`;
  }

  // ---------- Hot Deals: like a flash sale, every food with its own price, time and stock ----------
  const pctOff = it => Math.round((1 - it.price / it.oldPrice) * 100);
  const photoDots = it => (it.images || []).length > 1 ? `<span class="pdots">${it.images.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</span>` : "";
  const two = n => String(n).padStart(2, "0");
  // "01h : 23m : 45s" (or "2d 04h : 10m" when more than a day)
  function clockLeft(t) {
    const x = timeLeft(t);
    return x.d ? `${x.d}d ${two(x.h)}h : ${two(x.m)}m` : `${two(x.h)}h : ${two(x.m)}m : ${two(x.s)}s`;
  }
  // Short form for the small cards: "00:49:45" or "2d 04:10"
  function clockShort(t) {
    const x = timeLeft(t);
    return x.d ? `${x.d}d ${two(x.h)}:${two(x.m)}` : `${two(x.h)}:${two(x.m)}:${two(x.s)}`;
  }
  function dealCard(d) {
    const it = byId(d.id);
    if (!it) return "";
    const normal = it.deal ? it.oldPrice : it.price, pct = Math.round((1 - d.price / normal) * 100);
    const soldOut = d.started && d.left === 0, soon = !d.started;
    const bar = d.qty ? `<div class="stock"><span>${soldOut ? "Sold out" : `${d.left} left`}</span><div><i style="width:${Math.max(4, Math.round((d.left / d.qty) * 100))}%"></i></div></div>` : "";
    return `<article class="food flash-card${soldOut ? " sold" : ""}${soon ? " soon" : ""}${it.available ? "" : " off"}" data-id="${esc(it.id)}">
      <div class="ph">${it.image ? `<img src="${esc(it.image)}" alt="${esc(it.name)}" loading="lazy">` : `<span class="none">${esc(it.name.slice(0, 1))}</span>`}
        <span class="off-pct">-${pct}%</span>${soldOut ? `<span class="sold-tag">SOLD OUT</span>` : ""}${photoDots(it)}</div>
      <div class="body"><h3>${esc(it.name)}</h3>
        <div class="flash-price"><b>${money(d.price)}</b><s>${money(normal)}</s></div>
        ${soon ? `<div class="timer soon-t">Starts ${esc(startText(d.start))}</div>`
          : soldOut ? "" : `<div class="timer" data-end="${d.end}">Ends in <b>${clockShort(d.end)}</b></div>`}
        ${soon ? "" : bar}
        ${soon || soldOut || !it.available ? "" : `<button class="btn green small grab">Add to cart</button>`}
      </div></article>`;
  }
  function startText(t) {
    const d = new Date(t + 3 * 36e5), h = d.getUTCHours(), m = two(d.getUTCMinutes());
    const day = d.toISOString().slice(0, 10), today = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
    return `${day === today ? "today" : "tomorrow"} at ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  }
  function renderDeals() {
    const all = (settings.deals || []).filter(d => byId(d.id));
    // Running deals first (ending soonest first), sold-out ones last, then the ones coming up
    const now = all.filter(d => d.started).sort((a, b) => (a.left === 0) - (b.left === 0) || a.end - b.end), soon = all.filter(d => !d.started);
    const box = $("#deals");
    box.classList.toggle("hidden", !all.length);
    if (!all.length) return;
    // The header counts down to the first deal that ends
    const firstEnd = now.filter(d => d.left !== 0).map(d => d.end).sort((a, b) => a - b)[0];
    box.innerHTML = `<div class="flash-head"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#E7A545" d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>
        <h2>${esc(settings.deal.title || "Hot Deals")}</h2>
        ${firstEnd ? `<span class="tl">Time left: <b data-end="${firstEnd}">${clockLeft(firstEnd)}</b></span>` : `<span class="tl">Coming soon</span>`}</div>
      ${now.length ? `<div class="flash-grid">${now.map(dealCard).join("")}</div>` : ""}
      ${soon.length ? `<h3 class="soon-title">Coming up</h3><div class="flash-grid">${soon.map(dealCard).join("")}</div>` : ""}`;
  }
  // ---------- the space beside the welcome words ----------
  // Own picture (if switched on) > Hot Deals one after the other > best food photos > the logo
  let heroTimer = null, heroIndex = 0;
  function renderHeroVis() {
    const box = $("#heroVis");
    clearInterval(heroTimer);
    if (settings.heroOn && settings.hero) {
      box.className = "hero-vis own";
      box.innerHTML = `<img src="${esc(settings.hero)}" alt="Tuye Bites">`;
      return;
    }
    const live = (settings.deals || []).filter(d => d.started && d.left !== 0).map(d => ({ d, it: byId(d.id) })).filter(x => x.it && x.it.available);
    if (live.length) {
      heroIndex %= live.length;
      box.className = "hero-vis show";
      box.innerHTML = live.map(({ d, it }, i) => {
        const normal = it.deal ? it.oldPrice : it.price;
        return `<div class="hv-slide${i === heroIndex ? " on" : ""}" data-id="${esc(it.id)}">
          ${it.image ? `<img src="${esc(it.image)}" alt="${esc(it.name)}">` : `<span class="none">${esc(it.name.slice(0, 1))}</span>`}
          <span class="off-pct big">-${Math.round((1 - d.price / normal) * 100)}%</span>
          <div class="hv-cap"><small>HOT DEAL</small><b>${esc(it.name)}</b>
            <span class="hv-price"><em>${money(d.price)}</em><s>${money(normal)}</s></span>
            <span class="hv-t">Ends in <b data-end="${d.end}">${clockLeft(d.end)}</b></span></div></div>`;
      }).join("") + (live.length > 1 ? `<div class="hv-dots">${live.map((_, i) => `<i data-i="${i}" class="${i === heroIndex ? "on" : ""}"></i>`).join("")}</div>` : "");
      if (live.length > 1) heroTimer = setInterval(() => showSlide(heroIndex + 1), 4000);
      return;
    }
    // The foods ordered most today, with photos
    const foods = items.filter(i => i.available && i.image).sort((a, b) => (b.orderedToday || 0) - (a.orderedToday || 0)).slice(0, 3);
    if (foods.length) {
      box.className = "hero-vis stack n" + foods.length;
      box.innerHTML = foods.map((it, i) => `<div class="hv-card c${i}" data-id="${esc(it.id)}"><img src="${esc(it.image)}" alt="${esc(it.name)}">
        <div><b>${esc(it.name)}</b><span>${money(it.price)}</span></div></div>`).join("");
      return;
    }
    box.className = "hero-vis logo";
    box.innerHTML = settings.logo ? `<div class="hv-logo">${logoHtml(settings)}</div>` : `<div class="hv-full">${FULL_LOGO}</div>`;
  }
  function showSlide(i) {
    const slides = $$("#heroVis .hv-slide");
    if (!slides.length) return;
    heroIndex = (i + slides.length) % slides.length;
    slides.forEach((x, j) => x.classList.toggle("on", j === heroIndex));
    $$("#heroVis .hv-dots i").forEach((x, j) => x.classList.toggle("on", j === heroIndex));
  }
  $("#heroVis").addEventListener("click", e => {
    const dot = e.target.closest("[data-i]");
    if (dot) {
      clearInterval(heroTimer); showSlide(Number(dot.dataset.i));
      heroTimer = setInterval(() => showSlide(heroIndex + 1), 4000);
      return;
    }
    const card = e.target.closest("[data-id]"), it = card && byId(card.dataset.id);
    if (it && it.available) openFood(it);
  });

  // Every second: move the timers; when a deal starts or ends, load the menu again so prices change at once
  function tickDeals() {
    const now = Date.now();
    if ((settings && settings.deals || []).some(d => (!d.started && d.start <= now) || d.end <= now)) { settings.deals = []; load(); return; }
    $$("#deals [data-end], #heroVis [data-end]").forEach(el => {
      const t = Number(el.dataset.end);
      if (el.tagName === "B") el.textContent = clockLeft(t); else el.innerHTML = `Ends in <b>${clockShort(t)}</b>`;
    });
  }
  setInterval(tickDeals, 1000);

  // ---------- sheets ----------
  // A pop-up may set "leaveCheck": it runs before the pop-up closes and can stop it (checkout asks first)
  let leaveCheck = null;
  function sheet(html) {
    leaveCheck = null;
    $("#sheets").innerHTML = `<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.style.overflow = "hidden";
    const bg = $("#sheets .sheet-bg");
    bg.addEventListener("click", e => { if (e.target === bg || e.target.closest(".x")) tryClose(); });
    return $("#sheets .sheet");
  }
  function closeSheet() { leaveCheck = null; $("#sheets").innerHTML = ""; document.body.style.overflow = ""; }
  function tryClose() { if (!leaveCheck || leaveCheck()) closeSheet(); }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#sheets").innerHTML) tryClose(); });

  // Photos: swipe on a phone, arrows and small pictures on a computer
  function galleryHtml(it) {
    const imgs = it.images && it.images.length ? it.images : it.image ? [it.image] : [];
    if (!imgs.length) return "";
    const arrow = d => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    return `<div class="gallery"><div class="slides" id="slides">${imgs.map((u, i) => `<img src="${esc(u)}" alt="${esc(it.name)} photo ${i + 1}"${i ? ' loading="lazy"' : ""}>`).join("")}</div>
      ${imgs.length > 1 ? `<button type="button" class="gnav prev" aria-label="Previous photo">${arrow("M15 5l-7 7 7 7")}</button>
        <button type="button" class="gnav next" aria-label="Next photo">${arrow("M9 5l7 7-7 7")}</button>
        <span class="gcount" id="gcount">1 / ${imgs.length}</span>` : ""}
      ${it.deal && it.oldPrice ? `<span class="off-pct big">-${pctOff(it)}%</span>` : ""}</div>
      ${imgs.length > 1 ? `<div class="gthumbs">${imgs.map((u, i) => `<button type="button" data-g="${i}" class="${i ? "" : "on"}"><img src="${esc(u)}" alt=""></button>`).join("")}</div>` : ""}`;
  }
  function wireGallery(el) {
    const slides = $("#slides", el);
    if (!slides || slides.children.length < 2) return;
    const n = slides.children.length;
    const at = () => Math.round(slides.scrollLeft / slides.clientWidth);
    const go = i => slides.scrollTo({ left: ((i + n) % n) * slides.clientWidth, behavior: "smooth" });
    slides.addEventListener("scroll", () => {
      const i = at();
      $("#gcount", el).textContent = `${i + 1} / ${n}`;
      $$(".gthumbs button", el).forEach((b, j) => b.classList.toggle("on", j === i));
    }, { passive: true });
    $(".gnav.prev", el).onclick = () => go(at() - 1);
    $(".gnav.next", el).onclick = () => go(at() + 1);
    $$(".gthumbs button", el).forEach(b => b.onclick = () => go(Number(b.dataset.g)));
  }

  function openFood(it) {
    let qty = 1;
    const el = sheet(`<div class="head"><h2>${esc(it.name)}</h2><button class="x" aria-label="Close">&times;</button></div>
      ${galleryHtml(it)}
      ${it.description ? `<p class="hint">${esc(it.description)}</p>` : ""}
      <div class="price-row"><p class="price">${money(it.price)}${it.oldPrice ? ` <s style="display:inline">${money(it.oldPrice)}</s>` : ""}</p>
        <button type="button" class="btn small light" id="shareIt">Share</button></div>
      ${it.available ? "" : `<p class="alert bad">Sorry, this food is finished for today.</p>`}
      ${it.deal ? `<div class="deal-note">Hot Deal: ends in <b>${clockLeft(it.dealEnd)}</b>${it.dealLeft != null ? ` | only <b>${it.dealLeft}</b> left at this price` : ""}</div>` : ""}
      ${it.available && (it.orderedToday || it.viewing) ? `<div class="buzz-row">${it.orderedToday ? `<span class="buzz">${it.orderedToday} ${it.orderedToday === 1 ? "person has" : "people have"} ordered this today</span>` : ""}
        ${it.viewing ? `<span class="buzz eye"><i></i>${it.viewing} ${it.viewing === 1 ? "person is" : "people are"} viewing this now</span>` : ""}</div>` : ""}
      ${it.options.map((g, gi) => `<div class="opt"><h4>${esc(g.name)} <small class="${g.required ? "req" : ""}">${g.required ? "Choose one" : g.pick === "many" ? "Optional, pick any" : "Optional"}</small></h4>
        ${g.choices.map(c => `<label class="choice"><input type="${g.pick === "many" ? "checkbox" : "radio"}" name="g${gi}" value="${esc(c.name)}">
          <span>${esc(c.name)}</span><em>${c.price ? "+ " + money(c.price) : ""}</em></label>`).join("")}</div>`).join("")}
      <p class="err" id="foodErr"></p>
      <div class="bottom"><div class="qty"><button data-q="-1" aria-label="Less">-</button><b id="q">1</b><button data-q="1" aria-label="More">+</button></div>
        <button class="btn green" id="addIt"${it.available ? "" : " disabled"}>Add</button></div>`);
    wireGallery(el);
    // Phones share straight to WhatsApp, Status and others; computers open WhatsApp
    $("#shareIt", el).onclick = async () => {
      const url = shareLink(it.id), text = `${it.name} - ${money(it.price)} on Tuye Bites. Order here:`;
      if (navigator.share) { try { await navigator.share({ title: it.name, text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
      window.open(waLink("", text + " " + url), "_blank");
    };
    const picked = () => {
      const ch = {};
      it.options.forEach((g, gi) => { const v = $$(`input[name="g${gi}"]:checked`, el).map(x => x.value); if (v.length) ch[g.name] = v; });
      return ch;
    };
    // A radio choice can be tapped again to clear it when the group is optional
    $$('input[type="radio"]', el).forEach(r => r.addEventListener("click", () => {
      const g = it.options[Number(r.name.slice(1))];
      if (!g.required && r.dataset.was === "1") r.checked = false;
      $$(`input[name="${r.name}"]`, el).forEach(x => { x.dataset.was = x.checked ? "1" : ""; });
      refresh();
    }));
    const refresh = () => { $("#q", el).textContent = qty; $("#addIt", el).textContent = `Add ${qty} for ${money(unitPrice(it, picked()) * qty)}`; };
    el.addEventListener("change", refresh);
    $$("[data-q]", el).forEach(b => b.onclick = () => { qty = Math.min(20, Math.max(1, qty + Number(b.dataset.q))); refresh(); });
    $("#addIt", el).onclick = () => {
      const ch = picked(), miss = it.options.find(g => g.required && !ch[g.name]);
      if (miss) { $("#foodErr", el).textContent = `Please choose the ${miss.name}.`; return; }
      const key = it.id + "|" + JSON.stringify(ch), same = cart.find(l => l.key === key);
      if (same) same.qty = Math.min(20, same.qty + qty); else cart.push({ key, id: it.id, qty, choices: ch });
      saveCart(); closeSheet(); toast(`${it.name} added to your cart`);
    };
    refresh();
  }

  function openCart() {
    const lines = cartLines();
    if (!lines.length) { toast("Your cart is empty. Tap + on any food."); return; }
    const el = sheet(`<div class="head"><h2>Your cart</h2><button class="x" aria-label="Close">&times;</button></div>
      ${lines.map(l => `<div class="line" data-k="${esc(l.key)}"><div class="t"><b>${esc(l.item.name)}</b>
        <small>${l.extra ? esc(l.extra) + " | " : ""}${money(l.unit)} each</small>
        ${l.item.available ? "" : `<small class="err">Finished for today. Please remove it.</small>`}<br>
        <button class="rm">Remove</button></div>
        <div class="qty"><button data-q="-1" aria-label="Less">-</button><b>${l.qty}</b><button data-q="1" aria-label="More">+</button></div></div>`).join("")}
      <div class="totals"><div class="big"><span>Food total</span><span>${money(foodTotal())}</span></div></div>
      ${tooBig(itemCount()) ? `<p class="alert bad">${esc(tooBigText(itemCount()))}</p>`
        : bigFee(itemCount()) ? `<p class="alert info">${esc(bigText(itemCount()))} on delivery.</p>`
        : `<p class="hint">Delivery fee is added on the next step.${settings.bigOn ? ` Up to ${settings.bigIncluded} items are carried for the normal delivery fee.` : ""}</p>`}
      <div class="bottom"><button class="btn light" id="more">Add more food</button><button class="btn green" id="toCheckout"${tooBig(itemCount()) ? " disabled" : ""}>Checkout</button></div>`);
    $$(".line", el).forEach(row => {
      const l = cart.find(x => x.key === row.dataset.k);
      $(".rm", row).onclick = () => { cart = cart.filter(x => x !== l); saveCart(); cart.length ? openCart() : closeSheet(); };
      $$("[data-q]", row).forEach(b => b.onclick = () => {
        l.qty += Number(b.dataset.q);
        if (l.qty < 1) cart = cart.filter(x => x !== l);
        l.qty = Math.min(20, l.qty);
        saveCart(); cart.length ? openCart() : closeSheet();
      });
    });
    $("#more", el).onclick = closeSheet;
    $("#toCheckout", el).onclick = openCheckout;
  }

  // Times customers can choose for "order for later": every 30 minutes today and tomorrow, inside the opening hours (Kenya time)
  const EAT = 3 * 36e5;
  function laterSlots() {
    if (settings.mode === "closed") return [];
    const toM = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const o = toM(settings.open), c = toM(settings.close);
    const inHours = m => settings.mode === "open" || o === c || (o < c ? m >= o && m < c : m >= o || m < c);
    const d = new Date(Date.now() + EAT); d.setUTCHours(0, 0, 0, 0);
    const day0 = d.getTime() - EAT, out = [];
    for (let t = day0; t < day0 + 2 * 864e5; t += 30 * 6e4) {
      if (t >= Date.now() + 45 * 6e4 && inHours(Math.round(((t - day0) % 864e5) / 6e4))) out.push(t);
    }
    return out;
  }
  function slotText(t) {
    const d = new Date(t + EAT), h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
    const today = new Date(Date.now() + EAT).toISOString().slice(0, 10);
    return `${d.toISOString().slice(0, 10) === today ? "Today" : "Tomorrow"} ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  }

  function openCheckout() {
    const slots = laterSlots();
    if (!isOpen() && !slots.length) { toast(settings.state.text, true); return; }
    const lines = cartLines();
    if (lines.some(l => !l.item.available)) { toast("Remove the foods that are finished for today first.", true); openCart(); return; }
    if (tooBig(itemCount())) { toast(tooBigText(itemCount()), true); openCart(); return; }
    const big = bigFee(itemCount());
    const me = store.get("tb_me", {}), food = foodTotal();
    const areas = settings.deliveryAreas;
    // What the discount code and loyalty reward give, checked with the shop before ordering
    let perk = { discount: 0, code: "", text: "", freeDelivery: false };
    const el = sheet(`<div class="head"><h2>Checkout</h2><button class="x" aria-label="Close">&times;</button></div>
      ${me.customer ? `<p class="hint notme">Ordering as <b>${esc(me.customer)}</b>. <button type="button" class="linkbtn" id="notMe">Not you? Clear</button></p>` : ""}
      <form class="form" id="co" novalidate>
        <div class="two"><label>Your name <input id="cName" autocomplete="name" maxlength="50" value="${esc(me.customer || "")}"></label>
          <label>Phone number <input id="cPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XXXXXXXX" value="${esc(me.phone || "")}"></label></div>
        <label>Deliver to <select id="cArea">${areas.map(a => `<option value="${esc(a.name)}"${a.name === me.area ? " selected" : ""}>${esc(a.name)} (delivery ${money(a.fee)})</option>`).join("")}</select></label>
        <label>Exactly where? <input id="cDir" maxlength="200" placeholder="Building, floor and room, or a landmark near you" value="${esc(me.directions || "")}"></label>
        <label>When? <select id="cWhen">${isOpen() ? `<option value="">As soon as possible</option>` : ""}
          ${slots.length ? `<optgroup label="Order for later">${slots.map(t => `<option value="${t}">${slotText(t)}</option>`).join("")}</optgroup>` : ""}</select>
          ${isOpen() ? "" : `<span class="hint">We are closed now, but you can order for later.</span>`}</label>
        <label>Note for us (optional) <input id="cNote" maxlength="200" placeholder="e.g. no onions, call when you arrive"></label>
        <div><div class="disc"><input id="cDisc" maxlength="20" placeholder="Discount code" autocapitalize="characters" style="text-transform:uppercase">
          <button type="button" class="btn light" id="applyDisc">Apply</button></div><p class="hint" id="discMsg"></p></div>
        <p class="alert good hidden" id="perkMsg"></p>
        <div class="totals"><div><span>Food</span><span>${money(food)}</span></div>
          <div class="hidden" id="discRow"><span>Discount</span><span id="discAmt"></span></div>
          <div><span>Delivery</span><span id="fee"></span></div>
          ${big ? `<div><span>Big order (${itemCount()} items, ${settings.bigIncluded} included)</span><span>+ ${money(big)}</span></div>` : ""}
          <div class="big"><span>Total to pay</span><span id="total"></span></div></div>
        <p class="hint" id="timeNote"></p>
        ${settings.minOrder && food < settings.minOrder ? `<p class="alert bad">The smallest order is ${money(settings.minOrder)} of food. Please add more food.</p>` : ""}
        <div class="pay"><h3>Pay first on M-Pesa</h3>
          <ol><li>Open M-Pesa, choose <b>Lipa na M-Pesa</b>, then <b>Buy Goods and Services</b>.</li>
            <li>Till number: <span class="till">${esc(settings.till)}</span>${settings.tillName ? ` <small>(${esc(settings.tillName)})</small>` : ""}</li>
            <li>Amount: <b id="payAmt"></b></li>
            <li>Type the M-Pesa code from your message below.</li></ol>
          <label>M-Pesa code <input id="cCode" autocomplete="off" autocapitalize="characters" maxlength="12" placeholder="e.g. QJK7Y2B4XZ" style="text-transform:uppercase;letter-spacing:2px;font-weight:700"></label>
        </div>
        <label class="check"><input type="checkbox" id="cRemember" ${store.get("tb_remember", true) ? "checked" : ""}> Remember my details on this phone</label>
        <p class="hint" style="margin-top:-8px">Untick on a shared or borrowed phone.</p>
        <p class="hint" style="margin:0">By ordering you agree to our <a href="/policy.html" target="_blank">privacy and refund rules</a>.</p>
        <p class="err" id="coErr"></p>
        <button class="btn green wide" id="placeBtn">Place my order</button>
      </form>
      <div class="confirm hidden" id="confirmBox"></div>
      <div class="leave hidden" id="leaveBox"><div><b>Leave checkout?</b><span>Your food stays in the cart, but the details you typed here will be lost.</span>
        <div class="leave-btns"><button type="button" class="btn light" id="stayBtn">Stay</button><button type="button" class="btn line" id="leaveBtn">Leave checkout</button></div></div></div>`);
    // Ask before closing once the customer has typed something (or is on the confirm screen)
    const startValues = $$("#co input, #co select", el).map(x => x.type === "checkbox" ? x.checked : x.value).join("|");
    const changed = () => $$("#co input, #co select", el).map(x => x.type === "checkbox" ? x.checked : x.value).join("|") !== startValues;
    leaveCheck = () => {
      if (!changed() && $("#confirmBox", el).classList.contains("hidden")) return true;
      $("#leaveBox", el).classList.remove("hidden");
      return false;
    };
    $("#stayBtn", el).onclick = () => $("#leaveBox", el).classList.add("hidden");
    $("#leaveBtn", el).onclick = closeSheet;
    const area = () => areas.find(x => x.name === $("#cArea", el).value) || areas[0];
    const showFee = () => {
      const fee = perk.freeDelivery ? 0 : area().fee;
      $("#fee", el).textContent = perk.freeDelivery ? "FREE" : money(fee);
      $("#discRow", el).classList.toggle("hidden", !perk.discount);
      $("#discAmt", el).textContent = "- " + money(perk.discount);
      $("#total", el).textContent = $("#payAmt", el).textContent = money(food - perk.discount + fee + big);
      $("#perkMsg", el).textContent = perk.freeDelivery ? "This order has FREE delivery as a thank you for your loyalty." : "";
      $("#perkMsg", el).classList.toggle("hidden", !perk.freeDelivery);
      const later = $("#cWhen", el).value;
      $("#timeNote", el).innerHTML = later ? `We will deliver <b>${esc(slotText(Number(later)).toLowerCase())}</b>.`
        : settings.busy ? `<span class="busy-note">We are very busy right now. Delivery may take ${esc(settings.busyTime)}.</span>`
        : settings.deliveryTime ? `Delivery takes about <b>${esc(settings.deliveryTime)}</b> after we confirm your payment.` : "";
    };
    // Ask the shop again when the phone number or the code changes
    let asked = 0;
    async function refreshPerks(code, quiet) {
      const phone = $("#cPhone", el).value.replace(/\D/g, "");
      const n = ++asked;
      try {
        const r = await Api.perks(phone.length >= 10 ? phone : "", code, food);
        if (n !== asked) return;
        perk = r;
        if (code) $("#discMsg", el).innerHTML = `<b style="color:var(--green)">Code ${esc(r.code)}: ${esc(r.text)}.</b>`;
      } catch (err) {
        if (n !== asked) return;
        perk = { ...perk, discount: 0, code: "" };
        if (!quiet) $("#discMsg", el).innerHTML = `<span class="err">${esc(err.message)}</span>`;
      }
      showFee();
    }
    $("#cArea", el).onchange = showFee;
    $("#cWhen", el).onchange = showFee;
    $("#applyDisc", el).onclick = () => refreshPerks($("#cDisc", el).value.trim());
    $("#cDisc", el).onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); refreshPerks($("#cDisc", el).value.trim()); } };
    $("#cPhone", el).onchange = () => refreshPerks(perk.code, true);
    showFee();
    if (me.phone) refreshPerks("", true);
    if ($("#notMe", el)) $("#notMe", el).onclick = () => {
      forgetMe(); renderShop(); openCheckout();
      toast("Details cleared from this phone");
    };
    // Quick checks on this phone, so the confirm screen only shows a complete order (the shop checks everything again)
    function readyError() {
      if (!$("#cName", el).value.trim()) return ["#cName", "Type your name."];
      if (!/^(?:\+?254|0)[17]\d{8}$/.test($("#cPhone", el).value.replace(/[\s-]/g, ""))) return ["#cPhone", "Type a correct phone number with 10 digits, e.g. 0712345678."];
      if (!$("#cDir", el).value.trim()) return ["#cDir", "Tell us exactly where to bring the food (building, gate, landmark)."];
      if (!/^[A-Z][A-Z0-9]{9}$/.test($("#cCode", el).value.replace(/\s/g, "").toUpperCase())) return ["#cCode", "Type the M-Pesa code from your message: 10 letters and numbers, e.g. QJK7Y2B4XZ."];
      return null;
    }
    // The last look before the order is sent
    function showConfirm() {
      const a = area(), fee = perk.freeDelivery ? 0 : a.fee, later = Number($("#cWhen", el).value) || 0;
      $("#co", el).classList.add("hidden");
      $("#confirmBox", el).classList.remove("hidden");
      $("#confirmBox", el).innerHTML = `<h3>Please confirm your order</h3>
        <div class="cf-sec">${lines.map(l => `<div class="cf-line"><span>${l.qty} x ${esc(l.item.name)}${l.extra ? `<small>${esc(l.extra)}</small>` : ""}</span><b>${money(l.unit * l.qty)}</b></div>`).join("")}</div>
        <div class="totals"><div><span>Food</span><span>${money(food)}</span></div>
          ${perk.discount ? `<div><span>Discount (${esc(perk.code)})</span><span>- ${money(perk.discount)}</span></div>` : ""}
          <div><span>Delivery</span><span>${perk.freeDelivery ? "FREE" : money(fee)}</span></div>
          ${big ? `<div><span>Big order (${itemCount()} items)</span><span>+ ${money(big)}</span></div>` : ""}
          <div class="big"><span>Total paid</span><span>${money(food - perk.discount + fee + big)}</span></div></div>
        <div class="cf-sec cf-info">
          <div><small>Deliver to</small><b>${esc(a.name)}</b> - ${esc($("#cDir", el).value.trim())}</div>
          <div><small>When</small><b>${later ? esc(slotText(later)) : "As soon as possible"}</b></div>
          <div><small>Name and phone</small><b>${esc($("#cName", el).value.trim())}</b>, ${esc($("#cPhone", el).value.trim())}</div>
          <div><small>M-Pesa code</small><b class="cf-code">${esc($("#cCode", el).value.replace(/\s/g, "").toUpperCase())}</b></div>
          ${$("#cNote", el).value.trim() ? `<div><small>Note</small>${esc($("#cNote", el).value.trim())}</div>` : ""}</div>
        <p class="hint">Make sure you paid <b>${money(food - perk.discount + fee + big)}</b> to Till <b>${esc(settings.till)}</b> and the M-Pesa code is correct.</p>
        <p class="err" id="cfErr"></p>
        <div class="bottom"><button type="button" class="btn light" id="backBtn">Go back</button><button type="button" class="btn green" id="confirmBtn">Confirm order</button></div>`;
      $("#backBtn", el).onclick = backToForm;
      $("#confirmBtn", el).onclick = sendOrder;
      el.scrollTop = 0;
    }
    function backToForm(msg) {
      $("#confirmBox", el).classList.add("hidden");
      $("#co", el).classList.remove("hidden");
      if (typeof msg === "string") { $("#coErr", el).textContent = msg; $("#coErr", el).scrollIntoView({ block: "center" }); }
    }
    $("#co", el).onsubmit = e => {
      e.preventDefault();
      const bad = readyError();
      $("#coErr", el).textContent = bad ? bad[1] : "";
      if (bad) { $(bad[0], el).focus(); return; }
      showConfirm();
    };
    async function sendOrder() {
      const data = {
        customer: $("#cName", el).value, phone: $("#cPhone", el).value, area: $("#cArea", el).value,
        directions: $("#cDir", el).value, note: $("#cNote", el).value, mpesaCode: $("#cCode", el).value,
        deliverAt: Number($("#cWhen", el).value) || null, discountCode: perk.code || "",
        items: lines.map(l => ({ id: l.id, qty: l.qty, choices: l.choices }))
      };
      const btn = $("#confirmBtn", el);
      btn.disabled = true; btn.textContent = "Sending your order...";
      $("#cfErr", el).textContent = "";
      try {
        const { order } = await Api.placeOrder(data);
        const remember = $("#cRemember", el).checked;
        store.set("tb_remember", remember);
        if (remember) {
          store.set("tb_me", { customer: data.customer, phone: data.phone, area: data.area, directions: data.directions });
          store.set("tb_orders", [{ no: order.no, token: order.token, at: Date.now() }, ...store.get("tb_orders", [])].slice(0, 10));
        } else forgetMe();
        // This phone may open the order page without the 4-digit check (until the browser closes, if not remembered)
        OrderKeys.set(order.token, order.key, remember);
        cart = []; saveCart();
        showDone(order);
      } catch (err) {
        // Back to the form so the customer can fix it (e.g. a wrong M-Pesa code)
        backToForm(err.message);
      }
    }
  }

  function showDone(o) {
    const link = location.origin + "/t/" + o.token;
    const text = [`New order ${o.no}`, `Name: ${o.customer}`, `Phone: ${o.phone}`, `Deliver to: ${o.area} - ${o.directions}`, "",
      ...o.items.map(l => `${l.qty} x ${l.name}${l.choices.length ? " (" + choiceText(l) + ")" : ""} = ${money(l.total)}`), "",
      `Food: ${money(o.foodTotal)}`, o.discount ? `Discount (${o.discountCode}): - ${money(o.discount)}` : null,
      `Delivery: ${o.freeDelivery ? "FREE (loyalty reward)" : money(o.deliveryFee)}`, o.bigFee ? `Big order: + ${money(o.bigFee)}` : null, `Total paid: ${money(o.total)}`,
      o.deliverAt ? `Deliver: ${slotText(o.deliverAt)}` : null,
      `M-Pesa code: ${o.mpesaCode}`, o.note ? `Note: ${o.note}` : "", "", `Track: ${link}`].filter(x => x !== null).filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
    const el = sheet(`<div class="head"><span></span><button class="x" aria-label="Close">&times;</button></div>
      <div class="done"><div class="tick"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></div>
        <h2>Order received</h2><p class="no">${esc(o.no)}</p>
        <p>We are checking your M-Pesa payment of <b>${money(o.total)}</b>.${o.deliverAt ? ` We will deliver <b>${esc(slotText(o.deliverAt).toLowerCase())}</b>.` : ""} You can follow your order on the tracking page.</p>
        <div class="btns"><a class="btn wa" id="waBtn" target="_blank" rel="noopener" href="${esc(waLink(settings.whatsapp, text))}">Send my order on WhatsApp</a>
          <a class="btn plum" href="/t/${esc(o.token)}">Track my order</a></div>
        <p class="hint">Tap "Send my order on WhatsApp" so we get it even faster.</p></div>`);
    $("#waBtn", el).focus();
  }

  // ---------- events ----------
  $("#chips").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c) { group = c.dataset.g; renderMenu(); } });
  $("#search").addEventListener("input", e => { query = e.target.value; renderMenu(); });
  const onFoodClick = e => {
    const card = e.target.closest(".food"); if (!card || card.matches(".soon, .sold")) return;
    const it = byId(card.dataset.id);
    if (!it || !it.available) return;
    // Foods without choices go straight into the cart from the + button
    if (e.target.closest(".add, .grab") && !it.options.length) {
      const key = it.id + "|{}", same = cart.find(l => l.key === key);
      if (same) same.qty = Math.min(20, same.qty + 1); else cart.push({ key, id: it.id, qty: 1, choices: {} });
      saveCart(); toast(`${it.name} added to your cart`);
    } else openFood(it);
  };
  $("#menu").addEventListener("click", onFoodClick);
  $("#deals").addEventListener("click", onFoodClick);
  $("#cartBtn").onclick = openCart;
  $("#cartBar").onclick = openCart;

  // ---------- install like an app ----------
  let installEvent = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  function showInstall() {
    if (standalone() || store.get("tb_noinstall", false)) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!installEvent && !ios) return;
    $("#install").innerHTML = `<div><b>Get the Tuye Bites app</b><small>${installEvent ? "Order faster from your home screen." : "Tap the Share button, then \"Add to Home Screen\"."}</small></div>
      ${installEvent ? `<button class="btn small amber" id="installBtn">Install</button>` : ""}<button class="x" id="installX" aria-label="Hide">&times;</button>`;
    $("#install").classList.remove("hidden");
    if ($("#installBtn")) $("#installBtn").onclick = async () => {
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (e) {}
      installEvent = null; $("#install").classList.add("hidden");
    };
    $("#installX").onclick = () => { store.set("tb_noinstall", true); $("#install").classList.add("hidden"); };
  }
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; showInstall(); });

  async function load() {
    try {
      ({ items, settings } = await Api.shop());
      renderShop();
    } catch (e) {
      if (!settings) $("#menu").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    }
  }
  // A shared food link (/f/<food>) opens that food straight away
  load().then(() => {
    const m = /food=([^&]+)/.exec(location.hash);
    const it = m && byId(decodeURIComponent(m[1]));
    if (it) { history.replaceState(null, "", location.pathname); openFood(it); }
    showInstall();
  });
  // Keep the menu fresh (finished foods, opening hours) while the page stays open
  setInterval(() => { if (!document.hidden && !$("#sheets").innerHTML) load(); }, 120000);
})();
