/* Helpers shared by the requisition pages. */
(function () {
  "use strict";
  const CFG = window.REQ_CONFIG;
  const LIVE = !!CFG.API_URL && !/^PASTE/.test(CFG.API_URL);
  const $ = (s, el) => (el || document).querySelector(s);

  const academicYears = () => Array.from({ length: CFG.ACADEMIC_YEARS_SHOWN }, (_, i) => (CFG.FIRST_ACADEMIC_YEAR + i) + "/" + (CFG.FIRST_ACADEMIC_YEAR + i + 1));
  function fillSelect(sel, list, prompt) {
    sel.innerHTML = '<option value="" disabled selected>' + prompt + "</option>";
    list.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  }

  /* ---------- what this device remembers (name, email, phone, department; and the device pass) ----------
     Kept only while the tab is open (sessionStorage) unless "Remember me" is ticked (localStorage). */
  const KEY = "feas-req-me", TOK = "feas-req-token", REM = "feas-req-remember";
  const safe = fn => { try { return fn(); } catch (e) { return null; } };
  const remembered = () => safe(() => localStorage.getItem(REM) === "1") === true;
  const store = () => safe(() => (remembered() ? localStorage : sessionStorage));
  const readMe = () => safe(() => JSON.parse(store().getItem(KEY) || "{}")) || {};
  const saveMe = obj => safe(() => store().setItem(KEY, JSON.stringify(Object.assign(readMe(), obj))));
  function setRemember(on) {
    safe(() => {
      const from = on ? sessionStorage : localStorage, to = on ? localStorage : sessionStorage;
      [KEY, TOK].forEach(k => { const v = from.getItem(k); if (v != null) to.setItem(k, v); from.removeItem(k); });
      if (on) localStorage.setItem(REM, "1"); else localStorage.removeItem(REM);
    });
  }
  function forgetMe() { safe(() => [KEY, TOK, REM].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); })); }
  function setupRemember(form, onForget) {
    const box = form.querySelector('input[name="remember"]'), forget = form.querySelector(".forget");
    if (!box) return;
    box.checked = remembered();
    box.addEventListener("change", () => setRemember(box.checked));
    if (forget) {
      forget.hidden = !readMe().email;
      forget.addEventListener("click", () => { forgetMe(); box.checked = false; forget.hidden = true; if (onForget) onForget(); });
    }
  }
  const tokenFor = email => (safe(() => JSON.parse(store().getItem(TOK) || "{}")) || {})[email] || "";
  const keepToken = (email, token) => safe(() => { const t = JSON.parse(store().getItem(TOK) || "{}"); t[email] = token; store().setItem(TOK, JSON.stringify(t)); });

  const clean = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const ugx = n => Number(n || 0).toLocaleString("en-US");
  const emailOk = e => { const m = String(e).toLowerCase().match(/^[a-z0-9._%+\-']+@([a-z0-9.\-]+\.[a-z]{2,})$/);
                         return !!m && CFG.EMAIL_DOMAINS.some(d => m[1] === d || m[1].endsWith("." + d)); };

  /* ---------- talking to the register ---------- */
  async function send(data) {
    const res = await fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(data) });
    const r = await res.json();
    if (r && r.service) { const e = new Error("The website reached the register, but your request did not. (Staff: check that API_URL in config.js is exactly the Web app URL ending /exec.)"); e.fromServer = true; throw e; }
    return r;
  }
  // Sends a request. If the register asks for the code it emailed, shows a code box and resends with it.
  async function post(data, anchor) {
    if (data.email && !data.token) data.token = tokenFor(data.email.toLowerCase());
    let r = await send(data);
    if (r.needsCode) r = await askForCode(data, r, anchor);
    if (!r.ok) { const e = new Error(r.error || "The register did not accept the request."); e.fromServer = true; throw e; }
    if (r.token && data.email) keepToken(data.email.toLowerCase(), r.token);
    return r;
  }
  function askForCode(data, first, anchor) {
    anchor = anchor || $("#status");
    const box = document.createElement("div");
    box.className = "otp";
    box.setAttribute("role", "group");
    box.innerHTML = '<h3>Check your email</h3><p class="otp-msg"></p>' +
      '<div class="row"><input class="otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" aria-label="6-digit code">' +
      '<button type="button" class="otp-go">Continue</button></div>' +
      '<p class="otp-links"><button type="button" class="linkish otp-new">Send a new code</button><button type="button" class="linkish otp-cancel">Cancel</button></p>';
    anchor.parentNode.insertBefore(box, anchor);
    const msg = $(".otp-msg", box), input = $("input", box), go = $(".otp-go", box);
    const say = (t, bad) => { msg.textContent = t; msg.classList.toggle("bad", !!bad); };
    say(first.error);
    if (anchor.id === "status") { anchor.textContent = "Waiting for the code from your email…"; anchor.className = "status busy"; anchor.hidden = false; }
    input.focus();
    return new Promise(resolve => {
      const finish = r => { box.remove(); resolve(r); };
      async function attempt(extra) {
        go.disabled = true;
        try {
          const r = await send(Object.assign({}, data, extra));
          if (r.needsCode) { say(r.error, !!extra.otp); input.value = ""; input.focus(); } else finish(r);
        } catch (e) { say(e.fromServer ? e.message : "Could not reach the register. Check your connection and try again.", true); }
        finally { go.disabled = false; }
      }
      go.addEventListener("click", () => {
        const code = input.value.replace(/\D/g, "");
        if (code.length !== 6) { say("Enter the 6 digits from the email.", true); input.focus(); return; }
        attempt({ otp: code });
      });
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
      $(".otp-new", box).addEventListener("click", () => attempt({}));
      $(".otp-cancel", box).addEventListener("click", () => finish({ ok: false, error: "Cancelled. Nothing was saved." }));
    });
  }

  /* ---------- PDF tools load only when needed ---------- */
  const loading = {};
  function loadScripts(list) {
    const key = list.join("|");
    if (!loading[key]) {
      loading[key] = Promise.all(list.map(src => new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src; s.async = false; s.onload = res;
        s.onerror = () => { delete loading[key]; rej(new Error("Could not load " + src)); };
        document.head.appendChild(s);
      })));
    }
    return loading[key];
  }
  const pdfReady = () => loadScripts(["assets/vendor/pdf-lib.min.js", "assets/vendor/fontkit.umd.min.js", "assets/vendor/qrcode.js", "assets/js/req-pdf.js"]);
  function toBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function uploadPdf(bytes, ticket) {
    const r = await send({ action: "upload", ticket: ticket, pdf: toBase64(bytes) });
    if (!r.ok) { const e = new Error(r.error || "The PDF could not be filed."); e.fromServer = true; throw e; }
    return r;
  }
  // Opens the PDF in a new tab (to print) and offers it as a download.
  function savePdf(bytes, name, link) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (link) { link.href = url; link.download = name; }
    return url;
  }
  const fileName = rec => (rec.ref || "PREVIEW").replace(/\//g, "-") + " " + (rec.courseCode || "").replace(/\s+/g, "") +
                          (rec.status === "Approved" ? " APPROVED" : "") + ".pdf";

  // Keep the current tab visible in the scrollable tab row.
  const tabs = $(".tabs"), cur = tabs && tabs.querySelector('[aria-current="page"]');
  if (cur && cur.offsetLeft + cur.offsetWidth > tabs.clientWidth) tabs.scrollLeft = cur.offsetLeft - 16;

  // Contact links: the address is decoded only on click, so harvesting bots can't read it.
  document.querySelectorAll("a.reveal[data-v]").forEach(a => {
    a.addEventListener("click", () => {
      const v = safe(() => atob(a.dataset.v).split("").reverse().join(""));
      if (!v) return;
      a.href = a.dataset.k + ":" + v;
      const label = a.querySelector("span");
      if (label) label.textContent = a.dataset.k === "tel" ? v.replace(/^\+256(\d{3})(\d{6})$/, "0$1 $2") : v;
      a.classList.add("revealed");
    });
  });

  if (!LIVE) { const b = $("#previewBanner"); if (b) b.hidden = false; }

  function showStatus(el, text, kind) { el.textContent = text; el.className = "status " + (kind || "busy"); el.hidden = !text; }
  const friendly = e => e && e.fromServer ? e.message
    : !e || /fetch|network|load failed|NetworkError/i.test(String(e.message)) ? "Could not reach the register. Check your internet connection and try again."
    : "Something went wrong on this page (" + e.message + "). Please try again; if it keeps happening, contact the Dean’s office.";

  window.REQ = { CFG, LIVE, $, academicYears, fillSelect, readMe, saveMe, setupRemember, clean, ugx, emailOk, post, send,
                 pdfReady, uploadPdf, savePdf, fileName, showStatus, friendly };
})();
