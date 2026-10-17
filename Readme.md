# NaviClone ERP

Un clone web, leggero e senza dipendenze, ispirato a **Microsoft Dynamics NAV (Navision)**.
Gira interamente nel browser: basta aprire `index.html`. I dati vengono salvati nel `localStorage`.

## Avvio

```bash
# apri direttamente il file…
xdg-open index.html
# …oppure servi la cartella
python3 -m http.server 8000   # poi http://localhost:8000
```

Al primo avvio viene creata la società dimostrativa **Regni di Giada S.r.l.** con clienti, fornitori,
articoli, piano dei conti e alcuni documenti già registrati. Da *Amministrazione → Ripristina dati demo*
si torna allo stato iniziale.

## Funzionalità

| Area | Cosa c'è |
|---|---|
| **Centro ruolo** | KPI (ricavi, utile lordo, banca, crediti), riquadri attività cliccabili, ultime fatture, migliori clienti |
| **Vendite** | Clienti, ordini di vendita (testata + righe), rilascio/riapertura, statistiche, registrazione → fattura registrata, stampa fattura, movimenti clienti |
| **Acquisti** | Fornitori, ordini di acquisto (obbligo *N. fattura fornitore* e controllo duplicati), fatture registrate, movimenti fornitori |
| **Magazzino** | Articoli (magazzino/servizio), giacenza e disponibilità, costo medio ponderato, rettifiche, movimenti articoli, valorizzazione |
| **Contabilità** | Piano dei conti, registrazioni COGE (incassi/pagamenti con collegamento automatico alle partite aperte), movimenti C/G, bilancio di verifica, scadenzario clienti |
| **Amministrazione** | Informazioni società e conti di registrazione, numerazioni, data di lavoro |

Elementi tipici di NAV riprodotti:

- **Liste / schede / documenti** con FastTab comprimibili e FactBox laterali
- **FlowField con drill-down**: cliccando su saldo, giacenza, ecc. si aprono i movimenti filtrati
- **Numerazioni** automatiche (C00001, OV00001, FV00001…)
- **Registrazione con F9**, transazioni atomiche (in caso di errore nulla viene scritto)
- Messaggi d'errore in stile NAV (*"Il campo … deve avere un valore…"*, *"Non vi è nulla da registrare."*)
- **"Dimmi cosa vuoi fare"** (Ctrl+K) per cercare pagine, azioni e record
- **Apri in Excel**: esportazione CSV di qualsiasi lista
- Layout responsive per l'uso da smartphone

## Logica di registrazione

**Fattura di vendita**: Dare *Crediti v/clienti* (totale IVA incl.), Avere *Ricavi vendite* e *IVA a debito*;
per gli articoli di magazzino Dare *Costo del venduto*, Avere *Magazzino* al costo medio.

**Fattura di acquisto**: Dare *Magazzino* (o *Acquisti servizi* / conto C/G della riga) e *IVA a credito*,
Avere *Debiti v/fornitori*. Il costo unitario dell'articolo viene ricalcolato come media ponderata.

**Registrazioni COGE**: importo positivo = Dare sul conto, Avere sulla contropartita. I movimenti cliente/fornitore
vengono collegati automaticamente alle partite aperte più vecchie.

## Struttura

```
index.html
css/style.css
js/db.js        database in localStorage, numerazioni, transazioni
js/tables.js    metadati delle tabelle (campi, liste, FastTab, FlowField, azioni)
js/posting.js   routine di registrazione (vendite, acquisti, COGE, rettifiche)
js/seed.js      dati dimostrativi
js/app.js       interfaccia: routing, liste, schede, documenti, report
```

> Progetto dimostrativo non affiliato a Microsoft. "Dynamics NAV" e "Navision" sono marchi dei rispettivi proprietari.
