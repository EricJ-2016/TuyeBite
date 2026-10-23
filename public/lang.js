// English / Kiswahili for the customer pages.
// The pages are written in English; when Kiswahili is chosen, the words on the screen are swapped using the list below.
// Food names, prices and what customers type are never changed. Admin pages stay in English.
// Customers only see the switch when an admin turns it on in Settings; "?lang=sw" in the address previews it.
window.I18N = (() => {
  const KEY = "tb_lang";
  const get = () => { try { return localStorage.getItem(KEY) || "en"; } catch (e) { return "en"; } };
  const preview = /[?&]lang=sw\b/.test(location.search);
  let lang = preview ? "sw" : get();

  // Whole pieces of text: English -> Kiswahili
  const W = {
    // top, welcome box, menu
    "Open": "Tuko wazi", "Closed": "Tumefunga", "Cart": "Kikapu",
    "Hot food from Wote's best fast foods,": "Chakula moto kutoka hoteli bora za Wote,",
    "brought to your door.": "tunakuletea mlangoni.",
    "Choose your food, pay on M-Pesa Till and our rider brings it to you.": "Chagua chakula, lipa kwa Till ya M-Pesa na mhudumu wetu wa pikipiki atakuletea.",
    "Pick your food": "Chagua chakula", "We deliver": "Tunakuletea", "Pay on Till": "Lipa kwa Till",
    "Search food, e.g. chips, chicken, pizza": "Tafuta chakula, mfano chipsi, kuku, pizza",
    "All": "Vyote", "Finished for today": "Kimeisha leo", "Hot Deal": "Ofa Moto", "Offer": "Ofa",
    "No food matches your search.": "Hakuna chakula kinacholingana na ulichotafuta.",
    "The menu is being prepared. Please check again soon.": "Menyu inaandaliwa. Tafadhali angalia tena baadaye.",
    "Loading the menu...": "Tunapakia menyu...",
    // Hot Deals
    "Hot Deals": "Ofa Moto", "Time left:": "Muda uliobaki:", "Coming soon": "Inakuja hivi karibuni", "Coming up": "Zinazokuja",
    "Ends in": "Inaisha baada ya", "Sold out": "Zimeisha", "SOLD OUT": "ZIMEISHA", "Add to cart": "Weka kikapuni", "HOT DEAL": "OFA MOTO",
    "Hot Deal: ends in": "Ofa Moto: inaisha baada ya", "| only": "| zimebaki", "left at this price": "kwa bei hii",
    // bottom bar, My orders, Your usual, Help
    "Menu": "Menyu", "My orders": "Oda zangu", "Help": "Msaada", "View": "Tazama",
    "Loading your orders...": "Tunapakia oda zako...", "Checking payment": "Tunaangalia malipo", "Check your M-Pesa code": "Angalia nambari ya M-Pesa",
    "Paid, being prepared": "Imelipwa, inaandaliwa", "On the way": "Iko njiani", "Delivered": "Imefika", "Cancelled": "Imesitishwa",
    "Track and receipt": "Fuatilia na risiti", "Open order": "Fungua oda", "Order again": "Agiza tena",
    "No orders on this phone yet.": "Bado hakuna oda kwenye simu hii.",
    "Those foods are not available right now.": "Vyakula hivyo havipatikani kwa sasa.",
    "Some foods from that order are finished for today.": "Baadhi ya vyakula vya oda hiyo vimeisha leo.",
    "Your usual": "Kawaida yako",
    "WhatsApp us": "Tuandikie WhatsApp", "When we are open": "Saa za kazi", "Where we deliver": "Tunapoleta", "How to pay": "Jinsi ya kulipa",
    "Rules": "Sheria", "Language": "Lugha", "Closed for now": "Tumefunga kwa sasa", "Open now": "Tuko wazi sasa",
    // footer
    "Contact us": "Wasiliana nasi", "When and where": "Lini na wapi", "Privacy and refunds": "Faragha na kurudishiwa pesa",
    // food pop-up
    "Share": "Shiriki", "Sorry, this food is finished for today.": "Samahani, chakula hiki kimeisha leo.",
    "Choose one": "Chagua kimoja", "Optional, pick any": "Si lazima, chagua vyovyote", "Optional": "Si lazima", "Add": "Ongeza",
    "Added to cart": "Kimewekwa kikapuni",
    // cart
    "Your cart": "Kikapu chako", "Remove": "Ondoa", "Finished for today. Please remove it.": "Kimeisha leo. Tafadhali kiondoe.",
    "Food total": "Jumla ya chakula", "Add more food": "Ongeza chakula", "Checkout": "Lipa sasa",
    "Your cart is empty. Tap + on any food.": "Kikapu chako ni tupu. Gusa + kwenye chakula chochote.",
    // checkout
    "Ordering as": "Unaagiza kama", "Not you? Clear": "Si wewe? Futa", "Your name": "Jina lako", "Phone number": "Nambari ya simu",
    "Deliver to": "Tuletee wapi", "Exactly where?": "Mahali kamili?", "Building, floor and room, or a landmark near you": "Jengo, ghorofa na chumba, au alama iliyo karibu nawe",
    "When?": "Lini?", "As soon as possible": "Haraka iwezekanavyo", "Order for later": "Agiza kwa baadaye",
    "We are closed now, but you can order for later.": "Tumefunga sasa, lakini unaweza kuagiza kwa baadaye.",
    "Note for us (optional)": "Ujumbe kwetu (si lazima)", "e.g. no onions, call when you arrive": "mfano bila vitunguu, nipigie ukifika",
    "Discount code": "Nambari ya punguzo", "Apply": "Tumia", "Food": "Chakula", "Discount": "Punguzo", "Delivery": "Kuleta",
    "Total to pay": "Jumla ya kulipa", "FREE": "BURE", "Pay first on M-Pesa": "Lipa kwanza kwa M-Pesa",
    "Open M-Pesa, choose": "Fungua M-Pesa, chagua", ", then": ", kisha", "Till number:": "Nambari ya Till:", "Copy": "Nakili", "Amount:": "Kiasi:",
    "Type the M-Pesa code from your message below.": "Andika nambari ya M-Pesa kutoka kwenye ujumbe wako hapa chini.",
    "M-Pesa code": "Nambari ya M-Pesa", "Remember my details on this phone": "Kumbuka maelezo yangu kwenye simu hii",
    "Untick on a shared or borrowed phone.": "Ondoa alama ukitumia simu ya kuazima.",
    "By ordering you agree to our": "Kwa kuagiza unakubali", "privacy and refund rules": "sheria zetu za faragha na kurudishiwa pesa",
    "Place my order": "Tuma oda yangu", "Leave checkout?": "Uondoke kwenye malipo?",
    "Your food stays in the cart, but the details you typed here will be lost.": "Chakula kinabaki kikapuni, lakini maelezo uliyoandika hapa yatapotea.",
    "Stay": "Baki", "Leave checkout": "Ondoka",
    "This order has FREE delivery as a thank you for your loyalty.": "Oda hii inaletwa BURE kama shukrani kwa uaminifu wako.",
    "Delivery takes about": "Tunafika baada ya takriban", "after we confirm your payment.": "baada ya kuthibitisha malipo yako.",
    "We will deliver": "Tutaleta",
    // confirm screen and after ordering
    "Please confirm your order": "Tafadhali thibitisha oda yako", "Total paid": "Jumla uliyolipa", "When": "Lini",
    "Name and phone": "Jina na simu", "Note": "Ujumbe", "Make sure you paid": "Hakikisha umelipa", "to Till": "kwa Till",
    "and the M-Pesa code is correct.": "na nambari ya M-Pesa ni sahihi.", "Go back": "Rudi", "Confirm order": "Thibitisha oda",
    "Sending your order...": "Tunatuma oda yako...", "Type your name.": "Andika jina lako.",
    "Type a correct phone number with 10 digits, e.g. 0712345678.": "Andika nambari sahihi ya simu yenye tarakimu 10, mfano 0712345678.",
    "Tell us exactly where to bring the food (building, gate, landmark).": "Tuambie mahali kamili pa kuleta chakula (jengo, lango, alama).",
    "Type the M-Pesa code from your message: 10 letters and numbers, e.g. QJK7Y2B4XZ.": "Andika nambari ya M-Pesa kutoka kwenye ujumbe: herufi na nambari 10, mfano QJK7Y2B4XZ.",
    "Order received": "Oda imepokelewa", "We are checking your M-Pesa payment of": "Tunaangalia malipo yako ya M-Pesa ya",
    ". You can follow your order on the tracking page.": ". Unaweza kufuatilia oda yako kwenye ukurasa wa ufuatiliaji.",
    "Send my order on WhatsApp": "Tuma oda yangu kwa WhatsApp", "Track my order": "Fuatilia oda yangu",
    "Get order updates on this phone": "Pata taarifa za oda kwenye simu hii", "Updates are on": "Taarifa zimewashwa",
    "Tap \"Send my order on WhatsApp\" so we get it even faster.": "Gusa \"Tuma oda yangu kwa WhatsApp\" ili tuipate haraka zaidi.",
    "Please wait...": "Tafadhali subiri...",
    // messages
    "You are offline. Connect to the internet to order.": "Hauko mtandaoni. Unganisha intaneti ili uagize.",
    "You are offline. This is the menu from your last visit. Connect to the internet to order.": "Hauko mtandaoni. Hii ni menyu ya ulipotembelea mara ya mwisho. Unganisha intaneti ili uagize.",
    "Details cleared from this phone": "Maelezo yamefutwa kwenye simu hii",
    "Remove the foods that are finished for today first.": "Kwanza ondoa vyakula vilivyoisha leo.",
    "Get the Tuye Bites app": "Pata programu ya Tuye Bites", "Order faster from your home screen.": "Agiza haraka kutoka skrini yako ya mwanzo.",
    "Install": "Sakinisha",
    // order page
    "We are checking your M-Pesa payment.": "Tunaangalia malipo yako ya M-Pesa.", "Payment confirmed": "Malipo yamethibitishwa",
    "Paid. We will deliver at the time you chose.": "Imelipwa. Tutaleta wakati uliochagua.", "We are getting your food ready.": "Tunaandaa chakula chako.",
    "Our rider is bringing your food.": "Mhudumu wetu anakuletea chakula.", "Enjoy your meal.": "Furahia mlo wako.",
    "Your food arrives in about": "Chakula chako kitafika baada ya takriban", "any moment now": "wakati wowote sasa",
    "Your food": "Chakula chako", "Total": "Jumla", "Order this again": "Agiza hii tena", "Ask us on WhatsApp": "Tuulize kwa WhatsApp",
    "This page updates by itself.": "Ukurasa huu unajisasisha wenyewe.", "Your receipt": "Risiti yako", "Download PDF": "Pakua PDF",
    "View receipt": "Tazama risiti", "Hide receipt": "Ficha risiti", "Print": "Chapisha", "Order more": "Agiza zaidi",
    "Get updates on this phone": "Pata taarifa kwenye simu hii", "Turn on": "Washa", "Turn off": "Zima",
    "How was your food and delivery?": "Chakula na huduma vilikuwaje?", "Send rating": "Tuma maoni", "Tell us more (optional)": "Tueleze zaidi (si lazima)",
    "Loading your order...": "Tunapakia oda yako...", "Back to the menu": "Rudi kwenye menyu",
    "Install Tuye Bites": "Sakinisha Tuye Bites", "Install the app": "Sakinisha programu",
    "Follow your order and order faster next time, right from your home screen.": "Fuatilia oda yako na uagize haraka zaidi wakati ujao, moja kwa moja kutoka skrini yako ya mwanzo.",
    "Share Tuye Bites": "Shiriki Tuye Bites", "Share Tuye Bites with a friend": "Mshirikishe rafiki Tuye Bites", "Enjoying Tuye Bites?": "Unafurahia Tuye Bites?",
    "Tell a friend about us on WhatsApp.": "Mwambie rafiki kutuhusu kwa WhatsApp.", "Your friend gets code": "Rafiki yako anapata nambari",
    "for a discount on their first order.": "ya punguzo kwenye oda yake ya kwanza.", "Share with a friend: they get code": "Mshirikishe rafiki: anapata nambari",
    "on their first order.": "kwenye oda yake ya kwanza.", "A new version of Tuye Bites is ready.": "Toleo jipya la Tuye Bites liko tayari.", "Tap to refresh": "Gusa ili kusasisha"
  };
  // Pieces with numbers or names inside
  // "05-15 minutes" -> "dakika 05-15", "1 hour" -> "saa 1" (in Kiswahili the word comes first)
  const min = s => {
    const t = s.replace(/^about\s*/i, "").trim(), m = /^(.+?)\s*(minutes?|min|hours?|hr)$/i.exec(t);
    return m ? `${/^h/i.test(m[2]) ? "saa" : "dakika"} ${m[1]}` : t;
  };
  const R = [
    [/^Pay on Till (\d+)$/, (m, a) => `Lipa kwa Till ${a}`],
    [/^Delivery in about (.+)\.$/, (m, a) => `Tunafika baada ya takriban ${min(a)}.`],
    [/^(\d+)-(\d+) min$/, (m, a, b) => `dak ${a}-${b}`],
    [/^(?:about )?[\d-]+ (?:minutes?|hours?)$/, m => min(m)],
    [/^(\d+) ordered today$/, (m, a) => `${a} wameagiza leo`],
    [/^(\d+) left$/, (m, a) => `Zimebaki ${a}`],
    [/^Starts (today|tomorrow) at (.+)$/, (m, d, t) => `Inaanza ${d === "today" ? "leo" : "kesho"} saa ${t}`],
    [/^(\d+) in progress$/, (m, a) => `${a} zinaendelea`],
    [/^Call (\d+)$/, (m, a) => `Piga ${a}`],
    [/^Every day, (.+) to (.+)$/, (m, a, b) => `Kila siku, ${a} hadi ${b}`],
    [/^Delivering in Wote town: (.+)$/, (m, a) => `Tunaleta mjini Wote: ${a}`],
    [/^Fast food from Wote's best hotels, delivered to your door\. Pay on M-Pesa Till (\d+)\.$/, (m, a) => `Chakula cha haraka kutoka hoteli bora za Wote, tunakuletea mlangoni. Lipa kwa Till ya M-Pesa ${a}.`],
    [/^On M-Pesa Till (\d+), before we deliver\.$/, (m, a) => `Kwa Till ya M-Pesa ${a}, kabla hatujaleta.`],
    [/^View cart \((\d+)\)$/, (m, a) => `Tazama kikapu (${a})`],
    [/^View cart \((\d+) items?\)$/, (m, a) => `Tazama kikapu (vitu ${a})`],
    [/^Add (\d+) for (KES [\d,]+)$/, (m, a, b) => `Ongeza ${a} kwa ${b}`],
    [/^Please choose the (.+)\.$/, (m, a) => `Tafadhali chagua ${a}.`],
    [/^(\d+) (?:person has|people have) ordered this today$/, (m, a) => `Watu ${a} wameagiza hiki leo`],
    [/^(\d+) (?:person is|people are) viewing this now$/, (m, a) => `Watu ${a} wanakitazama sasa`],
    [/^(.*)(KES [\d,]+) each$/, (m, a, b) => `${a}${b} kila kimoja`],
    [/^Delivery fee is added on the next step\.(?: Up to (\d+) items are carried for the normal delivery fee\.)?$/,
      (m, a) => "Gharama ya kuleta inaongezwa hatua inayofuata." + (a ? ` Hadi vitu ${a} vinabebwa kwa gharama ya kawaida.` : "")],
    [/^Big order: (\d+) items \((\d+) included in the delivery\), \+ (KES [\d,]+)(?: on delivery)?\.?$/, (m, a, b, c) => `Oda kubwa: vitu ${a} (${b} vimejumuishwa), + ${c} kwenye kuleta.`],
    [/^Big order \((\d+) items(?:, (\d+) included)?\)$/, (m, a, b) => `Oda kubwa (vitu ${a}${b ? `, ${b} vimejumuishwa` : ""})`],
    [/^That is a big order \((\d+) items\)\. The most we can take online is (\d+)\. Please call or WhatsApp us on (\d+) and we will arrange it\.$/,
      (m, a, b, c) => `Hii ni oda kubwa (vitu ${a}). Kwa mtandao tunapokea hadi vitu ${b}. Tafadhali tupigie au tuandikie WhatsApp ${c} tutapanga.`],
    [/^(.+) \(delivery (KES [\d,]+)\)$/, (m, a, b) => `${a} (kuleta ${b})`],
    [/^Today (.+)$/, (m, a) => `Leo ${a}`], [/^Tomorrow (.+)$/, (m, a) => `Kesho ${a}`],
    [/^today (\d.+)$/, (m, a) => `leo ${a}`], [/^tomorrow (\d.+)$/, (m, a) => `kesho ${a}`],
    [/^We are very busy right now\. Delivery may take (.+?)\.( Thank you for your patience\.)?$/,
      (m, a, b) => `Tuna kazi nyingi sasa hivi. Kuleta kunaweza kuchukua ${min(a)}.${b ? " Asante kwa uvumilivu wako." : ""}`],
    [/^We are closed now\. We open at (.+?) and close at (.+?)\.( You can still order for later\.)?$/,
      (m, a, b, c) => `Tumefunga sasa. Tunafungua saa ${a} na kufunga saa ${b}.${c ? " Bado unaweza kuagiza kwa baadaye." : ""}`],
    [/^We are not taking orders right now\.( You can still order for later\.)?$/, (m, c) => `Hatupokei oda kwa sasa.${c ? " Bado unaweza kuagiza kwa baadaye." : ""}`],
    [/^Till (\d+) copied\. Paste it in M-Pesa\.$/, (m, a) => `Till ${a} imenakiliwa. Ibandike kwenye M-Pesa.`],
    [/^Till number: (\d+)$/, (m, a) => `Nambari ya Till: ${a}`],
    [/^(.+) added to your cart$/, (m, a) => `${a} kimewekwa kikapuni`],
    [/^We are getting your food ready\. It takes about (\d+) minutes\.$/, (m, a) => `Tunaandaa chakula chako. Inachukua takriban dakika ${a}.`],
    [/^We are getting your food ready\. Delivery in about (.+)\.$/, (m, a) => `Tunaandaa chakula chako. Tunafika baada ya takriban ${min(a)}.`],
    [/^(\d+) h (\d+) min (\d+) s$/, (m, a, b, c) => `saa ${a} dak ${b} sek ${c}`],
    [/^(\d+) min (\d+) s$/, (m, a, b) => `dak ${a} sek ${b}`],
    [/^by (\d.+)$/, (m, a) => `kufikia ${a}`]
  ];
  function tr(text) {
    const t = text.trim();
    if (!t) return text;
    let out = W[t];
    if (out === undefined) for (const [re, fn] of R) { if (re.test(t)) { out = t.replace(re, fn); break; } }
    if (out === undefined) return text;
    // keep the spaces around the piece (pages put words next to bold numbers)
    return text.replace(t, out);
  }
  const ATTRS = ["placeholder", "aria-label", "title", "label"];
  const done = new WeakMap();
  function apply(root) {
    if (lang !== "sw" || !root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement && !n.parentElement.closest("script, style, textarea, .rc, [data-notr]") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    if (root.nodeType === 3) nodes.push(root); else while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const n of nodes) {
      if (done.get(n) === n.nodeValue) continue;
      const v = tr(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
      done.set(n, n.nodeValue);
    }
    if (root.querySelectorAll) for (const el of [root, ...root.querySelectorAll("[placeholder], [aria-label], [title], optgroup[label]")]) {
      for (const a of ATTRS) if (el.getAttribute && el.hasAttribute(a)) { const v = tr(el.getAttribute(a)); if (v !== el.getAttribute(a)) el.setAttribute(a, v); }
    }
  }
  let watching = null;
  function watch() {
    if (watching || lang !== "sw") return;
    document.documentElement.lang = "sw";
    apply(document.body);
    watching = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") apply(m.target);
        else m.addedNodes.forEach(n => apply(n.nodeType === 1 || n.nodeType === 3 ? n : null));
      }
    });
    watching.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  return {
    lang: () => lang,
    // The switch shows to customers only after an admin turns it on (or while previewing)
    canSwitch: s => preview || !!(s && s.swOn),
    set(l) {
      lang = l === "sw" ? "sw" : "en";
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      if (lang === "en") location.replace(location.pathname + location.hash); else watch();
    },
    // Customers who chose Kiswahili before the switch was turned off go back to English
    check(s) {
      if (lang !== "sw") return;
      if (preview || (s && s.swOn)) watch();
      else { lang = "en"; try { localStorage.setItem(KEY, "en"); } catch (e) {} }
    },
    // A preview starts at once; otherwise the page calls check() once it knows whether the switch is on
    start: () => { if (!preview) return; if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch); }
  };
})();
I18N.start();
