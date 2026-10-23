// Draws a Tuye Bites receipt (a narrow till-roll slip, like Muthwii Queens) and turns it into a PDF.
// Used by the admin page and by the customer's order page, so both look exactly the same.
window.Receipt = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kes = n => Number(n || 0).toLocaleString("en-KE");
  const money = n => "KES " + kes(n);
  const fmtDate = ms => new Date(ms).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const phoneDisplay = n => String(n || "").replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");

  // o = the order; settings = { logo, whatsapp, till, tillName }
  function html(o, settings = {}) {
    const logo = settings.logo ? `<img src="${esc(settings.logo)}" alt="">` : `<img src="/logo-full.webp" alt="Tuye Bites">`;
    const lines = o.items.map(l => `<div class="rc-line">
        <b>${esc(l.name)}</b>${l.choices && l.choices.length ? `<small>${esc(l.choices.map(c => c.name).join(", "))}</small>` : ""}
        <div class="rc-qty"><span>${l.qty} x ${kes(l.unit)}</span><b>${kes(l.total)}</b></div></div>`).join("");
    const stamp = o.status === "cancelled" ? "CANCELLED" : ["new", "payment_problem"].includes(o.status) ? "NOT PAID YET" : "";
    return `<div class="rc">
    <div class="rc-head">
      <span class="rc-logo${settings.logo ? " own" : ""}">${logo}</span>
      ${settings.logo ? `<b>Tuye Bites</b>` : ""}
      <small>Fast food delivered in Wote</small>
      <small>WhatsApp ${esc(phoneDisplay(settings.whatsapp))}</small>
    </div>
    ${settings.till ? `<div class="rc-till">Paid via M-Pesa<br><b>Till ${esc(settings.till)}</b>${settings.tillName ? `<br>${esc(settings.tillName)}` : ""}</div>` : ""}
    <div class="rc-title">RECEIPT</div>
    ${stamp ? `<div class="rc-stamp">${stamp}</div>` : ""}
    <div class="rc-meta">
      <span>Receipt no.</span><b>${esc(o.no)}</b>
      <span>Ordered</span><b>${fmtDate(o.at)}</b>
      ${o.customer ? `<span>Customer</span><b>${esc(o.customer)}</b>` : ""}
      ${o.phone ? `<span>Phone</span><b>${esc(phoneDisplay(o.phone))}</b>` : ""}
      <span>Deliver to</span><b>${esc(o.area)}${o.directions ? `<small>${esc(o.directions)}</small>` : ""}</b>
      ${o.riderName ? `<span>Rider</span><b>${esc(o.riderName)}</b>` : ""}
    </div>
    <div class="rc-items">
      <div class="rc-ihead"><span>Item</span><span>KES</span></div>
      ${lines}
    </div>
    <div class="rc-tot">
      <span>Food</span><b>${money(o.foodTotal)}</b>
      ${o.discount ? `<span>Discount${o.discountCode ? " (" + esc(o.discountCode) + ")" : ""}</span><b>- ${money(o.discount)}</b>` : ""}
      <span>Delivery: ${esc(o.area)}</span><b>${o.freeDelivery ? "FREE" : money(o.deliveryFee)}</b>
      ${o.bigFee ? `<span>Big order</span><b>${money(o.bigFee)}</b>` : ""}
      <span class="big">TOTAL</span><b class="big">${money(o.total)}</b>
    </div>
    <div class="rc-pays"><div class="rc-sub">Payment</div>
      <div><span>M-Pesa${o.mpesaCode ? `<small>Code ${esc(o.mpesaCode)}</small>` : ""}</span><b>${money(o.total)}</b></div></div>
    ${o.freeDelivery ? `<p class="rc-note">Free delivery: loyalty reward. Thank you for ordering with us often.</p>` : ""}
    ${o.paidAt ? `<p class="rc-note">Payment confirmed on ${fmtDate(o.paidAt)}</p>` : ""}
    ${o.deliveredAt ? `<p class="rc-note">Delivered on ${fmtDate(o.deliveredAt)}</p>`
      : ["confirmed", "on_the_way"].includes(o.status) ? `<p class="rc-note">Delivery: ${o.status === "on_the_way" ? "on the way" : "being prepared"}${o.etaAt ? ", expected by " + new Date(o.etaAt).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" }) : ""}</p>` : ""}
    ${o.status === "cancelled" ? `<p class="rc-note">Cancelled${o.cancelledAt ? " on " + fmtDate(o.cancelledAt) : ""}: ${esc(o.cancelReason)}</p>` : ""}
    ${o.note ? `<p class="rc-note">Note: ${esc(o.note)}</p>` : ""}
    <p class="rc-thanks">Thank you for ordering from Tuye Bites.<br>Let's eat!</p>
  </div>`;
  }

  // ---------- PDF (80 mm wide, made in the browser) ----------
  const LIBS = ["https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js", "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"];
  const load = src => new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => fail(new Error("Could not load the PDF maker. Check your internet."));
    document.head.appendChild(s);
  });
  let libs = null;
  const loadLibs = () => (libs ??= Promise.all([window.html2canvas || load(LIBS[0]), window.jspdf || load(LIBS[1])]).catch(e => { libs = null; throw e; }));

  async function pdf(o, settings = {}) {
    await loadLibs();
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;padding:0";
    box.innerHTML = html(o, settings);
    document.body.appendChild(box);
    const el = box.querySelector(".rc");
    el.style.border = "0"; el.style.boxShadow = "none"; el.style.borderRadius = "0";
    // wait for the logo so it is in the PDF
    await Promise.all([...el.querySelectorAll("img")].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
    try {
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
      const w = 80, h = Math.round(canvas.height * w / canvas.width);
      const doc = new jspdf.jsPDF({ unit: "mm", format: [w, h], orientation: "portrait" });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
      return new File([doc.output("blob")], `Tuye Bites receipt ${o.no}.pdf`, { type: "application/pdf" });
    } finally { box.remove(); }
  }

  function download(file) {
    const url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Prints only the slip, in its own small window, sized like a till roll
  function print(o, settings = {}) {
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) { alert("Please allow pop-ups for this site to print the receipt."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/"><title>Receipt ${esc(o.no)}</title>
      <link rel="stylesheet" href="/style.css"><style>body{background:#fff!important;margin:0;padding:4mm 0}body::before{display:none!important}
      .rc{border:0;box-shadow:none}@page{size:80mm auto;margin:0}</style></head>
      <body>${html(o, settings)}<script>window.onload=()=>setTimeout(()=>{print()},400)<\/script></body></html>`);
    w.document.close();
  }

  return { html, pdf, download, print, loadLibs };
})();
