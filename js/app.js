'use strict';
// Interfaccia: centro ruolo, liste, schede, documenti, registrazioni COGE, report.

const esc = U.esc;

const NAV = [
  { caption: 'Home', items: [['Centro ruolo', '#/']] },
  { caption: 'Vendite', items: [['Clienti', '#/list/customer'], ['Ordini vendita', '#/list/salesOrder'],
    ['Fatture vendita registrate', '#/list/postedSalesInv'], ['Movimenti clienti', '#/list/custLedger']] },
  { caption: 'Acquisti', items: [['Fornitori', '#/list/vendor'], ['Ordini acquisto', '#/list/purchaseOrder'],
    ['Fatture acquisto registrate', '#/list/postedPurchInv'], ['Movimenti fornitori', '#/list/vendLedger']] },
  { caption: 'Magazzino', items: [['Articoli', '#/list/item'], ['Movimenti articoli', '#/list/itemLedger'],
    ['Valorizzazione magazzino', '#/report/inventory']] },
  { caption: 'Contabilità', items: [['Piano dei conti', '#/list/glAccount'], ['Registrazioni COGE', '#/journal'],
    ['Movimenti C/G', '#/list/glEntry'], ['Bilancio di verifica', '#/report/trialBalance'], ['Scadenzario clienti', '#/report/aging']] },
  { caption: 'Amministrazione', items: [['Informazioni società', '#/card/setup/SETUP'], ['Numerazioni', '#/list/noSeries'],
    ['Ripristina dati demo', '#/reset']] },
];

