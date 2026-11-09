/* The requisition part of a form: which sessions it covers, Section C items with amounts and totals,
   and Section D. Used by the practical page (optional requisition) and the requisition page. */
(function () {
  "use strict";
  const { CFG, $, ugx, clean } = window.REQ;
  const digits = v => String(v || "").replace(/[,\s]/g, "");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? +m[3] + " " + MON[+m[2] - 1] : ""; };

  function mount(form) {
    const itemsBox = $("#items", form), cover = $("#cover", form), site = $("#siteCost", form);
    const root = itemsBox.closest("#reqBlock") || form;

    function checkMoney(input) {
      const t = digits(input.value);
      input.setCustomValidity(t.includes(".") ? "Whole shillings only: remove the decimal point." :
        t === "" && !input.required ? "" : /^\d{1,10}$/.test(t) ? "" : "Enter the amount in UGX as a whole number.");
    }
    function moneyInput(input) {
      input.addEventListener("input", () => {
        const [whole, ...rest] = input.value.split(".");
        const d = whole.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
        input.value = (d ? ugx(Number(d)) : "") + (rest.length ? "." + rest.join("").replace(/\D/g, "") : "");
        checkMoney(input); totals();
      });
    }
    moneyInput(site);

    function addItem(x) {
      x = x || {};
      if (itemsBox.children.length >= CFG.MAX_ITEMS) return null;
      const el = document.createElement("div");
      el.className = "line item";
      el.innerHTML = '<div class="line-head"><span class="n"></span><button type="button" class="remove">Remove</button></div>' +
        '<label>Item <span class="hint inline">(material, equipment or service, with size or specification)</span><input data-k="item" required maxlength="150" value="' + esc(x.item) + '" placeholder="e.g. Portland cement, 50 kg bag"></label>' +
        '<div class="g3"><label>Units<input data-k="units" class="money" required inputmode="decimal" maxlength="9" value="' + esc(x.units) + '" placeholder="e.g. 4"></label>' +
        '<label>Unit cost (UGX)<input data-k="unitCost" class="money" required inputmode="numeric" maxlength="13" autocomplete="off" value="' +
          (x.unitCost != null && x.unitCost !== "" ? ugx(x.unitCost) : "") + '" placeholder="e.g. 35,000"></label>' +
        '<div class="field">Amount (UGX)<output class="amount" data-k="amount">–</output></div></div>' +
        '<div class="grid2"><label>Purpose / use in practical <span class="hint inline">(optional)</span><input data-k="purpose" maxlength="200" value="' + esc(x.purpose) + '"></label>' +
        '<label>Remarks <span class="hint inline">(optional)</span><input data-k="remarks" maxlength="200" value="' + esc(x.remarks) + '"></label></div>';
      el.querySelector(".remove").addEventListener("click", () => { el.remove(); renumber(); totals(); });
      const units = el.querySelector('[data-k="units"]'), cost = el.querySelector('[data-k="unitCost"]');
      units.addEventListener("input", () => {
        units.value = units.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
        const n = Number(units.value);
        units.setCustomValidity(units.value && n > 0 && n <= 1000000 ? "" : "Enter the number of units (more than 0).");
        totals();
      });
      moneyInput(cost);
      itemsBox.appendChild(el);
      renumber(); totals();
      return el;
    }
    function renumber() {
      [...itemsBox.children].forEach((el, i) => { el.querySelector(".n").textContent = "Item " + (i + 1); });
      $("#addItem", form).hidden = itemsBox.children.length >= CFG.MAX_ITEMS;
    }
    function totals() {
      let materials = 0;
      [...itemsBox.children].forEach(el => {
        const u = Number(el.querySelector('[data-k="units"]').value), c = digits(el.querySelector('[data-k="unitCost"]').value);
        const out = el.querySelector('[data-k="amount"]');
        if (u > 0 && /^\d+$/.test(c)) { const a = Math.round(u * Number(c)); materials += a; out.textContent = ugx(a); } else out.textContent = "–";
      });
      const s = /^\d+$/.test(digits(site.value)) ? Number(digits(site.value)) : 0;
      $("#materialsTotal", form).textContent = "UGX " + ugx(materials);
      $("#grandTotal", form).textContent = "UGX " + ugx(materials + s);
      $("#grandSplit", form).textContent = s ? "Materials UGX " + ugx(materials) + " + external site fees UGX " + ugx(s) : "";
    }
    $("#addItem", form).addEventListener("click", () => { const el = addItem(); el && el.querySelector("input").focus(); });

    // sessions: [{week, title, date}], checked: session numbers (1-based); default all
    function setSessions(sessions, checked) {
      const keep = new Set(checked || sessions.map((_, i) => i + 1));
      cover.innerHTML = sessions.length ? sessions.map((s, i) =>
        '<label class="check cover-row"><input type="checkbox" value="' + (i + 1) + '"' + (keep.has(i + 1) ? " checked" : "") + "> " +
        "<span><strong>Session " + (i + 1) + "</strong> · Week " + esc(s.week) + ": " + esc(s.title || "(no title yet)") +
        (s.date ? ' <span class="muted">· ' + day(s.date) + (s.location ? ", " + esc(s.location) : "") + "</span>" : "") + "</span></label>").join("")
        : '<p class="muted small">Add the practical sessions in Section B first.</p>';
    }
    const covered = () => [...cover.querySelectorAll("input:checked")].map(x => Number(x.value));

    function read() {
      const el = n => form.elements[n];
      const items = [...itemsBox.children].map(row => {
        const o = {}; ["item", "units", "unitCost", "purpose", "remarks"].forEach(k => o[k] = clean(row.querySelector('[data-k="' + k + '"]').value));
        o.unitCost = digits(o.unitCost); return o;
      });
      return {
        sessionsCovered: covered(), items,
        transport: { vehicle: el("t_vehicle").checked, fuel: el("t_fuel").checked, driver: el("t_driver").checked, dates: clean(el("t_dates").value) },
        site: { name: clean(el("s_name").value), contact: clean(el("s_contact").value), cost: digits(el("s_cost").value) },
        allowances: { fieldStaff: el("a_fieldStaff").checked, casuals: el("a_casuals").checked, studentTransport: el("a_studentTransport").checked },
        notes: clean(el("r_notes").value)
      };
    }
    function fill(rec) {
      const el = n => form.elements[n];
      itemsBox.innerHTML = "";
      (rec.items || []).forEach(x => addItem(x));
      if (!itemsBox.children.length) addItem();
      el("t_vehicle").checked = !!rec.transport.vehicle; el("t_fuel").checked = !!rec.transport.fuel; el("t_driver").checked = !!rec.transport.driver;
      el("t_dates").value = rec.transport.dates || "";
      el("s_name").value = rec.site.name || ""; el("s_contact").value = rec.site.contact || ""; el("s_cost").value = rec.site.cost ? ugx(rec.site.cost) : "";
      ["fieldStaff", "casuals", "studentTransport"].forEach(k => el("a_" + k).checked = !!rec.allowances[k]);
      el("r_notes").value = rec.notes || "";
      totals();
    }
    // Problems the browser's own checks don't catch. Returns [element, message] or null.
    function problem() {
      const d = read();
      if (!d.sessionsCovered.length) return [cover, "Tick at least one session this requisition is for."];
      if (!d.items.length && !d.transport.vehicle && !d.transport.fuel && !d.transport.driver && !Number(d.site.cost) &&
          !d.allowances.fieldStaff && !d.allowances.casuals && !d.allowances.studentTransport)
        return [$("#addItem", form), "Add at least one item in Section C, or a need in Section D."];
      return null;
    }
    // When the requisition part is hidden its fields must not block the form.
    function enable(on) { root.querySelectorAll("input, select, textarea, button").forEach(x => { x.disabled = !on; }); }

    addItem();
    return { addItem, setSessions, read, fill, problem, enable, totals };
  }

  window.REQPARTS = { mount };
})();
