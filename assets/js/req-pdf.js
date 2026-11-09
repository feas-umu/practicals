/* Builds the practical materials requisition PDF (A4) in the browser with pdf-lib.
   Layout follows the Faculty's "Practical Materials Submission" Word template: title block,
   Semester / Academic Year, Sections A–D, and the signatures table for the requisition book. */
(function () {
  "use strict";
  const { PDFDocument, rgb, degrees } = PDFLib;
  const P = window.REQ_CONFIG.PRINT;

  const W = 595.32, H = 841.92, ML = 48, MR = W - 48, TW = MR - ML;
  const TOP = 40, BOTTOM = 58;                       // printable band (footer below BOTTOM)
  const BLACK = rgb(0, 0, 0), GREY = rgb(0.42, 0.45, 0.5), LINE = rgb(0.25, 0.25, 0.25), SHADE = rgb(0.93, 0.94, 0.96);
  const NAVY = rgb(0.075, 0.161, 0.294), GREEN = rgb(0.07, 0.5, 0.36), GREEN_BG = rgb(0.92, 0.97, 0.94);
  const AMBER = rgb(0.55, 0.38, 0), AMBER_BG = rgb(1, 0.965, 0.84);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const cache = {};
  async function bytes(url) {
    if (!cache[url]) cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error("Could not load " + url); return r.arrayBuffer(); });
    return new Uint8Array(await cache[url]);
  }
  const ugx = n => Number(n || 0).toLocaleString("en-US");
  const day = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? +m[3] + " " + MON[+m[2] - 1] + " " + m[1] : ""; };
  const when = iso => { if (!iso) return ""; const d = new Date(iso); return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() + ", " +
                        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

  async function build(rec) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);
    const [regB, boldB, crestB] = await Promise.all([bytes("assets/fonts/Carlito-Regular.ttf"), bytes("assets/fonts/Carlito-Bold.ttf"), bytes("assets/img/crest.png")]);
    const fR = await pdf.embedFont(regB, { subset: true }), fB = await pdf.embedFont(boldB, { subset: true });
    const crest = await pdf.embedPng(crestB);
    const approved = rec.status === "Approved", preview = rec.status === "Preview";
    pdf.setTitle("Practical materials submission " + (rec.ref || "preview"));
    pdf.setAuthor(P.faculty + ", " + P.university);

    let page, y;                                          // y = distance from the top of the page
    const pages = [];
    const ascent = s => s * 0.75;
    function newPage() {
      page = pdf.addPage([W, H]); pages.push(page); y = TOP;
      if (!approved) {                                    // unapproved copies can't pass as approved
        const t = preview ? "PREVIEW" : "NOT APPROVED", s = 74, tw = fB.widthOfTextAtSize(t, s);
        page.drawText(t, { x: W / 2 - tw / 2 * 0.72, y: H / 2 - tw / 2 * 0.69, size: s, font: fB, color: rgb(0.85, 0.2, 0.2), opacity: 0.08, rotate: degrees(43) });
      }
    }
    function text(t, x, top, o = {}) {
      const f = o.bold ? fB : fR, size = o.size || 10;
      page.drawText(String(t), { x, y: H - top - ascent(size), size, font: f, color: o.color || BLACK });
      return f.widthOfTextAtSize(String(t), size);
    }
    const width = (t, o = {}) => (o.bold ? fB : fR).widthOfTextAtSize(String(t), o.size || 10);
    function centre(t, top, o) { text(t, (W - width(t, o)) / 2, top, o); }
    // Wraps text to a width (breaking any word that is too long by itself).
    function wrap(t, w, o = {}) {
      const out = [];
      String(t == null ? "" : t).split(/\n/).forEach(para => {
        let line = "";
        para.split(/\s+/).filter(Boolean).forEach(word => {
          while (width(word, o) > w) {
            let i = word.length; while (i > 1 && width(word.slice(0, i), o) > w) i--;
            if (line) { out.push(line); line = ""; }
            out.push(word.slice(0, i)); word = word.slice(i);
          }
          const test = line ? line + " " + word : word;
          if (width(test, o) <= w) line = test; else { out.push(line); line = word; }
        });
        out.push(line);
      });
      return out.length ? out : [""];
    }
    function ensure(h, again) { if (y + h > H - BOTTOM) { newPage(); if (again) again(); } }
    function rect(x, top, w, h, o = {}) {
      page.drawRectangle({ x, y: H - top - h, width: w, height: h, color: o.fill, borderColor: o.border === false ? undefined : (o.border || LINE),
                           borderWidth: o.border === false ? 0 : (o.bw || 0.6) });
    }
    function box(x, top, size, ticked) {                // a check box, ticked or not
      rect(x, top, size, size, { bw: 0.8 });
      if (ticked) {
        page.drawLine({ start: { x: x + size * 0.2, y: H - top - size * 0.55 }, end: { x: x + size * 0.42, y: H - top - size * 0.8 }, thickness: 1.4, color: BLACK });
        page.drawLine({ start: { x: x + size * 0.42, y: H - top - size * 0.8 }, end: { x: x + size * 0.85, y: H - top - size * 0.18 }, thickness: 1.4, color: BLACK });
      }
    }

    /* ---------- a table with wrapping cells; the header row repeats on each new page ---------- */
    const PAD = 4, LH = 11.5;
    function table(cols, head, rows, o = {}) {
      const size = o.size || 9.5;
      const drawRow = (cells, opts) => {
        cells = cells.map(c => (c !== null && typeof c === "object" ? c : { t: c == null ? "" : String(c) }));
        const lines = cells.map((c, i) => wrap(c.t, cols[i].w - PAD * 2, { size, bold: opts.bold || !!c.b }));
        const h = Math.max(...lines.map(l => l.length)) * LH + PAD * 2 - 2;
        ensure(h, opts.head ? null : drawHead);
        let x = ML;
        cells.forEach((c, i) => {
          rect(x, y, cols[i].w, h, { fill: opts.fill || c.fill || undefined });
          lines[i].forEach((ln, k) => {
            const bold = !!(opts.bold || c.b), tw = width(ln, { size, bold });
            const tx = cols[i].align === "right" && !opts.head ? x + cols[i].w - PAD - tw : cols[i].align === "center" && !opts.head ? x + (cols[i].w - tw) / 2 : x + PAD;
            text(ln, tx, y + PAD + k * LH, { size, bold });
          });
          x += cols[i].w;
        });
        y += h;
      };
      const drawHead = () => { if (head) drawRow(head, { bold: true, fill: SHADE, head: true }); };
      if (head) { ensure(LH * 3 + 30); drawHead(); }
      rows.forEach(r => drawRow(r, {}));
    }
    const cols = ws => { const t = ws.reduce((a, b) => a + (b.w || b), 0); return ws.map(c => (typeof c === "number" ? { w: c * TW / t } : Object.assign({}, c, { w: c.w * TW / t }))); };
    function heading(t) { ensure(40); y += 12; text(t, ML, y, { size: 11, bold: true }); y += 17; }

    /* ---------- page 1: title block ---------- */
    newPage();
    const cw = 40, chh = cw * crest.height / crest.width;
    page.drawImage(crest, { x: (W - cw) / 2, y: H - y - chh, width: cw, height: chh });
    y += chh + 6;
    centre(P.title, y, { size: 13, bold: true }); y += 18;
    centre(P.faculty, y, { size: 11, bold: true }); y += 15;
    centre(P.university + (P.campus ? ", " + P.campus : ""), y, { size: 11, bold: true }); y += 20;

    // QR code top right (approved and submitted copies; not the preview)
    if (rec.code) {
      const url = new URL("verify.html", location.href); url.searchParams.set("c", rec.code); url.searchParams.set("r", rec.revision);
      const qr = qrcode(0, "M"); qr.addData(url.toString()); qr.make();
      const n = qr.getModuleCount(), size = 62, m = size / (n + 2), qx = MR - size, qTop = TOP - 4;
      page.drawRectangle({ x: qx, y: H - qTop - size, width: size, height: size, color: rgb(1, 1, 1) });
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c))
        page.drawRectangle({ x: qx + m * (c + 1), y: H - qTop - m * (r + 2), width: m + 0.05, height: m + 0.05, color: BLACK });
      const cap = rec.code;
      text("Scan to verify", qx + (size - width("Scan to verify", { size: 7 })) / 2, qTop + size + 1, { size: 7, color: GREY });
      text(cap, qx + (size - width(cap, { size: 8, bold: true })) / 2, qTop + size + 9, { size: 8, bold: true });
    }
    // Reference top left
    let hy = TOP + 2;
    text("Ref: " + (rec.ref || "—") + (rec.revision > 1 ? "  (version " + rec.revision + ")" : ""), ML, hy, { size: 9, bold: true }); hy += 12;
    if (rec.practicalRef) { text("Practical: " + rec.practicalRef, ML, hy, { size: 9, color: GREY }); hy += 12; }
    if (rec.submitted) text("Submitted " + when(rec.submitted), ML, hy, { size: 9, color: GREY });

    // Status band
    const band = approved
      ? ["APPROVED ONLINE by the Head of Department", (rec.decidedBy || "") + (rec.decisionDate ? " on " + when(rec.decisionDate) : "") + ". Copy into the requisition book; the HOD must sign the book."]
      : preview ? ["PREVIEW — NOT SUBMITTED", "This copy was made before the site was connected to the register. It is not a requisition."]
      : ["NOT YET APPROVED — " + String(rec.status || "").toUpperCase(), "Do not use for the requisition book until the Head of Department has approved it."];
    const bh = 34;
    rect(ML, y, TW, bh, { fill: approved ? GREEN_BG : AMBER_BG, border: approved ? GREEN : AMBER, bw: 1 });
    text(band[0], ML + 10, y + 6, { size: 10.5, bold: true, color: approved ? GREEN : AMBER });
    text(wrap(band[1], TW - 20, { size: 9 })[0], ML + 10, y + 19, { size: 9, color: approved ? GREEN : AMBER });
    y += bh + 10;

    /* ---------- Semester / Academic Year ---------- */
    const quarter = cols([1, 1, 1, 1]);
    table(quarter, null, [[{ t: "Semester:", b: true }, rec.semester, { t: "Academic Year", b: true }, rec.academicYear]]);

    /* ---------- Section A ---------- */
    heading("Section A: Instructor & Course Details");
    const half = cols([1, 1]);
    table(half, [{ t: "Field" }, { t: "" }], [
      ["Instructor Name", rec.name], ["Email / Phone", [rec.email, rec.phone].filter(Boolean).join("  ·  ")], ["Department", rec.department],
      ["Course Title", rec.courseTitle], ["Course Code", rec.courseCode], ["Credit Units (CU)", rec.creditUnits]]
      .concat(rec.students ? [["Number of Students", String(rec.students)]] : []));

    /* ---------- Section B ---------- */
    heading("Section B: Schedule of Practical Sessions");
    if (rec.sessionsCovered && !/^All/.test(rec.sessionsCovered)) { y -= 4; text("This requisition covers " + rec.sessionsCovered.replace(/^Sessions/, "sessions") + " registered for the course.", ML, y, { size: 9, color: GREY }); y += 13; }
    table(cols([{ w: 38, align: "center" }, 150, 62, 84, { w: 62, align: "center" }, 100]),
      ["Week", "Practical Title/Activity", "Expected Date", "Location (Workshop/ Lab/Field)", "Technician Support Needed (Y/N)", "Remarks"],
      (rec.sessions || []).map(s => [String(s.week), s.title, day(s.date), s.location, s.technician === "Y" ? "Y" : "N", s.remarks || ""]));

    /* ---------- Section C ---------- */
    heading("Section C: List of Required Materials, Equipment & Services");
    const items = rec.items || [];
    table(cols([150, { w: 44, align: "right" }, { w: 66, align: "right" }, { w: 72, align: "right" }, 100, 74]),
      ["Item", "Units", "Unit cost", "Amount", "Purpose/Use in practical", "Remarks"],
      items.map(x => [x.item, String(x.units), ugx(x.unitCost), ugx(x.amount), x.purpose || "", x.remarks || ""])
        .concat(items.length ? [[{ t: "Total (UGX)", b: true, fill: SHADE }, { t: "", fill: SHADE }, { t: "", fill: SHADE }, { t: ugx(rec.materialsTotal), b: true, fill: SHADE }, { t: "", fill: SHADE }, { t: "", fill: SHADE }]]
                              : [["No items", "", "", "", "", ""]]));

    /* ---------- Section D ---------- */
    heading("Section D: Additional Requirements (if any)");
    const checks = (label, list) => {
      ensure(36);
      text(label, ML, y, { size: 10, bold: true }); y += 15;
      let x = ML;
      list.forEach(([t, on]) => { box(x, y + 0.5, 9, on); text(t, x + 14, y, { size: 10 }); x += 14 + width(t, { size: 10 }) + 22; });
      y += 17;
    };
    const field = (label, value) => {
      ensure(18);
      const lw = text(label + " ", ML, y, { size: 10 });
      const lines = wrap(value || "", TW - lw - 4, { size: 10 });
      lines.forEach((ln, i) => {
        if (i) { y += 13; ensure(14); }
        text(ln, ML + lw + 2, y, { size: 10, bold: !!value });
      });
      if (!value) page.drawLine({ start: { x: ML + lw + 2, y: H - y - 10 }, end: { x: ML + lw + 160, y: H - y - 10 }, thickness: 0.5, color: GREY });
      y += 15;
    };
    const t = rec.transport || {}, a = rec.allowances || {}, st = rec.site || {};
    checks("Transport Needs:", [["Vehicle for fieldwork", t.vehicle], ["Fuel support", t.fuel], ["Driver", t.driver]]);
    field("Estimated dates:", t.dates);
    y += 4; ensure(18); text("External Site Fees (if applicable):", ML, y, { size: 10, bold: true }); y += 15;
    field("Site name:", st.name); field("Contact person:", st.contact); field("Estimated cost:", rec.siteCost ? "UGX " + ugx(rec.siteCost) : "");
    y += 4;
    checks("Allowances (if applicable):", [["Field support staff", a.fieldStaff], ["Casual labourers", a.casuals], ["Student transport", a.studentTransport]]);
    if (rec.notes) { ensure(30); text("Notes:", ML, y, { size: 10, bold: true }); y += 14; wrap(rec.notes, TW, { size: 10 }).forEach(l => { ensure(14); text(l, ML, y, { size: 10 }); y += 13; }); y += 4; }

    // Total requested
    ensure(40);
    y += 4;
    rect(ML, y, TW, 28, { fill: SHADE, border: NAVY, bw: 0.8 });
    text("TOTAL REQUESTED", ML + 10, y + 8, { size: 10.5, bold: true, color: NAVY });
    const tot = "UGX " + ugx(rec.grandTotal);
    text(tot, MR - 10 - width(tot, { size: 13, bold: true }), y + 6.5, { size: 13, bold: true, color: NAVY });
    if (rec.siteCost) { const s = "materials " + ugx(rec.materialsTotal) + " + site fees " + ugx(rec.siteCost); text(s, ML + 120, y + 9.5, { size: 8.5, color: GREY }); }
    y += 38;

    /* ---------- signatures (for the physical requisition book) ---------- */
    ensure(120);
    page.drawLine({ start: { x: ML, y: H - y }, end: { x: MR, y: H - y }, thickness: 1, color: BLACK });
    y += 8; text("SIGNATURES AND APPROVALS", ML, y, { size: 10.5, bold: true }); y += 18;
    table(cols([2.2, 1.1, 0.8]), ["Name & Role", "Signature", "Date"], [
      ["Instructor: " + (rec.name || ""), "", ""], ["Laboratory/Workshop Technician", "", ""],
      ["Head of Department" + (approved && rec.decidedBy ? " (approved online: " + rec.decidedBy + ")" : ""), "", approved ? day(rec.decisionDate ? new Date(rec.decisionDate).toISOString().slice(0, 10) : "") : ""]],
      { size: 9.5 });

    /* ---------- footer on every page ---------- */
    pages.forEach((pg, i) => {
      const f = "Page " + (i + 1) + " of " + pages.length, s = 8.5;
      pg.drawText(f, { x: (W - fR.widthOfTextAtSize(f, s)) / 2, y: 30, size: s, font: fR, color: GREY });
      const left = (rec.ref || "PREVIEW") + (rec.revision > 1 ? " · v" + rec.revision : "") + " · " + (rec.courseCode || "");
      pg.drawText(left, { x: ML, y: 30, size: s, font: fR, color: GREY });
      if (rec.code) { const r = "Verify: " + rec.code; pg.drawText(r, { x: MR - fR.widthOfTextAtSize(r, s), y: 30, size: s, font: fR, color: GREY }); }
    });
    return pdf.save();
  }

  window.REQ_PDF = { build };
})();
