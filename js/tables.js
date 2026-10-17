'use strict';
// Metadati delle tabelle: campi, liste, schede (FastTab), FlowField e azioni.

const custEntries = no => DB.all('custLedger').filter(e => e.customerNo === no);
const vendEntries = no => DB.all('vendLedger').filter(e => e.vendorNo === no);
const itemEntries = no => DB.all('itemLedger').filter(e => e.itemNo === no);
const lineNet = l => U.round(U.num(l.quantity) * U.num(l.unitPrice) * (1 - U.num(l.lineDiscount) / 100));
const lineVat = l => U.round(lineNet(l) * U.num(l.vatPct) / 100);
const docNet = d => U.round((d.lines || []).reduce((a, l) => a + lineNet(l), 0));
const docVat = d => U.round((d.lines || []).reduce((a, l) => a + lineVat(l), 0));
const openQty = (table, itemNo) => U.round(DB.all(table).reduce((a, d) =>
  a + (d.lines || []).filter(l => l.type === 'Articolo' && l.no === itemNo).reduce((s, l) => s + U.num(l.quantity), 0), 0));

const YES_NO_FACT = (label, value, href) =>
  `<div class="fb-row"><span>${U.esc(label)}</span>${href ? `<a href="${href}">${value}</a>` : `<b>${value}</b>`}</div>`;

const LINE_FIELDS = {
  sales: [
    { key: 'type', label: 'Tipo', type: 'option', options: ['Articolo', 'C/G'], w: 90 },
    { key: 'no', label: 'N.', type: 'lookup', table: l => l.type === 'C/G' ? 'glAccount' : 'item', w: 110 },
    { key: 'description', label: 'Descrizione', w: 240 },
    { key: 'quantity', label: 'Quantità', type: 'dec', w: 80 },
    { key: 'unitPrice', label: 'Prezzo unitario', type: 'dec', w: 100 },
    { key: 'lineDiscount', label: '% sconto', type: 'dec', w: 70 },
    { key: 'vatPct', label: '% IVA', type: 'dec', w: 60 },
    { key: 'amount', label: 'Importo riga', type: 'flow', calc: lineNet, w: 110 },
  ],
};
LINE_FIELDS.purchase = LINE_FIELDS.sales.map(f => f.key === 'unitPrice' ? { ...f, label: 'Costo diretto unit.' } : f);

// Compila i campi della riga dal record articolo / conto selezionato.
function validateLineNo(kind, line) {
  if (!line.no) { line.description = ''; return; }
  if (line.type === 'Articolo') {
    const it = DB.get('item', line.no);
    if (!it) throw new Error(`L'articolo ${line.no} non esiste.`);
    if (it.blocked) throw new Error(`L'articolo ${it.no} è bloccato.`);
    line.description = it.description;
    line.unitPrice = kind === 'sales' ? it.unitPrice : it.unitCost;
    line.vatPct = it.vatPct;
  } else {
    const g = DB.get('glAccount', line.no);
    if (!g) throw new Error(`Il conto C/G ${line.no} non esiste.`);
    if (g.accountType !== 'Registrazione') throw new Error(`Il conto ${g.no} non è di tipo Registrazione.`);
    line.description = g.name;
    line.vatPct = DB.setup().vatPct;
  }
  if (!U.num(line.quantity)) line.quantity = 1;
}

