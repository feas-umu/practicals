/* Workshop and laboratory equipment: loads data/equipment.json, suggests equipment for a practical,
   and draws the "Equipment you can use" panel on the register and requisition pages. */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let cache = null;

  /* The site's own copy (data/equipment.json) holds the course units from the curricula, the practical areas and a
     copy of the inventory. When the register has an "All Equipment" tab, its items replace the copy's, so edits in
     the Google Sheet show here; each course unit's equipment then follows the sheet's "Course unit codes" column. */
  const codeKey = s => String(s || "").toUpperCase().replace(/\s+/g, "");
  function load() {
    if (cache) return cache;
    const CFG = window.REQ_CONFIG || {}, live = !!CFG.API_URL && !/^PASTE/.test(CFG.API_URL);
    const sheet = live ? fetch(CFG.API_URL + "?action=equipment").then(r => r.json()).catch(() => null) : Promise.resolve(null);
    cache = Promise.all([fetch("data/equipment.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("equipment list " + r.status); return r.json(); }), sheet])
      .then(([d, fromSheet]) => {
        d.areaById = {}; d.areas.forEach(a => { a.rx = new RegExp(a.titles, "i"); d.areaById[a.id] = a; });
        d.courseById = {}; d.courses.forEach(c => { d.courseById[c.id] = c; c.e = c.e || []; c.a = c.a || []; c.dept = d.departments[c.d]; });
        d.items.forEach(i => { i.dept = d.departments[i.d]; i.cat = d.categories[i.k]; i.a = i.a || []; i.x = i.x || []; });
        if (fromSheet && fromSheet.ok && fromSheet.items && fromSheet.items.length) {
          const old = {}; d.items.forEach((i, k) => { if (i.id) old[i.id] = { item: i, k: k }; });
          const rankOf = {}; d.courses.forEach(c => { rankOf[c.id] = {}; c.e.forEach((k, r) => { rankOf[c.id][d.items[k].id] = r; }); });
          const idx = (list, v) => { let k = list.indexOf(v); if (k < 0) { list.push(v); k = list.length - 1; } return k; };
          const byCode = {}; d.courses.forEach(c => { byCode[codeKey(c.id)] = c; });
          d.items = fromSheet.items.map(i => {
            const o = old[i.id] && old[i.id].item;
            return { id: i.id, c: i.c, d: idx(d.departments, i.dept), dept: i.dept, w: i.w, n: i.n, k: idx(d.categories, i.cat), cat: i.cat, q: i.q, s: i.s,
                     a: o ? o.a : [], x: o ? o.x : [], codes: i.u, m: i.m || undefined, r: i.r || undefined };
          });
          d.courses.forEach(c => { c.e = []; });
          d.items.forEach((i, k) => i.codes.forEach((code, pos) => { const c = byCode[codeKey(code)]; if (c) c.e.push({ k: k, r: rankOf[c.id][i.id], pos: pos }); }));
          d.courses.forEach(c => { c.e = c.e.sort((p, q) => (p.r == null ? 1e6 + p.pos : p.r) - (q.r == null ? 1e6 + q.pos : q.r)).map(x => x.k); });
          const seen = {}; d.workshops = [];
          d.items.forEach(i => { const k = i.c + "|" + i.dept + "|" + i.w; if (!seen[k]) d.workshops.push(seen[k] = { campus: i.c, department: i.dept, name: i.w, count: 0 }); seen[k].count++; });
          d.generated = String(fromSheet.updated || "").slice(0, 10) || d.generated;
          d.source = "sheet";
        }
        d.items.forEach(i => { i.words = stems(i.n); i.u = []; });
        d.courses.forEach((c, ci) => c.e.forEach(k => d.items[k].u.push(ci)));      // each item's course units, best match first
        return d;
      });
    return cache;
  }

  /* the course unit a lecturer means: by code (within their department if two share it), else by title */
  function findCourse(d, ctx) {
    const code = codeKey(ctx.courseCode), title = String(ctx.courseTitle || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const same = c => !ctx.department || c.dept === ctx.department;
    if (code.length >= 6) {
      const hits = d.courses.filter(c => codeKey(c.code) === code);
      if (hits.length) return hits.find(same) || hits[0];
    }
    if (title.length >= 5) {
      const t = c => c.t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return d.courses.find(c => same(c) && t(c) === title) || d.courses.find(c => same(c) && t(c).replace(/ (i|ii|iii|iv)$/, "") === title.replace(/ (i|ii|iii|iv)$/, "")) || null;
    }
    return null;
  }
  const courseName = c => c.code + " " + c.t;

  /* ---------- matching ---------- */
  const STOP = new Set("test tests testing practical practicals session sessions introduction intro basic basics using with from into field workshop workshops laboratory lab labs study studies determination determine measurement measuring experiment experiments apparatus equipment machine machines principle principles demonstration part unit units course engineering engineer general simple other their about under over week".split(" "));
  function stem(w) { return w.replace(/(ies)$/, "y").replace(/(ings|ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1").replace(/e$/, ""); }
  function stems(text) {
    return Array.from(new Set(String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)).map(stem).filter(w => w.length >= 3)));
  }
  /* ctx: { department, courseCode, courseTitle, sessions: [titles] } → { course, areas: [{id, name}], items: [{item, score}] }
     A course unit from the curricula gives its own equipment list; otherwise practical areas are guessed from the titles. */
  function suggest(d, ctx) {
    const title = String(ctx.courseTitle || ""), sessions = (ctx.sessions || []).filter(Boolean);
    const course = findCourse(d, ctx), words = stems(sessions.join(" ") + " " + title), items = [];
    const scores = {};
    d.areas.forEach(a => {
      let s = 0;
      if (!course && title && a.rx.test(title)) s += 3;
      sessions.forEach(t => { if (a.rx.test(t)) s += 2; });
      if (s && ctx.department && a.depts.indexOf(ctx.department) >= 0) s += 0.5;
      if (s) scores[a.id] = s;
    });
    const rank = {};
    if (course) course.e.forEach((k, r) => { rank[k] = r; });
    const n = course ? Math.max(course.e.length, 1) : 1;
    d.items.forEach((i, k) => {
      let s = 0;
      if (course && rank[k] != null) s += 4 + 6 * (1 - rank[k] / n);            // the course unit's own list, best match first
      i.a.forEach(a => { s += (scores[a] || 0) * (i.x.indexOf(a) >= 0 ? 0.35 : 1); });   // x: areas given only because of the item's workshop
      const hits = words.filter(w => i.words.indexOf(w) >= 0).length;
      // the item's own name matches words in the practical; one word alone counts only for related or same-department items
      if (hits && (s || hits > 1 || i.dept === ctx.department)) s += hits * 4;
      if (!s) return;
      if (ctx.department && i.dept === ctx.department) s += 0.5;
      if (i.s && /^Not working|^Moved/.test(i.s)) s -= 2;
      if (s >= 1) items.push({ item: i, score: s });
    });
    items.sort((a, b) => b.score - a.score || a.item.n.localeCompare(b.item.n));
    const areas = Object.keys(scores).map(id => ({ id, name: d.areaById[id].name, score: scores[id] })).sort((a, b) => b.score - a.score);
    return { course, areas, items };
  }
  function search(d, q, campus) {
    const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return d.items.filter(i => (!campus || i.c === campus) && words.every(w => (i.n + " " + i.w + " " + i.cat + " " + (i.m || "")).toLowerCase().indexOf(w) >= 0));
  }

  /* ---------- labels ---------- */
  const shortWorkshop = w => /^Donated/.test(w) ? "donated equipment" : w.replace(/Laboratory/, "Lab").replace(/ \(BCP\) Workshop$/, " Workshop");
  const campusName = c => c === "UTC" ? "UTC Kichwamba" : "UMU Fort Portal";
  const label = i => i.n + " (" + shortWorkshop(i.w) + ", " + (i.c === "UTC" ? "Kichwamba" : "UMU") + ")";
  const condBadge = s => !s || s === "Working" || s === "Not stated" ? "" : '<span class="eq-flag">' + esc(s) + "</span>";

  /* ---------- panel ----------
     opts: { context: () => ctx, sessions: () => [{n, title}] | null, onAdd: (sessionIndex, text) => "ok" | "dup" | "full" | null } */
  function panel(box, opts) {
    const canAdd = typeof opts.onAdd === "function";
    box.classList.add("eq-panel");
    box.innerHTML = '<div class="eq-head"><h3>' + esc(opts.heading || "Equipment you can use") + "</h3>" +
      '<p class="hint">' + esc(opts.intro || "Suggested for the course unit and its sessions, from the faculty curricula. UMU and UTC Kichwamba (MOU) equipment are shown separately.") + ' <a href="equipment.html" target="_blank" rel="noopener">See all equipment</a></p></div>' +
      '<div class="eq-courses" hidden></div>' +
      '<div class="eq-tools"><div class="eq-seg" role="group" aria-label="Campus">' +
        '<button type="button" data-c="" aria-pressed="true">Both</button><button type="button" data-c="UMU" aria-pressed="false">UMU</button><button type="button" data-c="UTC" aria-pressed="false">Kichwamba</button></div>' +
        '<input type="search" class="eq-q" placeholder="Search all equipment, e.g. theodolite" aria-label="Search all equipment" maxlength="60"></div>' +
      (canAdd ? '<label class="eq-target">Add to <select class="eq-sel"></select></label>' : "") +
      '<div class="eq-list" aria-live="polite"><p class="eq-empty">Loading the equipment list…</p></div><p class="eq-msg" role="status" hidden></p>';
    const list = box.querySelector(".eq-list"), chips = box.querySelector(".eq-courses"), q = box.querySelector(".eq-q"), sel = box.querySelector(".eq-sel"), msg = box.querySelector(".eq-msg");
    let data = null, campus = "", limit = 12, shown = [];

    box.querySelectorAll(".eq-seg button").forEach(b => b.addEventListener("click", () => {
      campus = b.dataset.c; box.querySelectorAll(".eq-seg button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); limit = 12; draw();
    }));
    let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { limit = 12; draw(); }, 200); });

    function syncTargets() {
      if (!sel) return;
      const ss = opts.sessions() || [], was = sel.value;
      sel.innerHTML = ss.map((s, k) => '<option value="' + k + '">Session ' + (k + 1) + (s.title ? ": " + esc(s.title.slice(0, 40)) : "") + "</option>").join("");
      if (was && Number(was) < ss.length) sel.value = was; else if (ss.length) sel.value = String(ss.length - 1);
    }

    function draw() {
      if (!data) return;
      syncTargets();
      const ctx = opts.context(), term = q.value.trim();
      let rows, note = "";
      if (term) {
        rows = search(data, term, campus).map(i => ({ item: i }));
        chips.hidden = true;
        note = rows.length ? rows.length + " found for “" + esc(term) + "”." : "Nothing found for “" + esc(term) + "”.";
      } else {
        const s = suggest(data, ctx);
        rows = s.items.filter(r => !campus || r.item.c === campus);
        chips.hidden = !s.course && !s.areas.length;
        chips.innerHTML = s.course
          ? '<span class="hint inline">Course unit:</span> <span class="eq-chip strong" title="' + esc(s.course.p.join(", ")) + '">' + esc(courseName(s.course)) + "</span>" +
            ' <span class="hint inline">(' + esc(s.course.p.join(", ")) + ")</span>"
          : '<span class="hint inline">Matched areas:</span> ' + s.areas.slice(0, 4).map(a => '<span class="eq-chip">' + esc(a.name) + "</span>").join(" ");
        if (!rows.length) note = s.course && s.course.np ? esc(courseName(s.course)) + " has no practical work in the curriculum, so no equipment is linked. Use the search box if you need something."
          : s.course && !s.course.e.length ? "No equipment is linked to " + esc(courseName(s.course)) + " yet. Use the search box, or add detail to the session titles."
          : (ctx.courseCode || ctx.courseTitle || (ctx.sessions || []).some(Boolean))
          ? "No equipment matched yet. Try the search box, or add more detail to the session titles."
          : "Enter the course code or title above to see equipment suggestions.";
      }
      shown = rows.slice(0, limit);
      const groups = [];
      shown.forEach(r => {
        const key = r.item.c + "|" + r.item.w;
        let g = groups.find(x => x.key === key);
        if (!g) groups.push(g = { key, c: r.item.c, w: r.item.w, own: r.item.dept === ctx.department, best: r.score || 0, rows: [] });
        g.rows.push(r);
      });
      // the campus with the best match first (UMU on a tie), then the lecturer's own department's workshops, then the best matches
      const top = { UMU: 0, UTC: 0 }; groups.forEach(g => { top[g.c] = Math.max(top[g.c], g.best); });
      const first = top.UTC > top.UMU + 0.5 ? "UTC" : "UMU";
      groups.sort((a, b) => (a.c === b.c ? 0 : a.c === first ? -1 : 1) || (b.own - a.own) || (b.best - a.best));
      let last = "";
      list.innerHTML = (note ? '<p class="eq-empty">' + note + "</p>" : "") + groups.map(g => {
        const head = g.c !== last ? '<h4 class="eq-campus ' + g.c.toLowerCase() + '">' + esc(campusName(g.c)) + (g.c === "UTC" ? ' <span class="hint inline">· MOU partner, book with the college</span>' : "") + "</h4>" : "";
        last = g.c;
        return head + '<div class="eq-group"><div class="eq-wk">' + esc(g.w) + "</div><ul>" + g.rows.map(r => {
          const i = r.item, idx = data.items.indexOf(i);
          return '<li><span class="eq-name">' + esc(i.n) + (i.q != null ? ' <span class="eq-qty">× ' + esc(i.q) + "</span>" : "") + condBadge(i.s) + "</span>" +
            (canAdd ? '<button type="button" class="eq-add" data-i="' + idx + '" aria-label="Add ' + esc(i.n) + '">Add</button>' : "") + "</li>";
        }).join("") + "</ul></div>";
      }).join("") + (rows.length > limit ? '<button type="button" class="secondary eq-more">Show more (' + (rows.length - limit) + ")</button>" : "");
      const more = list.querySelector(".eq-more");
      if (more) more.addEventListener("click", () => { limit += 24; draw(); });
      list.querySelectorAll(".eq-add").forEach(b => b.addEventListener("click", () => {
        const i = data.items[Number(b.dataset.i)], k = Number(sel.value || 0);
        const r = opts.onAdd(k, label(i));
        msg.hidden = false;
        msg.textContent = r === "dup" ? "Already listed for session " + (k + 1) + "." : r === "full" ? "Session " + (k + 1) + "’s equipment list is full. Shorten it first." : "Added to session " + (k + 1) + ": " + i.n + ".";
        msg.className = "eq-msg" + (r === "ok" ? "" : " bad");
        if (r === "ok") { b.textContent = "Added"; b.classList.add("done"); }
      }));
    }

    load().then(d => { data = d; draw(); }).catch(() => { list.innerHTML = '<p class="eq-empty">The equipment list could not be loaded. You can still type the equipment in each session.</p>'; });
    let u; return { update() { clearTimeout(u); u = setTimeout(draw, 250); } };
  }

  window.EQUIP = { load, suggest, search, findCourse, courseName, codeKey, panel, label, shortWorkshop, campusName, condBadge, esc };
})();
