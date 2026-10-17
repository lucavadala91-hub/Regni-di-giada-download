// Dati di gioco: regni, classi, abilità, mostri, oggetti, missioni

export const KINGDOMS = [
  { id: 'drago', name: 'Regno del Drago Cremisi', short: 'Drago Cremisi', color: 0xb3261e, css: '#d8402f', motto: 'Fuoco e onore.' },
  { id: 'tigre', name: 'Regno della Tigre Dorata', short: 'Tigre Dorata', color: 0xd6a419, css: '#e8b928', motto: 'Forza e ricchezza.' },
  { id: 'fenice', name: 'Regno della Fenice Azzurra', short: 'Fenice Azzurra', color: 0x2a5fb3, css: '#4a86e0', motto: 'Saggezza e rinascita.' },
];

export const CLASSES = {
  guerriero: {
    name: 'Guerriero', icon: '⚔️', desc: 'Maestro della spada. Molti punti vita e difesa robusta.',
    hp: 200, hpL: 32, mp: 60, mpL: 6, atk: 14, def: 9, range: 2.4, atkSpeed: 1.0, speed: 8.5, magic: false,
    weapon: 'sword', armor: 0x7a2b1f, accent: 0xc9a24a, cloth: 0x2b221c, hair: 0x1a1410,
    skills: [
      { name: 'Vortice di Lame', icon: '🌀', mp: 18, cd: 6, lvl: 1, type: 'aoe', mult: 2.0, radius: 5, color: 0xffd27a, desc: 'Ruota su te stesso colpendo tutti i nemici vicini.' },
      { name: 'Carica Furiosa', icon: '💥', mp: 16, cd: 8, lvl: 3, type: 'dash', mult: 2.6, color: 0xff8a3a, desc: 'Ti lanci sul bersaglio colpendolo con forza.' },
      { name: 'Corpo di Ferro', icon: '🛡️', mp: 25, cd: 30, lvl: 5, type: 'buff', buff: 'def', value: 0.6, dur: 20, color: 0x9ab8ff, desc: '+60% difesa per 20 secondi.' },
      { name: 'Spirito della Spada', icon: '🔥', mp: 30, cd: 35, lvl: 8, type: 'buff', buff: 'atk', value: 0.4, dur: 20, color: 0xff5a2a, desc: '+40% attacco per 20 secondi.' },
    ],
  },
  assassino: {
    name: 'Assassino', icon: '🗡️', desc: 'Rapido e letale con due pugnali. Colpi critici frequenti.',
    hp: 160, hpL: 25, mp: 70, mpL: 7, atk: 13, def: 6, range: 2.2, atkSpeed: 0.65, speed: 9.5, magic: false, critBonus: 0.08,
    weapon: 'dagger', armor: 0x2c2c3a, accent: 0x8a8fa0, cloth: 0x1a1a22, hair: 0x2a1a10,
    skills: [
      { name: 'Colpo Furtivo', icon: '🗡️', mp: 15, cd: 5, lvl: 1, type: 'single', mult: 3.2, color: 0xd0d0ff, desc: 'Un fendente preciso che infligge danni enormi.' },
      { name: "Passo d'Ombra", icon: '💨', mp: 15, cd: 7, lvl: 3, type: 'dash', mult: 2.2, color: 0x8a6aff, desc: "Appari alle spalle del bersaglio e lo colpisci." },
      { name: 'Nube Velenosa', icon: '☠️', mp: 22, cd: 9, lvl: 5, type: 'aoe', mult: 1.9, radius: 6, color: 0x6aff5a, desc: 'Un veleno che danneggia i nemici intorno a te.' },
      { name: 'Furia del Vento', icon: '🌪️', mp: 30, cd: 35, lvl: 8, type: 'buff', buff: 'haste', value: 0.4, dur: 20, color: 0xbaffd0, desc: '+40% velocità di movimento e di attacco.' },
    ],
  },
  mago: {
    name: 'Mago', icon: '🔮', desc: 'Attacca dalla distanza con il potere degli elementi.',
    hp: 140, hpL: 20, mp: 120, mpL: 12, atk: 15, def: 5, range: 13, atkSpeed: 1.2, speed: 8.5, magic: true,
    weapon: 'staff', armor: 0x3a2a6a, accent: 0xb89a4a, cloth: 0x22183a, hair: 0x5a3a20, robe: true,
    skills: [
      { name: 'Sfera di Fuoco', icon: '🔥', mp: 14, cd: 3, lvl: 1, type: 'projectile', mult: 2.6, color: 0xff6a1a, desc: 'Scaglia una sfera infuocata.' },
      { name: 'Pioggia di Meteore', icon: '☄️', mp: 28, cd: 9, lvl: 3, type: 'aoe', atTarget: true, mult: 2.4, radius: 6, color: 0xff9a3a, desc: 'Meteore cadono sul bersaglio e intorno.' },
      { name: 'Barriera Arcana', icon: '🔰', mp: 25, cd: 30, lvl: 5, type: 'buff', buff: 'def', value: 0.8, dur: 20, color: 0x7ab0ff, desc: '+80% difesa per 20 secondi.' },
      { name: 'Lancia di Fulmine', icon: '⚡', mp: 35, cd: 10, lvl: 8, type: 'projectile', mult: 4.2, color: 0x9ae0ff, desc: 'Un fulmine devastante.' },
    ],
  },
  sciamano: {
    name: 'Sciamano', icon: '🪭', desc: 'Guida gli spiriti del cielo: cura, protegge e punisce.',
    hp: 165, hpL: 24, mp: 110, mpL: 11, atk: 13, def: 6, range: 11, atkSpeed: 1.1, speed: 8.5, magic: true,
    weapon: 'fan', armor: 0xe0d6c0, accent: 0x2f9a6a, cloth: 0x3a5a4a, hair: 0x101010, robe: true,
    skills: [
      { name: 'Drago Volante', icon: '🐉', mp: 14, cd: 3, lvl: 1, type: 'projectile', mult: 2.4, color: 0x5affb0, desc: 'Evoca uno spirito drago che colpisce il bersaglio.' },
      { name: 'Benedizione', icon: '💚', mp: 30, cd: 12, lvl: 3, type: 'heal', value: 0.35, color: 0x6aff8a, desc: 'Recupera il 35% dei punti vita.' },
      { name: 'Ira del Cielo', icon: '🌩️', mp: 28, cd: 9, lvl: 5, type: 'aoe', atTarget: true, mult: 2.2, radius: 6, color: 0xbad0ff, desc: 'Fulmini colpiscono l\'area del bersaglio.' },
      { name: 'Protezione Celeste', icon: '✨', mp: 35, cd: 35, lvl: 8, type: 'buff', buff: 'both', value: 0.3, dur: 20, color: 0xfff0a0, desc: '+30% attacco e difesa per 20 secondi.' },
    ],
  },
};

