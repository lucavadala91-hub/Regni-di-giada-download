'use strict';
// Database in memoria persistito in localStorage, con numerazioni e transazioni.

const STORAGE_KEY = 'naviclone.db.v1';

const U = {
  round(n) { return Math.round((Number(n) || 0) * 100) / 100; },
  num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; },
  fmt(n, dec = 2) {
    n = Number(n) || 0;
    if (Math.abs(n) < 0.005) n = 0;
    return n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  },
  fmtQty(n) { return (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 }); },
  date(d) {
    if (!d) return '';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}`;
  },
  iso(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  today() { return U.iso(new Date()); },
  addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return U.iso(d);
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  sum(rows, key) { return U.round(rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)); },
};

const DB = {
  data: null,

  load() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage non disponibile */ }
    if (raw) {
      try { this.data = JSON.parse(raw); return; } catch (e) { /* dati corrotti: riparte dal demo */ }
    }
    this.reset();
  },

  reset() {
    this.data = { counters: {} };
    Seed.run();
    this.save();
  },

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignora */ }
  },

  // Esegue fn in modo atomico: in caso di errore ripristina lo stato precedente.
  transaction(fn) {
    const snapshot = JSON.stringify(this.data);
    try {
      const result = fn();
      this.save();
      return result;
    } catch (e) {
      this.data = JSON.parse(snapshot);
      throw e;
    }
  },

  all(t) { return this.data[t] || (this.data[t] = []); },
  keyOf(t) { return (TABLES[t] && TABLES[t].key) || 'no'; },
  get(t, k) {
    const kf = this.keyOf(t);
    return this.all(t).find(r => String(r[kf]) === String(k));
  },
  insert(t, rec) {
    const kf = this.keyOf(t);
    if (this.get(t, rec[kf]) !== undefined) {
      throw new Error(`${TABLES[t].single} ${rec[kf]} esiste già.`);
    }
    this.all(t).push(rec);
    return rec;
  },
  remove(t, k) {
    const kf = this.keyOf(t);
    this.data[t] = this.all(t).filter(r => String(r[kf]) !== String(k));
  },
  setup() { return this.all('setup')[0]; },
  workDate() { return this.setup().workDate || U.today(); },

  nextNo(code) {
    const s = this.all('noSeries').find(x => x.code === code);
    if (!s) throw new Error(`La numerazione ${code} non esiste.`);
    s.lastNo = (Number(s.lastNo) || 0) + 1;
    return s.prefix + String(s.lastNo).padStart(Number(s.digits) || 0, '0');
  },
  nextEntryNo(t) {
    this.data.counters[t] = (this.data.counters[t] || 0) + 1;
    return this.data.counters[t];
  },
};