const App = {
  state: { selected: {}, sort: {}, search: {} },
  current: null,

  init() {
    DB.load();
    this.main = document.getElementById('main');
    this.renderNav();
    this.renderTop();
    this.bindTellMe();
    document.getElementById('navToggle').onclick = () => document.body.classList.toggle('nav-open');
    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('tellme').focus(); }
      if (e.key === 'F9' && this.current && this.current.post) { e.preventDefault(); this.current.post(); }
      if (e.key === 'Escape') this.closeDialog();
    });
    this.route();
  },

  go(hash) {
    if (location.hash === hash) this.route(); else location.hash = hash;
  },

  route() {
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    document.body.classList.remove('nav-open');
    this.current = null;
    this.highlightNav();
    try {
      switch (parts[0]) {
        case undefined: return this.roleCenter();
        case 'list': return this.list(parts[1], params);
        case 'card': return this.card(parts[1], parts[2]);
        case 'doc': return this.doc(parts[1], parts[2]);
        case 'journal': return this.journal();
        case 'report': return this.report(parts[1]);
        case 'reset': return this.resetDemo();
        default: return this.notFound();
      }
    } catch (e) {
      console.error(e);
      this.alert(e.message);
    }
  },

  // ---------- Struttura ----------

  renderTop() {
    const S = DB.setup();
    document.getElementById('companyName').textContent = S.companyName;
    document.getElementById('workDate').textContent = 'Data di lavoro: ' + U.date(DB.workDate());
  },

  renderNav() {
    document.getElementById('navpane').innerHTML = NAV.map(g => `
      <div class="nav-group"><div class="nav-caption">${esc(g.caption)}</div>
      ${g.items.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join('')}</div>`).join('');
  },

  highlightNav() {
    const h = (location.hash || '#/').split('?')[0];
    document.querySelectorAll('#navpane a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === h));
  },

  page({ title, crumb = '', ribbon = '', body = '', cls = '' }) {
    this.main.innerHTML = `
      <div class="page ${cls}">
        <div class="page-head">${crumb ? `<div class="crumb">${crumb}</div>` : ''}<h1>${esc(title)}</h1></div>
        ${ribbon ? `<div class="ribbon">${ribbon}</div>` : ''}
        <div class="page-body">${body}</div>
      </div>`;
    this.main.scrollTop = 0;
  },

  btn(act, label, icon, extra = '') {
    return `<button class="rb ${extra}" data-act="${act}"><span class="ico">${icon}</span><span>${esc(label)}</span></button>`;
  },

  bindActions(map) {
    this.main.querySelectorAll('[data-act]').forEach(b => {
      const fn = map[b.dataset.act];
      if (fn) b.addEventListener('click', e => { e.preventDefault(); this.safe(() => fn(b)); });
    });
  },

  safe(fn) {
    try {
      const r = fn();
      if (r && r.catch) r.catch(e => this.alert(e.message));
    } catch (e) {
      console.error(e);
      this.alert(e.message);
    }
  },

  // ---------- Dialoghi ----------

  dialog(html, buttons) {
    return new Promise(resolve => {
      this.closeDialog();
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `<div class="dialog" role="dialog"><div class="dlg-title">${esc(DB.setup().companyName)}</div>
        <div class="dlg-body">${html}</div>
        <div class="dlg-buttons">${buttons.map((b, i) => `<button data-i="${i}" class="${i === 0 ? 'primary' : ''}">${esc(b)}</button>`).join('')}</div></div>`;
      ov.querySelectorAll('button').forEach(b => b.onclick = () => {
        const input = ov.querySelector('input');
        ov.remove();
        resolve({ index: Number(b.dataset.i), value: input ? input.value : undefined });
      });
      ov._resolve = resolve;
      document.body.appendChild(ov);
      (ov.querySelector('input') || ov.querySelector('button')).focus();
      const input = ov.querySelector('input');
      if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') ov.querySelector('button').click(); });
    });
  },

  closeDialog() {
    const ov = document.querySelector('.overlay');
    if (ov) { ov.remove(); ov._resolve && ov._resolve({ index: -1 }); }
  },

  alert(msg) { return this.dialog(`<p>${esc(msg)}</p>`, ['OK']); },

  async confirm(msg) {
    const r = await this.dialog(`<p>${esc(msg)}</p>`, ['Sì', 'No']);
    return r.index === 0;
  },

  async prompt(msg, def = '') {
    const r = await this.dialog(`<p>${esc(msg)}</p><input type="text" value="${esc(def)}">`, ['OK', 'Annulla']);
    return r.index === 0 ? r.value : null;
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => t.classList.remove('show'), 3000);
  },

  // ---------- Formattazione campi ----------

  cellValue(f, r) { return f.type === 'flow' ? f.calc(r) : r[f.key]; },

  cellText(f, r) {
    const v = this.cellValue(f, r);
    if (f.type === 'flow' && f.text) return v;
    if (f.type === 'flow') return f.qty ? U.fmtQty(v) : U.fmt(v);
    switch (f.type) {
      case 'dec': return U.fmt(v);
      case 'int': return v ?? '';
      case 'date': return U.date(v);
      case 'bool': return v ? 'Sì' : 'No';
      default: return v ?? '';
    }
  },

  isNumeric(f) { return ['dec', 'int'].includes(f.type) || (f.type === 'flow' && !f.text); },

  lookupTable(f, rec) { return typeof f.table === 'function' ? f.table(rec) : f.table; },

  // Controllo di input per un campo; data-field / data-lfield servono al binding.
  input(f, rec, ro, attr) {
    const v = rec[f.key];
    if (f.type === 'flow') {
      const href = f.drill && f.drill(rec);
      const text = esc(this.cellText(f, rec));
      return href ? `<a class="flow" href="${href}" ${attr}>${text}</a>` : `<span class="flow" ${attr}>${text}</span>`;
    }
    if (ro || f.readonly) {
      if (f.type === 'lookup' && v) {
        const t = this.lookupTable(f, rec);
        const page = t && TABLES[t].page;
        if (page) return `<a class="ro link" href="#/${page}/${t}/${encodeURIComponent(v)}" ${attr}>${esc(v)}</a>`;
      }
      return `<span class="ro ${this.isNumeric(f) ? 'num' : ''}" ${attr}>${esc(this.cellText(f, rec))}</span>`;
    }
    switch (f.type) {
      case 'bool': return `<input type="checkbox" ${v ? 'checked' : ''} ${attr}>`;
      case 'date': return `<input type="date" value="${esc(v || '')}" ${attr}>`;
      case 'dec': case 'int':
        return `<input type="number" step="${f.type === 'int' ? 1 : 'any'}" class="num" value="${esc(v ?? '')}" ${attr}>`;
      case 'option':
        return `<select ${attr}>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      case 'lookup': {
        const t = this.lookupTable(f, rec);
        let rows = t ? DB.all(t).filter(r => !r.blocked || r[DB.keyOf(t)] === v) : [];
        if (t === 'glAccount') rows = rows.filter(r => r.accountType === 'Registrazione');
        const disp = t && TABLES[t].display;
        return `<select ${attr}><option value=""></option>${rows.map(r => {
          const k = r[DB.keyOf(t)];
          return `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(k)}${disp ? ' – ' + esc(r[disp]) : ''}</option>`;
        }).join('')}</select>`;
      }
      default: return `<input type="text" value="${esc(v ?? '')}" ${attr}>`;
    }
  },

  readInput(f, el) {
    if (f.type === 'bool') return el.checked;
    if (f.type === 'dec') return el.value === '' ? 0 : U.num(el.value);
    if (f.type === 'int') return el.value === '' ? 0 : Math.trunc(U.num(el.value));
    return el.value;
  },

  // Assegna un valore e lancia il trigger OnValidate; in caso di errore ripristina il record.
  setField(rec, f, value) {
    const backup = JSON.stringify(rec);
    rec[f.key] = value;
    try {
      if (f.validate) f.validate(rec);
    } catch (e) {
      Object.keys(rec).forEach(k => delete rec[k]);
      Object.assign(rec, JSON.parse(backup));
      throw e;
    }
  },

  // ---------- Centro ruolo ----------

  roleCenter() {
    const wd = DB.workDate();
    const year = wd.slice(0, 4);
    const cues = [
      ['Ordini vendita aperti', DB.all('salesOrder').filter(d => d.status === 'Aperto').length, '#/list/salesOrder?status=Aperto'],
      ['Ordini vendita rilasciati', DB.all('salesOrder').filter(d => d.status === 'Rilasciato').length, '#/list/salesOrder?status=Rilasciato'],
      ['Ordini acquisto aperti', DB.all('purchaseOrder').length, '#/list/purchaseOrder'],
      ['Fatture clienti scadute', DB.all('custLedger').filter(TABLES.custLedger.filters.scaduti.fn).length, '#/list/custLedger?scaduti=1', 'warn'],
      ['Articoli sotto scorta', DB.all('item').filter(TABLES.item.filters.sottoScorta.fn).length, '#/list/item?sottoScorta=1', 'warn'],
      ['Fatture fornitori scadute', DB.all('vendLedger').filter(TABLES.vendLedger.filters.scaduti.fn).length, '#/list/vendLedger?scaduti=1', 'warn'],
    ];
    const sales = -U.sum(DB.all('glEntry').filter(e => e.accountNo[0] === '3' && e.postingDate.startsWith(year)), 'amount');
    const costs = U.sum(DB.all('glEntry').filter(e => e.accountNo[0] === '4' && e.postingDate.startsWith(year)), 'amount');
    const bank = U.sum(DB.all('glEntry').filter(e => e.accountNo === DB.setup().bankAccount), 'amount');
    const recv = U.sum(DB.all('custLedger'), 'remaining');
    const kpis = [
      ['Ricavi ' + year, sales], ['Utile lordo ' + year, U.round(sales - costs)], ['Liquidità banca', bank], ['Crediti clienti', recv],
    ];
    const recent = DB.all('postedSalesInv').slice().sort((a, b) => b.no.localeCompare(a.no)).slice(0, 6);
    const top = DB.all('customer').map(c => ({ c, v: U.sum(custEntries(c.no), 'salesAmount') }))
      .sort((a, b) => b.v - a.v).slice(0, 5);
    const maxTop = Math.max(1, ...top.map(t => t.v));

    this.page({
      title: `Centro ruolo – ${DB.setup().companyName}`,
      cls: 'rolecenter',
      ribbon: [
        this.btn('newSO', 'Ordine vendita', '🧾'), this.btn('newPO', 'Ordine acquisto', '📦'),
        this.btn('newCust', 'Cliente', '👤'), this.btn('newItem', 'Articolo', '🏷'), this.btn('journal', 'Registrazioni COGE', '📒'),
      ].join(''),
      body: `
        <div class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><div class="kpi-l">${esc(l)}</div><div class="kpi-v">€ ${U.fmt(v)}</div></div>`).join('')}</div>
        <h2 class="sect">Attività</h2>
        <div class="cues">${cues.map(([l, n, href, cls]) => `<a class="cue ${cls && n ? cls : ''}" href="${href}"><div class="cue-n">${n}</div><div class="cue-l">${esc(l)}</div></a>`).join('')}</div>
        <div class="rc-cols">
          <section class="part"><h2 class="sect">Ultime fatture di vendita</h2>
            <table class="grid"><thead><tr><th>N.</th><th>Cliente</th><th>Data</th><th class="num">Importo IVA incl.</th></tr></thead>
            <tbody>${recent.map(d => `<tr><td><a href="#/doc/postedSalesInv/${d.no}">${esc(d.no)}</a></td><td>${esc(d.customerName)}</td><td>${U.date(d.postingDate)}</td><td class="num">${U.fmt(d.amountInclVat)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nessuna fattura</td></tr>'}</tbody></table>
          </section>
          <section class="part"><h2 class="sect">Migliori clienti (vendite)</h2>
            <div class="bars">${top.map(t => `<a class="bar-row" href="#/card/customer/${t.c.no}"><span class="bar-l">${esc(t.c.name)}</span>
              <span class="bar"><span style="width:${(t.v / maxTop * 100).toFixed(1)}%"></span></span><span class="bar-v">${U.fmt(t.v, 0)}</span></a>`).join('')}</div>
          </section>
        </div>`,
    });
    this.bindActions({
      newSO: () => this.newDoc('salesOrder'), newPO: () => this.newDoc('purchaseOrder'),
      newCust: () => this.newRecord('customer'), newItem: () => this.newRecord('item'), journal: () => this.go('#/journal'),
    });
  },

  // ---------- Liste ----------

  openHref(tname, rec) {
    const t = TABLES[tname];
    if (t.openRow) return t.openRow(rec);
    if (t.page) return `#/${t.page}/${tname}/${encodeURIComponent(rec[t.key])}`;
    return '';
  },

  listRows(tname, params) {
    const t = TABLES[tname];
    let rows = DB.all(tname).slice();
    for (const [k, v] of Object.entries(params)) {
      if (t.filters && t.filters[k]) rows = rows.filter(t.filters[k].fn);
      else rows = rows.filter(r => String(r[k] ?? '') === v);
    }
    const cols = t.list.map(k => fieldOf(tname, k));
    const s = (this.state.search[tname] || '').toLowerCase();
    if (s) rows = rows.filter(r => cols.some(f => String(this.cellText(f, r)).toLowerCase().includes(s)));
    const so = this.state.sort[tname] || t.defaultSort || { key: t.key, dir: 1 };
    const sf = fieldOf(tname, so.key) || cols[0];
    rows.sort((a, b) => {
      const x = this.cellValue(sf, a), y = this.cellValue(sf, b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'it', { numeric: true });
      return c * so.dir;
    });
    return { rows, cols, so };
  },

  list(tname, params) {
    const t = TABLES[tname];
    if (!t || !t.list) return this.notFound();
    const canEdit = t.page && !t.readonly && !t.noInsert;
    const chips = Object.entries(params).map(([k, v]) => {
      const label = t.filters && t.filters[k] ? t.filters[k].label : `${(fieldOf(tname, k) || { label: k }).label}: ${v}`;
      return `<span class="chip">${esc(label)}</span>`;
    }).join('');

    this.page({
      title: t.caption,
      crumb: chips ? `Filtri: ${chips} <a href="#/list/${tname}" class="chip-clear">✕ Rimuovi filtri</a>` : '',
      ribbon: [
        canEdit ? this.btn('new', 'Nuovo', '＋') : '',
        t.page ? this.btn('open', canEdit ? 'Modifica' : 'Visualizza', '✎') : '',
        canEdit ? this.btn('del', 'Elimina', '✕') : '',
        this.btn('csv', 'Apri in Excel', '⇩'),
        `<div class="spacer"></div><input class="search" type="search" placeholder="Cerca…" value="${esc(this.state.search[tname] || '')}">`,
      ].join(''),
      body: `<div class="grid-wrap"><table class="grid list"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>`,
    });

    const table = this.main.querySelector('table.list');
    const fill = () => {
      const { rows, cols, so } = this.listRows(tname, params);
      table.tHead.innerHTML = `<tr>${cols.map(f => `<th data-sort="${f.key}" class="${this.isNumeric(f) ? 'num' : ''}">${esc(f.label)}${so.key === f.key ? (so.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>`;
      const sel = this.state.selected[tname];
      table.tBodies[0].innerHTML = rows.map(r => {
        const key = r[t.key];
        const href = this.openHref(tname, r);
        return `<tr data-key="${esc(key)}" class="${String(sel) === String(key) ? 'sel' : ''} ${t.rowClass ? t.rowClass(r) : ''}">${cols.map((f, i) => {
          let txt = esc(this.cellText(f, r));
          if (i === 0 && href) txt = `<a href="${href}">${txt}</a>`;
          else if (f.type === 'flow' && f.drill && f.drill(r)) txt = `<a href="${f.drill(r)}">${txt}</a>`;
          return `<td class="${this.isNumeric(f) ? 'num' : ''}">${txt}</td>`;
        }).join('')}</tr>`;
      }).join('') || `<tr><td colspan="${cols.length}" class="empty">(Nessun record da visualizzare)</td></tr>`;
      const hasSum = cols.some(f => f.sum);
      table.tFoot.innerHTML = hasSum ? `<tr>${cols.map((f, i) => `<td class="num">${f.sum ? U.fmt(rows.reduce((a, r) => a + (Number(this.cellValue(f, r)) || 0), 0)) : i === 0 ? `<span class="count">${rows.length} righe</span>` : ''}</td>`).join('')}</tr>` : '';
    };
    fill();

    table.tHead.addEventListener('click', e => {
      const th = e.target.closest('th');
      if (!th) return;
      const cur = this.state.sort[tname] || t.defaultSort || { key: t.key, dir: 1 };
      this.state.sort[tname] = { key: th.dataset.sort, dir: cur.key === th.dataset.sort ? -cur.dir : 1 };
      fill();
    });
    table.tBodies[0].addEventListener('click', e => {
      const tr = e.target.closest('tr[data-key]');
      if (!tr) return;
      this.state.selected[tname] = tr.dataset.key;
      table.querySelectorAll('tr.sel').forEach(x => x.classList.remove('sel'));
      tr.classList.add('sel');
    });
    table.tBodies[0].addEventListener('dblclick', e => {
      const tr = e.target.closest('tr[data-key]');
      const rec = tr && DB.get(tname, tr.dataset.key);
      const href = rec && this.openHref(tname, rec);
      if (href) this.go(href);
    });
    const search = this.main.querySelector('.search');
    search.addEventListener('input', () => { this.state.search[tname] = search.value; fill(); });

    const selected = () => {
      const rec = DB.get(tname, this.state.selected[tname]);
      if (!rec) throw new Error('Selezionare prima una riga.');
      return rec;
    };
    this.bindActions({
      new: () => t.page === 'doc' ? this.newDoc(tname) : this.newRecord(tname),
      open: () => { const h = this.openHref(tname, selected()); if (h) this.go(h); },
      del: () => this.deleteRecord(tname, selected()[t.key]),
      csv: () => this.exportCsv(tname, this.listRows(tname, params)),
    });
  },

  exportCsv(tname, { rows, cols }) {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [cols.map(f => q(f.label)).join(';')]
      .concat(rows.map(r => cols.map(f => q(this.cellText(f, r))).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${TABLES[tname].caption}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // ---------- Creazione / eliminazione ----------

  async newRecord(tname, extra = {}) {
    const t = TABLES[tname];
    let key;
    if (t.series) {
      key = DB.nextNo(t.series);
    } else {
      key = await this.prompt(`Inserire il ${fieldOf(tname, t.key).label} del nuovo record (${t.single}):`);
      if (!key) return;
      key = key.trim().toUpperCase();
    }
    const rec = { ...t.defaults(), ...extra, [t.key]: key };
    DB.insert(tname, rec);
    DB.save();
    this.go(`#/card/${tname}/${encodeURIComponent(key)}`);
  },

  newDoc(tname, header = {}) {
    const t = TABLES[tname];
    const rec = { ...t.defaults(), no: DB.nextNo(t.series) };
    for (const [k, v] of Object.entries(header)) this.setField(rec, fieldOf(tname, k), v);
    DB.insert(tname, rec);
    DB.save();
    this.go(`#/doc/${tname}/${encodeURIComponent(rec.no)}`);
  },

  async deleteRecord(tname, key) {
    const t = TABLES[tname];
    const rec = DB.get(tname, key);
    if (t.onDelete) t.onDelete(rec);
    if (!await this.confirm(`Eliminare ${t.single} ${key}?`)) return;
    DB.remove(tname, key);
    DB.save();
    this.toast(`${t.single} ${key} eliminato.`);
    this.go(`#/list/${tname}`);
  },

  // ---------- Schede ----------

  fieldsHtml(tname, rec, keys, ro) {
    return keys.map(k => {
      const f = fieldOf(tname, k);
      const lock = ro || f.readonly;
      return `<label class="fld ${f.type === 'bool' ? 'chk' : ''}"><span>${esc(f.label)}</span>${this.input(f, rec, lock, `data-field="${k}"`)}</label>`;
    }).join('');
  },

  fastTabs(tname, rec, ro) {
    return TABLES[tname].groups.map(g => `
      <section class="fasttab"><header>${esc(g.caption)}</header>
      <div class="fields">${this.fieldsHtml(tname, rec, g.fields, ro)}</div></section>`).join('');
  },

  // Aggiorna sul posto i controlli della pagina dopo una modifica (senza perdere il focus).
  refreshFields(tname, rec, root) {
    root.querySelectorAll('[data-field]').forEach(el => {
      if (el === document.activeElement) return;
      const f = fieldOf(tname, el.dataset.field);
      if (f.type === 'flow' || el.tagName === 'SPAN' || el.tagName === 'A') {
        el.textContent = this.cellText(f, rec);
        if (f.drill && el.tagName === 'A') el.href = f.drill(rec);
      } else if (f.type === 'bool') el.checked = !!rec[f.key];
      else el.value = rec[f.key] ?? '';
    });
  },

  bindFields(tname, rec, root, after) {
    root.addEventListener('change', e => {
      const el = e.target.closest('[data-field]');
      if (!el) return;
      const f = fieldOf(tname, el.dataset.field);
      try {
        this.setField(rec, f, this.readInput(f, el));
        DB.save();
      } catch (err) {
        this.alert(err.message);
      }
      this.refreshFields(tname, rec, root);
      if (el.value !== undefined && f.type !== 'bool') el.value = rec[f.key] ?? '';
      if (after) after();
    });
  },

  card(tname, key) {
    const t = TABLES[tname];
    if (!t) return this.notFound();
    const rec = DB.get(tname, key);
    if (!rec) return this.notFound(`${t.single} ${key} non esiste.`);
    const title = tname === 'setup' ? t.caption : `${t.single} – ${rec[t.key]}${t.display && rec[t.display] ? ' · ' + rec[t.display] : ''}`;
    const actions = t.cardActions || [];
    this.page({
      title,
      crumb: `<a href="#/list/${tname}">${esc(t.caption)}</a>`,
      ribbon: [
        !t.noInsert ? this.btn('new', 'Nuovo', '＋') : '',
        !t.noInsert ? this.btn('del', 'Elimina', '✕') : '',
        ...actions.map((a, i) => this.btn('a' + i, a.label, a.icon || '▸')),
      ].join(''),
      body: `<div class="card-layout"><div class="card-main">${this.fastTabs(tname, rec, t.readonly)}</div>
        ${t.factbox ? `<aside class="factbox">${t.factbox(rec)}</aside>` : ''}</div>`,
    });
    const root = this.main.querySelector('.card-main');
    const fb = this.main.querySelector('.factbox');
    this.bindFields(tname, rec, root, () => {
      if (fb) fb.innerHTML = t.factbox(rec);
      const h1 = this.main.querySelector('h1');
      if (tname !== 'setup') h1.textContent = `${t.single} – ${rec[t.key]}${t.display && rec[t.display] ? ' · ' + rec[t.display] : ''}`;
      else this.renderTop();
    });
    this.bindFastTabs();
    const map = { new: () => this.newRecord(tname), del: () => this.deleteRecord(tname, rec[t.key]) };
    actions.forEach((a, i) => { map['a' + i] = () => a.go ? this.go(a.go(rec)) : a.run(rec); });
    this.bindActions(map);
  },

  bindFastTabs() {
    this.main.querySelectorAll('.fasttab > header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed')));
  },

  async adjustInventory(item) {
    const v = await this.prompt(`Quantità da rettificare per ${item.no} (es. 5 oppure -2):`, '');
    if (v === null || v.trim() === '') return;
    const qty = U.num(v.replace(',', '.'));
    if (!qty) throw new Error('Specificare una quantità diversa da zero.');
    const docNo = Post.itemAdjustment(item.no, qty);
    this.toast(`Rettifica ${docNo} registrata.`);
    this.route();
  },

  newPayment(accountType, accountNo) {
    const t = accountType === 'Cliente' ? 'customer' : 'vendor';
    const party = DB.get(t, accountNo);
    const bal = fieldOf(t, 'balance').calc(party);
    const lines = DB.all('genJournal');
    lines.push({
      lineNo: Math.max(0, ...lines.map(l => l.lineNo)) + 1, postingDate: DB.workDate(), docType: 'Pagamento', docNo: DB.nextNo('PAG'),
      accountType, accountNo, description: `${accountType === 'Cliente' ? 'Incasso' : 'Pagamento'} ${party.name}`,
      amount: accountType === 'Cliente' ? -bal : bal, balAccountNo: DB.setup().bankAccount,
    });
    DB.save();
    this.go('#/journal');
  },

  // ---------- Documenti (testata + righe) ----------

  doc(tname, key) {
    const t = TABLES[tname];
    if (!t || t.page !== 'doc') return this.notFound();
    const rec = DB.get(tname, key);
    if (!rec) return this.notFound(`${t.single} ${key} non esiste.`);
    const released = rec.status === 'Rilasciato';
    const ro = t.readonly || released;
    const party = DB.get(t.partyTable, rec[t.partyField]);

    const ribbon = t.readonly ? [
      t.printable ? this.btn('print', 'Stampa', '🖶') : '',
      this.btn('entries', 'Naviga movimenti', '📒'),
      party ? this.btn('party', TABLES[t.partyTable].single, '👤') : '',
    ] : [
      this.btn('post', 'Registra (F9)', '✔', 'primary'),
      released ? this.btn('reopen', 'Riapri', '🔓') : this.btn('release', 'Rilascia', '🔒'),
      this.btn('stats', 'Statistiche', '📊'),
      this.btn('del', 'Elimina', '✕'),
    ];

    this.page({
      title: `${t.single} – ${rec.no}${party ? ' · ' + party.name : ''}`,
      crumb: `<a href="#/list/${tname}">${esc(t.caption)}</a>${released ? ' <span class="chip">Rilasciato</span>' : ''}`,
      ribbon: ribbon.join(''),
      body: `<div class="card-layout"><div class="card-main">
          ${this.fastTabs(tname, rec, ro)}
          <section class="fasttab lines-tab"><header>Righe</header>
            ${ro ? '' : `<div class="sub-ribbon"><button data-lact="add">＋ Nuova riga</button><button data-lact="delLine">✕ Elimina riga</button></div>`}
            <div class="grid-wrap"><table class="grid lines"></table></div>
            <div class="totals"></div>
          </section>
        </div>
        ${party && TABLES[t.partyTable].factbox ? `<aside class="factbox">${TABLES[t.partyTable].factbox(party)}</aside>` : ''}</div>`,
    });

    const lf = LINE_FIELDS[t.lineKind];
    const linesTable = this.main.querySelector('table.lines');
    const totals = this.main.querySelector('.totals');
    let selLine = -1;
    const renderTotals = () => {
      const net = docNet(rec), vat = docVat(rec);
      totals.innerHTML = `<div><span>Totale imponibile</span><b>${U.fmt(net)}</b></div>
        <div><span>Totale IVA</span><b>${U.fmt(vat)}</b></div><div class="grand"><span>Totale IVA incl. (€)</span><b>${U.fmt(net + vat)}</b></div>`;
    };
    const renderLines = () => {
      linesTable.innerHTML = `<thead><tr>${lf.map(f => `<th class="${this.isNumeric(f) ? 'num' : ''}" style="min-width:${f.w}px">${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${(rec.lines || []).map((l, i) => `<tr data-line="${i}" class="${i === selLine ? 'sel' : ''}">${lf.map(f =>
          `<td class="${this.isNumeric(f) ? 'num' : ''}">${this.input(f, l, ro, `data-lfield="${f.key}"`)}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${lf.length}" class="empty">${ro ? '(Nessuna riga)' : 'Nessuna riga. Usare “Nuova riga” per aggiungere articoli.'}</td></tr>`}</tbody>`;
      renderTotals();
    };
    renderLines();

    const header = this.main.querySelector('.card-main');
    if (!ro) {
      this.bindFields(tname, rec, header, () => {
        const p = DB.get(t.partyTable, rec[t.partyField]);
        const fb = this.main.querySelector('.factbox');
        if (fb && p) fb.innerHTML = TABLES[t.partyTable].factbox(p);
        this.main.querySelector('h1').textContent = `${t.single} – ${rec.no}${p ? ' · ' + p.name : ''}`;
      });
      linesTable.addEventListener('change', e => {
        e.stopPropagation();
        const el = e.target.closest('[data-lfield]');
        const i = Number(el.closest('tr').dataset.line);
        const line = rec.lines[i];
        const f = lf.find(x => x.key === el.dataset.lfield);
        const backup = { ...line };
        try {
          line[f.key] = this.readInput(f, el);
          if (f.key === 'type') Object.assign(line, { no: '', description: '', unitPrice: 0 });
          if (f.key === 'no') validateLineNo(t.lineKind, line);
          DB.save();
        } catch (err) {
          Object.assign(line, backup);
          this.alert(err.message);
        }
        if (f.key === 'type' || f.key === 'no') {
          renderLines();
          if (f.key === 'no' && line.no) {
            const q = linesTable.querySelector(`tr[data-line="${i}"] [data-lfield="quantity"]`);
            if (q) { q.focus(); q.select(); }
          }
        } else {
          const tr = el.closest('tr');
          tr.querySelector('[data-lfield="amount"]').textContent = U.fmt(lineNet(line));
          renderTotals();
        }
      });
      linesTable.addEventListener('focusin', e => {
        const tr = e.target.closest('tr[data-line]');
        if (!tr) return;
        selLine = Number(tr.dataset.line);
        linesTable.querySelectorAll('tr.sel').forEach(x => x.classList.remove('sel'));
        tr.classList.add('sel');
      });
      this.main.querySelectorAll('[data-lact]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.lact === 'add') {
          rec.lines.push({ type: 'Articolo', no: '', description: '', quantity: 0, unitPrice: 0, lineDiscount: 0, vatPct: DB.setup().vatPct });
          selLine = rec.lines.length - 1;
          DB.save();
          renderLines();
          const sel = linesTable.querySelector(`tr[data-line="${selLine}"] [data-lfield="no"]`);
          if (sel) sel.focus();
        } else {
          if (selLine < 0 || !rec.lines[selLine]) return this.alert('Selezionare prima una riga.');
          rec.lines.splice(selLine, 1);
          selLine = -1;
          DB.save();
          renderLines();
        }
      }));
    }
    this.bindFastTabs();

    const post = async () => {
      if (!await this.confirm(`Registrare ${t.single.toLowerCase()} ${rec.no} (spedizione e fatturazione)?`)) return;
      const invNo = t.post(rec.no);
      this.toast(`Documento registrato: fattura ${invNo}.`);
      const target = tname === 'salesOrder' ? 'postedSalesInv' : 'postedPurchInv';
      if (await this.confirm(`L'ordine è stato registrato come fattura ${invNo}. Aprire la fattura registrata?`)) this.go(`#/doc/${target}/${invNo}`);
      else this.go(`#/list/${tname}`);
    };
    if (!t.readonly) this.current = { post: () => this.safe(post) };

    this.bindActions({
      post,
      release: () => {
        if (!(rec.lines || []).some(l => l.no && U.num(l.quantity))) throw new Error(`Non vi sono righe da rilasciare per ${t.single.toLowerCase()} ${rec.no}.`);
        if (!rec[t.partyField]) throw new Error(`Il campo ${fieldOf(tname, t.partyField).label} deve avere un valore.`);
        rec.status = 'Rilasciato';
        DB.save();
        const p = DB.get(t.partyTable, rec[t.partyField]);
        if (tname === 'salesOrder' && p.creditLimit > 0 && fieldOf('customer', 'balance').calc(p) + docNet(rec) + docVat(rec) > p.creditLimit) {
          this.alert(`Attenzione: con questo ordine il cliente ${p.no} supera il limite di credito di € ${U.fmt(p.creditLimit)}.`);
        }
        this.route();
      },
      reopen: () => { rec.status = 'Aperto'; DB.save(); this.route(); },
      del: () => this.deleteRecord(tname, rec.no),
      stats: () => {
        const net = docNet(rec), vat = docVat(rec);
        const cost = U.round((rec.lines || []).filter(l => l.type === 'Articolo').reduce((a, l) => a + U.num(l.quantity) * ((DB.get('item', l.no) || {}).unitCost || 0), 0));
        const qty = U.round((rec.lines || []).reduce((a, l) => a + U.num(l.quantity), 0));
        const rows = [['Quantità', U.fmtQty(qty)], ['Importo', U.fmt(net)], ['IVA', U.fmt(vat)], ['Importo IVA incl.', U.fmt(net + vat)]];
        if (tname === 'salesOrder') rows.push(['Costo (€)', U.fmt(cost)], ['Profitto (€)', U.fmt(net - cost)], ['Profitto %', net ? U.fmt((net - cost) / net * 100, 1) : '0']);
        this.dialog(`<h3>Statistiche ${esc(t.single.toLowerCase())} ${esc(rec.no)}</h3><table class="stats">${rows.map(([l, v]) => `<tr><td>${l}</td><td class="num">${v}</td></tr>`).join('')}</table>`, ['Chiudi']);
      },
      print: () => this.printInvoice(rec),
      entries: () => this.go(`#/list/glEntry?docNo=${encodeURIComponent(rec.no)}`),
      party: () => this.go(`#/card/${t.partyTable}/${party.no}`),
    });
  },

  printInvoice(inv) {
    const S = DB.setup();
    const c = DB.get('customer', inv.customerNo) || {};
    const vatGroups = {};
    inv.lines.forEach(l => { vatGroups[l.vatPct] = (vatGroups[l.vatPct] || 0) + lineNet(l); });
    const el = document.getElementById('print');
    el.innerHTML = `
      <div class="inv">
        <div class="inv-head"><div><h2>${esc(S.companyName)}</h2>${esc(S.address)}<br>${esc(S.city)}<br>P.IVA ${esc(S.vatNo)}</div>
          <div class="inv-to"><small>Spett.le</small><br><b>${esc(inv.customerName)}</b><br>${esc(inv.address || '')}<br>${esc(c.postCode || '')} ${esc(inv.city || '')} ${esc(c.county || '')}<br>P.IVA ${esc(c.vatNo || '')}</div></div>
        <h1>Fattura n. ${esc(inv.no)}</h1>
        <p>Data: ${U.date(inv.postingDate)} · Scadenza: ${U.date(inv.dueDate)} · Ordine: ${esc(inv.orderNo || '')}${inv.externalDocNo ? ' · Vs. rif.: ' + esc(inv.externalDocNo) : ''}</p>
        <table><thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th class="num">Prezzo</th><th class="num">Sc. %</th><th class="num">IVA %</th><th class="num">Importo</th></tr></thead>
        <tbody>${inv.lines.map(l => `<tr><td>${esc(l.no)}</td><td>${esc(l.description)}</td><td class="num">${U.fmtQty(l.quantity)}</td><td class="num">${U.fmt(l.unitPrice)}</td><td class="num">${l.lineDiscount ? U.fmt(l.lineDiscount) : ''}</td><td class="num">${U.fmt(l.vatPct, 0)}</td><td class="num">${U.fmt(lineNet(l))}</td></tr>`).join('')}</tbody></table>
        <table class="inv-tot">${Object.entries(vatGroups).map(([p, b]) => `<tr><td>Imponibile IVA ${U.fmt(p, 0)}%</td><td class="num">${U.fmt(b)}</td><td>IVA</td><td class="num">${U.fmt(b * p / 100)}</td></tr>`).join('')}
          <tr class="grand"><td colspan="3">Totale documento (€)</td><td class="num">${U.fmt(inv.amountInclVat)}</td></tr></table>
        <p class="inv-foot">Pagamento tramite bonifico su IBAN ${esc(S.iban)}</p>
      </div>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 500);
  },

  // ---------- Registrazioni COGE ----------

  journal() {
    const t = TABLES.genJournal;
    const lines = DB.all('genJournal');
    let sel = -1;
    this.page({
      title: 'Registrazioni COGE – GENERALE',
      crumb: 'Contabilità',
      ribbon: [this.btn('add', 'Nuova riga', '＋'), this.btn('delLine', 'Elimina riga', '✕'), this.btn('post', 'Registra (F9)', '✔', 'primary')].join(''),
      body: `<p class="hint">Importo positivo = Dare sul conto, Avere sulla contropartita. Per un incasso cliente usare un importo negativo; per un pagamento fornitore un importo positivo.</p>
        <div class="grid-wrap"><table class="grid lines journal"></table></div><div class="totals"></div>`,
    });
    const table = this.main.querySelector('table.journal');
    const totals = this.main.querySelector('.totals');
    const render = () => {
      table.innerHTML = `<thead><tr>${t.fields.map(f => `<th class="${this.isNumeric(f) ? 'num' : ''}" style="min-width:${f.w}px">${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${lines.map((l, i) => `<tr data-line="${i}" class="${i === sel ? 'sel' : ''}">${t.fields.map(f => `<td>${this.input(f, l, false, `data-lfield="${f.key}"`)}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${t.fields.length}" class="empty">Nessuna riga.</td></tr>`}</tbody>`;
      totals.innerHTML = `<div><span>Righe</span><b>${lines.length}</b></div><div><span>Totale importi</span><b>${U.fmt(U.sum(lines, 'amount'))}</b></div>`;
    };
    render();
    table.addEventListener('change', e => {
      const el = e.target.closest('[data-lfield]');
      const line = lines[Number(el.closest('tr').dataset.line)];
      const f = t.fields.find(x => x.key === el.dataset.lfield);
      try { this.setField(line, f, this.readInput(f, el)); DB.save(); } catch (err) { this.alert(err.message); }
      render();
    });
    table.addEventListener('focusin', e => {
      const tr = e.target.closest('tr[data-line]');
      if (tr) { sel = Number(tr.dataset.line); table.querySelectorAll('tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); }
    });
    const post = async () => {
      if (!await this.confirm('Registrare le righe di registrazione?')) return;
      const n = Post.journal();
      this.toast(`${n} righe registrate correttamente.`);
      this.route();
    };
    this.current = { post: () => this.safe(post) };
    this.bindActions({
      add: () => {
        const last = lines[lines.length - 1];
        lines.push({ lineNo: Math.max(0, ...lines.map(l => l.lineNo)) + 1, postingDate: last ? last.postingDate : DB.workDate(), docType: '',
          docNo: last ? last.docNo : DB.nextNo('PAG'), accountType: 'C/G', accountNo: '', description: '', amount: 0, balAccountNo: DB.setup().bankAccount });
        sel = lines.length - 1;
        DB.save(); render();
      },
      delLine: () => {
        if (sel < 0 || !lines[sel]) throw new Error('Selezionare prima una riga.');
        lines.splice(sel, 1); sel = -1; DB.save(); render();
      },
      post,
    });
  },

  // ---------- Report ----------

  report(name) {
    if (name === 'trialBalance') return this.trialBalance();
    if (name === 'inventory') return this.inventoryValuation();
    if (name === 'aging') return this.aging();
    this.notFound();
  },

  reportPage(title, body) {
    this.page({ title, crumb: `Report · Data di lavoro ${U.date(DB.workDate())}`, ribbon: this.btn('print', 'Stampa', '🖶'), body, cls: 'report' });
    this.bindActions({ print: () => window.print() });
  },

  trialBalance() {
    const accounts = DB.all('glAccount').slice().sort((a, b) => a.no.localeCompare(b.no));
    let td = 0, tc = 0;
    const rows = accounts.map(a => {
      if (a.accountType === 'Intestazione') return `<tr class="heading"><td>${esc(a.no)}</td><td colspan="4">${esc(a.name)}</td></tr>`;
      const es = DB.all('glEntry').filter(e => e.accountNo === a.no);
      const d = U.sum(es.filter(e => e.amount > 0), 'amount'), c = -U.sum(es.filter(e => e.amount < 0), 'amount');
      td += d; tc += c;
      return `<tr><td><a href="#/list/glEntry?accountNo=${a.no}">${esc(a.no)}</a></td><td>${esc(a.name)}</td><td class="num">${U.fmt(d)}</td><td class="num">${U.fmt(c)}</td><td class="num">${U.fmt(d - c)}</td></tr>`;
    }).join('');
    this.reportPage('Bilancio di verifica', `<div class="grid-wrap"><table class="grid">
      <thead><tr><th>N.</th><th>Nome</th><th class="num">Dare</th><th class="num">Avere</th><th class="num">Saldo</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td></td><td>Totale</td><td class="num">${U.fmt(td)}</td><td class="num">${U.fmt(tc)}</td><td class="num">${U.fmt(td - tc)}</td></tr></tfoot></table></div>`);
  },

  inventoryValuation() {
    let tot = 0;
    const rows = DB.all('item').filter(i => i.type === 'Magazzino').map(i => {
      const es = itemEntries(i.no);
      const q = U.sum(es, 'quantity'), v = U.sum(es, 'costAmount');
      tot += v;
      return `<tr><td><a href="#/card/item/${i.no}">${esc(i.no)}</a></td><td>${esc(i.description)}</td><td class="num">${U.fmtQty(q)}</td><td>${esc(i.baseUnit)}</td><td class="num">${U.fmt(q ? v / q : i.unitCost)}</td><td class="num">${U.fmt(v)}</td></tr>`;
    }).join('');
    this.reportPage('Valorizzazione magazzino', `<div class="grid-wrap"><table class="grid">
      <thead><tr><th>N.</th><th>Descrizione</th><th class="num">Giacenza</th><th>UM</th><th class="num">Costo medio</th><th class="num">Valore</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td></td><td>Totale</td><td></td><td></td><td></td><td class="num">${U.fmt(tot)}</td></tr></tfoot></table></div>`);
  },

  aging() {
    const wd = DB.workDate();
    const buckets = ['Non scaduto', '1-30 gg', '31-60 gg', 'Oltre 60 gg'];
    const bucket = due => {
      const days = Math.round((new Date(wd) - new Date(due)) / 86400000);
      return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3;
    };
    const tot = [0, 0, 0, 0];
    const rows = DB.all('customer').map(c => {
      const b = [0, 0, 0, 0];
      custEntries(c.no).filter(e => e.open).forEach(e => { b[bucket(e.dueDate)] += e.remaining; });
      if (!b.some(Boolean)) return '';
      b.forEach((v, i) => { tot[i] += v; });
      return `<tr><td><a href="#/list/custLedger?customerNo=${c.no}&open=true">${esc(c.no)}</a></td><td>${esc(c.name)}</td>${b.map(v => `<td class="num">${U.fmt(v)}</td>`).join('')}<td class="num"><b>${U.fmt(b.reduce((a, x) => a + x, 0))}</b></td></tr>`;
    }).join('');
    this.reportPage('Scadenzario clienti', `<div class="grid-wrap"><table class="grid">
      <thead><tr><th>N.</th><th>Nome</th>${buckets.map(b => `<th class="num">${b}</th>`).join('')}<th class="num">Totale</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">Nessuna partita aperta</td></tr>'}</tbody>
      <tfoot><tr><td></td><td>Totale</td>${tot.map(v => `<td class="num">${U.fmt(v)}</td>`).join('')}<td class="num">${U.fmt(tot.reduce((a, x) => a + x, 0))}</td></tr></tfoot></table></div>`);
  },

  // ---------- Varie ----------

  async resetDemo() {
    if (await this.confirm('Eliminare tutti i dati e ripristinare la società dimostrativa?')) {
      DB.reset();
      this.state = { selected: {}, sort: {}, search: {} };
      this.renderTop();
      this.toast('Dati dimostrativi ripristinati.');
    }
    this.go('#/');
  },

  notFound(msg = 'Pagina non trovata.') {
    this.page({ title: 'Non trovato', body: `<p class="empty">${esc(msg)}</p><p><a href="#/">Torna al centro ruolo</a></p>` });
  },

  // Cerca pagina o record ("Dimmi cosa vuoi fare").
  bindTellMe() {
    const input = document.getElementById('tellme');
    const box = document.getElementById('tellmeResults');
    let results = [];
    const pages = NAV.flatMap(g => g.items.map(([l, h]) => ({ label: l, hint: g.caption, href: h })))
      .concat([
        { label: 'Nuovo ordine vendita', hint: 'Azione', run: () => this.newDoc('salesOrder') },
        { label: 'Nuovo ordine acquisto', hint: 'Azione', run: () => this.newDoc('purchaseOrder') },
        { label: 'Nuovo cliente', hint: 'Azione', run: () => this.newRecord('customer') },
        { label: 'Nuovo articolo', hint: 'Azione', run: () => this.newRecord('item') },
      ]);
    const pick = r => {
      input.value = ''; box.hidden = true; input.blur();
      if (r.run) this.safe(r.run); else this.go(r.href);
    };
    input.addEventListener('input', () => {
      const s = input.value.trim().toLowerCase();
      if (!s) { box.hidden = true; return; }
      const recs = ['customer', 'vendor', 'item'].flatMap(t => DB.all(t)
        .filter(r => r.no.toLowerCase().includes(s) || String(r[TABLES[t].display]).toLowerCase().includes(s))
        .slice(0, 4).map(r => ({ label: `${r.no} · ${r[TABLES[t].display]}`, hint: TABLES[t].single, href: `#/card/${t}/${r.no}` })));
      results = pages.filter(p => p.label.toLowerCase().includes(s)).concat(recs).slice(0, 10);
      box.innerHTML = results.map((r, i) => `<li data-i="${i}" class="${i === 0 ? 'hl' : ''}"><span>${esc(r.label)}</span><small>${esc(r.hint)}</small></li>`).join('')
        || '<li class="none">Nessun risultato</li>';
      box.hidden = false;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && results[0] && !box.hidden) pick(results[0]);
      if (e.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); }
    });
    box.addEventListener('mousedown', e => {
      const li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); pick(results[Number(li.dataset.i)]); }
    });
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
