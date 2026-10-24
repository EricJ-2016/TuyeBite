// Admin and rider pages. Admins: orders, menu, reports, team, settings. Riders: only the deliveries given to them.
(() => {
  let me = null, settings = null, orders = [], riders = [], filter = "check", days = 2;
  let knownNew = null, soundOn = false, audio = null, pollTimer = null;
  const isAdmin = () => me && me.role === "admin";
  const STATUS = { new: "Check payment", payment_problem: "Payment not found", confirmed: "Paid - preparing", on_the_way: "On the way", delivered: "Delivered", cancelled: "Cancelled" };

  // ---------- sheets (pop-ups) ----------
  function sheet(html) {
    $("#sheets").innerHTML = `<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
    const bg = $("#sheets .sheet-bg");
    bg.addEventListener("click", e => { if (e.target === bg || e.target.closest(".x")) closeSheet(); });
    return $("#sheets .sheet");
  }
  const closeSheet = () => { $("#sheets").innerHTML = ""; };
  const head = t => `<div class="head"><h2>${t}</h2><button class="x" type="button" aria-label="Close">&times;</button></div>`;
  // Runs a save, shows the error inside the form if it fails
  async function busy(btn, errEl, fn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = "Please wait...";
    if (errEl) errEl.textContent = "";
    try { await fn(); } catch (e) { if (errEl) errEl.textContent = e.message; else toast(e.message, true); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
  }

  // ---------- login ----------
  let authMode = "login";
  async function showAuth() {
    stopPolling();
    $("#appView").classList.add("hidden");
    $("#logoutBtn").classList.add("hidden");
    $("#soundBtn").classList.add("hidden");
    $("#authView").classList.remove("hidden");
    $("#authLogo").innerHTML = FULL_LOGO;
    try {
      const st = await Api.status();
      setAuthMode(st.hasAdmin ? "login" : "setup", st.setupHint);
    } catch (e) { $("#authErr").textContent = e.message; }
  }
  function setAuthMode(mode, hint) {
    authMode = mode;
    const t = { login: ["Welcome back", "Log in with your phone number", "Log in"],
      setup: ["Create the main admin", "This is done only once. Keep the setup code safe.", "Create my login"],
      reset: ["Choose a new password", "For the main admin. You need the setup code.", "Save new password"] }[mode];
    $("#authTitle").textContent = t[0]; $("#authSub").textContent = t[1]; $("#authBtn").textContent = t[2];
    $("#codeWrap").classList.toggle("hidden", mode === "login");
    $("#nameWrap").classList.toggle("hidden", mode !== "setup");
    $("#phoneWrap").classList.toggle("hidden", mode === "reset");
    $("#forgotBtn").textContent = mode === "login" ? "Forgot password? (main admin)" : "Back to log in";
    $("#forgotBtn").parentElement.classList.toggle("hidden", mode === "setup");
    $("#codeHint").textContent = hint || "";
    $("#codeHint").classList.toggle("hidden", !hint || mode === "login");
    $("#aPass").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("#authErr").textContent = "";
  }
  $("#forgotBtn").onclick = () => setAuthMode(authMode === "login" ? "reset" : "login", $("#codeHint").textContent);
  $("#authForm").onsubmit = e => {
    e.preventDefault();
    busy($("#authBtn"), $("#authErr"), async () => {
      const code = $("#aCode").value, pass = $("#aPass").value;
      me = authMode === "login" ? await Api.login($("#aPhone").value, pass)
        : authMode === "setup" ? await Api.setup(code, $("#aName").value, $("#aPhone").value, pass)
        : await Api.reset(code, pass);
      $("#aPass").value = ""; $("#aCode").value = "";
      start();
    });
  };
  $("#logoutBtn").onclick = () => { Api.logout(); me = null; knownNew = null; showAuth(); };
  Api.onLoggedOut(() => { me = null; showAuth(); });

  // ---------- new-order sound ----------
  function beep() {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = i === 2 ? 1046 : 880; o.type = "triangle";
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.22);
        o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.25);
      });
    } catch (e) {}
  }
  $("#soundBtn").onclick = () => {
    soundOn = !soundOn;
    try { localStorage.setItem("tb_sound", soundOn ? "1" : ""); } catch (e) {}
    if (soundOn) beep();
    showSoundBtn();
  };
  const showSoundBtn = () => {
    $("#soundBtn").textContent = soundOn ? "Sound on" : "Sound off";
    $("#soundBtn").className = "btn small " + (soundOn ? "green" : "amber");
  };
  // Browsers only allow sound after a tap on the page
  document.addEventListener("click", () => { if (soundOn && !audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } }, { once: true });

  // ---------- start ----------
  async function start() {
    $("#authView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    $("#logoutBtn").classList.remove("hidden");
    $("#whoSmall").textContent = `${me.name} (${me.role === "admin" ? (me.main ? "main admin" : "admin") : "rider"})`;
    $$(".admin-only").forEach(x => x.classList.toggle("hidden", !isAdmin()));
    try { soundOn = localStorage.getItem("tb_sound") === "1"; } catch (e) {}
    $("#soundBtn").classList.remove("hidden"); showSoundBtn();
    // Admins get every setting; riders only need what customers see
    try { settings = isAdmin() ? await Api.settings() : (await Api.shop()).settings; } catch (e) {}
    $("#logo").innerHTML = headerLogo(settings);
    const tabs = isAdmin()
      ? [["orders", "Orders"], ["menu", "Menu"], ["customers", "Customers"], ["reports", "Reports"], ["team", "Team"], ["settings", "Settings"]]
      : [["orders", "My deliveries"], ["account", "My account"]];
    $("#nav").innerHTML = tabs.map(([k, t]) => `<a href="#${k}" data-tab="${k}">${t}${k === "orders" ? `<span class="badge hidden" id="newBadge"></span>` : ""}</a>`).join("");
    if (!tabs.some(([k]) => k === location.hash.slice(1))) location.hash = "orders";
    show();
    startPolling();
  }
  window.addEventListener("hashchange", () => { if (me) show(); });
  function show() {
    const tab = location.hash.slice(1) || "orders";
    $$("#nav a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    closeSheet();
    ({ orders: viewOrders, menu: viewMenu, customers: viewCustomers, reports: viewReports, team: viewTeam, settings: viewSettings, account: viewAccount }[tab] || viewOrders)();
    window.scrollTo(0, 0);
  }

  // ---------- orders ----------
  const mins = t => Math.floor((Date.now() - t) / 6e4);
  // An order is late when its payment is not checked in time, or it is not delivered in time
  function lateText(o) {
    const s = settings || {};
    if (o.status === "new" && mins(o.at) >= (s.lateCheck || 5)) return `Late: payment waiting ${mins(o.at)} min`;
    if (["confirmed", "on_the_way"].includes(o.status)) {
      // Late once the promised time has passed (or, without one, after the usual delivery minutes)
      if (o.etaAt && Date.now() > o.etaAt) return `Late: promised by ${clock(o.etaAt)}, ${mins(o.etaAt)} min ago`;
      if (!o.etaAt && mins(o.at) >= (s.lateDeliver || 45)) return `Late: ordered ${mins(o.at)} min ago`;
    }
    return "";
  }
  // Ordered for later and not yet due (more than an hour away)
  const isLater = o => !!o.deliverAt && !["delivered", "cancelled"].includes(o.status) && o.deliverAt > Date.now() + 36e5;
  // "Today 1:00 PM" / "Tomorrow 1:00 PM" in Kenya time
  function whenText(t) {
    const E = 3 * 36e5, d = new Date(t + E), h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
    const day = d.toISOString().slice(0, 10), today = new Date(Date.now() + E).toISOString().slice(0, 10);
    return `${day === today ? "Today" : "Tomorrow"} ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  }
  // "Arrives by 13:45 (12 min left)"
  const etaText = o => {
    if (!o.etaAt || !["confirmed", "on_the_way"].includes(o.status)) return "";
    const left = Math.ceil((o.etaAt - Date.now()) / 6e4);
    return `Arrives by ${clock(o.etaAt)} (${left > 0 ? left + " min left" : "time passed"})`;
  };
  // What to buy at each hotel for this order
  function buyList(o) {
    const by = {};
    for (const l of o.items) (by[l.hotel || "Hotel not set"] ??= []).push(`${l.qty} x ${l.name}${l.choices.length ? " (" + choiceText(l) + ")" : ""}`);
    return `<div class="buy"><b>${isAdmin() ? "Buy" : "Pick up"}</b>${Object.entries(by).map(([h, list]) =>
      `<div><span class="hotel">${esc(h)}</span>${list.map(esc).join("<br>")}</div>`).join("")}</div>`;
  }
  const starsHtml = n => `<span class="stars">${"&#9733;".repeat(n)}<s>${"&#9733;".repeat(5 - n)}</s></span>`;

  async function loadOrders() {
    const r = await Api.orders(days);
    orders = r.orders; riders = r.riders || riders;
    // New orders: sound, badge and the tab title
    const nowNew = orders.filter(o => o.status === "new").map(o => o.id);
    if (knownNew && nowNew.some(id => !knownNew.includes(id))) {
      if (soundOn) beep();
      toast("New order received");
    }
    knownNew = nowNew;
    const waiting = isAdmin() ? orders.filter(o => o.status === "new").length : orders.filter(o => o.status === "confirmed").length;
    const badge = $("#newBadge");
    if (badge) { badge.textContent = waiting; badge.classList.toggle("hidden", !waiting); }
    document.title = (waiting ? `(${waiting}) ` : "") + (isAdmin() ? "Admin" : "Rider") + " | Tuye Bites";
  }
  function startPolling() {
    stopPolling();
    const tick = async () => {
      if (document.hidden) return;
      try {
        await loadOrders();
        if ((location.hash.slice(1) || "orders") === "orders" && !$("#sheets").innerHTML && !document.activeElement.matches("select, input")) renderOrders();
      } catch (e) {}
    };
    // Every 20 seconds while the page is on screen (phone alerts tell you sooner), and at once when you come back to it
    pollTimer = setInterval(tick, 20000);
    document.onvisibilitychange = () => { if (!document.hidden && pollTimer) tick(); };
  }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

  const FILTERS = [
    ["check", "To check", o => ["new", "payment_problem"].includes(o.status)],
    ["late", "Late", o => !!lateText(o)],
    ["later", "For later", o => isLater(o)],
    ["confirmed", "Preparing", o => o.status === "confirmed"],
    ["on_the_way", "On the way", o => o.status === "on_the_way"],
    ["delivered", "Delivered", o => o.status === "delivered"],
    ["cancelled", "Cancelled", o => o.status === "cancelled"],
    ["all", "All", () => true]
  ];
  async function viewOrders() {
    $("#page").innerHTML = `<p class="empty">Loading orders...</p>`;
    try { await loadOrders(); } catch (e) { $("#page").innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    renderOrders();
  }
  function renderOrders() {
    if (!isAdmin()) return renderRider();
    const f = FILTERS.find(x => x[0] === filter) || FILTERS[0];
    const list = orders.filter(f[2]);
    $("#page").innerHTML = `<div id="alertsTip"></div><div class="bar"><h2>Orders</h2>
        <select id="days" aria-label="Show orders from">${[[2, "Last 2 days"], [7, "Last 7 days"], [30, "Last 30 days"]].map(([d, t]) => `<option value="${d}"${d === days ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="chips" style="margin-bottom:14px">${FILTERS.map(([k, t, fn]) => {
        const n = orders.filter(fn).length;
        if ((k === "late" || k === "later") && !n && filter !== k) return "";
        return `<button class="chip${k === filter ? " on" : ""}${(k === "check" || k === "late") && n ? " alert-chip" : ""}" data-f="${k}">${t}<span class="n">${n}</span></button>`;
      }).join("")}</div>
      ${list.length ? `<div class="orders">${list.map(orderCard).join("")}</div>` : `<p class="empty">No orders here.</p>`}`;
    $$("[data-f]").forEach(b => b.onclick = () => { filter = b.dataset.f; renderOrders(); });
    $("#days").onchange = async e => { days = Number(e.target.value); await viewOrders(); };
    wireOrders(); alertsReminder();
  }
  function customerMsg(o) {
    const t = {
      new: `Hello ${o.customer}, we have received your Tuye Bites order ${o.no}. We are checking your payment.`,
      payment_problem: `Hello ${o.customer}, we could not find the M-Pesa payment for order ${o.no} (code ${o.mpesaCode}). Please check and send the correct code here: ${location.origin}/t/${o.token}`,
      confirmed: `Hello ${o.customer}, your payment for order ${o.no} is confirmed. We are getting your food ready${o.etaAt ? ", it will reach you in about " + Math.max(1, Math.ceil((o.etaAt - Date.now()) / 6e4)) + " minutes (by " + clock(o.etaAt) + ")" : ""}.`,
      on_the_way: `Hello ${o.customer}, your order ${o.no} is on the way${o.riderName ? " with " + o.riderName : ""}.`,
      delivered: `Hello ${o.customer}, thank you for ordering from Tuye Bites. Enjoy your meal.`,
      cancelled: `Hello ${o.customer}, your order ${o.no} was cancelled. ${o.cancelReason}${o.refund ? " Refund: " + o.refund : ""}`
    }[o.status];
    return t + (o.status === "payment_problem" ? "" : `\nTrack: ${location.origin}/t/${o.token}`);
  }
  function orderCard(o) {
    const items = `<ul>${o.items.map(l => `<li>${l.qty} x ${esc(l.name)}${l.choices.length ? ` <small>(${esc(choiceText(l))})</small>` : ""} <small>${money(l.total)}</small></li>`).join("")}</ul>`;
    let acts = "";
    if (["new", "payment_problem"].includes(o.status)) acts = `<button class="btn small green" data-a="paid">Payment received</button>
      ${o.status === "new" ? `<button class="btn small light" data-a="nopay">Code not found</button>` : ""}`;
    if (["confirmed", "on_the_way"].includes(o.status)) acts = `<select data-rider aria-label="Rider"><option value="">${riders.length ? "Choose rider" : "No riders yet (add in Team)"}</option>
        ${riders.map(r => `<option value="${r.id}"${r.id === o.riderId ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
      <button class="btn small plum" data-a="assign">${o.riderId ? "Change rider" : "Give to rider"}</button>
      ${o.status === "confirmed" && o.riderId ? `<button class="btn small amber" data-a="pickup">On the way</button>` : ""}
      <button class="btn small green" data-a="delivered">Delivered</button>
      <button class="btn small light" data-a="eta">Change time</button>`;
    if (!["delivered", "cancelled"].includes(o.status)) acts += `<button class="btn small line" data-a="cancel">Cancel</button>`;
    if (o.status === "delivered") acts = `<button class="btn small plum" data-a="receipt">Receipt</button>`;
    else if (["confirmed", "on_the_way"].includes(o.status)) acts += `<button class="btn small plum" data-a="receipt">Receipt</button>`;
    const meta = [o.paidAt && `Paid confirmed ${clock(o.paidAt)} by ${o.paidBy}`, o.riderName && `Rider: ${o.riderName}`,
      o.pickedAt && `Left ${clock(o.pickedAt)}`, o.deliveredAt && `Delivered ${clock(o.deliveredAt)}`, o.riderPay && `Rider pay ${money(o.riderPay)}`,
      o.cancelledAt && `Cancelled ${clock(o.cancelledAt)}: ${o.cancelReason}${o.refund ? " | Refund: " + o.refund : ""}`].filter(Boolean);
    const late = lateText(o);
    return `<article class="ocard s-${o.status}${late ? " late" : ""}" data-id="${o.id}">
      <div class="h"><div><b>${esc(o.no)}</b><small>${timeAgo(o.at)} | ${clock(o.at)}</small></div><span class="st ${o.status}">${STATUS[o.status]}</span></div>
      ${o.deliverAt && !["delivered", "cancelled"].includes(o.status) ? `<div class="later-bar">For later: deliver ${esc(whenText(o.deliverAt))}</div>` : ""}
      ${late ? `<div class="late-bar">${esc(late)}</div>` : etaText(o) ? `<div class="eta-bar">${esc(etaText(o))}</div>` : ""}
      <div class="who">${esc(o.customer)} <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div>
      <div class="where"><b>${esc(o.area)}</b> - ${esc(o.directions)}${o.note ? `<br><i>Note: ${esc(o.note)}</i>` : ""}</div>
      ${items}
      ${["confirmed", "on_the_way", "new"].includes(o.status) ? buyList(o) : ""}
      ${o.rating ? `<div class="rating">${starsHtml(o.rating)}${o.ratingNote ? ` <i>"${esc(o.ratingNote)}"</i>` : ""}</div>` : ""}
      <div class="money"><span>Food ${money(o.foodTotal)}${o.discount ? ` - ${esc(o.discountCode)} ${money(o.discount)}` : ""} + delivery ${o.freeDelivery ? "FREE (reward)" : money(o.deliveryFee)}${o.bigFee ? ` + big order ${money(o.bigFee)}` : ""}</span><b>${money(o.total)}</b></div>
      <div class="money"><span>M-Pesa code <button class="code" data-copy="${esc(o.mpesaCode)}" title="Copy">${esc(o.mpesaCode)}</button></span>
        <span>${o.costTotal ? "Profit " + money(o.foodTotal - o.discount - o.costTotal + o.deliveryFee + o.bigFee - (o.riderPay || 0)) : ""}</span></div>
      ${o.problem && o.status === "payment_problem" ? `<div class="alert bad" style="margin:0">${esc(o.problem)}<br><small>Waiting for the customer to send the correct code.</small></div>` : ""}
      ${meta.length ? `<div class="meta">${esc(meta.join(" | "))}</div>` : ""}
      <div class="acts">${acts}<a class="btn small wa" target="_blank" rel="noopener" href="${esc(waLink(o.phone, customerMsg(o)))}">WhatsApp customer</a></div>
    </article>`;
  }
  function wireOrders() {
    $$(".code").forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); toast("Code copied: " + b.dataset.copy); });
    $$(".ocard [data-a]").forEach(b => b.onclick = () => {
      const card = b.closest(".ocard"), o = orders.find(x => x.id === Number(card.dataset.id)), a = b.dataset.a;
      if (a === "nopay") return askNoPay(o);
      if (a === "receipt") return showReceipt(o);
      if (a === "paid" || a === "eta") return askMinutes(o, a);
      if (a === "cancel") return askCancel(o);
      const extra = {};
      if (a === "assign") {
        extra.riderId = Number($("[data-rider]", card).value);
        if (!extra.riderId) return toast("Choose the rider first.", true);
      }
      if (a === "delivered" && !confirm(`Mark ${o.no} as delivered?`)) return;
      busy(b, null, async () => { await Api.orderAction(o.id, a, extra); await loadOrders(); renderOrders(); toast("Saved"); });
    });
  }
  // Payment received (or Change time): how many minutes until the food reaches the customer. They see it on their order page.
  function askMinutes(o, action) {
    let last = 30;
    try { last = Number(localStorage.getItem("tb_eta")) || 30; } catch (e) {}
    const paid = action === "paid", fixed = paid && o.deliverAt && o.deliverAt > Date.now() + 5 * 6e4;
    const el = sheet(`${head((paid ? "Payment received - " : "New delivery time - ") + esc(o.no))}
      <form class="form" id="f" novalidate>
        ${paid ? `<p class="alert info" style="margin:0">Check that the Till messages show <b>${money(o.total)}</b> with code <b>${esc(o.mpesaCode)}</b>.</p>` : ""}
        ${fixed ? `<p class="later-bar">Ordered for later: deliver ${esc(whenText(o.deliverAt))}. The customer sees that time.</p>` : ""}
        <label class="${fixed ? "hidden" : ""}">Food will reach the customer in (minutes)
          <input id="m" type="number" min="5" max="240" inputmode="numeric" value="${last}" style="font-size:1.4rem;font-weight:800"></label>
        <div class="chips ${fixed ? "hidden" : ""}">${[15, 20, 30, 40, 45, 60].map(n => `<button type="button" class="chip" data-m="${n}">${n} min</button>`).join("")}</div>
        <p class="hint ${fixed ? "hidden" : ""}">The customer sees "arrives in about ... minutes" counting down on their order page.</p>
        <p class="err" id="e"></p><button class="btn green wide">${paid ? "Confirm payment" : "Save new time"}</button></form>`);
    $$("[data-m]", el).forEach(b => b.onclick = () => { $("#m", el).value = b.dataset.m; });
    $("#f", el).onsubmit = e => { e.preventDefault(); busy($("button.wide", el), $("#e", el), async () => {
      const minutes = fixed ? undefined : Number($("#m", el).value);
      await Api.orderAction(o.id, action, { minutes });
      if (!fixed) { try { localStorage.setItem("tb_eta", String(minutes)); } catch (err) {} }
      closeSheet(); await loadOrders(); renderOrders();
      toast(fixed ? `Payment confirmed. Deliver ${whenText(o.deliverAt)}.` : paid ? `Payment confirmed. Food in ${minutes} min.` : `New time: ${minutes} min`);
    }); };
  }
  // ---------- receipt (the same slip the customer gets) ----------
  function showReceipt(o) {
    let file = null;
    const make = () => (file ??= Receipt.pdf(o, settings).catch(e => { file = null; throw e; }));
    setTimeout(() => make().catch(() => {}), 300);   // made in the background so sending is quick
    const el = sheet(`${head("Receipt " + esc(o.no))}
      <div class="rc-wrap">${Receipt.html(o, settings)}</div>
      <div class="rc-actions"><button class="btn green" id="rcSend">Send to customer</button><button class="btn light" id="rcPdf">Download PDF</button>
        <button class="btn light" id="rcPrint">Print</button></div>
      <p class="hint" style="text-align:center">The customer can also download it from their order page.</p>`);
    $("#rcPdf", el).onclick = () => busy($("#rcPdf", el), null, async () => { Receipt.download(await make()); toast("Receipt downloaded"); });
    $("#rcPrint", el).onclick = () => Receipt.print(o, settings);
    // Phones: share the PDF straight into WhatsApp. Computers: download it and open the customer's chat with the order link.
    $("#rcSend", el).onclick = () => busy($("#rcSend", el), null, async () => {
      const f = await make();
      const text = `Hello ${o.customer}, here is your Tuye Bites receipt for order ${o.no}. Thank you for ordering with us!`;
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: `Receipt ${o.no}`, text }); return; }
        catch (e) {
          if (e.name === "AbortError") return;
          if (e.name === "NotAllowedError") { toast("PDF ready: tap Send to customer again"); return; }
        }
      }
      Receipt.download(f);
      window.open(waLink(o.phone, `${text}\nYou can also download it here: ${location.origin}/t/${o.token}`), "_blank", "noopener");
      toast("PDF downloaded. In WhatsApp, tap the paperclip, then Document, and choose it.");
    });
  }
  function askNoPay(o) {
    const el = sheet(`${head("Payment not found - " + esc(o.no))}
      <form class="form" id="f"><p class="hint">The customer will see this message and can type the correct M-Pesa code on their tracking page.</p>
        <label>Message to the customer <textarea id="msg" maxlength="200">We could not find M-Pesa code ${esc(o.mpesaCode)} for ${money(o.total)} on our till.</textarea></label>
        <p class="err" id="e"></p><button class="btn wide">Send</button></form>`);
    $("#f", el).onsubmit = e => { e.preventDefault(); busy($("button.wide", el), $("#e", el), async () => {
      await Api.orderAction(o.id, "nopay", { note: $("#msg", el).value }); closeSheet(); await loadOrders(); renderOrders();
      toast("Saved. You can also tell the customer on WhatsApp.");
    }); };
  }
  function askCancel(o) {
    const paid = !["new", "payment_problem"].includes(o.status);
    const el = sheet(`${head("Cancel " + esc(o.no))}
      <form class="form" id="f"><label>Why? (the customer sees this) <input id="why" maxlength="200" placeholder="e.g. The hotel has finished this food"></label>
        <label>Refund ${paid ? "" : "(if any money was received)"} <input id="ref" maxlength="200" placeholder="e.g. KES ${o.total} sent back to ${esc(o.phone)}, code ..."></label>
        <p class="err" id="e"></p><button class="btn wide">Cancel the order</button></form>`);
    $("#f", el).onsubmit = e => { e.preventDefault(); busy($("button.wide", el), $("#e", el), async () => {
      await Api.orderAction(o.id, "cancel", { reason: $("#why", el).value, refund: $("#ref", el).value }); closeSheet(); await loadOrders(); renderOrders();
      toast("Order cancelled");
    }); };
  }

  // A rider's list: only their orders, no money to collect because customers pay first
  function renderRider() {
    const active = orders.filter(o => ["confirmed", "on_the_way"].includes(o.status));
    const done = orders.filter(o => o.status === "delivered");
    const card = o => `<article class="ocard s-${o.status}" data-id="${o.id}">
      <div class="h"><div><b>${esc(o.no)}</b><small>${timeAgo(o.at)}</small></div><span class="st ${o.status}">${STATUS[o.status]}</span></div>
      <div class="who">${esc(o.customer)} <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div>
      <div class="where"><b>${esc(o.area)}</b> - ${esc(o.directions)}${o.note ? `<br><i>Note: ${esc(o.note)}</i>` : ""}</div>
      ${o.status === "delivered" ? `<ul>${o.items.map(l => `<li>${l.qty} x ${esc(l.name)}${l.choices.length ? ` <small>(${esc(choiceText(l))})</small>` : ""}</li>`).join("")}</ul>` : buyList(o)}
      ${o.status === "delivered" ? `<div class="meta">Delivered ${clock(o.deliveredAt)}${o.rating ? " | " + starsHtml(o.rating) : ""}</div>` : `${o.deliverAt ? `<div class="later-bar">For later: deliver ${esc(whenText(o.deliverAt))}</div>` : o.etaAt ? `<div class="eta-bar">Deliver by ${clock(o.etaAt)}</div>` : ""}<div class="paid-note">PAID - do not collect money</div>
      <div class="acts"><a class="btn small green" href="tel:${esc(o.phone)}">Call customer</a>
        ${o.status === "confirmed" ? `<button class="btn small amber" data-a="pickup">I have picked the food</button>` : ""}
        <button class="btn small" data-a="delivered">Delivered</button></div>`}
    </article>`;
    $("#page").innerHTML = `<div id="alertsTip"></div><div class="bar"><h2>My deliveries</h2></div>
      ${active.length ? `<div class="orders">${active.map(card).join("")}</div>` : `<p class="empty">No deliveries for you right now. This page updates by itself.</p>`}
      ${done.length ? `<h3 style="margin-top:24px">Delivered today (${done.length})</h3><div class="orders">${done.map(card).join("")}</div>` : ""}`;
    $$(".ocard [data-a]").forEach(b => b.onclick = () => {
      const o = orders.find(x => x.id === Number(b.closest(".ocard").dataset.id)), a = b.dataset.a;
      if (a === "delivered" && !confirm(`Did ${o.customer} receive the food?`)) return;
      busy(b, null, async () => { await Api.orderAction(o.id, a); await loadOrders(); renderRider(); toast("Saved"); });
    });
    alertsReminder();
  }

  // ---------- menu ----------
  let menu = [], menuGroup = "All";
  async function viewMenu() {
    $("#page").innerHTML = `<p class="empty">Loading the menu...</p>`;
    try { menu = (await Api.items()).items; } catch (e) { $("#page").innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    renderMenu();
  }
  function renderMenu() {
    const groups = [...new Set([...settings.categories, ...menu.map(i => i.category)])];
    const list = menu.filter(i => menuGroup === "All" || i.category === menuGroup);
    const off = menu.filter(i => !i.available).length;
    const noSmall = menu.filter(i => i.image && i.thumb === i.image).length;
    $("#page").innerHTML = `<div class="bar"><h2>Menu</h2>${noSmall ? `<button class="btn small light" id="mkSmall">Make small photos (${noSmall})</button>` : ""}<button class="btn green" id="addFood">Add food</button></div>
      <p class="hint" style="margin:-6px 0 12px">${menu.length} foods${off ? `, ${off} finished for today` : ""}. Switch a food off when it is finished; switch it on again tomorrow.</p>
      <div class="chips" style="margin-bottom:12px">${["All", ...groups].map(g => `<button class="chip${g === menuGroup ? " on" : ""}" data-g="${esc(g)}">${esc(g)}<span class="n">${g === "All" ? menu.length : menu.filter(i => i.category === g).length}</span></button>`).join("")}</div>
      <div class="box scroll">${list.length ? `<table class="tbl menu-tbl"><thead><tr><th></th><th>Food</th><th class="r">Selling</th><th class="r">Buying</th><th class="r">Profit</th><th>Available</th><th></th></tr></thead><tbody>
        ${list.map(i => `<tr data-id="${esc(i.id)}"><td>${i.image ? `<img class="thumb" src="${esc(i.image)}" alt="">` : `<span class="thumb">${esc(i.name[0])}</span>`}</td>
          <td><b>${esc(i.name)}</b>${dealOf(i.id) ? ` <span class="st confirmed">Deal ${money(dealOf(i.id))}</span>` : ""}<br><small class="hint">${esc(i.category)}${i.hotel ? " | from " + esc(i.hotel) : ""}${i.options.length ? " | " + i.options.map(g => esc(g.name)).join(", ") : ""}${(i.orderedToday || 0) + i.realToday || i.viewing ? `<br>Shows: ${[((i.orderedToday || 0) + i.realToday) && `${(i.orderedToday || 0) + i.realToday} ordered today${i.realToday ? ` (${i.realToday} real)` : ""}`, i.viewing && i.viewing + " viewing"].filter(Boolean).join(", ")}` : ""}</small></td>
          <td class="r" data-l="Selling">${money(i.price)}</td><td class="r" data-l="Buying">${i.cost != null ? money(i.cost) : `<small class="hint">not set</small>`}</td>
          <td class="r" data-l="Profit">${i.cost != null ? money(i.price - i.cost) : ""}</td>
          <td><label class="switch"><input type="checkbox" data-av ${i.available ? "checked" : ""}><span></span></label></td>
          <td><div class="row-btns"><button class="btn small light" data-share>Share</button><button class="btn small light" data-edit>Edit</button></div></td></tr>`).join("")}</tbody></table>`
        : `<p class="empty">No foods yet. Tap "Add food".</p>`}</div>`;
    $$("[data-g]").forEach(b => b.onclick = () => { menuGroup = b.dataset.g; renderMenu(); });
    $("#addFood").onclick = () => editFood(null);
    // Small copies of the photos for the customers' menu cards (foods saved before this existed)
    if ($("#mkSmall")) $("#mkSmall").onclick = () => busy($("#mkSmall"), null, async () => {
      const todo = menu.filter(i => i.image && i.thumb === i.image);
      let n = 0;
      for (const it of todo) {
        const photos = await Promise.all(it.images.map(async src => ({ src, thumb: await shrinkSrc(src, 360, 0.7).catch(() => null) })));
        const { id, image, images, thumb, createdAt, realToday, ...rest } = it;
        await Api.saveItem(id, { ...rest, photos });
        $("#mkSmall").textContent = `Please wait... ${++n} of ${todo.length}`;
      }
      toast(`Small photos made for ${n} food${n === 1 ? "" : "s"}`);
      await viewMenu();
    });
    $$("[data-edit]").forEach(b => b.onclick = () => editFood(menu.find(i => i.id === b.closest("tr").dataset.id)));
    $$("[data-share]").forEach(b => b.onclick = () => shareFood(menu.find(i => i.id === b.closest("tr").dataset.id)));
    $$("[data-av]").forEach(c => c.onchange = async () => {
      const id = c.closest("tr").dataset.id;
      try {
        const { item } = await Api.setAvailable(id, c.checked);
        menu = menu.map(i => i.id === id ? item : i);
        toast(item.available ? `${item.name} is available` : `${item.name} is finished for today`);
        renderMenu();
      } catch (e) { toast(e.message, true); c.checked = !c.checked; }
    });
  }

  const dealOf = id => {
    const now = Date.now(), d = settings.deal.on && settings.deal.items.find(x => x.id === id && (x.start || 0) <= now && x.end > now);
    return d ? d.price : 0;
  };
  // A link that shows the food's photo and price on WhatsApp and Status
  function shareFood(it) {
    const link = shareLink(it.id), price = dealOf(it.id) || it.price;
    const text = `${it.name} - ${money(price)}${it.description ? "\n" + it.description : ""}\nOrder now on Tuye Bites, delivered in Wote:\n${link}`;
    const el = sheet(`${head("Share " + esc(it.name))}
      <p class="hint">Customers who open this link see the photo and price, then can order straight away.</p>
      <input readonly value="${esc(link)}" id="lnk">
      <div class="bottom"><button class="btn light" id="cp">Copy link</button>
        <a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink("", text))}">Share on WhatsApp</a></div>`);
    $("#cp", el).onclick = () => { $("#lnk", el).select(); navigator.clipboard && navigator.clipboard.writeText(link); toast("Link copied"); };
  }

  function choiceRow(c = { name: "", price: "" }) {
    return `<div class="rowi choice-row"><input placeholder="Choice, e.g. Large" maxlength="40" data-cn value="${esc(c.name)}">
      <input type="number" min="0" inputmode="numeric" placeholder="+ KES" style="max-width:110px" data-cp value="${c.price || ""}">
      <button type="button" class="x" data-rmc aria-label="Remove choice">&times;</button></div>`;
  }
  function groupBox(g = { name: "", pick: "one", required: false, choices: [{ name: "", price: 0 }] }) {
    return `<div class="ogroup"><div class="rowi"><input placeholder="Group name, e.g. Size, Extras, Flavour" maxlength="30" data-gn value="${esc(g.name)}">
        <button type="button" class="x" data-rmg aria-label="Remove group">&times;</button></div>
      <div class="rowi"><select data-gp><option value="one"${g.pick === "one" ? " selected" : ""}>Customer picks one</option><option value="many"${g.pick === "many" ? " selected" : ""}>Customer can pick many</option></select>
        <label class="check"><input type="checkbox" data-gr ${g.required ? "checked" : ""}> Must choose</label></div>
      <div class="rows" data-choices>${g.choices.map(choiceRow).join("")}</div>
      <button type="button" class="btn small light" data-addc>Add choice</button></div>`;
  }
  function editFood(it) {
    // Photos: saved ones are kept by their address, new ones are sent as pictures. The first is the main photo.
    let photos = it ? [...(it.images || [])] : [];
    const groups = [...new Set([...settings.categories, ...(it ? [it.category] : [])])];
    const el = sheet(`${head(it ? "Edit food" : "Add food")}
      <form class="form" id="f" novalidate>
        <div><b>Photos</b> <span class="hint">(up to 8; the first one is the main photo)</span>
          <div class="pgrid" id="pgrid"></div></div>
        <label>Food name <input id="n" maxlength="60" value="${esc(it ? it.name : "")}" placeholder="e.g. Chips Masala"></label>
        <label>Food group <select id="cat">${groups.map(g => `<option${it && it.category === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
        <div class="two"><label>Selling price (KES) <input id="p" type="number" min="1" inputmode="numeric" value="${it ? it.price : ""}"></label>
          <label>"Was" price (optional) <input id="op" type="number" min="0" inputmode="numeric" value="${it && it.oldPrice ? it.oldPrice : ""}"><span class="hint">Shows as an offer, e.g. was 300</span></label></div>
        <div class="two"><label>Buying price (KES) <input id="c" type="number" min="0" inputmode="numeric" value="${it && it.cost != null ? it.cost : ""}"><span class="hint">Private. Used for profit.</span></label>
          <label>Bought from (hotel) <input id="h" maxlength="60" value="${esc(it ? it.hotel : "")}" placeholder="Private"></label></div>
        <div class="motiv"><b>To encourage customers</b><p class="hint">Customers see these on the food. They are only what you type: they are not counted in sales or reports. Leave empty to hide.</p>
          <div class="two"><label>Ordered today <input id="ot" type="number" min="0" inputmode="numeric" value="${it && it.orderedToday ? it.orderedToday : ""}" placeholder="e.g. 18"></label>
            <label>People viewing now <input id="vw" type="number" min="0" inputmode="numeric" value="${it && it.viewing ? it.viewing : ""}" placeholder="e.g. 6"></label></div></div>
        <label>Description (optional) <textarea id="d" maxlength="300" placeholder="e.g. Crispy chips with masala spice">${esc(it ? it.description : "")}</textarea></label>
        <div><b>Choices and extras</b><p class="hint">For sizes, flavours or extras like sauce. The price is added to the food price (0 = free).</p></div>
        <div class="rows" id="groups">${(it ? it.options : []).map(groupBox).join("")}</div>
        <button type="button" class="btn small light" id="addG">Add a group of choices</button>
        <label class="check"><input type="checkbox" id="av" ${!it || it.available ? "checked" : ""}> Available now</label>
        <p class="err" id="e"></p>
        <div class="bottom">${it ? `<button type="button" class="btn line" id="del">Delete</button>` : ""}<button class="btn green" id="save">Save</button></div>
      </form>`);
    const drawPhotos = () => {
      $("#pgrid", el).innerHTML = photos.map((u, i) => `<div class="pbox${i ? "" : " main"}">
          <img src="${esc(u)}" alt="">${i ? "" : `<span class="pmain">Main</span>`}
          <div class="pbtns">${i ? `<button type="button" data-first="${i}" title="Make main photo">Make main</button>` : ""}<button type="button" data-rmp="${i}" aria-label="Remove photo">&times;</button></div></div>`).join("")
        + (photos.length < 8 ? `<label class="padd"><input type="file" accept="image/*" multiple id="pf" hidden><b>+</b><span>Add photos</span></label>` : "");
      const pf = $("#pf", el);
      if (pf) pf.onchange = async e => {
        const files = [...e.target.files].slice(0, 8 - photos.length);
        for (const f of files) {
          try { photos.push(await compressImage(f, 900, 0.74)); } catch (err) { toast(err.message, true); }
        }
        if (e.target.files.length > files.length) toast("Only 8 photos for each food.", true);
        drawPhotos();
      };
    };
    $("#pgrid", el).addEventListener("click", e => {
      const rm = e.target.closest("[data-rmp]"), first = e.target.closest("[data-first]");
      if (rm) { photos.splice(Number(rm.dataset.rmp), 1); drawPhotos(); }
      if (first) { const [x] = photos.splice(Number(first.dataset.first), 1); photos.unshift(x); drawPhotos(); }
    });
    drawPhotos();
    $("#addG", el).onclick = () => $("#groups", el).insertAdjacentHTML("beforeend", groupBox());
    $("#groups", el).addEventListener("click", e => {
      if (e.target.closest("[data-rmg]")) e.target.closest(".ogroup").remove();
      if (e.target.closest("[data-rmc]")) e.target.closest(".choice-row").remove();
      if (e.target.closest("[data-addc]")) $("[data-choices]", e.target.closest(".ogroup")).insertAdjacentHTML("beforeend", choiceRow());
    });
    $("#groups", el).addEventListener("change", e => {
      // "Must choose" only makes sense when the customer picks one
      if (e.target.matches("[data-gp]")) { const r = $("[data-gr]", e.target.closest(".ogroup")); r.disabled = e.target.value === "many"; if (r.disabled) r.checked = false; }
    });
    $$("[data-gp]", el).forEach(s => { if (s.value === "many") $("[data-gr]", s.closest(".ogroup")).disabled = true; });
    $("#f", el).onsubmit = e => {
      e.preventDefault();
      const options = $$(".ogroup", el).map(g => ({
        name: $("[data-gn]", g).value, pick: $("[data-gp]", g).value, required: $("[data-gr]", g).checked,
        choices: $$(".choice-row", g).map(r => ({ name: $("[data-cn]", r).value, price: $("[data-cp]", r).value })).filter(c => c.name.trim())
      })).filter(g => g.name.trim() || g.choices.length);
      const data = { name: $("#n", el).value, category: $("#cat", el).value, price: $("#p", el).value, oldPrice: $("#op", el).value,
        cost: $("#c", el).value, hotel: $("#h", el).value, description: $("#d", el).value, options, available: $("#av", el).checked,
        orderedToday: $("#ot", el).value, viewing: $("#vw", el).value };
      busy($("#save", el), $("#e", el), async () => {
        // Each photo goes with a small copy for the menu cards (also made now for photos saved before)
        data.photos = await Promise.all(photos.map(async src => ({ src, thumb: await shrinkSrc(src, 360, 0.7).catch(() => null) })));
        await Api.saveItem(it && it.id, data);
        toast(it ? "Food saved" : "Food added");
        await viewMenu();
      });
    };
    if ($("#del", el)) $("#del", el).onclick = () => {
      if (!confirm(`Delete ${it.name} from the menu?`)) return;
      busy($("#del", el), $("#e", el), async () => { await Api.removeItem(it.id); toast("Food deleted"); await viewMenu(); });
    };
  }

  // ---------- reports ----------
  let range = "today", lastReport = null;
  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  function rangeTimes() {
    const today = dayStart(Date.now()), D = 864e5;
    if (range === "today") return [today, today + D];
    if (range === "yesterday") return [today - D, today];
    if (range === "week") { const wd = (new Date(today).getDay() + 6) % 7; return [today - wd * D, today + D]; }
    if (range === "month") { const x = new Date(today); x.setDate(1); return [x.getTime(), today + D]; }
    const f = $("#from") && $("#from").value, t = $("#to") && $("#to").value;
    return [f ? dayStart(f + "T00:00") : today, (t ? dayStart(t + "T00:00") : today) + D];
  }
  async function viewReports() {
    const iso = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const [f0, t0] = rangeTimes();
    $("#page").innerHTML = `<div class="bar"><h2>Reports</h2><button class="btn small wa" id="sumWa">Send summary to my WhatsApp</button><button class="btn small light" id="csv">Download orders (Excel)</button></div>
      <div class="chips" style="margin-bottom:10px">${[["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["custom", "Choose dates"]]
        .map(([k, t]) => `<button class="chip${k === range ? " on" : ""}" data-r="${k}">${t}</button>`).join("")}</div>
      <div class="bar ${range === "custom" ? "" : "hidden"}"><label>From <input type="date" id="from" value="${iso(f0)}"></label><label>To <input type="date" id="to" value="${iso(t0 - 864e5)}"></label>
        <button class="btn small" id="go" style="align-self:flex-end">Show</button></div>
      <div id="rep"><p class="empty">Loading...</p></div>`;
    $$("[data-r]").forEach(b => b.onclick = () => { range = b.dataset.r; viewReports(); });
    if ($("#go")) $("#go").onclick = loadReport;
    $("#csv").onclick = downloadCsv;
    $("#sumWa").onclick = sendSummary;
    loadReport();
  }
  async function loadReport() {
    const [from, to] = rangeTimes();
    try { lastReport = await Api.report(from, to); } catch (e) { $("#rep").innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    const r = lastReport, maxH = Math.max(1, ...r.hours);
    const table = (rows, cols) => rows.length ? `<table class="tbl"><tbody>${rows.map(cols).join("")}</tbody></table>` : `<p class="hint">Nothing yet.</p>`;
    $("#rep").innerHTML = `<div class="stats">
        <div class="stat"><small>Orders delivered</small><b>${r.delivered}</b></div>
        <div class="stat"><small>Money received</small><b>${money(r.received)}</b></div>
        <div class="stat"><small>Food sales</small><b>${money(r.food)}</b></div>
        ${r.discounts ? `<div class="stat red"><small>Discount codes</small><b>${money(r.discounts)}</b></div>` : ""}
        ${r.freeDeliveries ? `<div class="stat"><small>Free delivery rewards</small><b>${r.freeDeliveries}</b></div>` : ""}
        ${r.bigFees ? `<div class="stat"><small>Big order fees (in delivery fees)</small><b>${money(r.bigFees)}</b></div>` : ""}
        <div class="stat"><small>Delivery fees</small><b>${money(r.fees)}</b></div>
        <div class="stat red"><small>Food buying cost</small><b>${money(r.cost)}</b></div>
        <div class="stat red"><small>Rider pay</small><b>${money(r.riderPay)}</b></div>
        <div class="stat green"><small>Profit (after buying and rider pay)</small><b>${money(r.profit)}</b></div>
        <div class="stat"><small>Customer rating</small><b>${r.rating ? r.rating + " / 5" : "-"}</b><small>${r.ratedCount} rated</small></div>
        <div class="stat plum"><small>Still in progress</small><b>${r.waiting}</b></div>
        <div class="stat"><small>Cancelled</small><b>${r.cancelled}</b></div></div>
      ${r.missingCost ? `<p class="alert info">Some delivered foods have no buying price, so the profit looks bigger than it is. Add buying prices in Menu.</p>` : ""}
      <div class="box"><h3>Best sellers</h3>${table(r.foods.slice(0, 15), f => `<tr><td>${esc(f.name)}</td><td class="r">${f.qty} sold</td><td class="r">${money(f.money)}</td></tr>`)}</div>
      <div class="box"><h3>Busiest hours</h3><div class="hours">${r.hours.map((n, h) => `<div style="height:${(n / maxH) * 100}%" title="${h}:00 - ${n} orders"></div>`).join("")}</div>
        <div class="hours-l">${r.hours.map((_, h) => `<span>${h % 3 === 0 ? h : ""}</span>`).join("")}</div></div>
      <div class="box"><h3>Delivery areas</h3>${table(r.areas, a => `<tr><td>${esc(a.name)}</td><td class="r">${a.orders} order${a.orders === 1 ? "" : "s"}</td><td class="r">${money(a.fees)}</td></tr>`)}</div>
      <div class="box"><h3>Money spent at each hotel</h3>${table(r.hotels, h => `<tr><td>${esc(h.name)}</td><td class="r">${h.qty} foods</td><td class="r">${money(h.cost)}</td></tr>`)}</div>
      <div class="box"><h3>Riders: deliveries and pay owed</h3>${table(r.riders, x => `<tr><td>${esc(x.name)}</td><td class="r">${x.orders} delivered</td><td class="r">${x.rating ? x.rating + " stars" : ""}</td><td class="r"><b>${money(x.pay)}</b></td></tr>`)}</div>
      <div class="box"><h3>What customers said</h3>${r.comments.length ? r.comments.map(c => `<div class="comment">${starsHtml(c.rating)} <b>${esc(c.customer)}</b> <small class="hint">${esc(c.no)}${c.rider ? " | rider " + esc(c.rider) : ""}</small><br>${esc(c.note)}</div>`).join("") : `<p class="hint">No comments yet.</p>`}</div>`;
  }
  // The period's numbers as a WhatsApp message to the logged-in admin's own number
  function sendSummary() {
    const r = lastReport;
    if (!r) return;
    const label = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", custom: "Chosen dates" }[range];
    const d = t => new Date(t).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
    const text = [`TUYE BITES SUMMARY - ${label} (${d(r.from)}${r.to - r.from > 864e5 ? " to " + d(r.to - 1) : ""})`, "",
      `Orders delivered: ${r.delivered}`, `Money received: ${money(r.received)}`, `Food sales: ${money(r.food)}`,
      r.discounts ? `Discount codes: - ${money(r.discounts)}` : null, `Delivery fees: ${money(r.fees)}`,
      `Food buying cost: ${money(r.cost)}`, `Rider pay: ${money(r.riderPay)}`, `PROFIT: ${money(r.profit)}`, "",
      `Cancelled: ${r.cancelled} | Still in progress: ${r.waiting}`, r.rating ? `Customer rating: ${r.rating} / 5 (${r.ratedCount} rated)` : null,
      r.foods.length ? "\nBest sellers:\n" + r.foods.slice(0, 5).map(f => `- ${f.name}: ${f.qty}`).join("\n") : null,
      r.riders.length ? "\nRiders to pay:\n" + r.riders.map(x => `- ${x.name}: ${x.orders} deliveries, ${money(x.pay)}`).join("\n") : null
    ].filter(x => x !== null).join("\n");
    window.open(waLink(me.phone, text), "_blank");
  }
  function downloadCsv() {
    if (!lastReport) return;
    const q = v => { const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) && typeof v !== "number" ? "'" + t : t).replace(/"/g, '""')}"`; };
    const rows = [["Order", "Date", "Time", "Status", "Customer", "Phone", "Area", "Foods", "Food KES", "Delivery KES", "Total KES", "Buying KES", "Discount KES", "Big order KES", "Rider pay KES", "Profit KES", "M-Pesa code", "Rider", "Stars"]];
    for (const o of lastReport.list) rows.push([o.no, new Date(o.at).toLocaleDateString("en-KE"), clock(o.at), STATUS[o.status], o.customer, o.phone, o.area,
      o.items.map(l => `${l.qty} x ${l.name}${l.choices.length ? " (" + choiceText(l) + ")" : ""}`).join("; "),
      o.foodTotal, o.deliveryFee, o.total, o.costTotal, o.discount || "", o.bigFee || "", o.riderPay || "", o.status === "delivered" ? o.foodTotal - o.discount - o.costTotal + o.deliveryFee + o.bigFee - (o.riderPay || 0) : "", o.mpesaCode, o.riderName, o.rating || ""]);
    const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Tuye Bites orders ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- customers ----------
  let custQuery = "";
  async function viewCustomers() {
    $("#page").innerHTML = `<p class="empty">Loading customers...</p>`;
    let list;
    try { list = (await Api.customers()).customers; } catch (e) { $("#page").innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    const draw = () => {
      const q = custQuery.trim().toLowerCase();
      const shown = list.filter(c => !q || (c.name + " " + c.phone + " " + c.area).toLowerCase().includes(q));
      $("#clist").innerHTML = shown.length ? shown.map(c => `<div class="cust${c.blocked ? " blocked" : ""}" data-p="${esc(c.phone)}">
          <div class="t"><b>${esc(c.name || "(no orders)")}</b> <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>
            ${c.blocked ? `<span class="st cancelled">Blocked</span>` : c.delivered >= 5 ? `<span class="st delivered">Regular</span>` : ""}
            <small class="hint">${c.area ? esc(c.area) + " | " : ""}${c.orders} order${c.orders === 1 ? "" : "s"}, ${c.delivered} delivered${c.cancelled ? `, ${c.cancelled} cancelled` : ""}${c.last ? " | last " + timeAgo(c.last) : ""}${c.rating ? " | gives " + c.rating + " stars" : ""}</small>
            ${c.blocked && c.blocked.reason ? `<small class="err">${esc(c.blocked.reason)}</small>` : ""}</div>
          <div class="r"><b>${money(c.spent)}</b><div class="row-btns">
            <a class="btn small wa" target="_blank" rel="noopener" href="${esc(waLink(c.phone, `Hello ${c.name}, `))}">WhatsApp</a>
            <button class="btn small ${c.blocked ? "green" : "line"}" data-block>${c.blocked ? "Unblock" : "Block"}</button></div></div></div>`).join("")
        : `<p class="empty">${list.length ? "No customer matches." : "No customers yet. They appear here after their first order."}</p>`;
      $$("[data-block]").forEach(b => b.onclick = async () => {
        const c = list.find(x => x.phone === b.closest(".cust").dataset.p);
        let reason = "";
        if (!c.blocked) {
          reason = prompt(`Block ${c.phone}? They will not be able to order online.\nWhy? (only admins see this)`, "Fake order");
          if (reason === null) return;
        }
        try { await Api.block(c.phone, !c.blocked, reason); toast(c.blocked ? "Unblocked" : "Blocked"); viewCustomers(); }
        catch (e) { toast(e.message, true); }
      });
    };
    const total = list.reduce((a, c) => a + c.spent, 0);
    $("#page").innerHTML = `<div class="bar"><h2>Customers</h2><button class="btn small light" id="blockNew">Block a number</button></div>
      <p class="hint" style="margin:-6px 0 12px">${list.filter(c => c.orders).length} customers, ${money(total)} spent on delivered orders. Best customers first.</p>
      <div class="search"><input type="search" id="cq" placeholder="Search name, phone or area" value="${esc(custQuery)}"></div>
      <div class="box" id="clist"></div>`;
    $("#cq").oninput = e => { custQuery = e.target.value; draw(); };
    $("#blockNew").onclick = async () => {
      const phone = prompt("Phone number to block (e.g. 0712345678):");
      if (!phone) return;
      const reason = prompt("Why? (only admins see this)", "Fake order");
      if (reason === null) return;
      try { await Api.block(phone, true, reason); toast("Blocked"); viewCustomers(); } catch (e) { toast(e.message, true); }
    };
    draw();
  }

  // ---------- team: admins and riders ----------
  async function viewTeam() {
    $("#page").innerHTML = `<p class="empty">Loading...</p>`;
    let users;
    try { users = (await Api.users()).users; } catch (e) { $("#page").innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    const row = u => `<tr data-id="${u.id}"><td><b>${esc(u.name)}</b>${u.id === me.id ? " (you)" : ""}<br><small class="hint">${esc(u.phone)}</small></td>
      <td>${u.role === "admin" ? (u.main ? "Main admin" : "Admin") : `Rider<br><small class="hint">${money(u.pay ?? settings.riderPay)} per delivery</small>`}</td>
      <td>${u.active ? `<span class="st delivered">On</span>` : `<span class="st cancelled">Off</span>`}</td>
      <td><small class="hint">${u.lastLogin ? "Last log in " + timeAgo(u.lastLogin) : "Never logged in"}</small></td>
      <td>${canEdit(u) ? `<button class="btn small light" data-edit>Edit</button>` : ""}</td></tr>`;
    $("#page").innerHTML = `<div class="bar"><h2>Team</h2><button class="btn green" id="addU">Add rider${me.main ? " or admin" : ""}</button></div>
      <p class="hint" style="margin:-6px 0 12px">Everyone logs in at this same page with their phone number and password. Riders only see the deliveries you give them.${me.main ? "" : " Only the main admin can add other admins."}</p>
      <div class="box scroll"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Login</th><th></th><th></th></tr></thead><tbody>${users.map(row).join("")}</tbody></table></div>`;
    $("#addU").onclick = () => editUser(null);
    $$("[data-edit]").forEach(b => b.onclick = () => editUser(users.find(u => u.id === Number(b.closest("tr").dataset.id))));
  }
  const canEdit = u => u.id === me.id || (!u.main && (u.role === "rider" || me.main));
  function editUser(u) {
    const self = u && u.id === me.id;
    const el = sheet(`${head(u ? "Edit " + esc(u.name) : "Add a login")}
      <form class="form" id="f" novalidate>
        ${u ? "" : `<label>Role <select id="role"><option value="rider">Rider</option>${me.main ? `<option value="admin">Admin (can do everything except change other admins)</option>` : ""}</select></label>`}
        <label>Name <input id="n" maxlength="40" value="${esc(u ? u.name : "")}"></label>
        <label>Phone number (used to log in) <input id="ph" type="tel" inputmode="tel" value="${esc(u ? u.phone : "")}" placeholder="07XXXXXXXX"></label>
        <label class="${u && u.role !== "rider" ? "hidden" : ""}" id="payWrap">Pay per delivery (KES) <input id="pay" type="number" min="0" inputmode="numeric" value="${u && u.pay != null ? u.pay : ""}" placeholder="Empty = normal pay (${money(settings.riderPay)})"></label>
        <label>${u ? "New password (leave empty to keep)" : "Password"} <input id="pw" type="text" autocomplete="off" placeholder="At least 6 characters"><span class="hint">Give this password to the person. They can change it later.</span></label>
        ${u && !u.main && !self ? `<label class="check"><input type="checkbox" id="act" ${u.active ? "checked" : ""}> Can log in (switch off to block)</label>` : ""}
        <p class="err" id="e"></p>
        <div class="bottom">${u && !u.main && !self ? `<button type="button" class="btn line" id="del">Remove</button>` : ""}<button class="btn green" id="save">Save</button></div>
      </form>`);
    if ($("#role", el)) $("#role", el).onchange = () => $("#payWrap", el).classList.toggle("hidden", $("#role", el).value !== "rider");
    $("#f", el).onsubmit = e => {
      e.preventDefault();
      const data = { name: $("#n", el).value, phone: $("#ph", el).value, password: $("#pw", el).value || undefined, pay: $("#pay", el).value };
      if (!u) data.role = $("#role", el).value;
      if ($("#act", el)) data.active = $("#act", el).checked;
      busy($("#save", el), $("#e", el), async () => {
        await Api.saveUser(u && u.id, data);
        if (self) { me = await Api.me(); $("#whoSmall").textContent = `${me.name} (${me.main ? "main admin" : "admin"})`; }
        toast("Saved"); viewTeam();
      });
    };
    if ($("#del", el)) $("#del", el).onclick = () => {
      if (!confirm(`Remove ${u.name}? They will not be able to log in.`)) return;
      busy($("#del", el), $("#e", el), async () => { await Api.removeUser(u.id); toast("Removed"); viewTeam(); });
    };
  }

  // ---------- settings ----------
  function viewSettings() {
    const s = settings;
    $("#page").innerHTML = `<div class="bar"><h2>Settings</h2></div>
      <div class="box"><h3>Shop details</h3><form class="form" id="shopF" novalidate>
        <div class="logo-edit"><span class="logo" id="lg">${logoHtml(s)}</span><div>
          <label class="btn small light" style="display:inline-flex">Change logo<input type="file" accept="image/*" id="lf" hidden></label>
          ${s.logo ? `<button type="button" class="btn small line" id="rmLogo">Use the default logo</button>` : ""}</div></div>
        <div class="two"><label>WhatsApp number for orders <input id="wa" type="tel" value="${esc(s.whatsapp)}"></label>
          <label>Smallest order (KES, 0 = any) <input id="mo" type="number" min="0" value="${s.minOrder || 0}"></label></div>
        <div class="two"><label>M-Pesa Till number <input id="till" inputmode="numeric" value="${esc(s.till)}"></label>
          <label>Name on the till <input id="tn" maxlength="40" value="${esc(s.tillName)}"><span class="hint">Customers see this so they know they are paying the right till.</span></label></div>
        <div class="hero-edit"><b>Picture beside the welcome words (optional)</b>
          <p class="hint">Normally the site shows your Hot Deals one after the other there, or your best food photos. Upload your own picture
            (e.g. your rider, a combo or a poster) for days you want it instead.</p>
          <div class="hero-prev" id="hp">${s.hero ? `<img src="${esc(s.hero)}" alt="">` : `<span>No picture yet</span>`}</div>
          <div class="row-btns" style="justify-content:flex-start"><label class="btn small light" style="display:inline-flex">Choose picture<input type="file" accept="image/*" id="hf" hidden></label>
            ${s.hero ? `<button type="button" class="btn small line" id="rmHero">Remove picture</button>` : ""}</div>
          <label class="check"><input type="checkbox" id="hOn" ${s.heroOn ? "checked" : ""}> Show my picture instead of Hot Deals and food photos</label></div>
        <label>Message at the top of the site (optional) <input id="nt" maxlength="200" value="${esc(s.notice)}" placeholder="e.g. Free delivery in town this weekend"></label>
        <p class="err" id="e1"></p><button class="btn" id="b1">Save shop details</button></form></div>

      <div class="box"><h3>Opening hours</h3><form class="form" id="hoursF" novalidate>
        <label>Taking orders <select id="mode">
          <option value="auto"${s.mode === "auto" ? " selected" : ""}>Follow the opening hours</option>
          <option value="open"${s.mode === "open" ? " selected" : ""}>Open now (ignore the hours)</option>
          <option value="closed"${s.mode === "closed" ? " selected" : ""}>Closed now (stop all orders)</option></select></label>
        <div class="two"><label>Opens at <input id="op" type="time" value="${esc(s.open)}"></label><label>Closes at <input id="cl" type="time" value="${esc(s.close)}"></label></div>
        <p class="hint">Right now the site is <b>${s.state.open ? "OPEN" : "CLOSED"}</b> for orders.</p>
        <p class="err" id="e2"></p><button class="btn" id="b2">Save hours</button></form></div>

      <div class="box"><h3>Delivery time, late warnings and rider pay</h3><form class="form" id="timeF" novalidate>
        <label>Delivery time customers see <input id="dt" maxlength="40" value="${esc(s.deliveryTime)}" placeholder="e.g. 30-45 minutes (empty = not shown)"><span class="hint">Change it on busy days, e.g. 1 hour.</span></label>
        <div class="two"><label>Late if payment not checked in (minutes) <input id="lc" type="number" min="1" value="${s.lateCheck}"></label>
          <label>Late if not delivered in (minutes) <input id="ld" type="number" min="5" value="${s.lateDeliver}"></label></div>
        <label>Normal rider pay per delivery (KES) <input id="rp" type="number" min="0" value="${s.riderPay}"><span class="hint">A rider can have their own pay in Team.</span></label>
        <div class="two"><label>Busy message when this many orders are in progress <input id="ba" type="number" min="0" value="${s.busyAt}"><span class="hint">0 = never show it.</span></label>
          <label>Busy delivery time <input id="bt" maxlength="40" value="${esc(s.busyTime)}"><span class="hint">Shows as "Delivery may take about 60 minutes".</span></label></div>
        <p class="err" id="e6"></p><button class="btn" id="b6">Save</button></form></div>

      <div class="box"><h3>Hot Deals</h3><form class="form" id="dealF" novalidate>
        <p class="hint">Each food gets its own deal price, start and end time. Customers see them at the top of the site like a flash sale, each with its own countdown.
          Add "How many" to show "Only 7 left": the deal stops by itself when they are sold. ${s.dealActive ? `<b style="color:var(--green)">Running now.</b>` : ""}</p>
        <div class="two"><label class="check"><input type="checkbox" id="dOn" ${s.deal.on ? "checked" : ""}> Show Hot Deals</label>
          <label>Title <input id="dTitle" maxlength="40" value="${esc(s.deal.title)}"></label></div>
        <div class="deal-rows" id="dealRows"><p class="hint">Loading foods...</p></div>
        <button type="button" class="btn small light" id="addD">Add a food to Hot Deals</button>
        <p class="err" id="e7"></p><button class="btn" id="b7">Save Hot Deals</button></form></div>

      <div class="box"><h3>Discount codes</h3>
        <p class="hint">Customers type the code at checkout. The discount comes off the food, not the delivery.</p>
        <div id="discList"><p class="hint">Loading...</p></div>
        <form class="form" id="discF" novalidate style="margin-top:12px">
          <div class="two"><label>Code <input id="dcCode" maxlength="20" placeholder="e.g. WELCOME50" style="text-transform:uppercase"></label>
            <label>Discount <span class="rowi"><select id="dcKind" style="max-width:110px"><option value="amount">KES off</option><option value="percent">% off</option></select>
              <input id="dcVal" type="number" min="1" inputmode="numeric" placeholder="e.g. 50"></span></label></div>
          <div class="two"><label>Smallest food order (optional) <input id="dcMin" type="number" min="0" inputmode="numeric" placeholder="e.g. 500"></label>
            <label>Ends on (optional) <input id="dcEnd" type="date"></label></div>
          <div class="two"><label>Can be used (times, optional) <input id="dcMax" type="number" min="1" inputmode="numeric" placeholder="e.g. 100"></label>
            <label class="check" style="align-self:end"><input type="checkbox" id="dcFirst"> First order only</label></div>
          <p class="err" id="e9"></p><button class="btn" id="b9">Add code</button></form></div>

      <div class="box"><h3>Big orders</h3><form class="form" id="bigF" novalidate>
        <p class="hint">Big orders are heavy for a rider. Items above the number included add a little to the delivery fee, and very big orders must call you.</p>
        <label class="check"><input type="checkbox" id="bOn" ${s.bigOn ? "checked" : ""}> Add a fee for big orders</label>
        <div class="two"><label>Items included in the delivery fee <input id="bInc" type="number" min="1" inputmode="numeric" value="${s.bigIncluded}"></label>
          <label>Extra for each item above that (KES) <input id="bPer" type="number" min="0" inputmode="numeric" value="${s.bigPerItem}"></label></div>
        <label>Most items in one online order <input id="bMax" type="number" min="0" inputmode="numeric" value="${s.maxItems}"><span class="hint">0 = no limit. Above this, customers are asked to call or WhatsApp you.</span></label>
        <p class="hint" id="bEx"></p>
        <p class="err" id="e11"></p><button class="btn" id="b11">Save big orders</button></form></div>

      <div class="box"><h3>Kiswahili for customers</h3><form class="form" id="swF" novalidate>
        <p class="hint">Customers can switch the site between English and Kiswahili (at the bottom of the site and in Help).
          Please first check the Kiswahili words with someone you trust: open the preview, look through the menu, cart and checkout, and tell Claude what to change.</p>
        <a class="btn light" href="/?lang=sw" target="_blank">Preview the site in Kiswahili</a>
        <label class="check"><input type="checkbox" id="swOn" ${s.swOn ? "checked" : ""}> Show the English / Kiswahili switch to customers</label>
        <p class="err" id="e14"></p><button class="btn" id="b14">Save</button></form></div>

      <div class="box"><h3>Share Tuye Bites</h3><form class="form" id="shareF" novalidate>
        <p class="hint">Customers can share your site on WhatsApp (from Help, My orders and after ordering). Choose a discount code their friends get,
          for example a first-order code like WELCOME50. Make the code first under Discount codes.</p>
        <label>Code for friends <select id="shCode"><option value="">No code (just share the link)</option></select></label>
        <p class="err" id="e15"></p><button class="btn" id="b15">Save</button></form></div>

      <div class="box"><h3>Loyalty reward</h3><form class="form" id="loyF" novalidate>
        <label>Free delivery on every ... delivered order <input id="le" type="number" min="0" max="100" value="${s.loyaltyEvery}"><span class="hint">For example 10: every 10th order of the same phone number gets free delivery. 0 = off.</span></label>
        <p class="err" id="e8"></p><button class="btn" id="b8">Save</button></form></div>

      <div class="box"><h3>Delivery areas and fees</h3><form class="form" id="areaF" novalidate>
        <div class="rows" id="areas">${s.deliveryAreas.map(areaRow).join("")}</div>
        <button type="button" class="btn small light" id="addA">Add area</button>
        <p class="err" id="e3"></p><button class="btn" id="b3">Save delivery areas</button></form></div>

      <div class="box"><h3>Food groups</h3><form class="form" id="catF" novalidate>
        <p class="hint">The groups customers see at the top of the menu, in this order.</p>
        <div class="rows" id="cats">${s.categories.map(catRow).join("")}</div>
        <button type="button" class="btn small light" id="addC">Add group</button>
        <p class="err" id="e4"></p><button class="btn" id="b4">Save food groups</button></form></div>

      ${alertsBox()}
      ${accountBox()}
      <div class="box"><h3>Privacy and refunds page</h3>
        <p class="hint">This is the page customers open from the bottom of the site and from checkout. Change the words to match how you work.</p>
        <div class="howto"><b>How to write it:</b>
          <span><code># Title</code> starts a new box</span><span><code>## Small title</code> a heading inside it</span>
          <span><code>- text</code> a point in a list</span><span><code>**words**</code> makes words bold</span>
          <span><code>{whatsapp}</code> and <code>{till}</code> show your WhatsApp and till numbers</span></div>
        <textarea id="polText" rows="16" maxlength="20000" spellcheck="true"><\/textarea>
        <p class="hint" id="polInfo"></p>
        <p class="err" id="e13"></p>
        <div class="row-btns" style="justify-content:flex-start">
          <button type="button" class="btn light" id="polPrev">Preview</button>
          <button type="button" class="btn" id="b13">Save page</button>
          <button type="button" class="btn line" id="polReset">Put back the original words</button>
          <a class="btn line" href="/policy.html" target="_blank">Open the page</a></div>
        <div class="pol-preview hidden" id="polPreview"></div></div>

      <div class="box"><h3>Backup</h3>
        <p class="hint">Download everything (menu, settings, team, orders, customers, discount codes and history) as one file to keep on your computer.
          Do it once a week. Photos stay online and are not in the file. Keep the file private: it has customers' phone numbers.</p>
        <p class="err" id="e12"></p><button class="btn plum" id="b12">Download everything</button></div>
      <div class="box"><h3>Activity history</h3><p class="hint">Who did what. Newest first.</p><div class="act-list" id="act"><p class="hint">Loading...</p></div></div>`;

    let logo, hero;
    $("#hf").onchange = async e => {
      try {
        hero = await compressImage(e.target.files[0], 1200, 0.8);
        $("#hp").innerHTML = `<img src="${hero}" alt="">`;
        $("#hOn").checked = true;
        toast("Tap Save shop details to use this picture");
      } catch (err) { toast(err.message, true); }
    };
    if ($("#rmHero")) $("#rmHero").onclick = () => { hero = null; $("#hp").innerHTML = "<span>No picture</span>"; $("#hOn").checked = false; toast("Tap Save shop details to remove the picture"); };
    $("#lf").onchange = async e => {
      try { logo = await compressImage(e.target.files[0], 300, 0.85); $("#lg").innerHTML = `<img src="${logo}" alt="">`; toast("Tap Save shop details to keep the new logo"); }
      catch (err) { toast(err.message, true); }
    };
    if ($("#rmLogo")) $("#rmLogo").onclick = () => { logo = null; $("#lg").innerHTML = DEFAULT_LOGO; toast("Tap Save shop details to use the default logo"); };
    const save = (btn, err, patch, msg) => busy(btn, err, async () => {
      settings = await Api.saveSettings(patch);
      $("#logo").innerHTML = headerLogo(settings);
      toast(msg); viewSettings();
    });
    $("#shopF").onsubmit = e => { e.preventDefault();
      const p = { whatsapp: $("#wa").value, minOrder: $("#mo").value, till: $("#till").value, tillName: $("#tn").value, notice: $("#nt").value };
      if (logo !== undefined) p.logo = logo;
      if (hero !== undefined) p.hero = hero;
      p.heroOn = $("#hOn").checked;
      if (p.heroOn && !hero && !s.hero) { $("#e1").textContent = "Choose a picture first, or untick Show my picture."; return; }
      save($("#b1"), $("#e1"), p, "Shop details saved"); };
    $("#timeF").onsubmit = e => { e.preventDefault();
      save($("#b6"), $("#e6"), { deliveryTime: $("#dt").value, lateCheck: $("#lc").value, lateDeliver: $("#ld").value, riderPay: $("#rp").value,
        busyAt: $("#ba").value, busyTime: $("#bt").value }, "Saved"); };
    // Example under the big-order numbers, so the owner sees what customers will pay
    const bigExample = () => {
      const inc = Number($("#bInc").value) || 1, per = Number($("#bPer").value) || 0, n = inc + 2;
      $("#bEx").textContent = $("#bOn").checked ? `Example: ${n} items = normal delivery + ${money(2 * per)}.` : "Off: every order pays only the normal delivery fee.";
    };
    ["#bOn", "#bInc", "#bPer"].forEach(id => $(id).addEventListener("input", bigExample)); bigExample();
    $("#bigF").onsubmit = e => { e.preventDefault(); save($("#b11"), $("#e11"), { bigOn: $("#bOn").checked, bigIncluded: $("#bInc").value, bigPerItem: $("#bPer").value, maxItems: $("#bMax").value }, "Big orders saved"); };
    Api.discounts().then(({ discounts }) => {
      const sel = $("#shCode");
      if (!sel) return;
      sel.insertAdjacentHTML("beforeend", discounts.filter(d => d.active).map(d => `<option value="${esc(d.code)}"${d.code === s.shareCode ? " selected" : ""}>${esc(d.code)} (${d.kind === "percent" ? d.value + "% off" : money(d.value) + " off"}${d.firstOnly ? ", first order" : ""})</option>`).join(""));
    }).catch(() => {});
    $("#shareF").onsubmit = e => { e.preventDefault(); save($("#b15"), $("#e15"), { shareCode: $("#shCode").value }, "Share setting saved"); };
    $("#swF").onsubmit = e => { e.preventDefault(); save($("#b14"), $("#e14"), { swOn: $("#swOn").checked }, "Kiswahili setting saved"); };
    $("#loyF").onsubmit = e => { e.preventDefault(); save($("#b8"), $("#e8"), { loyaltyEvery: $("#le").value }, "Loyalty reward saved"); };
    loadDiscounts();
    // Hot Deals: every row is one food with its own price and time; new rows go at the bottom, nothing is replaced
    Promise.all([Api.items(), Api.shop()]).then(([{ items }, shopNow]) => {
      // How many are left of each limited deal right now
      const live = shopNow.settings.deals || [];
      const leftOf = d => (live.find(x => x.id === d.id && x.start === d.start) || {}).left;
      const opts = sel => `<option value="">Choose a food</option>` + items.map(i => `<option value="${esc(i.id)}"${i.id === sel ? " selected" : ""}>${esc(i.name)} (${money(i.price)})</option>`).join("");
      const status = d => {
        const now = Date.now();
        if (!d.end) return "";
        if (d.end <= now) return `<span class="st cancelled">Ended</span>`;
        if (d.start > now) return `<span class="st confirmed">Starts ${esc(whenText(d.start))}</span>`;
        const left = leftOf(d);
        if (d.qty && left === 0) return `<span class="st cancelled">Sold out (${d.qty} of ${d.qty})</span>`;
        return `<span class="st delivered">Running, ends ${esc(whenText(d.end))}${d.qty && left != null ? ` | ${d.qty - left} of ${d.qty} sold` : ""}</span>`;
      };
      const row = d => `<div class="deal-row-box">
        <div class="rowi"><select data-di>${opts(d.id)}</select><button type="button" class="x" data-rmd aria-label="Remove">&times;</button></div>
        <div class="dgrid"><label>Deal price (KES) <input data-dp type="number" min="1" inputmode="numeric" value="${d.price || ""}" placeholder="e.g. 299"></label>
          <label>How many (optional) <input data-dq type="number" min="1" inputmode="numeric" value="${d.qty || ""}" placeholder="No limit"></label>
          <label>Starts <input data-ds type="datetime-local" value="${localDT(d.start || Date.now())}"></label>
          <label>Ends <input data-de type="datetime-local" value="${d.end ? localDT(d.end) : ""}"></label></div>
        <div class="dquick"><span class="hint">Ends in:</span>${[1, 2, 3, 6, 12, 24].map(h => `<button type="button" class="chip" data-h="${h}">${h} h</button>`).join("")}
          <span class="dstat">${status(d)}</span></div></div>`;
      $("#dealRows").innerHTML = items.length ? (s.deal.items.map(row).join("") || `<p class="hint" id="noDeals">No Hot Deals yet.</p>`) : `<p class="hint">Add foods in Menu first.</p>`;
      $("#addD").onclick = () => {
        if (!items.length) return;
        if ($("#noDeals")) $("#noDeals").remove();
        $("#dealRows").insertAdjacentHTML("beforeend", row({ id: "", price: "", start: Date.now(), end: Date.now() + 2 * 36e5 }));
        $("#dealRows").lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      $("#dealRows").addEventListener("click", e => {
        const box = e.target.closest(".deal-row-box");
        if (!box) return;
        if (e.target.closest("[data-rmd]")) box.remove();
        const h = e.target.closest("[data-h]");
        if (h) {
          // "Ends in 2 h" counts from the start time (or from now if it has already started)
          const st = new Date($("[data-ds]", box).value).getTime() || Date.now();
          $("[data-de]", box).value = localDT(Math.max(st, Date.now()) + Number(h.dataset.h) * 36e5);
        }
      });
    }).catch(e => { $("#dealRows").textContent = e.message; });
    $("#dealF").onsubmit = e => { e.preventDefault();
      const t = v => v ? new Date(v).getTime() : 0;
      const rows = $$("#dealRows .deal-row-box");
      if (rows.some(r => !$("[data-di]", r).value)) { $("#e7").textContent = "Choose the food in every Hot Deal row (or remove the empty row)."; return; }
      save($("#b7"), $("#e7"), { deal: { on: $("#dOn").checked, title: $("#dTitle").value,
        items: rows.map(r => ({ id: $("[data-di]", r).value, price: $("[data-dp]", r).value, qty: $("[data-dq]", r).value,
          start: t($("[data-ds]", r).value), end: t($("[data-de]", r).value) })) } }, "Hot Deals saved"); };
    $("#hoursF").onsubmit = e => { e.preventDefault(); save($("#b2"), $("#e2"), { mode: $("#mode").value, open: $("#op").value, close: $("#cl").value }, "Hours saved"); };
    $("#addA").onclick = () => $("#areas").insertAdjacentHTML("beforeend", areaRow({ name: "", fee: "" }));
    $("#addC").onclick = () => $("#cats").insertAdjacentHTML("beforeend", catRow(""));
    $("#page").addEventListener("click", e => { if (e.target.closest("[data-rm]")) e.target.closest(".rowi").remove(); });
    $("#areaF").onsubmit = e => { e.preventDefault();
      save($("#b3"), $("#e3"), { deliveryAreas: $$("#areas .rowi").map(r => ({ name: $("[data-an]", r).value, fee: $("[data-af]", r).value })) }, "Delivery areas saved"); };
    $("#catF").onsubmit = e => { e.preventDefault(); save($("#b4"), $("#e4"), { categories: $$("#cats input").map(i => i.value) }, "Food groups saved"); };
    wireAccount(); wireAlerts(); wirePolicy();
    $("#b12").onclick = () => busy($("#b12"), $("#e12"), async () => {
      const blob = await Api.backup(), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `Tuye Bites backup ${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast("Backup downloaded. Keep it in a safe folder.");
    });
    Api.activity().then(r => {
      $("#act").innerHTML = r.activity.slice(0, 200).map(a => `<div><b>${esc(a.action)}</b>${a.detail ? " - " + esc(a.detail) : ""}<br>
        <small>${new Date(a.at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${a.who ? " | " + esc(a.who) : ""}</small></div>`).join("") || `<p class="hint">Nothing yet.</p>`;
    }).catch(e => { $("#act").textContent = e.message; });
  }
  async function loadDiscounts() {
    let list;
    try { list = (await Api.discounts()).discounts; } catch (e) { $("#discList").textContent = e.message; return; }
    const ended = d => d.endsAt && d.endsAt < Date.now(), usedUp = d => d.maxUses && d.uses >= d.maxUses;
    $("#discList").innerHTML = list.length ? list.map(d => `<div class="cust" data-c="${esc(d.code)}"><div class="t">
        <b class="code">${esc(d.code)}</b> ${d.kind === "percent" ? d.value + "% off" : money(d.value) + " off"}
        ${!d.active ? `<span class="st cancelled">Off</span>` : ended(d) ? `<span class="st cancelled">Ended</span>` : usedUp(d) ? `<span class="st cancelled">Used up</span>` : `<span class="st delivered">On</span>`}
        <small class="hint">Used ${d.uses}${d.maxUses ? " of " + d.maxUses : ""} times${d.minOrder ? " | food from " + money(d.minOrder) : ""}${d.endsAt ? " | ends " + new Date(d.endsAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : ""}${d.firstOnly ? " | first order only" : ""}</small></div>
      <div class="row-btns"><button class="btn small light" data-dt>${d.active ? "Switch off" : "Switch on"}</button><button class="btn small line" data-dd>Delete</button></div></div>`).join("")
      : `<p class="hint">No codes yet.</p>`;
    $$("#discList [data-dt]").forEach(b => b.onclick = async () => {
      const d = list.find(x => x.code === b.closest(".cust").dataset.c);
      try { await Api.setDiscount(d.code, !d.active); loadDiscounts(); } catch (e) { toast(e.message, true); }
    });
    $$("#discList [data-dd]").forEach(b => b.onclick = async () => {
      const c = b.closest(".cust").dataset.c;
      if (!confirm(`Delete the code ${c}?`)) return;
      try { await Api.removeDiscount(c); loadDiscounts(); } catch (e) { toast(e.message, true); }
    });
    $("#discF").onsubmit = e => { e.preventDefault(); busy($("#b9"), $("#e9"), async () => {
      const end = $("#dcEnd").value ? new Date($("#dcEnd").value + "T23:59:59").getTime() : null;
      await Api.addDiscount({ code: $("#dcCode").value, kind: $("#dcKind").value, value: $("#dcVal").value, minOrder: $("#dcMin").value,
        endsAt: end, maxUses: $("#dcMax").value, firstOnly: $("#dcFirst").checked });
      $("#discF").reset(); toast("Code added"); loadDiscounts();
    }); };
  }
  // ---------- privacy and refunds wording ----------
  async function wirePolicy() {
    const ta = $("#polText");
    let saved = "";
    const info = p => { $("#polInfo").textContent = p.isDefault ? "Showing the original words (not changed yet)." : "Last saved " + new Date(p.updatedAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + "."; };
    try { const p = await Api.policy(); ta.value = saved = p.text; info(p); } catch (e) { $("#e13").textContent = e.message; return; }
    $("#polPrev").onclick = () => {
      const box = $("#polPreview");
      box.innerHTML = `<p class="hint">Preview: this is how customers will see it.</p>` + policyHtml(ta.value, settings);
      box.classList.remove("hidden");
      box.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    $("#b13").onclick = () => busy($("#b13"), $("#e13"), async () => {
      const p = await Api.savePolicy(ta.value); ta.value = saved = p.text; info(p); toast("Privacy and refunds page saved");
    });
    $("#polReset").onclick = () => {
      if (!confirm("Put back the original words? Your changes to this page will be lost.")) return;
      busy($("#polReset"), $("#e13"), async () => { const p = await Api.savePolicy(null); ta.value = saved = p.text; info(p); $("#polPreview").classList.add("hidden"); toast("Original words put back"); });
    };
  }
  const localDT = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
  const areaRow = a => `<div class="rowi"><input data-an maxlength="40" placeholder="Area, e.g. Wote town centre" value="${esc(a.name)}">
    <input data-af type="number" min="0" inputmode="numeric" style="max-width:120px" placeholder="Fee KES" value="${a.fee === "" ? "" : Number(a.fee)}">
    <button type="button" class="x" data-rm aria-label="Remove">&times;</button></div>`;
  const catRow = c => `<div class="rowi"><input maxlength="30" placeholder="e.g. Chips" value="${esc(c)}"><button type="button" class="x" data-rm aria-label="Remove">&times;</button></div>`;

  // ---------- phone alerts ----------
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  async function currentSub() {
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    return { reg, sub: await reg.pushManager.getSubscription() };
  }
  async function turnOnAlerts() {
    if (!pushSupported()) throw new Error("This browser cannot show alerts. On iPhone, first add the site to the Home Screen and open it from there.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Alerts were not allowed. Allow notifications for this site in the browser settings, then try again.");
    const { reg } = await currentSub();
    const key = await Api.pushKey();
    const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await Api.pushSubscribe(sub.toJSON());
  }
  async function turnOffAlerts() {
    const cur = await currentSub();
    if (cur && cur.sub) { await Api.pushUnsubscribe(cur.sub.endpoint).catch(() => {}); await cur.sub.unsubscribe(); }
  }
  async function alertsOn() {
    try { const cur = await currentSub(); return !!(cur && cur.sub && Notification.permission === "granted"); } catch (e) { return false; }
  }
  // The box in Settings / My account, and a reminder on the Orders page while alerts are off
  const alertsBox = () => `<div class="box"><h3>Alerts on this phone</h3>
      <p class="hint">${isAdmin() ? "Get an alert for every new order" : "Get an alert for every delivery given to you"}, even when the phone is locked or this page is closed. Turn it on separately on each phone you use.</p>
      <p id="alertState" class="hint">Checking...</p><p class="err" id="e10"></p><button class="btn" id="b10">Turn on alerts</button></div>`;
  async function wireAlerts() {
    const btn = $("#b10");
    if (!btn) return;
    const on = await alertsOn();
    $("#alertState").innerHTML = !pushSupported() ? "This browser cannot show alerts." : on ? `<b style="color:var(--green)">Alerts are ON on this phone.</b>` : "Alerts are off on this phone.";
    btn.textContent = on ? "Turn off alerts" : "Turn on alerts";
    btn.className = "btn " + (on ? "line" : "green");
    btn.onclick = () => busy(btn, $("#e10"), async () => {
      if (on) { await turnOffAlerts(); toast("Alerts turned off on this phone"); }
      else { await turnOnAlerts(); toast("Alerts are on. A test alert is on its way."); }
      wireAlerts();
    });
  }
  async function alertsReminder() {
    const box = $("#alertsTip");
    if (!box || !pushSupported() || await alertsOn()) return;
    try { if (sessionStorage.getItem("tb_alert_tip") === "no") return; } catch (e) {}
    box.innerHTML = `<div class="alert info tip"><span>Get new-order alerts on this phone, even when it is locked.</span>
      <button class="btn small green" id="tipOn">Turn on</button><button class="x" id="tipX" aria-label="Hide">&times;</button></div>`;
    $("#tipOn").onclick = () => busy($("#tipOn"), null, async () => { await turnOnAlerts(); box.innerHTML = ""; toast("Alerts are on. A test alert is on its way."); });
    $("#tipX").onclick = () => { try { sessionStorage.setItem("tb_alert_tip", "no"); } catch (e) {} box.innerHTML = ""; };
  }

  // ---------- my account ----------
  const accountBox = () => `<div class="box"><h3>My password</h3><form class="form" id="pwF" novalidate>
      <p class="hint">Logged in as ${esc(me.name)} (${esc(me.phone)}). Changing the password logs you out on other phones.</p>
      <div class="two"><label>Current password <input type="password" id="cur" autocomplete="current-password"></label>
        <label>New password <input type="password" id="nw" autocomplete="new-password" placeholder="At least 6 characters"></label></div>
      <p class="err" id="e5"></p><button class="btn" id="b5">Change password</button></form></div>`;
  function wireAccount() {
    $("#pwF").onsubmit = e => { e.preventDefault(); busy($("#b5"), $("#e5"), async () => {
      await Api.changePassword($("#cur").value, $("#nw").value); $("#cur").value = $("#nw").value = ""; toast("Password changed");
    }); };
  }
  function viewAccount() {
    $("#page").innerHTML = `<div class="bar"><h2>My account</h2></div>${alertsBox()}${accountBox()}`;
    wireAccount(); wireAlerts();
  }

  // ---------- go ----------
  $("#logo").innerHTML = FULL_LOGO;
  // Keep the tab bar just under the header, whatever height the logo makes it
  const headH = () => document.documentElement.style.setProperty("--adminHeadH", $(".top").offsetHeight + "px");
  headH(); new ResizeObserver(headH).observe($(".top"));
  if (!Api.hasToken()) showAuth();
  else Api.me().then(u => { me = u; start(); }).catch(showAuth);
})();
