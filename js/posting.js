'use strict';
// Routine di registrazione: generano movimenti C/G, clienti, fornitori e articoli.

const Post = {
  account(no) {
    const g = DB.get('glAccount', no);
    if (!g) throw new Error(`Il conto C/G ${no || '(vuoto)'} non esiste. Verificare il setup.`);
    if (g.accountType !== 'Registrazione') throw new Error(`Il conto C/G ${no} non è di tipo Registrazione.`);
    if (g.blocked) throw new Error(`Il conto C/G ${no} è bloccato.`);
    return g;
  },

  gl(date, docNo, accountNo, description, amount) {
    amount = U.round(amount);
    if (!amount) return;
    this.account(accountNo);
    DB.all('glEntry').push({ entryNo: DB.nextEntryNo('glEntry'), postingDate: date, docNo, accountNo, description, amount });
  },

  // Collega il nuovo movimento ai movimenti aperti di segno opposto (più vecchi per primi).
  apply(table, partyKey, entry) {
    const open = DB.all(table)
      .filter(e => e[partyKey] === entry[partyKey] && e.open && e !== entry && Math.sign(e.remaining) === -Math.sign(entry.remaining))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.entryNo - b.entryNo);
    for (const e of open) {
      if (!entry.remaining) break;
      const applied = Math.sign(entry.remaining) * Math.min(Math.abs(entry.remaining), Math.abs(e.remaining));
      e.remaining = U.round(e.remaining + applied);
      entry.remaining = U.round(entry.remaining - applied);
      e.open = e.remaining !== 0;
    }
    entry.open = entry.remaining !== 0;
  },

  ledger(table, partyKey, rec) {
    const entry = { entryNo: DB.nextEntryNo(table), ...rec, amount: U.round(rec.amount), remaining: U.round(rec.amount), open: true };
    DB.all(table).push(entry);
    this.apply(table, partyKey, entry);
    return entry;
  },

  item(rec) {
    DB.all('itemLedger').push({ entryNo: DB.nextEntryNo('itemLedger'), salesAmount: 0, ...rec });
  },

  checkLines(doc, kind) {
    const lines = (doc.lines || []).filter(l => l.no && U.num(l.quantity) !== 0);
    if (!lines.length) throw new Error('Non vi è nulla da registrare.');
    for (const l of lines) {
      if (U.num(l.quantity) < 0) throw new Error(`La quantità della riga ${l.no} deve essere positiva.`);
      if (l.type === 'Articolo') {
        const it = DB.get('item', l.no);
        if (!it) throw new Error(`L'articolo ${l.no} non esiste.`);
        if (it.blocked) throw new Error(`L'articolo ${l.no} è bloccato.`);
      } else {
        this.account(l.no);
      }
    }
    return lines;
  },

  salesOrder(no) {
    return DB.transaction(() => {
      const S = DB.setup();
      const h = DB.get('salesOrder', no);
      if (!h.customerNo) throw new Error(`Il campo N. cliente deve avere un valore in Testata vendite: N.=${no}.`);
      const cust = DB.get('customer', h.customerNo);
      if (!cust) throw new Error(`Il cliente ${h.customerNo} non esiste.`);
      if (cust.blocked) throw new Error(`Il cliente ${cust.no} è bloccato.`);
      const lines = this.checkLines(h, 'sales');
      const date = h.postingDate || DB.workDate();
      const dueDate = h.dueDate || U.addDays(date, cust.paymentDays || 0);
      const invNo = DB.nextNo('FV');
      const desc = `Ordine ${h.no}`;

      let net = 0, vat = 0;
      for (const l of lines) {
        const lnet = lineNet(l), lvat = lineVat(l);
        net += lnet; vat += lvat;
        if (l.type === 'Articolo') {
          const it = DB.get('item', l.no);
          this.gl(date, invNo, S.salesAccount, l.description, -lnet);
          if (it.type === 'Magazzino') {
            const cost = U.round(U.num(l.quantity) * it.unitCost);
            this.item({ postingDate: date, entryType: 'Vendita', docNo: invNo, itemNo: it.no, description: l.description,
              quantity: -U.num(l.quantity), costAmount: -cost, salesAmount: lnet });
            this.gl(date, invNo, S.cogsAccount, l.description, cost);
            this.gl(date, invNo, S.inventoryAccount, l.description, -cost);
          }
        } else {
          this.gl(date, invNo, l.no, l.description, -lnet);
        }
      }
      net = U.round(net); vat = U.round(vat);
      const total = U.round(net + vat);
      this.gl(date, invNo, S.vatSalesAccount, `IVA ${desc}`, -vat);
      this.gl(date, invNo, S.receivablesAccount, `${cust.name}`, total);
      this.ledger('custLedger', 'customerNo', { postingDate: date, docType: 'Fattura', docNo: invNo, customerNo: cust.no,
        description: desc, amount: total, salesAmount: net, dueDate });

      DB.insert('postedSalesInv', {
        no: invNo, orderNo: h.no, customerNo: cust.no, customerName: h.customerName || cust.name, address: h.address, city: h.city,
        postingDate: date, dueDate, externalDocNo: h.externalDocNo, amount: net, amountInclVat: total,
        lines: lines.map(l => ({ ...l })),
      });
      DB.remove('salesOrder', no);
      return invNo;
    });
  },

  purchaseOrder(no) {
    return DB.transaction(() => {
      const S = DB.setup();
      const h = DB.get('purchaseOrder', no);
      if (!h.vendorNo) throw new Error(`Il campo N. fornitore deve avere un valore in Testata acquisti: N.=${no}.`);
      const vend = DB.get('vendor', h.vendorNo);
      if (!vend) throw new Error(`Il fornitore ${h.vendorNo} non esiste.`);
      if (vend.blocked) throw new Error(`Il fornitore ${vend.no} è bloccato.`);
      if (!h.vendorInvoiceNo) throw new Error(`Il campo N. fattura fornitore deve avere un valore in Testata acquisti: N.=${no}.`);
      if (DB.all('vendLedger').some(e => e.vendorNo === vend.no && e.externalDocNo === h.vendorInvoiceNo)) {
        throw new Error(`La fattura fornitore ${h.vendorInvoiceNo} è già stata registrata per il fornitore ${vend.no}.`);
      }
      const lines = this.checkLines(h, 'purchase');
      const date = h.postingDate || DB.workDate();
      const dueDate = h.dueDate || U.addDays(date, vend.paymentDays || 0);
      const invNo = DB.nextNo('FA');
      const desc = `Ordine ${h.no}`;

      let net = 0, vat = 0;
      for (const l of lines) {
        const lnet = lineNet(l), lvat = lineVat(l);
        net += lnet; vat += lvat;
        if (l.type === 'Articolo') {
          const it = DB.get('item', l.no);
          const qty = U.num(l.quantity);
          if (it.type === 'Magazzino') {
            // Costo medio ponderato.
            const invQty = U.sum(DB.all('itemLedger').filter(e => e.itemNo === it.no), 'quantity');
            const invVal = U.sum(DB.all('itemLedger').filter(e => e.itemNo === it.no), 'costAmount');
            if (invQty + qty > 0) it.unitCost = U.round((Math.max(invVal, 0) + lnet) / (Math.max(invQty, 0) + qty));
            this.item({ postingDate: date, entryType: 'Acquisto', docNo: invNo, itemNo: it.no, description: l.description,
              quantity: qty, costAmount: lnet });
            this.gl(date, invNo, S.inventoryAccount, l.description, lnet);
          } else {
            this.gl(date, invNo, S.purchServiceAccount, l.description, lnet);
          }
        } else {
          this.gl(date, invNo, l.no, l.description, lnet);
        }
      }
      net = U.round(net); vat = U.round(vat);
      const total = U.round(net + vat);
      this.gl(date, invNo, S.vatPurchAccount, `IVA ${desc}`, vat);
      this.gl(date, invNo, S.payablesAccount, vend.name, -total);
      this.ledger('vendLedger', 'vendorNo', { postingDate: date, docType: 'Fattura', docNo: invNo, externalDocNo: h.vendorInvoiceNo,
        vendorNo: vend.no, description: desc, amount: -total, purchAmount: net, dueDate });

      DB.insert('postedPurchInv', {
        no: invNo, orderNo: h.no, vendorNo: vend.no, vendorName: h.vendorName || vend.name, vendorInvoiceNo: h.vendorInvoiceNo,
        postingDate: date, dueDate, amount: net, amountInclVat: total, lines: lines.map(l => ({ ...l })),
      });
      DB.remove('purchaseOrder', no);
      return invNo;
    });
  },

  journal() {
    return DB.transaction(() => {
      const S = DB.setup();
      const lines = DB.all('genJournal');
      if (!lines.length) throw new Error('Non vi è nulla da registrare.');
      for (const l of lines) {
        const where = `nella riga con N. documento ${l.docNo || '(vuoto)'}`;
        if (!l.postingDate) throw new Error(`Il campo Data reg. deve avere un valore ${where}.`);
        if (!l.docNo) throw new Error('Il campo N. documento deve avere un valore in tutte le righe.');
        if (!l.accountNo) throw new Error(`Il campo N. conto deve avere un valore ${where}.`);
        if (!U.num(l.amount)) throw new Error(`Il campo Importo deve avere un valore ${where}.`);
        if (!l.balAccountNo) throw new Error(`Il campo N. contropartita deve avere un valore ${where}.`);
      }
      for (const l of lines) {
        const amount = U.round(l.amount);
        const desc = l.description || l.docType || 'Registrazione';
        if (l.accountType === 'Cliente') {
          const c = DB.get('customer', l.accountNo);
          if (!c) throw new Error(`Il cliente ${l.accountNo} non esiste.`);
          this.ledger('custLedger', 'customerNo', { postingDate: l.postingDate, docType: l.docType || (amount < 0 ? 'Pagamento' : 'Fattura'),
            docNo: l.docNo, customerNo: c.no, description: desc, amount, salesAmount: 0, dueDate: l.postingDate });
          this.gl(l.postingDate, l.docNo, S.receivablesAccount, desc, amount);
        } else if (l.accountType === 'Fornitore') {
          const v = DB.get('vendor', l.accountNo);
          if (!v) throw new Error(`Il fornitore ${l.accountNo} non esiste.`);
          this.ledger('vendLedger', 'vendorNo', { postingDate: l.postingDate, docType: l.docType || (amount > 0 ? 'Pagamento' : 'Fattura'),
            docNo: l.docNo, vendorNo: v.no, description: desc, amount, purchAmount: 0, dueDate: l.postingDate });
          this.gl(l.postingDate, l.docNo, S.payablesAccount, desc, amount);
        } else {
          this.gl(l.postingDate, l.docNo, l.accountNo, desc, amount);
        }
        this.gl(l.postingDate, l.docNo, l.balAccountNo, desc, -amount);
      }
      const n = lines.length;
      DB.data.genJournal = [];
      return n;
    });
  },

  itemAdjustment(itemNo, qty) {
    return DB.transaction(() => {
      const S = DB.setup();
      const it = DB.get('item', itemNo);
      if (it.type !== 'Magazzino') throw new Error(`L'articolo ${it.no} non è di tipo Magazzino.`);
      const date = DB.workDate();
      const docNo = DB.nextNo('RET');
      const cost = U.round(qty * it.unitCost);
      this.item({ postingDate: date, entryType: qty > 0 ? 'Rettifica positiva' : 'Rettifica negativa', docNo, itemNo: it.no,
        description: it.description, quantity: qty, costAmount: cost });
      this.gl(date, docNo, S.inventoryAccount, `Rettifica ${it.no}`, cost);
      this.gl(date, docNo, S.invAdjAccount, `Rettifica ${it.no}`, -cost);
      return docNo;
    });
  },
};
