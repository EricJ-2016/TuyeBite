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
      <div class="ph">${it.image ? `<img src="${esc(it.thumb || it.image)}" alt="${esc(it.name)}" loading="lazy">` : `<span class="none">${esc(it.name.slice(0, 1))}</span>`}${tag}
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
    $("#logo").innerHTML = headerLogo(settings);
    const hl = $("#logo img"); if (hl) { hl.complete ? headH() : hl.addEventListener("load", headH); }
    $("#notice").textContent = settings.notice;
    $("#notice").classList.toggle("hidden", !settings.notice);
    const pill = $("#openPill");
    pill.className = "pill " + (isOpen() ? "open" : "closed");
    pill.textContent = isOpen() ? "Open" : "Closed";
    $("#closedBar").textContent = settings.state.text + (!isOpen() && laterSlots().length ? " You can still order for later." : "");
    $("#closedBar").classList.toggle("hidden", isOpen());
    $("#busyBar").textContent = `We are very busy right now. Delivery may take ${settings.busyTime}. Thank you for your patience.`;
    $("#busyBar").classList.toggle("hidden", !(isOpen() && settings.busy));
    // Step 2 shows the till number saved in admin -> Settings
    // The moving motorbike in the top bar shows the delivery time (the busy time when busy mode is on)
    const short = t => String(t || "").replace(/^about\s*/i, "").replace(/\s*minutes?\b/i, " min").replace(/\s*hours?\b/i, " hr").trim();
    $("#motoTime").textContent = settings.busy ? short(settings.busyTime) : short(settings.deliveryTime) || "05-15 min";
    $("#motoChip").classList.toggle("busy", !!settings.busy);
    $("#motoChip").classList.toggle("hidden", !settings.busy && !settings.deliveryTime);
    $("#tillText").textContent = settings.till ? `Pay on Till ${settings.till}` : "Pay on Till";
    $("#dTime").textContent = settings.deliveryTime ? `Delivery in about ${settings.deliveryTime}.` : "";
    renderDeals();
    renderHeroVis();
    renderMenu();
    saveCart();
    renderFoot();
    renderOrdersBar();
  }

  // ---------- My orders: every order placed on this phone, with live status and receipts ----------
  const myOrderList = () => store.get("tb_orders", []);
  const STAGE = { new: ["Checking payment", "wait"], payment_problem: ["Check your M-Pesa code", "bad"], confirmed: ["Paid, being prepared", "go"],
    on_the_way: ["On the way", "go"], delivered: ["Delivered", "done"], cancelled: ["Cancelled", "off"] };
  let myCache = {};
  // One request for all of them; also brings this customer's share code and reward progress
  async function fetchMine() {
    const list = myOrderList();
    if (!list.length) return list;
    const r = await Api.mine(list.map(o => ({ token: o.token, key: OrderKeys.get(o.token) })));
    myCache = Object.fromEntries(r.orders.map(o => [o.token, o]));
    if (r.me) { store.set("tb_refcode", r.me.refCode); store.set("tb_rewards", r.me); }
    return list;
  }
  const LIVE = ["new", "payment_problem", "confirmed", "on_the_way"];
  const isLive = o => myCache[o.token] && LIVE.includes(myCache[o.token].status);
  const hasReceipt = o => ["confirmed", "on_the_way", "delivered"].includes(o.status) || (o.status === "cancelled" && o.paidAt);
  // Top bar: only orders still in progress. The bottom bar "My orders" has them all.
  async function renderOrdersBar() {
    const bar = $("#ordersBar"), list = myOrderList();
    const draw = () => {
      const live = list.filter(isLive).length;
      bar.classList.toggle("hidden", !live);
      bar.innerHTML = `<span class="ob-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01"/></svg></span>
        <b>${live === 1 ? "Your order" : "Your orders"}</b><span class="ob-live">${live} in progress</span><span class="ob-go">View</span>`;
      $("#bnBadge").textContent = live || "";
      $("#bnBadge").classList.toggle("hidden", !live);
    };
    if (!list.length) { draw(); return; }
    draw();
    await fetchMine().catch(() => {});
    draw();
    renderUsual();
  }
  // ---------- "Your usual": the last order again, one tap away ----------
  function renderUsual() {
    const box = $("#usual");
    const last = myOrderList().map(x => myCache[x.token]).find(o => o && o.items && o.status !== "cancelled");
    const lines = last ? last.items.filter(l => byId(l.id) && byId(l.id).available) : [];
    box.classList.toggle("hidden", !lines.length);
    if (!lines.length) return;
    const price = lines.reduce((a, l) => {
      const it = byId(l.id), ch = {};
      for (const c of l.choices || []) (ch[c.group] ??= []).push(c.name);
      return a + unitPrice(it, ch) * l.qty;
    }, 0);
    const pic = byId(lines[0].id);
    box.innerHTML = `${pic && pic.image ? `<img src="${esc(pic.thumb || pic.image)}" alt="">` : ""}
      <div class="us-t"><small>Your usual</small><b>${esc(lines.map(l => `${l.qty} x ${l.name}`).join(", "))}</b><span>${money(price)} + delivery</span></div>
      <button type="button" class="btn green small" id="usualBtn">Order again</button>`;
    $("#usualBtn").onclick = () => orderAgain(last);
  }
  // Progress towards the rewards (10 orders, 10 friends)
  function rewardsCard() {
    const me = store.get("tb_rewards", null);
    if (!me) return "";
    const part = (x, what) => !x ? "" : `<div class="rw-row"><b>${x.ready ? `Ready: ${esc(x.text)} on your next order` : `${x.done} ${what}`}</b>
      ${x.ready ? "" : x.left ? `<small>${x.left} more and you get ${esc(x.text)}.</small>` : `<small>Reward already used.</small>`}
      <div class="rw-bar"><i style="width:${x.ready ? 100 : Math.round(((x.every - (x.left || x.every)) / x.every) * 100)}%"></i></div></div>`;
    const html = part(me.orders, me.orders && me.orders.done === 1 ? "delivered order" : "delivered orders")
      + part(me.referral, me.referral && me.referral.done === 1 ? "friend ordered with your link" : "friends ordered with your link");
    return html ? `<div class="rewards-card"><h3>Your rewards</h3>${html}</div>` : "";
  }
  async function openMyOrders(onlyLive) {
    onlyLive = onlyLive === true;
    const el = sheet(`<div class="head"><h2>${onlyLive ? "Orders in progress" : "My orders"}</h2><button class="x" aria-label="Close">&times;</button></div><div id="myList"><p class="empty">Loading your orders...</p></div>`);
    let failed = false;
    await fetchMine().catch(() => { failed = true; });
    const all = myOrderList(), list = onlyLive ? all.filter(isLive) : all;
    const got = all.map(x => myCache[x.token]).filter(Boolean), paid = got.filter(o => o.status === "delivered");
    $("#myList", el).innerHTML = (failed ? `<p class="alert bad">Could not load your orders. Check your internet.</p>` : "")
      + (!onlyLive && got.length ? `<div class="mo-sum"><div><b>${got.length}</b><small>order${got.length === 1 ? "" : "s"}</small></div>
        <div><b>${paid.length}</b><small>delivered</small></div><div><b>${money(paid.reduce((a, o) => a + o.total, 0))}</b><small>spent</small></div></div>` : "")
      + (!onlyLive ? rewardsCard() : "")
      + (list.length ? list.map(x => {
      const o = myCache[x.token];
      if (!o) return `<div class="mo"><div class="mo-h"><b>${esc(x.no)}</b><small>${timeAgo(x.at)}</small></div><a class="btn small light" href="/t/${esc(x.token)}">Open order</a></div>`;
      const [label, kind] = STAGE[o.status] || [o.status, "wait"];
      const foods = o.items ? o.items.map(l => `${l.qty} x ${l.name}`).join(", ") : "";
      return `<div class="mo" data-t="${esc(x.token)}"><div class="mo-h"><b>${esc(o.no)}</b><span class="mo-st ${kind}">${esc(label)}</span></div>
        <small class="mo-when">${new Date(o.at).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} | ${money(o.total)}</small>
        ${foods ? `<p class="mo-foods">${esc(foods)}</p>` : ""}
        <div class="mo-btns"><a class="btn small plum" href="/t/${esc(x.token)}">${LIVE.includes(o.status) ? "Track order" : "Open order"}</a>
          ${hasReceipt(o) ? `<button class="btn small light" data-rc>Receipt</button>` : ""}
          ${o.items ? `<button class="btn small green" data-again>Order again</button>` : ""}</div></div>`;
    }).join("") : `<p class="empty">${onlyLive ? "No orders in progress right now." : "No orders on this phone yet."}</p>`)
      + (onlyLive && all.length > list.length ? `<button type="button" class="btn line wide" id="seeAll">See all my orders (${all.length})</button>` : "");
    if ($("#seeAll", el)) $("#seeAll", el).onclick = () => openMyOrders();
    $$("[data-again]", el).forEach(b => b.onclick = () => orderAgain(myCache[b.closest(".mo").dataset.t]));
    $$("[data-rc]", el).forEach(b => b.onclick = () => openReceipt(myCache[b.closest(".mo").dataset.t]));
    if (!onlyLive && list.length && (settings.shareCode || refOn())) {
      $("#myList", el).insertAdjacentHTML("beforeend", shareCard("shareMine"));
      $("#shareMine", el).onclick = shareApp;
    }
  }
  // The receipt of one order: view, download as PDF or print (the same slip the shop sends)
  function openReceipt(o) {
    if (!o) return;
    const rs = { logo: settings.logo, whatsapp: settings.whatsapp, till: settings.till, tillName: settings.tillName };
    Receipt.loadLibs().catch(() => {});
    const el = sheet(`<div class="head"><h2>Receipt ${esc(o.no)}</h2><button class="x" aria-label="Close">&times;</button></div>
      <div class="rc-wrap">${Receipt.html(o, rs)}</div>
      <div class="rc-actions"><button class="btn green" id="rcPdf">Download PDF</button><button class="btn light" id="rcPrint">Print</button>
        <button class="btn light" id="rcBack">Back to my orders</button></div>`);
    $("#rcPdf", el).onclick = async () => {
      const b = $("#rcPdf", el); b.disabled = true; b.textContent = "Making PDF...";
      try { Receipt.download(await Receipt.pdf(o, rs)); toast("Receipt downloaded"); } catch (e) { toast(e.message, true); }
      b.disabled = false; b.textContent = "Download PDF";
    };
    $("#rcPrint", el).onclick = () => Receipt.print(o, rs);
    $("#rcBack", el).onclick = () => openMyOrders();
  }
  // Puts the same foods and choices back in the cart
  function orderAgain(o) {
    let added = 0;
    for (const l of o.items) {
      const it = byId(l.id);
      if (!it || !it.available) continue;
      const choices = {};
      for (const c of l.choices || []) (choices[c.group] ??= []).push(c.name);
      const key = l.id + "|" + JSON.stringify(choices), same = cart.find(x => x.key === key);
      if (same) same.qty = Math.min(20, same.qty + l.qty); else cart.push({ key, id: l.id, qty: l.qty, choices });
      added++;
    }
    saveCart();
    if (!added) { toast("Those foods are not available right now.", true); return; }
    closeSheet(); openCart();
    if (added < o.items.length) toast("Some foods from that order are finished for today.");
  }

  // ---------- share Tuye Bites: the friend gets the discount code the owner chose, and the link carries this customer's own code ----------
  const myRef = () => store.get("tb_refcode", "");
  const refUrl = base => myRef() ? base + (base.includes("?") ? "&" : "?") + "ref=" + encodeURIComponent(myRef()) : base;
  const ruleText = x => x.kind === "percent" ? `${x.value}% off the food` : `${money(x.value)} off the food`;
  const refOn = () => settings.refReward && settings.refReward.on;
  function shareCard(id) {
    const rr = settings.refReward, me = store.get("tb_rewards", null);
    const friends = me && me.referral ? me.referral.done : 0;
    return `<div class="share-card"><b>Share Tuye Bites</b><span>${settings.shareCode ? `Your friend gets code <b>${esc(settings.shareCode)}</b> for a discount on their first order.` : "Tell a friend about us on WhatsApp."}
      ${refOn() ? `${myRef() ? "" : "After your first order you get your own share link. "}When <b>${rr.every}</b> friends order with your link, you get <b>${esc(ruleText(rr))}</b>.${myRef() && friends ? ` So far: <b>${friends}</b>.` : ""}` : ""}</span>
      <button type="button" class="btn green small" id="${id}">Share</button></div>`;
  }
  function rewardsHelp() {
    const o = settings.orderReward, r = settings.refReward, out = [];
    if (o && o.on) out.push(`After every ${o.every} delivered orders${o.repeat ? "" : " (once)"}: ${ruleText(o)} on your next order.`);
    if (r && r.on) out.push(`When ${r.every} friends order with your share link${r.repeat ? "" : " (once)"}: ${ruleText(r)} on your next order.`);
    return out.length ? `<div><b>Rewards</b><span>${esc(out.join(" "))}</span></div>` : "";
  }
  async function shareApp() {
    const code = settings.shareCode;
    const text = `Order hot fast food in Wote on Tuye Bites, delivered to your door.${code ? ` Use code ${code} for a discount on your first order.` : ""}`;
    const url = refUrl(location.origin + "/");
    if (navigator.share) { try { await navigator.share({ title: "Tuye Bites", text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    window.open(waLink("", text + " " + url), "_blank");
  }

  // ---------- Help (from the bottom bar) ----------
  function openHelp() {
    const t = v => { const [h, m] = v.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
    const tel = settings.whatsapp;
    const el = sheet(`<div class="head"><h2>Help</h2><button class="x" aria-label="Close">&times;</button></div>
      <div class="help-btns"><a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink(tel, "Hello Tuye Bites, "))}">WhatsApp us</a><a class="btn light" href="tel:${esc(tel)}">Call ${esc(tel)}</a></div>
      <div class="help-list">
        <div><b>When we are open</b><span>${settings.mode === "closed" ? "Closed for now" : settings.mode === "open" ? "Open now" : `Every day, ${t(settings.open)} to ${t(settings.close)}`}</span></div>
        <div><b>Where we deliver</b><span>${settings.deliveryAreas.map(a => `${esc(a.name)} (${money(a.fee)})`).join(", ")}</span></div>
        <div><b>How to pay</b><span>On M-Pesa Till ${esc(settings.till)}, before we deliver.</span></div>
        <div><b>Cancelling</b><span>Cancel on your order page before the rider leaves. Within ${settings.fullRefundMin || 5} minutes of ordering we refund all your payment; after ${settings.fullRefundMin || 5} minutes we refund 50%.</span></div>
        ${rewardsHelp()}
        <div><b>Rules</b><span><a href="/policy.html">Privacy and refunds</a></span></div>
      </div>
      ${shareCard("shareHelp")}`);
    $("#shareHelp", el).onclick = shareApp;
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
      <div class="ph">${it.image ? `<img src="${esc(it.thumb || it.image)}" alt="${esc(it.name)}" loading="lazy">` : `<span class="none">${esc(it.name.slice(0, 1))}</span>`}
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
    $('#bnav [data-nav="deals"]').classList.toggle("hidden", !all.length);
    if (!all.length) return;
    // The header counts down to the first deal that ends
    const firstEnd = now.filter(d => d.left !== 0).map(d => d.end).sort((a, b) => a - b)[0];
    const kept = $$(".flash-grid", box).map(g => g.scrollLeft);   // keep the swipe place when the menu refreshes
    box.innerHTML = `<div class="flash-head"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#E7A545" d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>
        <h2>${esc(settings.deal.title || "Hot Deals")}</h2>
        ${firstEnd ? `<span class="tl">Time left: <b data-end="${firstEnd}">${clockLeft(firstEnd)}</b></span>` : `<span class="tl">Coming soon</span>`}</div>
      ${now.length ? `<div class="flash-grid">${now.map(dealCard).join("")}</div>${swipeHint(now.length)}` : ""}
      ${soon.length ? `<h3 class="soon-title">Coming up</h3><div class="flash-grid">${soon.map(dealCard).join("")}</div>${swipeHint(soon.length)}` : ""}`;
    // Hide "Swipe for more" once the customer reaches the end of the row
    $$(".flash-grid", box).forEach((g, i) => {
      const hint = () => { const h = g.nextElementSibling; if (h && h.classList.contains("swipe-hint")) h.classList.toggle("gone", g.scrollLeft + g.clientWidth >= g.scrollWidth - 8); };
      g.addEventListener("scroll", hint, { passive: true });
      if (kept[i]) { g.scrollLeft = kept[i]; hint(); }
    });
  }
  const swipeHint = n => n > 2 ? `<div class="swipe-hint" aria-hidden="true">Swipe for more <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>` : "";
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
      box.innerHTML = foods.map((it, i) => `<div class="hv-card c${i}" data-id="${esc(it.id)}"><img src="${esc(it.thumb || it.image)}" alt="${esc(it.name)}">
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

  // ---------- "Added to cart" pop-up under the cart button ----------
  let addedTimer = null;
  function showAdded(it, qty) {
    let box = $("#addedPop");
    if (!box) { box = document.createElement("div"); box.id = "addedPop"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    const n = cartLines().reduce((a, l) => a + l.qty, 0);
    box.innerHTML = `<div class="ap-tick"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></div>
      ${it.image ? `<img src="${esc(it.image)}" alt="">` : ""}
      <div class="ap-t"><b>Added to cart</b><span>${qty > 1 ? qty + " x " : ""}${esc(it.name)}</span></div>
      <button type="button" class="btn small green" id="apView">View cart (${n})</button>`;
    box.style.top = ($(".top").getBoundingClientRect().bottom + 8) + "px";
    box.classList.remove("show"); void box.offsetWidth; box.classList.add("show");
    // the cart button gives a little jump
    const cb = $("#cartBtn"); cb.classList.remove("bump"); void cb.offsetWidth; cb.classList.add("bump");
    $("#apView").onclick = () => { box.classList.remove("show"); openCart(); };
    clearTimeout(addedTimer);
    addedTimer = setTimeout(() => box.classList.remove("show"), 2600);
  }

  // ---------- sheets ----------
  // A pop-up may set "leaveCheck": it runs before the pop-up closes and can stop it (checkout asks first)
  let leaveCheck = null;
  function sheet(html, still = false) {
    leaveCheck = null;
    const open = $("#sheets .sheet");
    if (still && open) {
      const y = open.scrollTop;
      open.innerHTML = html;
      open.scrollTop = y;
      return open;
    }
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
      const url = refUrl(shareLink(it.id)), text = `${it.name} - ${money(it.price)} on Tuye Bites. Order here:`;
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
      saveCart(); closeSheet(); showAdded(it, qty);
    };
    refresh();
  }

  // still = changing amounts or removing inside the open cart: the cart updates where it is, without moving
  function openCart(still = false) {
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
      <div class="bottom"><button class="btn light" id="more">Add more food</button><button class="btn green" id="toCheckout"${tooBig(itemCount()) ? " disabled" : ""}>Checkout</button></div>`, still);
    $$(".line", el).forEach(row => {
      const l = cart.find(x => x.key === row.dataset.k);
      $(".rm", row).onclick = () => { cart = cart.filter(x => x !== l); saveCart(); cart.length ? openCart(true) : closeSheet(); };
      $$("[data-q]", row).forEach(b => b.onclick = () => {
        l.qty += Number(b.dataset.q);
        if (l.qty < 1) cart = cart.filter(x => x !== l);
        l.qty = Math.min(20, l.qty);
        saveCart(); cart.length ? openCart(true) : closeSheet();
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
    if (!navigator.onLine) { toast("You are offline. Connect to the internet to order.", true); return; }
    const slots = laterSlots();
    if (!isOpen() && !slots.length) { toast(settings.state.text, true); return; }
    const lines = cartLines();
    if (lines.some(l => !l.item.available)) { toast("Remove the foods that are finished for today first.", true); openCart(); return; }
    if (tooBig(itemCount())) { toast(tooBigText(itemCount()), true); openCart(); return; }
    const big = bigFee(itemCount());
    const me = store.get("tb_me", {}), food = foodTotal();
    const areas = settings.deliveryAreas;
    // What the discount code and loyalty reward give, checked with the shop before ordering
    let perk = { discount: 0, code: "", text: "", freeDelivery: false, reward: 0, rewardText: "" };
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
          <div class="hidden" id="rwRow"><span>Reward</span><span id="rwAmt"></span></div>
          <div><span>Delivery</span><span id="fee"></span></div>
          ${big ? `<div><span>Big order (${itemCount()} items, ${settings.bigIncluded} included)</span><span>+ ${money(big)}</span></div>` : ""}
          <div class="big"><span>Total to pay</span><span id="total"></span></div></div>
        <p class="hint" id="timeNote"></p>
        ${settings.minOrder && food < settings.minOrder ? `<p class="alert bad">The smallest order is ${money(settings.minOrder)} of food. Please add more food.</p>` : ""}
        <div class="pay"><h3>Pay first on M-Pesa</h3>
          <ol><li>Open M-Pesa, choose <b>Lipa na M-Pesa</b>, then <b>Buy Goods and Services</b>.</li>
            <li>Till number: <button type="button" class="till copy-till" title="Tap to copy">${esc(settings.till)}<span>Copy</span></button>${settings.tillName ? ` <small>(${esc(settings.tillName)})</small>` : ""}</li>
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
      $("#rwRow", el).classList.toggle("hidden", !perk.reward);
      $("#rwAmt", el).textContent = "- " + money(perk.reward);
      $("#total", el).textContent = $("#payAmt", el).textContent = money(food - perk.discount - perk.reward + fee + big);
      const msgs = [perk.reward ? perk.rewardText + ". Thank you!" : "", perk.freeDelivery ? "This order has FREE delivery as a thank you for your loyalty." : ""].filter(Boolean);
      $("#perkMsg", el).textContent = msgs.join(" ");
      $("#perkMsg", el).classList.toggle("hidden", !msgs.length);
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
        // the reward still counts without a code: ask again for it alone
        if (code) { try { const r2 = await Api.perks(phone.length >= 10 ? phone : "", "", food); if (n === asked) perk = r2; } catch (e) {} }
        if (!quiet) $("#discMsg", el).innerHTML = `<span class="err">${esc(err.message)}</span>`;
      }
      showFee();
    }
    $("#cArea", el).onchange = showFee;
    $("#cWhen", el).onchange = showFee;
    $("#applyDisc", el).onclick = () => refreshPerks($("#cDisc", el).value.trim());
    $("#cDisc", el).onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); refreshPerks($("#cDisc", el).value.trim()); } };
    $("#cPhone", el).onchange = () => refreshPerks(perk.code, true);
    $("#cPhone", el).oninput = () => { if ($("#cPhone", el).value.replace(/\D/g, "").length >= 10) refreshPerks(perk.code, true); };
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
      const a = area(), fee = perk.freeDelivery ? 0 : a.fee, later = Number($("#cWhen", el).value) || 0, pay = food - perk.discount - perk.reward + fee + big;
      $("#co", el).classList.add("hidden");
      $("#confirmBox", el).classList.remove("hidden");
      $("#confirmBox", el).innerHTML = `<h3>Please confirm your order</h3>
        <div class="cf-sec">${lines.map(l => `<div class="cf-line"><span>${l.qty} x ${esc(l.item.name)}${l.extra ? `<small>${esc(l.extra)}</small>` : ""}</span><b>${money(l.unit * l.qty)}</b></div>`).join("")}</div>
        <div class="totals"><div><span>Food</span><span>${money(food)}</span></div>
          ${perk.discount ? `<div><span>Discount (${esc(perk.code)})</span><span>- ${money(perk.discount)}</span></div>` : ""}
          ${perk.reward ? `<div><span>Reward</span><span>- ${money(perk.reward)}</span></div>` : ""}
          <div><span>Delivery</span><span>${perk.freeDelivery ? "FREE" : money(fee)}</span></div>
          ${big ? `<div><span>Big order (${itemCount()} items)</span><span>+ ${money(big)}</span></div>` : ""}
          <div class="big"><span>Total paid</span><span>${money(pay)}</span></div></div>
        <div class="cf-sec cf-info">
          <div><small>Deliver to</small><b>${esc(a.name)}</b> - ${esc($("#cDir", el).value.trim())}</div>
          <div><small>When</small><b>${later ? esc(slotText(later)) : "As soon as possible"}</b></div>
          <div><small>Name and phone</small><b>${esc($("#cName", el).value.trim())}</b>, ${esc($("#cPhone", el).value.trim())}</div>
          <div><small>M-Pesa code</small><b class="cf-code">${esc($("#cCode", el).value.replace(/\s/g, "").toUpperCase())}</b></div>
          ${$("#cNote", el).value.trim() ? `<div><small>Note</small>${esc($("#cNote", el).value.trim())}</div>` : ""}</div>
        <p class="hint">Make sure you paid <b>${money(pay)}</b> to Till <b>${esc(settings.till)}</b> and the M-Pesa code is correct.</p>
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
        deliverAt: Number($("#cWhen", el).value) || null, discountCode: perk.code || "", ref: store.get("tb_ref", ""),
        items: lines.map(l => ({ id: l.id, qty: l.qty, choices: l.choices }))
      };
      const btn = $("#confirmBtn", el);
      btn.disabled = true; btn.textContent = "Sending your order...";
      $("#cfErr", el).textContent = "";
      try {
        const { order } = await Api.placeOrder(data);
        const remember = $("#cRemember", el).checked;
        store.set("tb_remember", remember);
        try { localStorage.removeItem("tb_ref"); } catch (e) {}
        if (remember) {
          store.set("tb_me", { customer: data.customer, phone: data.phone, area: data.area, directions: data.directions });
          // Every order stays in "My orders" (the newest 200)
          store.set("tb_orders", [{ no: order.no, token: order.token, at: Date.now() }, ...store.get("tb_orders", [])].slice(0, 200));
          if (order.refCode) store.set("tb_refcode", order.refCode);
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

  const order_refHint = o => o.refCode ? `When ${settings.refReward.every} friends order with your share link, you get ${esc(ruleText(settings.refReward))}.` : "";
  function showDone(o) {
    const link = location.origin + "/t/" + o.token;
    const text = [`New order ${o.no}`, `Name: ${o.customer}`, `Phone: ${o.phone}`, `Deliver to: ${o.area} - ${o.directions}`, "",
      ...o.items.map(l => `${l.qty} x ${l.name}${l.choices.length ? " (" + choiceText(l) + ")" : ""} = ${money(l.total)}`), "",
      `Food: ${money(o.foodTotal)}`, o.discount ? `Discount (${o.discountCode}): - ${money(o.discount)}` : null, o.reward ? `Reward: - ${money(o.reward)}` : null,
      `Delivery: ${o.freeDelivery ? "FREE (loyalty reward)" : money(o.deliveryFee)}`, o.bigFee ? `Big order: + ${money(o.bigFee)}` : null, `Total paid: ${money(o.total)}`,
      o.deliverAt ? `Deliver: ${slotText(o.deliverAt)}` : null,
      `M-Pesa code: ${o.mpesaCode}`, o.note ? `Note: ${o.note}` : "", "", `Track: ${link}`].filter(x => x !== null).filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
    const el = sheet(`<div class="head"><span></span><button class="x" aria-label="Close">&times;</button></div>
      <div class="done"><div class="tick"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></div>
        <h2>Order received</h2><p class="no">${esc(o.no)}</p>
        <p>We are checking your M-Pesa payment of <b>${money(o.total)}</b>.${o.deliverAt ? ` We will deliver <b>${esc(slotText(o.deliverAt).toLowerCase())}</b>.` : ""} You can follow your order on the tracking page.</p>
        <div class="btns"><a class="btn wa" id="waBtn" target="_blank" rel="noopener" href="${esc(waLink(settings.whatsapp, text))}">Send my order on WhatsApp</a>
          <a class="btn plum" href="/t/${esc(o.token)}">Track my order</a></div>
        ${OrderUpdates.supported() && !OrderUpdates.isOn() ? `<button class="btn light wide" id="updBtn" style="margin-top:10px">Get order updates on this phone</button><p class="err" id="updErr"></p>` : ""}
        <p class="hint">Tap "Send my order on WhatsApp" so we get it even faster.</p>
        ${!standalone() && (installEvent || /iphone|ipad|ipod/i.test(navigator.userAgent)) ? `<div class="inst-card"><b>Install Tuye Bites</b>
          <span>Follow your order and order faster next time, right from your home screen.</span>
          ${installEvent ? `<button class="btn amber small" id="instNow">Install the app</button>` : `<small>On iPhone: tap the Share button, then "Add to Home Screen".</small>`}</div>` : ""}
        ${settings.shareCode || refOn() ? `<button class="btn line wide" id="shareDone" style="margin-top:10px">Share Tuye Bites with a friend</button>` : ""}
        ${refOn() && order_refHint(o) ? `<p class="hint">${order_refHint(o)}</p>` : ""}</div>`);
    if ($("#instNow", el)) $("#instNow", el).onclick = async () => {
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (e) {}
      installEvent = null; $(".inst-card", el).remove();
    };
    if ($("#shareDone", el)) $("#shareDone", el).onclick = shareApp;
    if ($("#updBtn", el)) $("#updBtn", el).onclick = async () => {
      const b = $("#updBtn", el); b.disabled = true; b.textContent = "Please wait...";
      try { await OrderUpdates.turnOn(o.token); b.textContent = "Updates are on"; }
      catch (e) { $("#updErr", el).textContent = e.message; b.disabled = false; b.textContent = "Get order updates on this phone"; }
    };
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
      saveCart(); showAdded(it, 1);
    } else openFood(it);
  };
  $("#menu").addEventListener("click", onFoodClick);
  $("#deals").addEventListener("click", onFoodClick);
  // Tap the till number (welcome box or checkout) to copy it, then paste it in M-Pesa
  async function copyTill() {
    if (!settings || !settings.till) return;
    toast(await copyText(settings.till) ? `Till ${settings.till} copied. Paste it in M-Pesa.` : `Till number: ${settings.till}`);
  }
  $("#tillStep").onclick = copyTill;
  $("#sheets").addEventListener("click", e => { if (e.target.closest(".copy-till")) copyTill(); });
  $("#ordersBar").onclick = () => openMyOrders(true);
  $("#bnav").addEventListener("click", e => {
    const b = e.target.closest("[data-nav]");
    if (!b) return;
    const go = b.dataset.nav;
    if (go === "menu") { closeSheet(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (go === "deals") { closeSheet(); const d = $("#deals"); window.scrollTo({ top: d.getBoundingClientRect().top + scrollY - $(".top").offsetHeight - 8, behavior: "smooth" }); }
    if (go === "orders") openMyOrders();
    if (go === "help") openHelp();
    $$("#bnav [data-nav]").forEach(x => x.classList.toggle("on", x === b && (go === "menu" || go === "deals")));
  });
  $("#cartBtn").onclick = () => openCart();
  $("#cartBar").onclick = () => openCart();

  // ---------- install like an app ----------
  let installEvent = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  function showInstall() {
    if (standalone() || store.get("tb_noinstall", false)) return;
    if (!store.get("tb_orders", []).length && store.get("tb_visits", 0) < 2) return;
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

  // The search bar sticks right under the top bar (its height depends on the logo and the screen)
  const headH = () => document.documentElement.style.setProperty("--headH", $(".top").offsetHeight + "px");
  window.addEventListener("resize", headH);
  window.addEventListener("load", headH);
  $(".top img") && $(".top img").addEventListener("load", headH);
  // Without internet the menu from the last visit still shows (ordering waits until the phone is back online)
  async function load() {
    try {
      ({ items, settings } = await Api.shop());
      store.set("tb_menu", { at: Date.now(), items, settings });
      offline(false);
      renderShop();
    } catch (e) {
      const saved = store.get("tb_menu", null);
      if (!settings && saved) { ({ items, settings } = saved); renderShop(); }
      if (settings) offline(true);
      else $("#menu").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    }
  }
  function offline(on) {
    let bar = $("#offlineBar");
    if (!bar) { bar = document.createElement("div"); bar.id = "offlineBar"; bar.className = "offline-bar hidden"; $(".top").after(bar); }
    bar.textContent = "You are offline. This is the menu from your last visit. Connect to the internet to order.";
    bar.classList.toggle("hidden", !on);
  }
  window.addEventListener("online", () => load());
  window.addEventListener("offline", () => { if (settings) offline(true); });
  store.set("tb_visits", store.get("tb_visits", 0) + 1);
  // Opened from a friend's share link (?ref=CODE): remembered until this phone places its first order
  (() => {
    const m = /[?&]ref=([A-Za-z0-9]{4,12})/.exec(location.search);
    if (!m) return;
    if (m[1].toUpperCase() !== store.get("tb_refcode", "") && !myOrderList().length) store.set("tb_ref", m[1].toUpperCase());
    history.replaceState(null, "", location.pathname + location.hash);
  })();
  // A shared food link (/f/<food>) opens that food straight away
  load().then(() => {
    const m = /food=([^&]+)/.exec(location.hash);
    const it = m && byId(decodeURIComponent(m[1]));
    if (it) { history.replaceState(null, "", location.pathname); openFood(it); }
    else if (location.hash === "#orders") { history.replaceState(null, "", location.pathname); openMyOrders(); }
    showInstall();
  });
  // Keep the menu fresh (finished foods, opening hours) while the page stays open
  setInterval(() => { if (!document.hidden && !$("#sheets").innerHTML) load(); }, 120000);
})();
