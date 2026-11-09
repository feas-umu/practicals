/* Equipment page: browse and search the FEAS equipment inventory (data/equipment.json). */
(function () {
  "use strict";
  const { load, search, condBadge, esc, codeKey, courseName } = window.EQUIP;
  const $ = s => document.querySelector(s);
  const q = $("#q"), fCampus = $("#fCampus"), fDept = $("#fDept"), fWk = $("#fWk"), fCourse = $("#fCourse"), fCat = $("#fCat");
  const results = $("#results"), count = $("#count"), reset = $("#reset");
  const CAMPUS = { UMU: "UMU Fort Portal Campus", UTC: "UTC Kichwamba" };
  let D = null, open = {};
  const courseNote = document.createElement("p"); courseNote.className = "eq-course-note"; courseNote.hidden = true;
  $("#count").closest(".eq-bar").insertAdjacentElement("afterend", courseNote);

  $("#filters").addEventListener("submit", e => e.preventDefault());
  const opts = (sel, list) => { sel.insertAdjacentHTML("beforeend", list.map(x => '<option value="' + esc(x.v) + '">' + esc(x.t) + "</option>").join("")); };

  // remember filters in the address, so a link can be shared ("equipment.html?campus=UTC&dept=Water%20Engineering")
  const KEYS = { q: q, campus: fCampus, dept: fDept, wk: fWk, course: fCourse, cat: fCat };
  function toUrl() {
    const p = new URLSearchParams();
    Object.keys(KEYS).forEach(k => { if (KEYS[k].value) p.set(k, KEYS[k].value); });
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  }

  function workshopsFor() {
    const seen = [];
    D.workshops.forEach(w => {
      if ((fCampus.value && w.campus !== fCampus.value) || (fDept.value && w.department !== fDept.value)) return;
      if (!seen.some(x => x.v === w.name)) seen.push({ v: w.name, t: w.name });
    });
    const was = fWk.value;
    fWk.innerHTML = '<option value="">All workshops and labs</option>'; opts(fWk, seen);
    fWk.value = seen.some(x => x.v === was) ? was : "";
  }

  function draw() {
    let term = q.value.trim();
    const typed = term && D.courses.find(c => codeKey(c.code) === codeKey(term));      // a course code typed in the search box
    const course = D.courseById[fCourse.value] || typed || null;
    if (typed) term = "";
    let rows = term ? search(D, term, fCampus.value) : D.items.filter(i => !fCampus.value || i.c === fCampus.value);
    const rank = {};
    if (course) course.e.forEach((k, r) => { rank[k] = r; });
    rows = rows.filter(i => (!fDept.value || i.dept === fDept.value) && (!fWk.value || i.w === fWk.value) &&
                            (!course || rank[D.items.indexOf(i)] != null) && (fCat.value === "" || String(i.k) === fCat.value));
    if (course) rows.sort((a, b) => rank[D.items.indexOf(a)] - rank[D.items.indexOf(b)]);
    courseNote.hidden = !course;
    if (course) courseNote.innerHTML = "<strong>" + esc(courseName(course)) + "</strong> · " + esc(course.p.join(", ")) + " · Year " + course.y + ", Semester " + course.s +
      (course.np ? " · no practical work in the curriculum" : course.e.length ? " · best matches first" : " · no equipment linked yet");
    const any = Object.values(KEYS).some(x => x.value);
    reset.hidden = !any;
    toUrl();

    const groups = [];
    rows.forEach(i => {
      const key = i.c + "|" + i.dept + "|" + i.w;
      let g = groups.find(x => x.key === key);
      if (!g) groups.push(g = { key, c: i.c, dept: i.dept, w: i.w, items: [] });
      g.items.push(i);
    });
    const total = rows.reduce((a, i) => a + (Number(i.q) || 0), 0);
    count.textContent = rows.length ? rows.length.toLocaleString() + " item" + (rows.length === 1 ? "" : "s") + " (" + total.toLocaleString() + (total === 1 ? " piece" : " pieces") + ") in " + groups.length + " workshop" + (groups.length === 1 ? "" : "s") + " and lab" + (groups.length === 1 ? "" : "s")
                                    : "Nothing matches. Try fewer words or clear the filters.";
    const single = groups.length <= 3 || !!term || !!course;
    let lastC = "", lastD = "";
    results.innerHTML = groups.map(g => {
      let h = "";
      if (g.c !== lastC) { h += '<h2 class="eq-campus-h ' + g.c.toLowerCase() + '">' + esc(CAMPUS[g.c]) + (g.c === "UTC" ? ' <span class="eq-mou">MOU partner · arrange access with the college</span>' : "") + "</h2>"; lastC = g.c; lastD = ""; }
      if (g.dept !== lastD) { h += '<h3 class="eq-dept-h">' + esc(g.dept) + "</h3>"; lastD = g.dept; }
      const isOpen = single || open[g.key];
      return h + '<details class="eq-block"' + (isOpen ? " open" : "") + ' data-key="' + esc(g.key) + '"><summary><span class="eq-wkname">' + esc(g.w) + '</span><span class="eq-n">' + g.items.length + " item" + (g.items.length === 1 ? "" : "s") + "</span></summary>" +
        '<div class="eq-table" role="table"><div class="eq-tr eq-th" role="row"><span role="columnheader">Equipment</span><span role="columnheader">Qty</span><span role="columnheader">Course units</span></div>' +
        g.items.map(i => '<div class="eq-tr" role="row"><span class="eq-td-name" role="cell"><strong>' + esc(i.n) + "</strong>" + condBadge(i.s) +
          '<span class="eq-sub">' + esc(D.categories[i.k]) + (i.m ? " · " + esc(i.m) : "") + (i.r ? " · " + esc(i.r) : "") + "</span></span>" +
          '<span class="eq-td-q" role="cell">' + (i.q != null ? esc(i.q) : "–") + "</span>" +
          '<span class="eq-td-u" role="cell">' + (i.u.length ? i.u.slice(0, 4).map(k => { const c = D.courses[k]; return '<button type="button" class="eq-chip" data-u="' + esc(c.id) + '" title="' + esc(c.t + " (" + c.p.join(", ") + ")") + '">' + esc(c.code) + "</button>"; }).join("") +
            (i.u.length > 4 ? '<span class="eq-more-cu" title="' + esc(i.u.slice(4).map(k => D.courses[k].code).join(", ")) + '">+' + (i.u.length - 4) + " more</span>" : "") : '<span class="muted">–</span>') + "</span></div>").join("") +
        "</div></details>";
    }).join("");
    results.querySelectorAll("details").forEach(d => d.addEventListener("toggle", () => { open[d.dataset.key] = d.open; }));
    results.querySelectorAll(".eq-chip[data-u]").forEach(b => b.addEventListener("click", () => { fCourse.value = b.dataset.u; q.value = ""; draw(); window.scrollTo({ top: $("#filters").offsetTop - 10, behavior: "smooth" }); }));
  }

  load().then(d => {
    D = d;
    opts(fDept, d.departments.map(x => ({ v: x, t: x })));
    // course units with equipment, grouped by programme
    const groupsHtml = {};
    d.courses.forEach(c => {
      if (c.np || !c.e.length) return;
      const g = c.p[0];
      (groupsHtml[g] = groupsHtml[g] || []).push('<option value="' + esc(c.id) + '">' + esc(c.code + " " + c.t) + (c.p.length > 1 ? " (also " + esc(c.p.slice(1).join(", ")) + ")" : "") + "</option>");
    });
    const PNAME = { "Dip. Civil": "Diploma in Civil Engineering", "Dip. Water": "Diploma in Water Engineering", "Dip. Elec": "Diploma in Electrical Engineering",
                    "Dip. Mech": "Diploma in Mechanical Engineering", "BSc Civil": "Bachelor of Civil Engineering", "BSc Elec": "BSc Electrical Engineering", "BSc Mech": "BSc Mechanical Engineering" };
    const ORDER = Object.keys(PNAME);
    fCourse.insertAdjacentHTML("beforeend", Object.keys(groupsHtml).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map(g => '<optgroup label="' + esc(PNAME[g] || g) + '">' + groupsHtml[g].join("") + "</optgroup>").join(""));
    opts(fCat, d.categories.map((c, k) => ({ v: String(k), t: c })));
    const p = new URLSearchParams(location.search);
    Object.keys(KEYS).forEach(k => { if (p.get(k) && k !== "wk") KEYS[k].value = p.get(k); });
    workshopsFor();
    if (p.get("wk")) fWk.value = p.get("wk");
    $("#updated").textContent = d.source === "sheet" ? "This list is read from the faculty register, so it shows the latest updates."
      : "List compiled " + new Date(d.generated + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) + ".";
    draw();
  }).catch(() => { count.textContent = "The equipment list could not be loaded. Please refresh the page."; });

  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, 180); });
  [fCampus, fDept].forEach(s => s.addEventListener("change", () => { workshopsFor(); draw(); }));
  [fWk, fCourse, fCat].forEach(s => s.addEventListener("change", draw));
  reset.addEventListener("click", () => { Object.values(KEYS).forEach(x => x.value = ""); workshopsFor(); draw(); });
})();
