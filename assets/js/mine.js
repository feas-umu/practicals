/* My practicals: each registered course unit with its sessions and requisitions. */
(function () {
  "use strict";
  const { CFG, LIVE, $, readMe, saveMe, ugx, emailOk, post, pdfReady, uploadPdf, savePdf, fileName, showStatus, friendly } = window.REQ;
  const form = $("#mineForm"), status = $("#status"), list = $("#list"), input = $("#email");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const day = iso => iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const BADGE = { "Approved": "ok", "Awaiting HOD approval": "wait", "Sent back": "back", "Cancelled": "off" };
  let email = "";

  input.value = readMe().email || "";

  form.addEventListener("submit", async e => {
    e.preventDefault();
    email = input.value.trim().toLowerCase();
    input.setCustomValidity(emailOk(email) ? "" : "Use your university email address (" + CFG.EMAIL_DOMAINS.map(x => "…@" + x).join(" or ") + ").");
    if (!form.reportValidity()) return;
    if (!LIVE) { showStatus(status, "This site is not connected to the register yet.", "error"); return; }
    saveMe({ email });
    $("#showBtn").disabled = true;
    showStatus(status, "Looking up your practicals…");
    try { const r = await post({ action: "mine", email }, status); showStatus(status, ""); render(r.practicals); }
    catch (err) { showStatus(status, friendly(err), "error"); }
    finally { $("#showBtn").disabled = false; }
  });

  // "All 3" → "All 3 sessions"; "Sessions 2, 3 of 3" stays as it is.
  const coveredText = c => c === "All 1" ? "The practical’s session" : /^All /.test(c) ? c + " sessions" : c;
  function reqHtml(x) {
    const st = x.status, canEdit = st === "Awaiting HOD approval" || st === "Sent back";
    const say = st === "Approved" ? "Approved " + day(x.decisionDate) : st === "Sent back" ? "Sent back " + day(x.decisionDate) + ": correct and resubmit"
              : st === "Awaiting HOD approval" ? "Waiting for " + esc(x.approver) : st;
    return '<div class="rq" data-ref="' + esc(x.ref) + '"><div class="rq-top"><div><strong>' + esc(x.ref) + "</strong>" + (x.revision > 1 ? " · version " + x.revision : "") +
      '<p class="meta">' + esc(coveredText(x.sessionsCovered)) + " · submitted " + day(x.submitted) + "</p>" +
      '<span class="badge ' + (BADGE[st] || "off") + '">' + say + "</span></div>" + '<span class="total">UGX ' + ugx(x.grandTotal) + "</span></div>" +
      (x.comment ? '<p class="comment' + (st === "Approved" ? " ok" : "") + '"><strong>Head of Department:</strong> ' + esc(x.comment) + "</p>" : "") +
      '<div class="actions">' +
        (st === "Approved" ? '<button type="button" class="primary-act" data-act="print">Print for the requisition book</button>' : "") +
        (canEdit ? '<a class="button' + (st === "Sent back" ? " primary-act" : " secondary-link") + '" href="requisition.html?edit=' + encodeURIComponent(x.ref) + '">Edit and resubmit</a>' : "") +
        (canEdit ? '<button type="button" class="secondary" data-act="copy">Download a copy</button>' : "") +
      '</div><p class="status" hidden></p></div>';
  }

  function render(practicals) {
    list.hidden = false;
    if (!practicals.length) { list.innerHTML = "<h2>No practicals yet</h2><p>None registered under " + esc(email) + '. <a href="index.html">Register one</a>.</p>'; return; }
    list.innerHTML = "<h2>" + practicals.length + " practical" + (practicals.length > 1 ? "s" : "") + "</h2>" + practicals.map(p => {
      const active = p.requisitions.some(x => x.status === "Approved" || x.status === "Awaiting HOD approval");
      return '<article class="prac" data-ref="' + esc(p.ref) + '"><div class="prac-head">' +
        "<h3>" + esc(p.courseCode) + " – " + esc(p.courseTitle) + "</h3>" +
        '<p class="meta">' + esc(p.academicYear) + ", " + esc(p.semester) + " · " + esc(p.department) + " · " + esc(p.ref) + "</p>" +
        "<details><summary>" + p.sessions.length + " practical session" + (p.sessions.length === 1 ? "" : "s") + "</summary><ol>" +
          p.sessions.map(s => "<li>Week " + esc(s.week) + ": " + esc(s.title) + ' <span class="muted">· ' + day(s.date) + ", " + esc(s.location) + "</span>" +
            (s.equipment ? '<br><span class="muted small">Equipment: ' + esc(s.equipment) + "</span>" : "") + "</li>").join("") +
        "</ol></details></div>" +
        '<div class="actions">' +
          '<a class="button primary-act" href="requisition.html?practical=' + encodeURIComponent(p.ref) + '">Make a requisition</a>' +
          '<a class="button secondary-link" href="index.html?edit=' + encodeURIComponent(p.ref) + '">Edit practical</a>' +
          '<a class="button secondary-link" href="index.html?copy=' + encodeURIComponent(p.ref) + '">Copy to another semester</a>' +
          (active ? "" : '<button type="button" class="secondary danger" data-act="withdraw">Remove</button>') +
        '</div><p class="status" hidden></p>' +
        '<div class="reqs">' + (p.requisitions.length ? p.requisitions.slice().reverse().map(reqHtml).join("") : '<p class="none">No requisitions. Make one only if this practical needs materials, equipment or services.</p>') + "</div>" +
        "</article>";
    }).join("");
    list.querySelectorAll(".rq [data-act]").forEach(b => b.addEventListener("click", () => getPdf(b)));
    list.querySelectorAll('[data-act="withdraw"]').forEach(b => b.addEventListener("click", () => withdraw(b)));
  }

  async function getPdf(b) {
    const row = b.closest(".rq"), st = row.querySelector(".status"), ref = row.dataset.ref;
    b.disabled = true;
    showStatus(st, "Preparing the PDF…");
    try {
      const r = await post({ action: "loadRequisition", email, ref }, st);
      await pdfReady();
      const bytes = await window.REQ_PDF.build(r.record);
      if (r.upload) uploadPdf(bytes, r.upload.ticket).catch(() => {});
      const url = savePdf(bytes, fileName(r.record), null);
      let a = row.querySelector("a.pdf");
      if (!a) { a = document.createElement("a"); a.className = "button pdf"; a.target = "_blank"; a.rel = "noopener"; row.querySelector(".actions").prepend(a); }
      a.href = url; a.textContent = r.record.status === "Approved" ? "Open the approved PDF to print" : "Open the copy (not approved)";
      const dl = document.createElement("a"); dl.href = url; dl.download = fileName(r.record); document.body.appendChild(dl); dl.click(); dl.remove();
      showStatus(st, r.record.status === "Approved" ? "Downloaded. Print it on A4, fill in the requisition book, and have the book signed by your HOD." : "Downloaded. This copy is marked NOT APPROVED.");
    } catch (err) { showStatus(st, friendly(err), "error"); }
    finally { b.disabled = false; }
  }

  async function withdraw(b) {
    const card = b.closest(".prac"), st = card.querySelector(".prac > .status"), ref = card.dataset.ref;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Press again to remove it from the register"; return; }
    b.disabled = true;
    try { await post({ action: "withdraw", email, ref }, st); card.remove(); }
    catch (err) { showStatus(st, friendly(err), "error"); b.disabled = false; }
  }

  if (input.value && LIVE) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
})();
