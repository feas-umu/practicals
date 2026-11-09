/* Register a practical (Sections A and B), with an optional requisition (Sections C and D). */
(function () {
  "use strict";
  const { CFG, LIVE, $, academicYears, fillSelect, readMe, saveMe, setupRemember, clean, ugx, emailOk, post,
          pdfReady, uploadPdf, savePdf, fileName, showStatus, friendly } = window.REQ;
  const form = $("#pracForm"), status = $("#status"), btn = $("#submitBtn"), sessionsBox = $("#sessions"), reqBlock = $("#reqBlock");
  const parts = window.REQPARTS.mount(form);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let editing = null, eq = null;

  fillSelect($("#academicYear"), academicYears(), "Choose the academic year");
  fillSelect($("#semester"), CFG.SEMESTERS, "Choose the semester");
  fillSelect($("#department"), CFG.DEPARTMENTS, "Choose your department");
  (function defaultYear() {
    const d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1, ay = y + "/" + (y + 1);
    if (academicYears().includes(ay)) $("#academicYear").value = ay;
  })();

  /* ---------- Section B rows ---------- */
  const opt = (list, v) => list.map(x => '<option value="' + x.v + '"' + (x.v === v ? " selected" : "") + ">" + x.t + "</option>").join("");
  const weeks = Array.from({ length: 20 }, (_, i) => ({ v: String(i + 1), t: "Week " + (i + 1) }));
  function addSession(s) {
    s = s || {};
    if (sessionsBox.children.length >= CFG.MAX_SESSIONS) return null;
    const el = document.createElement("div");
    el.className = "line session";
    el.innerHTML = '<div class="line-head"><span class="n"></span><button type="button" class="remove">Remove</button></div>' +
      '<div class="g-wt"><label>Week<select data-k="week" required><option value="" disabled' + (s.week ? "" : " selected") + '>–</option>' + opt(weeks, String(s.week || "")) + "</select></label>" +
      '<label>Practical title / activity<input data-k="title" required maxlength="150" value="' + esc(s.title) + '" placeholder="e.g. Atterberg limits test"></label></div>' +
      '<div class="g3 stack"><label>Expected date<input data-k="date" type="date" required value="' + esc(s.date) + '"></label>' +
      '<label>Location<select data-k="location" required><option value="" disabled' + (s.location ? "" : " selected") + ">Choose</option>" +
        opt(CFG.LOCATIONS.map(x => ({ v: x, t: x })), s.location) + "</select></label>" +
      '<label>Technician support?<select data-k="technician" required><option value="" disabled' + (s.technician ? "" : " selected") + ">Choose</option>" +
        opt([{ v: "Y", t: "Yes" }, { v: "N", t: "No" }], s.technician) + "</select></label></div>" +
      '<label>Remarks <span class="hint inline">(optional)</span><input data-k="remarks" maxlength="200" value="' + esc(s.remarks) + '"></label>' +
      '<label>Equipment to use <span class="hint inline">(optional; type it, or add it from “Equipment you can use” below)</span><textarea data-k="equipment" maxlength="400" rows="2" placeholder="e.g. Casagrande liquid limit set (Materials Lab, Kichwamba)">' + esc(s.equipment) + "</textarea></label>";
    el.querySelector(".remove").addEventListener("click", () => { el.remove(); renumber(); syncCover(); if (eq) eq.update(); });
    sessionsBox.appendChild(el);
    renumber(); syncCover(); if (eq) eq.update();
    return el;
  }
  function renumber() {
    [...sessionsBox.children].forEach((el, i, a) => { el.querySelector(".n").textContent = "Session " + (i + 1); el.querySelector(".remove").hidden = a.length === 1; });
    $("#addSession").hidden = sessionsBox.children.length >= CFG.MAX_SESSIONS;
  }
  const readSessions = () => [...sessionsBox.children].map(el => {
    const o = {}; ["week", "title", "date", "location", "technician", "remarks", "equipment"].forEach(k => o[k] = clean(el.querySelector('[data-k="' + k + '"]').value));
    o.week = Number(o.week) || ""; return o;
  });
  $("#addSession").addEventListener("click", () => { const el = addSession(); el && el.querySelector("select").focus(); });

  /* ---------- equipment suggestions ---------- */
  eq = window.EQUIP.panel($("#equipPanel"), {
    context: () => ({ department: form.elements.department.value, courseCode: form.elements.courseCode.value, courseTitle: form.elements.courseTitle.value,
                      sessions: [...sessionsBox.querySelectorAll('[data-k="title"]')].map(x => x.value.trim()) }),
    sessions: () => [...sessionsBox.querySelectorAll('[data-k="title"]')].map(x => ({ title: x.value.trim() })),
    onAdd(k, text) {
      const box = sessionsBox.children[k] && sessionsBox.children[k].querySelector('[data-k="equipment"]');
      if (!box) return null;
      const have = box.value.split(";").map(x => x.trim()).filter(Boolean);
      if (have.some(x => x.toLowerCase() === text.toLowerCase())) return "dup";
      const next = have.concat(text).join("; ");
      if (next.length > 400) return "full";
      box.value = next;
      return "ok";
    }
  });
  ["courseTitle", "courseCode", "department"].forEach(k => form.elements[k].addEventListener("input", () => eq.update()));

  /* course codes from the faculty curricula: offered as you type; picking one fills in the title and credit units if empty */
  const codeList = document.createElement("datalist"), codeHint = document.createElement("span");
  codeList.id = "courseCodes"; form.appendChild(codeList);
  codeHint.className = "hint code-hint"; form.elements.courseCode.insertAdjacentElement("afterend", codeHint);
  form.elements.courseCode.setAttribute("list", "courseCodes");
  let cur = null;
  window.EQUIP.load().then(d => { cur = d; fillCodes(); matchCode(); }).catch(() => {});
  function fillCodes() {
    if (!cur) return;
    const dep = form.elements.department.value;
    codeList.innerHTML = cur.courses.filter(c => !dep || c.dept === dep).map(c => '<option value="' + esc(c.code) + '">' + esc(c.t + " · " + c.p.join(", ")) + "</option>").join("");
  }
  function matchCode() {
    if (!cur) return;
    const v = form.elements.courseCode.value, c = window.EQUIP.findCourse(cur, { department: form.elements.department.value, courseCode: v });
    if (!c || window.EQUIP.codeKey(c.code) !== window.EQUIP.codeKey(v)) { codeHint.textContent = ""; return; }
    codeHint.textContent = c.t + " · " + c.p.join(", ") + " · Year " + c.y + ", Semester " + c.s;
    if (!form.elements.courseTitle.value.trim()) form.elements.courseTitle.value = c.t;
    if (!form.elements.creditUnits.value.trim() && c.cu) form.elements.creditUnits.value = c.cu;
    eq.update();
  }
  form.elements.department.addEventListener("change", () => { fillCodes(); matchCode(); });
  form.elements.courseCode.addEventListener("change", matchCode);
  form.elements.courseCode.addEventListener("input", () => { if (/\d{4}/.test(form.elements.courseCode.value)) matchCode(); else codeHint.textContent = ""; });
  form.elements.department.addEventListener("change", () => eq.update());
  sessionsBox.addEventListener("input", e => { if (e.target.dataset.k === "title") eq.update(); });

  /* ---------- optional requisition ---------- */
  const wantReq = () => form.elements.needReq.value === "yes";
  function syncCover() {                  // keep the "sessions covered" list in step with Section B, keeping ticks
    if (!wantReq()) return;
    const was = [...document.querySelectorAll("#cover input")];
    const ticked = was.length ? was.filter(x => x.checked).map(x => Number(x.value)) : null;
    const n = sessionsBox.children.length;
    const keep = ticked ? ticked.filter(x => x <= n).concat(Array.from({ length: Math.max(0, n - was.length) }, (_, i) => was.length + i + 1)) : null;
    parts.setSessions(readSessions(), keep);
  }
  sessionsBox.addEventListener("change", syncCover);
  sessionsBox.addEventListener("input", e => { if (e.target.dataset.k === "title") syncCover(); });
  function toggleReq() {
    const on = wantReq();
    reqBlock.hidden = !on; parts.enable(on);
    btn.textContent = on ? (editing ? "Save the practical and send the requisition" : "Register and send the requisition for approval")
                         : (editing ? "Save the changes" : "Register the practical");
    if (on) { document.querySelectorAll("#cover input").length || parts.setSessions(readSessions()); syncCover(); }
  }
  form.querySelectorAll('[name="needReq"]').forEach(r => r.addEventListener("change", toggleReq));

  /* ---------- start ---------- */
  const me = readMe();
  ["name", "email", "phone", "department"].forEach(k => { if (me[k]) form.elements[k].value = me[k]; });
  setupRemember(form, () => ["name", "email", "phone"].forEach(k => form.elements[k].value = ""));
  addSession();
  toggleReq();

  function fillPractical(p, copy) {
    ["name", "phone", "department", "academicYear", "semester", "courseTitle", "courseCode", "creditUnits", "students", "notes"].forEach(k => {
      if (form.elements[k] && p[k] != null) form.elements[k].value = p[k];
    });
    if (copy) form.elements.semester.value = "";
    sessionsBox.innerHTML = "";
    (p.sessions.length ? p.sessions : [{}]).forEach(s => addSession(copy ? Object.assign({}, s, { date: "" }) : s));
    eq.update();
  }
  const q = new URLSearchParams(location.search), editRef = q.get("edit"), copyRef = q.get("copy");
  if ((editRef || copyRef) && LIVE) {
    const banner = $("#editBanner");
    banner.hidden = false;
    if (!me.email) banner.textContent = "To edit or copy a practical, open it from My practicals on this device.";
    else {
      showStatus(status, "Loading…");
      post({ action: "loadPractical", email: me.email, ref: editRef || copyRef }, status).then(r => {
        showStatus(status, "");
        fillPractical(r.practical, !!copyRef);
        if (editRef) {
          editing = r.practical;
          banner.innerHTML = "<strong>Editing " + esc(editing.ref) + "</strong> (" + esc(editing.courseCode) + ", " + esc(editing.academicYear) + ", " + esc(editing.semester) + ")." +
            (editing.requisitions.length ? "<br>Its requisitions keep the sessions they were made for." : "");
        } else banner.textContent = "Copied from " + r.practical.ref + ". Choose the semester and the session dates, then register it as a new practical.";
        toggleReq();
      }).catch(e => showStatus(status, friendly(e), "error"));
    }
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const em = form.elements.email;
    em.setCustomValidity(!em.value || emailOk(em.value) ? "" : "Use your university email address (" + CFG.EMAIL_DOMAINS.map(x => "…@" + x).join(" or ") + ").");
    const cu = Number(form.elements.creditUnits.value);
    form.elements.creditUnits.setCustomValidity(form.elements.creditUnits.value && !(cu > 0 && cu <= 30) ? "Enter the credit units as a number, e.g. 3." : "");
    const st = form.elements.students.value.trim();
    form.elements.students.setCustomValidity(st && !/^\d{1,4}$/.test(st) ? "Enter the number of students, or leave it blank." : "");
    if (!form.reportValidity()) return;
    if (wantReq()) { const p = parts.problem(); if (p) { showStatus(status, p[1], "error"); p[0].scrollIntoView({ block: "center" }); return; } }

    const v = k => clean(form.elements[k].value);
    const d = { action: "practical", ref: editing ? editing.ref : undefined, name: v("name"), email: v("email").toLowerCase(), phone: v("phone"),
      department: v("department"), academicYear: v("academicYear"), semester: v("semester"), courseTitle: v("courseTitle"),
      courseCode: v("courseCode").toUpperCase(), creditUnits: v("creditUnits"), students: st, notes: v("notes"), sessions: readSessions() };
    if (wantReq()) d.requisition = parts.read();
    saveMe({ name: d.name, email: d.email, phone: d.phone, department: d.department });

    btn.disabled = true;
    showStatus(status, LIVE ? "Saving…" : "Making a preview…");
    try {
      if (!LIVE) return showPreview(d);
      const r = await post(d, status);
      let rq = r.requisition, link = $("#copyLink");
      if (rq) {
        showStatus(status, "Making the requisition PDF and sending it to your Head of Department…");
        await pdfReady();
        const bytes = await window.REQ_PDF.build(rq.record);
        savePdf(bytes, fileName(rq.record), link);
        link.hidden = false; link.textContent = "Download the requisition (not yet approved)";
        try { await uploadPdf(bytes, rq.upload.ticket); } catch (err) { /* the HOD is still emailed within 10 minutes */ }
      }
      showStatus(status, "");
      const p = r.practical;
      showResult(r.isNew ? "Practical registered" : "Practical updated",
        (r.isNew ? "It is now in the " + p.department + " register." : "The " + p.department + " register is updated.") +
        (rq ? " The requisition has gone to your Head of Department (" + rq.approver + ") for approval; we’ve emailed you a confirmation." : "") +
        (r.requisitionError ? " The requisition was NOT sent: " + r.requisitionError : ""),
        [["Practical", p.ref], ["Course", p.courseCode + " – " + p.courseTitle], ["Term", p.academicYear + ", " + p.semester], ["Sessions", String(p.sessions.length)]]
          .concat(rq ? [["Requisition", rq.ref + " (" + rq.record.sessionsCovered + ")"], ["Total requested", "UGX " + ugx(rq.record.grandTotal)]] : []),
        !!rq);
    } catch (err) {
      showStatus(status, friendly(err), "error");
    } finally {
      btn.disabled = false;
    }
  });

  async function showPreview(d) {
    if (d.requisition) {
      const covered = d.requisition.sessionsCovered.map(n => d.sessions[n - 1]);
      const items = d.requisition.items.map(x => Object.assign({}, x, { units: Number(x.units), unitCost: Number(x.unitCost), amount: Math.round(Number(x.units) * Number(x.unitCost)) }));
      const mat = items.reduce((a, x) => a + x.amount, 0), site = Number(d.requisition.site.cost || 0);
      const rec = Object.assign({}, d, d.requisition, { ref: "PREVIEW", practicalRef: "PREVIEW", code: "", status: "Preview", revision: 1, submitted: new Date().toISOString(),
        sessions: covered, sessionsCovered: covered.length === d.sessions.length ? "All " + d.sessions.length : "Sessions " + d.requisition.sessionsCovered.join(", ") + " of " + d.sessions.length,
        items, materialsTotal: mat, siteCost: site, grandTotal: mat + site, site: Object.assign({}, d.requisition.site, { cost: site }) });
      await pdfReady();
      const bytes = await window.REQ_PDF.build(rec), link = $("#copyLink");
      savePdf(bytes, "PREVIEW.pdf", link); link.hidden = false; link.textContent = "Download the preview requisition";
    }
    showStatus(status, ""); btn.disabled = false;
    showResult("Preview only", "This site is not connected to the register yet, so nothing was recorded or sent.", [["Course", d.courseCode + " – " + d.courseTitle], ["Sessions", String(d.sessions.length)]], false);
  }

  function showResult(title, text, facts, withReq) {
    const panel = $("#result");
    form.hidden = true; $("#editBanner").hidden = true; panel.hidden = false;
    panel.querySelector(".result-title").textContent = title;
    panel.querySelector(".result-text").textContent = text;
    $("#resultNote").hidden = !withReq || !LIVE;
    $("#facts").innerHTML = facts.map(x => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
