# Regni di Giada

Un MMORPG 3D fantasy orientale che si gioca nel browser, ispirato ai classici MMO coreani come Metin2.
Tutta la grafica (terreno, villaggio a pagode, personaggi, mostri, effetti) è **originale** e viene generata
con il codice tramite [Three.js](https://threejs.org/). Non contiene risorse, nomi o marchi di altri giochi.

## Come avviarlo

Il gioco usa i moduli ES, quindi va servito da un server web (aprire il file direttamente con `file://` non funziona):

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

In alternativa puoi pubblicarlo con **GitHub Pages** (Settings → Pages → branch principale, cartella root).
Serve una connessione a Internet per scaricare Three.js dalla CDN.

## Contenuti

- **3 regni** (Drago Cremisi, Tigre Dorata, Fenice Azzurra): il colore del regno compare su mantello, stendardi e porte.
- **4 classi**: Guerriero, Assassino, Mago, Sciamano, ognuna con 4 abilità che si sbloccano ai livelli 1, 3, 5, 8.
- **Mondo aperto** di circa 480×480 metri: villaggio murato con fontana di giada, pagode, fabbro e mercante; prati, laghi, boschi di pini e ciliegi in fiore, montagne.
- **Mostri** per zona: Lupi, Lupi Alfa, Cinghiali Selvatici, Guerrieri Orco e il boss **Capo Orco Gruk**.
- **Pietre dello Spirito** (3 livelli): attaccandole evocano ondate di mostri e alla distruzione lasciano molta esperienza e Frammenti di Giada.
- **Fabbro**: potenzia l'arma da +0 a +9 con probabilità di successo decrescente; l'arma brilla sempre di più.
- **Missioni** a catena dal Capitano Wen, **negozio** di pozioni, **punti statistica** (VIT/INT/FOR/DES), bottino a terra, minimappa, salvataggio automatico nel browser.

## Comandi

| Azione | Tasto |
| --- | --- |
| Muoviti | Clic sinistro sul terreno, oppure W A S D / frecce |
| Attacca / parla | Clic sinistro su mostro o personaggio |
| Ruota la visuale | Tasto destro + trascina, oppure Q / E |
| Zoom | Rotellina del mouse |
| Attacca il nemico più vicino | Spazio / Tab |
| Abilità | 1 2 3 4 |
| Pozione rossa / blu | 5 / 6 |
| Inventario · Personaggio · Aiuto | I · C · H |

## Struttura

- `index.html`, `style.css`: pagina e interfaccia
- `src/world.js`: terreno procedurale, vegetazione, villaggio
- `src/models.js`: modelli 3D di personaggi, mostri e Pietre dello Spirito
- `src/data.js`: classi, abilità, mostri, oggetti, missioni
- `src/main.js`: ciclo di gioco, combattimento, IA, interfaccia