const TABLES = {
  customer: {
    caption: 'Clienti', single: 'Cliente', key: 'no', series: 'CLI', page: 'card', display: 'name',
    fields: [
      { key: 'no', label: 'N.', readonly: true },
      { key: 'name', label: 'Nome' },
      { key: 'address', label: 'Indirizzo' },
      { key: 'postCode', label: 'CAP' },
      { key: 'city', label: 'Città' },
      { key: 'county', label: 'Provincia' },
      { key: 'country', label: 'Paese' },
      { key: 'phone', label: 'N. telefono' },
      { key: 'email', label: 'E-mail' },
      { key: 'contact', label: 'Contatto' },
      { key: 'vatNo', label: 'Partita IVA' },
      { key: 'fiscalCode', label: 'Codice fiscale' },
      { key: 'paymentDays', label: 'Termini pagamento (gg)', type: 'int' },
      { key: 'creditLimit', label: 'Limite credito (€)', type: 'dec' },
      { key: 'blocked', label: 'Bloccato', type: 'bool' },
      { key: 'balance', label: 'Saldo (€)', type: 'flow', sum: true,
        calc: r => U.sum(custEntries(r.no), 'amount'), drill: r => `#/list/custLedger?customerNo=${r.no}` },
      { key: 'balanceDue', label: 'Scaduto (€)', type: 'flow', sum: true,
        calc: r => U.sum(custEntries(r.no).filter(e => e.open && e.dueDate < DB.workDate()), 'remaining'),
        drill: r => `#/list/custLedger?customerNo=${r.no}&scaduti=1` },
      { key: 'sales', label: 'Vendite (€)', type: 'flow', sum: true,
        calc: r => U.sum(custEntries(r.no), 'salesAmount'), drill: r => `#/list/postedSalesInv?customerNo=${r.no}` },
    ],
    list: ['no', 'name', 'city', 'phone', 'contact', 'balance', 'balanceDue'],
    groups: [
      { caption: 'Generale', fields: ['no', 'name', 'address', 'postCode', 'city', 'county', 'country', 'contact', 'blocked', 'balance', 'balanceDue', 'creditLimit'] },
      { caption: 'Comunicazione', fields: ['phone', 'email'] },
      { caption: 'Fatturazione', fields: ['vatNo', 'fiscalCode', 'paymentDays', 'sales'] },
    ],
    defaults: () => ({ name: '', country: 'IT', paymentDays: 30, creditLimit: 0, blocked: false }),
    onDelete: r => {
      if (custEntries(r.no).length) throw new Error(`Impossibile eliminare il cliente ${r.no}: esistono movimenti.`);
      if (DB.all('salesOrder').some(d => d.customerNo === r.no)) throw new Error(`Impossibile eliminare il cliente ${r.no}: esistono ordini aperti.`);
    },
    cardActions: [
      { label: 'Nuovo ordine vendita', icon: '🧾', run: r => App.newDoc('salesOrder', { customerNo: r.no }) },
      { label: 'Registra incasso', icon: '💶', run: r => App.newPayment('Cliente', r.no) },
      { label: 'Movimenti', icon: '📒', go: r => `#/list/custLedger?customerNo=${r.no}` },
    ],
    factbox: r => {
      const f = k => TABLES.customer.fields.find(x => x.key === k);
      const bal = f('balance').calc(r);
      const orders = DB.all('salesOrder').filter(d => d.customerNo === r.no);
      const openAmt = U.round(orders.reduce((a, d) => a + docNet(d) + docVat(d), 0));
      const over = r.creditLimit > 0 && bal + openAmt > r.creditLimit;
      return `<h3>Statistiche cliente</h3>
        ${YES_NO_FACT('Saldo', U.fmt(bal), f('balance').drill(r))}
        ${YES_NO_FACT('Scaduto', U.fmt(f('balanceDue').calc(r)), f('balanceDue').drill(r))}
        ${YES_NO_FACT('Ordini aperti', orders.length, `#/list/salesOrder?customerNo=${r.no}`)}
        ${YES_NO_FACT('Importo ordini aperti', U.fmt(openAmt))}
        ${YES_NO_FACT('Vendite', U.fmt(f('sales').calc(r)), f('sales').drill(r))}
        ${over ? '<div class="fb-warn">Limite di credito superato</div>' : ''}`;
    },
  },

  vendor: {
    caption: 'Fornitori', single: 'Fornitore', key: 'no', series: 'FOR', page: 'card', display: 'name',
    fields: [
      { key: 'no', label: 'N.', readonly: true },
      { key: 'name', label: 'Nome' },
      { key: 'address', label: 'Indirizzo' },
      { key: 'postCode', label: 'CAP' },
      { key: 'city', label: 'Città' },
      { key: 'country', label: 'Paese' },
      { key: 'phone', label: 'N. telefono' },
      { key: 'email', label: 'E-mail' },
      { key: 'contact', label: 'Contatto' },
      { key: 'vatNo', label: 'Partita IVA' },
      { key: 'paymentDays', label: 'Termini pagamento (gg)', type: 'int' },
      { key: 'blocked', label: 'Bloccato', type: 'bool' },
      { key: 'balance', label: 'Saldo (€)', type: 'flow', sum: true,
        calc: r => -U.sum(vendEntries(r.no), 'amount'), drill: r => `#/list/vendLedger?vendorNo=${r.no}` },
      { key: 'purchases', label: 'Acquisti (€)', type: 'flow', sum: true,
        calc: r => U.sum(vendEntries(r.no), 'purchAmount'), drill: r => `#/list/postedPurchInv?vendorNo=${r.no}` },
    ],
    list: ['no', 'name', 'city', 'phone', 'contact', 'balance'],
    groups: [
      { caption: 'Generale', fields: ['no', 'name', 'address', 'postCode', 'city', 'country', 'contact', 'blocked', 'balance'] },
      { caption: 'Comunicazione', fields: ['phone', 'email'] },
      { caption: 'Pagamenti', fields: ['vatNo', 'paymentDays', 'purchases'] },
    ],
    defaults: () => ({ name: '', country: 'IT', paymentDays: 60, blocked: false }),
    onDelete: r => {
      if (vendEntries(r.no).length) throw new Error(`Impossibile eliminare il fornitore ${r.no}: esistono movimenti.`);
      if (DB.all('purchaseOrder').some(d => d.vendorNo === r.no)) throw new Error(`Impossibile eliminare il fornitore ${r.no}: esistono ordini aperti.`);
    },
    cardActions: [
      { label: 'Nuovo ordine acquisto', icon: '📦', run: r => App.newDoc('purchaseOrder', { vendorNo: r.no }) },
      { label: 'Registra pagamento', icon: '💸', run: r => App.newPayment('Fornitore', r.no) },
      { label: 'Movimenti', icon: '📒', go: r => `#/list/vendLedger?vendorNo=${r.no}` },
    ],
    factbox: r => {
      const f = k => TABLES.vendor.fields.find(x => x.key === k);
      const orders = DB.all('purchaseOrder').filter(d => d.vendorNo === r.no);
      return `<h3>Statistiche fornitore</h3>
        ${YES_NO_FACT('Saldo', U.fmt(f('balance').calc(r)), f('balance').drill(r))}
        ${YES_NO_FACT('Ordini aperti', orders.length, `#/list/purchaseOrder?vendorNo=${r.no}`)}
        ${YES_NO_FACT('Acquisti', U.fmt(f('purchases').calc(r)), f('purchases').drill(r))}`;
    },
  },

  item: {
    caption: 'Articoli', single: 'Articolo', key: 'no', series: 'ART', page: 'card', display: 'description',
    fields: [
      { key: 'no', label: 'N.', readonly: true },
      { key: 'description', label: 'Descrizione' },
      { key: 'type', label: 'Tipo', type: 'option', options: ['Magazzino', 'Servizio'] },
      { key: 'baseUnit', label: 'Unità di misura di base' },
      { key: 'category', label: 'Categoria' },
      { key: 'unitPrice', label: 'Prezzo unitario (€)', type: 'dec' },
      { key: 'unitCost', label: 'Costo unitario (€)', type: 'dec' },
      { key: 'vatPct', label: '% IVA', type: 'dec' },
      { key: 'reorderPoint', label: 'Punto di riordino', type: 'dec' },
      { key: 'vendorNo', label: 'N. fornitore', type: 'lookup', table: 'vendor' },
      { key: 'blocked', label: 'Bloccato', type: 'bool' },
      { key: 'inventory', label: 'Giacenza', type: 'flow', qty: true,
        calc: r => U.round(U.sum(itemEntries(r.no), 'quantity')), drill: r => `#/list/itemLedger?itemNo=${r.no}` },
      { key: 'qtyOnSales', label: 'Qtà su ordini vendita', type: 'flow', qty: true,
        calc: r => openQty('salesOrder', r.no) },
      { key: 'qtyOnPurch', label: 'Qtà su ordini acquisto', type: 'flow', qty: true,
        calc: r => openQty('purchaseOrder', r.no) },
    ],
    list: ['no', 'description', 'type', 'baseUnit', 'inventory', 'unitPrice', 'unitCost', 'vendorNo'],
    groups: [
      { caption: 'Articolo', fields: ['no', 'description', 'type', 'baseUnit', 'category', 'blocked'] },
      { caption: 'Magazzino', fields: ['inventory', 'qtyOnSales', 'qtyOnPurch', 'reorderPoint'] },
      { caption: 'Prezzi e registrazione', fields: ['unitPrice', 'unitCost', 'vatPct'] },
      { caption: 'Rifornimento', fields: ['vendorNo'] },
    ],
    defaults: () => ({ description: '', type: 'Magazzino', baseUnit: 'PZ', unitPrice: 0, unitCost: 0, vatPct: DB.setup().vatPct, reorderPoint: 0, blocked: false }),
    onDelete: r => {
      if (itemEntries(r.no).length) throw new Error(`Impossibile eliminare l'articolo ${r.no}: esistono movimenti.`);
    },
    filters: {
      sottoScorta: { label: 'Sotto punto di riordino', fn: r => r.type === 'Magazzino' && r.reorderPoint > 0 && U.sum(itemEntries(r.no), 'quantity') < r.reorderPoint },
    },
    cardActions: [
      { label: 'Rettifica giacenza', icon: '⚖', run: r => App.adjustInventory(r) },
      { label: 'Movimenti', icon: '📒', go: r => `#/list/itemLedger?itemNo=${r.no}` },
    ],
    factbox: r => {
      const inv = U.round(U.sum(itemEntries(r.no), 'quantity'));
      const avail = U.round(inv - openQty('salesOrder', r.no) + openQty('purchaseOrder', r.no));
      return `<h3>Disponibilità</h3>
        ${YES_NO_FACT('Giacenza', U.fmtQty(inv), `#/list/itemLedger?itemNo=${r.no}`)}
        ${YES_NO_FACT('Disponibilità prevista', U.fmtQty(avail))}
        ${YES_NO_FACT('Valore magazzino', U.fmt(U.sum(itemEntries(r.no), 'costAmount')))}
        ${YES_NO_FACT('Margine %', r.unitPrice ? U.fmt((r.unitPrice - r.unitCost) / r.unitPrice * 100, 1) : '0')}
        ${r.reorderPoint > 0 && inv < r.reorderPoint ? '<div class="fb-warn">Sotto il punto di riordino</div>' : ''}`;
    },
  },

  glAccount: {
    caption: 'Piano dei conti', single: 'Conto C/G', key: 'no', page: 'card', display: 'name', manualNo: true,
    fields: [
      { key: 'no', label: 'N.', readonly: true },
      { key: 'name', label: 'Nome' },
      { key: 'accountType', label: 'Tipo conto', type: 'option', options: ['Registrazione', 'Intestazione'] },
      { key: 'incomeBalance', label: 'Conto econ./Stato patr.', type: 'option', options: ['Stato patrimoniale', 'Conto economico'] },
      { key: 'blocked', label: 'Bloccato', type: 'bool' },
      { key: 'balance', label: 'Saldo (€)', type: 'flow',
        calc: r => r.accountType === 'Intestazione'
          ? U.sum(DB.all('glEntry').filter(e => e.accountNo[0] === r.no[0]), 'amount')
          : U.sum(DB.all('glEntry').filter(e => e.accountNo === r.no), 'amount'),
        drill: r => r.accountType === 'Intestazione' ? '' : `#/list/glEntry?accountNo=${r.no}` },
    ],
    list: ['no', 'name', 'accountType', 'incomeBalance', 'balance'],
    groups: [{ caption: 'Generale', fields: ['no', 'name', 'accountType', 'incomeBalance', 'blocked', 'balance'] }],
    defaults: () => ({ name: '', accountType: 'Registrazione', incomeBalance: 'Conto economico', blocked: false }),
    rowClass: r => r.accountType === 'Intestazione' ? 'heading' : '',
    onDelete: r => {
      if (DB.all('glEntry').some(e => e.accountNo === r.no)) throw new Error(`Impossibile eliminare il conto ${r.no}: esistono movimenti.`);
    },
    cardActions: [{ label: 'Movimenti', icon: '📒', go: r => `#/list/glEntry?accountNo=${r.no}` }],
  },

  salesOrder: {
    caption: 'Ordini vendita', single: 'Ordine vendita', key: 'no', series: 'OV', page: 'doc', lineKind: 'sales',
    partyTable: 'customer', partyField: 'customerNo',
    fields: [
      { key: 'no', label: 'N.', readonly: true },
      { key: 'customerNo', label: 'N. cliente', type: 'lookup', table: 'customer',
        validate: d => {
          const c = DB.get('customer', d.customerNo);
          if (!c) { d.customerName = ''; return; }
          if (c.blocked) throw new Error(`Il cliente ${c.no} è bloccato.`);
          Object.assign(d, { customerName: c.name, address: c.address, city: c.city, contact: c.contact,
            dueDate: U.addDays(d.postingDate || DB.workDate(), c.paymentDays || 0) });
        } },
      { key: 'customerName', label: 'Nome cliente', readonly: true },
      { key: 'address', label: 'Indirizzo' },
      { key: 'city', label: 'Città' },
      { key: 'contact', label: 'Contatto' },
      { key: 'orderDate', label: 'Data ordine', type: 'date' },
      { key: 'postingDate', label: 'Data di registrazione', type: 'date',
        validate: d => { const c = DB.get('customer', d.customerNo); if (c) d.dueDate = U.addDays(d.postingDate, c.paymentDays || 0); } },
      { key: 'dueDate', label: 'Data scadenza', type: 'date' },
      { key: 'externalDocNo', label: 'N. documento esterno' },
      { key: 'status', label: 'Stato', type: 'option', options: ['Aperto', 'Rilasciato'], readonly: true },
      { key: 'amount', label: 'Importo', type: 'flow', sum: true, calc: docNet },
      { key: 'amountInclVat', label: 'Importo IVA incl.', type: 'flow', sum: true, calc: d => U.round(docNet(d) + docVat(d)) },
    ],
    list: ['no', 'customerNo', 'customerName', 'orderDate', 'dueDate', 'status', 'amount', 'amountInclVat'],
    groups: [
      { caption: 'Generale', fields: ['no', 'customerNo', 'customerName', 'address', 'city', 'contact', 'orderDate', 'postingDate', 'dueDate', 'externalDocNo', 'status'] },
    ],
    defaults: () => ({ customerNo: '', orderDate: DB.workDate(), postingDate: DB.workDate(), status: 'Aperto', lines: [] }),
    post: no => Post.salesOrder(no),
  },

  purchaseOrder: {
    caption: 'Ordini acquisto', single: 'Ordine acquisto', key: 'no', series: 'OA', page: 'doc', lineKind: 'purchase',
    partyTable: 'vendor', partyField: 'vendorNo',
    fields: [
      { key: 'no', label: 'N.', readonly: true },
      { key: 'vendorNo', label: 'N. fornitore', type: 'lookup', table: 'vendor',
        validate: d => {
          const v = DB.get('vendor', d.vendorNo);
          if (!v) { d.vendorName = ''; return; }
          if (v.blocked) throw new Error(`Il fornitore ${v.no} è bloccato.`);
          Object.assign(d, { vendorName: v.name, address: v.address, city: v.city, contact: v.contact,
            dueDate: U.addDays(d.postingDate || DB.workDate(), v.paymentDays || 0) });
        } },
      { key: 'vendorName', label: 'Nome fornitore', readonly: true },
      { key: 'address', label: 'Indirizzo' },
      { key: 'city', label: 'Città' },
      { key: 'contact', label: 'Contatto' },
      { key: 'vendorInvoiceNo', label: 'N. fattura fornitore' },
      { key: 'orderDate', label: 'Data ordine', type: 'date' },
      { key: 'postingDate', label: 'Data di registrazione', type: 'date',
        validate: d => { const v = DB.get('vendor', d.vendorNo); if (v) d.dueDate = U.addDays(d.postingDate, v.paymentDays || 0); } },
      { key: 'dueDate', label: 'Data scadenza', type: 'date' },
      { key: 'status', label: 'Stato', type: 'option', options: ['Aperto', 'Rilasciato'], readonly: true },
      { key: 'amount', label: 'Importo', type: 'flow', sum: true, calc: docNet },
      { key: 'amountInclVat', label: 'Importo IVA incl.', type: 'flow', sum: true, calc: d => U.round(docNet(d) + docVat(d)) },
    ],
    list: ['no', 'vendorNo', 'vendorName', 'orderDate', 'vendorInvoiceNo', 'status', 'amount', 'amountInclVat'],
    groups: [
      { caption: 'Generale', fields: ['no', 'vendorNo', 'vendorName', 'address', 'city', 'contact', 'vendorInvoiceNo', 'orderDate', 'postingDate', 'dueDate', 'status'] },
    ],
    defaults: () => ({ vendorNo: '', orderDate: DB.workDate(), postingDate: DB.workDate(), status: 'Aperto', lines: [] }),
    post: no => Post.purchaseOrder(no),
  },

  postedSalesInv: {
    caption: 'Fatture vendita registrate', single: 'Fattura vendita registrata', key: 'no', page: 'doc', readonly: true, lineKind: 'sales',
    partyTable: 'customer', partyField: 'customerNo', printable: true,
    fields: [
      { key: 'no', label: 'N.' },
      { key: 'orderNo', label: 'N. ordine' },
      { key: 'customerNo', label: 'N. cliente', type: 'lookup', table: 'customer' },
      { key: 'customerName', label: 'Nome cliente' },
      { key: 'address', label: 'Indirizzo' },
      { key: 'city', label: 'Città' },
      { key: 'postingDate', label: 'Data di registrazione', type: 'date' },
      { key: 'dueDate', label: 'Data scadenza', type: 'date' },
      { key: 'externalDocNo', label: 'N. documento esterno' },
      { key: 'amount', label: 'Importo', type: 'dec', sum: true },
      { key: 'amountInclVat', label: 'Importo IVA incl.', type: 'dec', sum: true },
      { key: 'remaining', label: 'Importo residuo', type: 'flow', sum: true,
        calc: d => U.sum(DB.all('custLedger').filter(e => e.docNo === d.no && e.docType === 'Fattura'), 'remaining') },
    ],
    list: ['no', 'customerNo', 'customerName', 'postingDate', 'dueDate', 'amount', 'amountInclVat', 'remaining'],
    defaultSort: { key: 'no', dir: -1 },
    groups: [{ caption: 'Generale', fields: ['no', 'orderNo', 'customerNo', 'customerName', 'address', 'city', 'postingDate', 'dueDate', 'externalDocNo', 'remaining'] }],
  },

  postedPurchInv: {
    caption: 'Fatture acquisto registrate', single: 'Fattura acquisto registrata', key: 'no', page: 'doc', readonly: true, lineKind: 'purchase',
    partyTable: 'vendor', partyField: 'vendorNo',
    fields: [
      { key: 'no', label: 'N.' },
      { key: 'orderNo', label: 'N. ordine' },
      { key: 'vendorNo', label: 'N. fornitore', type: 'lookup', table: 'vendor' },
      { key: 'vendorName', label: 'Nome fornitore' },
      { key: 'vendorInvoiceNo', label: 'N. fattura fornitore' },
      { key: 'postingDate', label: 'Data di registrazione', type: 'date' },
      { key: 'dueDate', label: 'Data scadenza', type: 'date' },
      { key: 'amount', label: 'Importo', type: 'dec', sum: true },
      { key: 'amountInclVat', label: 'Importo IVA incl.', type: 'dec', sum: true },
    ],
    list: ['no', 'vendorNo', 'vendorName', 'vendorInvoiceNo', 'postingDate', 'dueDate', 'amount', 'amountInclVat'],
    defaultSort: { key: 'no', dir: -1 },
    groups: [{ caption: 'Generale', fields: ['no', 'orderNo', 'vendorNo', 'vendorName', 'vendorInvoiceNo', 'postingDate', 'dueDate'] }],
  },

  custLedger: {
    caption: 'Movimenti contabili clienti', single: 'Movimento cliente', key: 'entryNo', readonly: true,
    fields: [
      { key: 'entryNo', label: 'N. movimento', type: 'int' },
      { key: 'postingDate', label: 'Data reg.', type: 'date' },
      { key: 'docType', label: 'Tipo documento' },
      { key: 'docNo', label: 'N. documento' },
      { key: 'customerNo', label: 'N. cliente' },
      { key: 'description', label: 'Descrizione' },
      { key: 'amount', label: 'Importo', type: 'dec', sum: true },
      { key: 'remaining', label: 'Importo residuo', type: 'dec', sum: true },
      { key: 'dueDate', label: 'Data scadenza', type: 'date' },
      { key: 'open', label: 'Aperto', type: 'bool' },
    ],
    list: ['postingDate', 'docType', 'docNo', 'customerNo', 'description', 'amount', 'remaining', 'dueDate', 'open', 'entryNo'],
    defaultSort: { key: 'entryNo', dir: -1 },
    filters: { scaduti: { label: 'Scaduti', fn: r => r.open && r.dueDate < DB.workDate() } },
    openRow: r => DB.get('postedSalesInv', r.docNo) ? `#/doc/postedSalesInv/${r.docNo}` : '',
  },

  vendLedger: {
    caption: 'Movimenti contabili fornitori', single: 'Movimento fornitore', key: 'entryNo', readonly: true,
    fields: [
      { key: 'entryNo', label: 'N. movimento', type: 'int' },
      { key: 'postingDate', label: 'Data reg.', type: 'date' },
      { key: 'docType', label: 'Tipo documento' },
      { key: 'docNo', label: 'N. documento' },
      { key: 'externalDocNo', label: 'N. doc. esterno' },
      { key: 'vendorNo', label: 'N. fornitore' },
      { key: 'description', label: 'Descrizione' },
      { key: 'amount', label: 'Importo', type: 'dec', sum: true },
      { key: 'remaining', label: 'Importo residuo', type: 'dec', sum: true },
      { key: 'dueDate', label: 'Data scadenza', type: 'date' },
      { key: 'open', label: 'Aperto', type: 'bool' },
    ],
    list: ['postingDate', 'docType', 'docNo', 'externalDocNo', 'vendorNo', 'description', 'amount', 'remaining', 'dueDate', 'open', 'entryNo'],
    defaultSort: { key: 'entryNo', dir: -1 },
    filters: { scaduti: { label: 'Scaduti', fn: r => r.open && r.dueDate < DB.workDate() } },
    openRow: r => DB.get('postedPurchInv', r.docNo) ? `#/doc/postedPurchInv/${r.docNo}` : '',
  },

  itemLedger: {
    caption: 'Movimenti contabili articoli', single: 'Movimento articolo', key: 'entryNo', readonly: true,
    fields: [
      { key: 'entryNo', label: 'N. movimento', type: 'int' },
      { key: 'postingDate', label: 'Data reg.', type: 'date' },
      { key: 'entryType', label: 'Tipo movimento' },
      { key: 'docNo', label: 'N. documento' },
      { key: 'itemNo', label: 'N. articolo' },
      { key: 'description', label: 'Descrizione' },
      { key: 'quantity', label: 'Quantità', type: 'dec', sum: true },
      { key: 'costAmount', label: 'Importo costo', type: 'dec', sum: true },
      { key: 'salesAmount', label: 'Importo vendite', type: 'dec', sum: true },
    ],
    list: ['postingDate', 'entryType', 'docNo', 'itemNo', 'description', 'quantity', 'costAmount', 'salesAmount', 'entryNo'],
    defaultSort: { key: 'entryNo', dir: -1 },
    openRow: r => DB.get('postedSalesInv', r.docNo) ? `#/doc/postedSalesInv/${r.docNo}`
      : DB.get('postedPurchInv', r.docNo) ? `#/doc/postedPurchInv/${r.docNo}` : '',
  },

  glEntry: {
    caption: 'Movimenti C/G', single: 'Movimento C/G', key: 'entryNo', readonly: true,
    fields: [
      { key: 'entryNo', label: 'N. movimento', type: 'int' },
      { key: 'postingDate', label: 'Data reg.', type: 'date' },
      { key: 'docNo', label: 'N. documento' },
      { key: 'accountNo', label: 'N. conto C/G' },
      { key: 'accountName', label: 'Nome conto', type: 'flow', text: true, calc: r => (DB.get('glAccount', r.accountNo) || {}).name || '' },
      { key: 'description', label: 'Descrizione' },
      { key: 'debit', label: 'Dare', type: 'flow', sum: true, calc: r => r.amount > 0 ? r.amount : 0 },
      { key: 'credit', label: 'Avere', type: 'flow', sum: true, calc: r => r.amount < 0 ? -r.amount : 0 },
      { key: 'amount', label: 'Importo', type: 'dec', sum: true },
    ],
    list: ['postingDate', 'docNo', 'accountNo', 'accountName', 'description', 'debit', 'credit', 'amount', 'entryNo'],
    defaultSort: { key: 'entryNo', dir: -1 },
    openRow: r => DB.get('postedSalesInv', r.docNo) ? `#/doc/postedSalesInv/${r.docNo}`
      : DB.get('postedPurchInv', r.docNo) ? `#/doc/postedPurchInv/${r.docNo}` : '',
  },

  genJournal: {
    caption: 'Registrazioni COGE', single: 'Riga registrazioni', key: 'lineNo',
    fields: [
      { key: 'postingDate', label: 'Data reg.', type: 'date', w: 130 },
      { key: 'docType', label: 'Tipo documento', type: 'option', options: ['', 'Pagamento', 'Fattura', 'Nota di credito', 'Rimborso'], w: 110 },
      { key: 'docNo', label: 'N. documento', w: 100 },
      { key: 'accountType', label: 'Tipo conto', type: 'option', options: ['C/G', 'Cliente', 'Fornitore'], w: 100,
        validate: l => { l.accountNo = ''; l.description = ''; } },
      { key: 'accountNo', label: 'N. conto', type: 'lookup', w: 120,
        table: l => ({ 'C/G': 'glAccount', Cliente: 'customer', Fornitore: 'vendor' }[l.accountType]),
        validate: l => {
          const t = { 'C/G': 'glAccount', Cliente: 'customer', Fornitore: 'vendor' }[l.accountType];
          const r = DB.get(t, l.accountNo);
          l.description = r ? (r.name || '') : '';
        } },
      { key: 'description', label: 'Descrizione', w: 220 },
      { key: 'amount', label: 'Importo', type: 'dec', w: 100 },
      { key: 'balAccountNo', label: 'N. contropartita (C/G)', type: 'lookup', table: 'glAccount', w: 120 },
    ],
  },

  noSeries: {
    caption: 'Numerazioni', single: 'Numerazione', key: 'code', page: 'card', manualNo: true,
    fields: [
      { key: 'code', label: 'Codice', readonly: true },
      { key: 'description', label: 'Descrizione' },
      { key: 'prefix', label: 'Prefisso' },
      { key: 'digits', label: 'N. cifre', type: 'int' },
      { key: 'lastNo', label: 'Ultimo n. usato', type: 'int' },
      { key: 'example', label: 'Prossimo numero', type: 'flow', text: true,
        calc: s => s.prefix + String((Number(s.lastNo) || 0) + 1).padStart(Number(s.digits) || 0, '0') },
    ],
    list: ['code', 'description', 'prefix', 'lastNo', 'example'],
    groups: [{ caption: 'Generale', fields: ['code', 'description', 'prefix', 'digits', 'lastNo', 'example'] }],
    defaults: () => ({ description: '', prefix: '', digits: 5, lastNo: 0 }),
  },

  setup: {
    caption: 'Informazioni società e setup', single: 'Setup', key: 'id', page: 'card', noInsert: true,
    fields: [
      { key: 'companyName', label: 'Ragione sociale' },
      { key: 'address', label: 'Indirizzo' },
      { key: 'city', label: 'Città' },
      { key: 'vatNo', label: 'Partita IVA' },
      { key: 'iban', label: 'IBAN' },
      { key: 'workDate', label: 'Data di lavoro', type: 'date' },
      { key: 'vatPct', label: '% IVA predefinita', type: 'dec' },
      ...[
        ['salesAccount', 'C/G ricavi vendite'],
        ['cogsAccount', 'C/G costo del venduto'],
        ['inventoryAccount', 'C/G magazzino'],
        ['invAdjAccount', 'C/G rettifiche magazzino'],
        ['purchServiceAccount', 'C/G acquisti servizi'],
        ['receivablesAccount', 'C/G crediti v/clienti'],
        ['payablesAccount', 'C/G debiti v/fornitori'],
        ['vatSalesAccount', 'C/G IVA a debito'],
        ['vatPurchAccount', 'C/G IVA a credito'],
        ['bankAccount', 'C/G banca'],
      ].map(([key, label]) => ({ key, label, type: 'lookup', table: 'glAccount' })),
    ],
    groups: [
      { caption: 'Società', fields: ['companyName', 'address', 'city', 'vatNo', 'iban', 'workDate', 'vatPct'] },
      { caption: 'Gruppi di registrazione', fields: ['salesAccount', 'cogsAccount', 'inventoryAccount', 'invAdjAccount', 'purchServiceAccount', 'receivablesAccount', 'payablesAccount', 'vatSalesAccount', 'vatPurchAccount', 'bankAccount'] },
    ],
  },
};

function fieldOf(tname, key) {
  return TABLES[tname].fields.find(f => f.key === key);
}
