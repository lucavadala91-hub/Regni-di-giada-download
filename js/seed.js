'use strict';
// Dati dimostrativi: società, piano dei conti, anagrafiche e qualche documento già registrato.

const Seed = {
  run() {
    const d = DB.data;
    const today = U.today();
    const ago = n => U.addDays(today, -n);

    d.setup = [{
      id: 'SETUP', companyName: 'Regni di Giada S.r.l.', address: 'Via della Giada 8', city: 'Firenze',
      vatNo: 'IT01234567890', iban: 'IT60X0542811101000000123456', workDate: today, vatPct: 22,
      salesAccount: '3100', cogsAccount: '4100', inventoryAccount: '1100', invAdjAccount: '4500',
      purchServiceAccount: '4200', receivablesAccount: '1200', payablesAccount: '2100',
      vatSalesAccount: '2200', vatPurchAccount: '1300', bankAccount: '1400',
    }];

    d.noSeries = [
      ['CLI', 'Clienti', 'C', 5], ['FOR', 'Fornitori', 'F', 5], ['ART', 'Articoli', 'ART', 4],
      ['OV', 'Ordini vendita', 'OV', 5], ['OA', 'Ordini acquisto', 'OA', 5],
      ['FV', 'Fatture vendita registrate', 'FV', 5], ['FA', 'Fatture acquisto registrate', 'FA', 5],
      ['PAG', 'Incassi e pagamenti', 'PAG', 5], ['RET', 'Rettifiche magazzino', 'RET', 5],
    ].map(([code, description, prefix, digits]) => ({ code, description, prefix, digits, lastNo: 0 }));

    d.glAccount = [
      ['1000', 'ATTIVITÀ', 'Intestazione', 'Stato patrimoniale'],
      ['1100', 'Magazzino merci', 'Registrazione', 'Stato patrimoniale'],
      ['1200', 'Crediti verso clienti', 'Registrazione', 'Stato patrimoniale'],
      ['1300', 'IVA a credito', 'Registrazione', 'Stato patrimoniale'],
      ['1400', 'Banca c/c', 'Registrazione', 'Stato patrimoniale'],
      ['1500', 'Cassa', 'Registrazione', 'Stato patrimoniale'],
      ['2000', 'PASSIVITÀ E PATRIMONIO NETTO', 'Intestazione', 'Stato patrimoniale'],
      ['2100', 'Debiti verso fornitori', 'Registrazione', 'Stato patrimoniale'],
      ['2200', 'IVA a debito', 'Registrazione', 'Stato patrimoniale'],
      ['2300', 'Capitale sociale', 'Registrazione', 'Stato patrimoniale'],
      ['3000', 'RICAVI', 'Intestazione', 'Conto economico'],
      ['3100', 'Ricavi vendite merci', 'Registrazione', 'Conto economico'],
      ['3200', 'Ricavi prestazioni servizi', 'Registrazione', 'Conto economico'],
      ['4000', 'COSTI', 'Intestazione', 'Conto economico'],
      ['4100', 'Costo del venduto', 'Registrazione', 'Conto economico'],
      ['4200', 'Acquisti servizi', 'Registrazione', 'Conto economico'],
      ['4300', 'Affitti passivi', 'Registrazione', 'Conto economico'],
      ['4400', 'Utenze', 'Registrazione', 'Conto economico'],
      ['4500', 'Rettifiche di magazzino', 'Registrazione', 'Conto economico'],
    ].map(([no, name, accountType, incomeBalance]) => ({ no, name, accountType, incomeBalance, blocked: false }));

    const customers = [
      ['Bottega Rossi S.r.l.', 'Corso Buenos Aires 12', '20124', 'Milano', 'MI', 'Marco Rossi', '02 1234567', 30, 15000],
      ['Ferramenta Bianchi & C.', 'Via Po 45', '10123', 'Torino', 'TO', 'Giulia Bianchi', '011 765432', 60, 8000],
      ['Studio Verdi Associati', 'Via Indipendenza 3', '40121', 'Bologna', 'BO', 'Paolo Verdi', '051 998877', 30, 5000],
      ['Caffè del Porto S.n.c.', 'Calata Mandraccio 1', '16128', 'Genova', 'GE', 'Anna Ferrari', '010 445566', 30, 3000],
      ['Hotel Laguna S.p.A.', 'Riva degli Schiavoni 9', '30122', 'Venezia', 'VE', 'Luca Romano', '041 520520', 90, 25000],
    ];
    d.customer = customers.map((c, i) => ({
      no: DB.nextNo('CLI'), name: c[0], address: c[1], postCode: c[2], city: c[3], county: c[4], country: 'IT',
      contact: c[5], phone: c[6], email: c[5].split(' ')[0].toLowerCase() + '@example.com',
      vatNo: 'IT0' + String(1000000000 + i * 7654321).slice(0, 10), fiscalCode: '', paymentDays: c[7], creditLimit: c[8], blocked: false,
    }));

    const vendors = [
      ['Orient Stone Import S.r.l.', 'Via del Commercio 77', '57123', 'Livorno', 'Chen Wei', '0586 112233', 60],
      ['Argenteria Fiorentina S.p.A.', 'Lungarno Corsini 4', '50123', 'Firenze', 'Sara Conti', '055 287654', 30],
      ['Imballaggi Veloci S.r.l.', 'Via dell\'Industria 21', '36100', 'Vicenza', 'Davide Gallo', '0444 334455', 30],
      ['Trasporti Nord S.r.l.', 'Via Emilia 300', '43122', 'Parma', 'Elena Marino', '0521 667788', 30],
    ];
    d.vendor = vendors.map((v, i) => ({
      no: DB.nextNo('FOR'), name: v[0], address: v[1], postCode: v[2], city: v[3], country: 'IT', contact: v[4], phone: v[5],
      email: v[4].split(' ')[0].toLowerCase() + '@example.com', vatNo: 'IT0' + String(2000000000 + i * 3456789).slice(0, 10),
      paymentDays: v[6], blocked: false,
    }));

    const items = [
      ['Ciondolo in giada verde', 'Magazzino', 'PZ', 'Gioielli', 89, 35, 10, 'F00001'],
      ['Braccialetto giada e argento', 'Magazzino', 'PZ', 'Gioielli', 129, 52, 8, 'F00002'],
      ['Statuetta drago in giada', 'Magazzino', 'PZ', 'Oggettistica', 349, 140, 3, 'F00001'],
      ['Vaso imperiale in giada', 'Magazzino', 'PZ', 'Oggettistica', 1290, 610, 1, 'F00001'],
      ['Anello argento con giada', 'Magazzino', 'PZ', 'Gioielli', 159, 64, 6, 'F00002'],
      ['Collana perle e giada', 'Magazzino', 'PZ', 'Gioielli', 219, 95, 5, 'F00002'],
      ['Portagioie laccato', 'Magazzino', 'PZ', 'Confezioni', 45, 18, 20, 'F00003'],
      ['Servizio di incisione', 'Servizio', 'ORA', 'Servizi', 60, 0, 0, ''],
    ];
    d.item = items.map(it => ({
      no: DB.nextNo('ART'), description: it[0], type: it[1], baseUnit: it[2], category: it[3],
      unitPrice: it[4], unitCost: it[5], vatPct: 22, reorderPoint: it[6], vendorNo: it[7], blocked: false,
    }));

    ['salesOrder', 'purchaseOrder', 'postedSalesInv', 'postedPurchInv', 'custLedger', 'vendLedger', 'itemLedger', 'glEntry', 'genJournal']
      .forEach(t => { d[t] = []; });

    const line = (no, quantity, { kind = 'sales', ...overrides } = {}) => {
      const l = { type: 'Articolo', no, quantity: 0, unitPrice: 0, lineDiscount: 0, vatPct: 22 };
      validateLineNo(kind, l);
      return Object.assign(l, { quantity }, overrides);
    };
    const doc = (t, party, date, lines, extra = {}) => {
      const rec = { ...TABLES[t].defaults(), no: DB.nextNo(TABLES[t].series), [TABLES[t].partyField]: party, ...extra };
      fieldOf(t, TABLES[t].partyField).validate(rec);
      Object.assign(rec, { orderDate: date, postingDate: date, lines });
      fieldOf(t, 'postingDate').validate(rec);
      DB.insert(t, rec);
      return rec.no;
    };
    const p = (no, qty) => line(no, qty, { kind: 'purchase' });

    // Capitale iniziale versato in banca.
    Post.gl(ago(60), 'APERTURA', '1400', 'Versamento capitale sociale', 50000);
    Post.gl(ago(60), 'APERTURA', '2300', 'Versamento capitale sociale', -50000);

    Post.purchaseOrder(doc('purchaseOrder', 'F00001', ago(45),
      [p('ART0001', 30), p('ART0003', 6), p('ART0004', 2)], { vendorInvoiceNo: 'OSI-2291' }));
    Post.purchaseOrder(doc('purchaseOrder', 'F00002', ago(40),
      [p('ART0002', 20), p('ART0005', 15), p('ART0006', 10)], { vendorInvoiceNo: 'AF/118' }));
    Post.purchaseOrder(doc('purchaseOrder', 'F00003', ago(38), [p('ART0007', 40)], { vendorInvoiceNo: 'IV-5521' }));

    Post.salesOrder(doc('salesOrder', 'C00001', ago(35), [line('ART0001', 12), line('ART0007', 12)]));
    Post.salesOrder(doc('salesOrder', 'C00005', ago(28), [line('ART0004', 1), line('ART0003', 2, { lineDiscount: 5 })]));
    Post.salesOrder(doc('salesOrder', 'C00002', ago(20), [line('ART0002', 4), line('ART0005', 5), line('ART0008', 2)]));
    Post.salesOrder(doc('salesOrder', 'C00004', ago(12), [line('ART0006', 3), line('ART0001', 6)]));
    Post.salesOrder(doc('salesOrder', 'C00003', ago(4), [line('ART0005', 2), line('ART0007', 2)]));

    // Incasso del primo cliente e pagamento al primo fornitore.
    const inv1 = DB.all('custLedger')[0];
    d.genJournal = [
      { lineNo: 1, postingDate: ago(6), docType: 'Pagamento', docNo: DB.nextNo('PAG'), accountType: 'Cliente', accountNo: 'C00001',
        description: 'Incasso fattura ' + inv1.docNo, amount: -inv1.amount, balAccountNo: '1400' },
      { lineNo: 2, postingDate: ago(3), docType: 'Pagamento', docNo: DB.nextNo('PAG'), accountType: 'Fornitore', accountNo: 'F00003',
        description: 'Pagamento fattura IV-5521', amount: -DB.all('vendLedger')[2].amount, balAccountNo: '1400' },
    ];
    Post.journal();

    // Documenti ancora aperti.
    doc('salesOrder', 'C00005', ago(1), [line('ART0003', 2), line('ART0006', 4), line('ART0008', 3)], { externalDocNo: 'HL-PO-778' });
    doc('salesOrder', 'C00002', today, [line('ART0002', 6), line('ART0007', 6)]);
    doc('purchaseOrder', 'F00002', today, [p('ART0002', 10), p('ART0005', 10)]);
  },
};
