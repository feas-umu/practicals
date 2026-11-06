/* Requisition for a registered practical (?practical=REF), or a correction of one (?edit=REF). */
(function () {
  "use strict";
  const { LIVE, $, readMe, ugx, post, pdfReady, uploadPdf, savePdf, fileName, showStatus, friendly } = window.REQ;
  const form = $("#reqForm"), status = $("#status"), loadStatus = $("#loadStatus"), btn = $("#submitBtn"), card = $("#pracCard"), banner = $("#editBanner");
  const parts = window.REQPARTS.mount(form);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const q = new URLSearchParams(location.search), practicalRef = q.get("practical"), editRef = q.get("edit");
  const me = readMe();
  let practical = null, editing = null;

  function showCard(p) {
    card.hidden = false;
    card.innerHTML = "<h2>" + esc(p.courseCode) + " – " + esc(p.courseTitle) + "</h2>" +
      '<p class="meta">' + esc(p.ref) + " · " + esc(p.department) + " · " + esc(p.academicYear) + ", " + esc(p.semester) + " · " +
      p.sessions.length + " session" + (p.sessions.length === 1 ? "" : "s") + " · " + esc(p.name) + "</p>";
  }

  async function start() {
    if (!LIVE) { showStatus(loadStatus, "This site is not connected to the register yet.", "error"); return; }
    if (!practicalRef && !editRef) { showStatus(loadStatus, "Open this page from My practicals → Make a requisition.", "error"); return; }
    if (!me.email) {
      loadStatus.hidden = false; loadStatus.className = "status error";
      loadStatus.innerHTML = 'Open this page from <a href="mine.html">My practicals</a> on this device first.';
      return;
    }
    showStatus(loadStatus, "Loading…");
    try {
      if (editRef) {
        const r = await post({ action: "loadRequisition", email: me.email, ref: editRef }, loadStatus);
        const rec = r.record; practical = r.practical;
        showCard(practical);
        banner.hidden = false;
        if (rec.status === "Approved" || rec.status === "Cancelled") {
          banner.textContent = rec.ref + " is " + rec.status.toLowerCase() + ", so it can’t be changed. Make a new requisition from My practicals instead.";
          showStatus(loadStatus, ""); return;
        }
        editing = rec;
        banner.classList.toggle("back", rec.status === "Sent back");
        banner.innerHTML = "<strong>Correcting " + esc(rec.ref) + "</strong> (version " + rec.revision + ", " + esc(rec.status.toLowerCase()) + ")." +
          (rec.comment ? "<br>Head of Department’s comment: <em>“" + esc(rec.comment) + "”</em>" : "") +
          "<br>Submitting sends version " + (rec.revision + 1) + " to the Head of Department.";
        parts.setSessions(practical.sessions, rec.coveredNumbers.length ? rec.coveredNumbers : null);
        parts.fill(rec);
        btn.textContent = "Send the corrected version for approval";
      } else {
        const r = await post({ action: "loadPractical", email: me.email, ref: practicalRef }, loadStatus);
        practical = r.practical;
        showCard(practical);
        parts.setSessions(practical.sessions);
      }
      showStatus(loadStatus, "");
      form.hidden = false;
    } catch (e) { showStatus(loadStatus, friendly(e), "error"); }
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const p = parts.problem();
    if (p) { showStatus(status, p[1], "error"); p[0].scrollIntoView({ block: "center" }); return; }
    btn.disabled = true;
    showStatus(status, "Sending your requisition…");
    try {
      const d = Object.assign({ action: "requisition", email: me.email }, editing ? { ref: editing.ref } : { practicalRef: practical.ref }, parts.read());
      const r = await post(d, status), rq = r.requisition;
      showStatus(status, "Making the PDF and sending it to your Head of Department…");
      await pdfReady();
      const bytes = await window.REQ_PDF.build(rq.record), link = $("#copyLink");
      savePdf(bytes, fileName(rq.record), link);
      link.hidden = false; link.textContent = "Download a copy (not yet approved)";
      try { await uploadPdf(bytes, rq.upload.ticket); } catch (err) { /* the HOD is still emailed within 10 minutes */ }
      showStatus(status, "");
      const panel = $("#result");
      form.hidden = true; banner.hidden = true; panel.hidden = false;
      panel.querySelector(".result-title").textContent = rq.revised ? "Corrected version sent for approval" : "Sent for approval";
      panel.querySelector(".result-text").textContent = "Your Head of Department (" + rq.approver + ") has been asked to approve it. We’ve emailed you a confirmation.";
      $("#resultNote").hidden = false;
      $("#facts").innerHTML = [["Requisition", rq.ref + (rq.revision > 1 ? " (version " + rq.revision + ")" : "")], ["Practical", practical.ref],
        ["Course", rq.record.courseCode + " – " + rq.record.courseTitle], ["Sessions", rq.record.sessionsCovered], ["Total requested", "UGX " + ugx(rq.record.grandTotal)]]
        .map(x => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("");
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) { showStatus(status, friendly(err), "error"); }
    finally { btn.disabled = false; }
  });

  start();
})();