// zona: distanza minima/massima dal centro del villaggio
export const MOBS = {
  lupo: { name: 'Lupo', model: 'wolf', color: 0x8a8178, scale: 1, lvl: 1, hp: 55, atk: 7, def: 2, xp: 22, gold: 8, speed: 6.5, aggro: false, zone: [55, 95], count: 24 },
  lupoAlfa: { name: 'Lupo Alfa', model: 'wolf', color: 0x3e3836, scale: 1.3, eye: 0xff3a2a, lvl: 5, hp: 150, atk: 15, def: 5, xp: 60, gold: 18, speed: 7, aggro: true, zone: [90, 128], count: 18 },
  cinghiale: { name: 'Cinghiale Selvatico', model: 'boar', color: 0x5a3a24, scale: 1.1, lvl: 9, hp: 280, atk: 24, def: 9, xp: 120, gold: 32, speed: 6, aggro: false, zone: [120, 165], count: 18 },
  orco: { name: 'Guerriero Orco', model: 'orc', color: 0x5d7a3a, scale: 1.25, lvl: 14, hp: 520, atk: 38, def: 15, xp: 230, gold: 60, speed: 6.2, aggro: true, zone: [158, 205], count: 18 },
  capoOrco: { name: 'Capo Orco Gruk', model: 'orc', color: 0x3f5a28, scale: 1.9, lvl: 20, hp: 4200, atk: 70, def: 24, xp: 2500, gold: 900, speed: 6, aggro: true, boss: true },
};

export const STONE_TIERS = [
  { name: 'Pietra dello Spirito', lvl: 6, hp: 1100, def: 6, xp: 500, gold: 150, glow: 0xb05aff, r: 82 },
  { name: 'Pietra dell\'Ira', lvl: 12, hp: 3000, def: 12, xp: 1600, gold: 400, glow: 0xff3a4a, r: 135 },
  { name: 'Pietra dell\'Abisso', lvl: 18, hp: 6500, def: 20, xp: 4200, gold: 900, glow: 0xffb02a, r: 182 },
];

export const ITEMS = {
  rossa: { name: 'Pozione Rossa', icon: '🧪', color: '#e04a3a', desc: 'Ripristina 40% dei PV.', price: 30 },
  blu: { name: 'Pozione Blu', icon: '💧', color: '#3a7ae0', desc: 'Ripristina 40% dei PM.', price: 40 },
  frammento: { name: 'Frammento di Giada', icon: '💎', color: '#3ad08a', desc: 'Usato dal fabbro per potenziare le armi.', price: 0 },
  pergamena: { name: 'Pergamena della Fortuna', icon: '📜', color: '#e8c85a', desc: 'Aumenta del 20% la probabilità di potenziamento (consumata dal fabbro).', price: 0 },
};

export const UPGRADE_CHANCE = [100, 95, 90, 80, 70, 60, 50, 40, 30];

export const QUESTS = [
  { title: 'Caccia ai Lupi', kind: 'lupo', need: 10, xp: 400, gold: 300, item: ['rossa', 10], text: 'I lupi assaltano le carovane che portano le merci al villaggio. Uccidine 10 nei prati fuori dalle mura.' },
  { title: 'Il Branco Alfa', kind: 'lupoAlfa', need: 8, xp: 1500, gold: 800, item: ['blu', 10], text: 'Più a valle si aggirano i Lupi Alfa, guide del branco. Sconfiggine 8.' },
  { title: 'Cinghiali Furiosi', kind: 'cinghiale', need: 10, xp: 4000, gold: 1500, item: ['frammento', 4], text: 'I cinghiali selvatici stanno distruggendo i campi. Abbattine 10.' },
  { title: 'Le Pietre dello Spirito', kind: 'stone', need: 3, xp: 7000, gold: 3000, item: ['pergamena', 2], text: 'Dal cielo sono cadute Pietre maledette che corrompono le bestie. Distruggine 3.' },
  { title: "L'Orda degli Orchi", kind: 'orco', need: 12, xp: 14000, gold: 5000, item: ['frammento', 6], text: 'Gli orchi si radunano ai piedi delle montagne. Uccidi 12 Guerrieri Orco.' },
  { title: 'Il Capo Orco', kind: 'capoOrco', need: 1, xp: 40000, gold: 20000, item: ['frammento', 10], text: 'Il loro capo, Gruk, attende tra le rocce a nord. Ponete fine al suo dominio.' },
];

export function xpNeed(level) {
  return Math.floor(80 * Math.pow(level, 1.75));
}
