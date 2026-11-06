/* Verify a printed requisition (QR code or typed code). */
(function () {
  "use strict";
  const { CFG, LIVE, $, ugx, showStatus } = window.REQ;
  const form = $("#verifyForm"), input = $("#code"), out = $("#out"), status = $("#status");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = iso => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const q = new URLSearchParams(location.search);
  let printedRev = q.get("r");

  input.addEventListener("input", () => {
    const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    input.value = v.length > 4 ? v.slice(0, 4) + "-" + v.slice(4) : v;
  });

  async function check(code) {
    if (!LIVE) { showStatus(status, "This site is not connected to the register yet.", "error"); return; }
    showStatus(status, "Checking…");
    out.hidden = true;
    try {
      const url = CFG.API_URL + "?action=verify&code=" + encodeURIComponent(code) + (printedRev ? "&rev=" + encodeURIComponent(printedRev) : "");
      const r = await (await fetch(url)).json();
      showStatus(status, "");
      if (!r.ok) { showStatus(status, r.error || "Could not check right now.", "error"); return; }
      out.hidden = false;
      if (!r.found) { out.innerHTML = verdict("bad", "✕", "Not found", "No requisition has this code. Check the code, or treat the document as not genuine."); return; }
      const old = r.printedRevision && r.printedRevision !== r.revision;
      const kind = r.status === "Approved" && !old ? "ok" : r.status === "Awaiting HOD approval" ? "wait" : "bad";
      const head = old ? "Out-of-date printout" : r.status === "Approved" ? "Approved" : r.status === "Awaiting HOD approval" ? "Not yet approved" : r.status;
      const text = old ? "This paper is version " + r.printedRevision + ", but the requisition was changed to version " + r.revision + ". Ask for the current printout."
        : r.status === "Approved" ? "Approved online by " + esc(r.approvedBy) + (r.decisionDate ? " on " + when(r.decisionDate) : "") + ". Check that the figures below match the paper and the requisition book."
        : r.status === "Awaiting HOD approval" ? "The Head of Department has not approved this requisition yet. Do not process it."
        : "This requisition is " + esc(r.status.toLowerCase()) + ". Do not process it.";
      out.innerHTML = verdict(kind, kind === "ok" ? "✓" : kind === "wait" ? "…" : "✕", head, text) +
        '<dl class="facts">' + [["Requisition", r.ref + (r.revision > 1 ? " (version " + r.revision + ")" : "")], ["Practical", r.practicalRef], ["Lecturer", r.name],
          ["Department", r.department], ["Course", r.courseCode + " – " + r.courseTitle], ["Term", r.academicYear + ", " + r.semester],
          ["Sessions covered", r.sessionsCovered], ["Items", r.items],
          ["Materials (Section C)", "UGX " + ugx(r.materialsTotal)], ["External site fees", "UGX " + ugx(r.siteCost)], ["Total requested", "UGX " + ugx(r.grandTotal)]]
          .map(x => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("") + "</dl>";
    } catch (e) { showStatus(status, "Could not reach the register. Check your connection and try again.", "error"); }
  }
  const verdict = (k, m, h, t) => '<div class="verdict ' + k + '"><span class="mark" aria-hidden="true">' + m + "</span><div><h2>" + esc(h) + "</h2><p>" + t + "</p></div></div>";

  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = input.value.replace(/[^A-Z0-9]/gi, "");
    if (v.length !== 8) { showStatus(status, "Enter the 8-character code, like ABCD-2345.", "error"); return; }
    if (q.get("c") !== input.value) printedRev = null;              // typed by hand: no printed version to compare
    check(input.value);
  });
  if (q.get("c")) { input.value = q.get("c").toUpperCase(); check(input.value); }
})();
