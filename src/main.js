import * as THREE from 'three';
import {
  buildWorld, heightAt, terrainBlocked, glowTexture, mulberry32, HALF, WATER_LEVEL,
  ROAD_ANGLES, VILLAGE_WALL_R,
} from './world.js';
import {
  makeHumanoid, makeWolf, makeBoar, makeSpiritStone, animateHumanoid, animateQuad, animateStone, setWeaponGlow,
} from './models.js';
import { KINGDOMS, CLASSES, MOBS, STONE_TIERS, ITEMS, UPGRADE_CHANCE, QUESTS, xpNeed } from './data.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'regniDiGiada.save.v1';
const rand = (a, b) => a + Math.random() * (b - a);
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------------------
// Renderer, scena, luci
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9dccb, 70, 300);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);

scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x5a6b3a, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
const SUN_OFFSET = new THREE.Vector3(60, 110, 40);

const GLOW = glowTexture();

// ---------------------------------------------------------------------------
// Stato di gioco
// ---------------------------------------------------------------------------
const G = {
  started: false, time: 0, world: null, mobs: [], stones: [], npcs: [], drops: [], projectiles: [], effects: [], floaters: [],
  pickables: [], target: null, hover: null, saveTimer: 0,
};
let P = null; // giocatore

const cam = { yaw: 0.6, pitch: 0.55, dist: 14, dragging: false, lx: 0, ly: 0 };
const keys = {};

// ---------------------------------------------------------------------------
// Schermata iniziale
// ---------------------------------------------------------------------------
const choice = { kingdom: 0, cls: 'guerriero' };

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSave() {
  if (!P) return;
  const data = {
    name: P.name, cls: P.clsId, kingdom: P.kingdom, level: P.level, xp: P.xp, gold: P.gold,
    statPts: P.statPts, vit: P.vit, int: P.int, str: P.str, dex: P.dex, inv: P.inv,
    weaponPlus: P.weaponPlus, quest: P.quest,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage non disponibile */ }
}

function buildStartScreen() {
  const kWrap = $('kingdoms');
  KINGDOMS.forEach((k, i) => {
    const el = document.createElement('div');
    el.className = 'choice kingdom' + (i === choice.kingdom ? ' sel' : '');
    el.style.setProperty('--kc', k.css);
    el.innerHTML = `<div class="emblem"></div><div class="cname">${k.name}</div><div class="cdesc">${k.motto}</div>`;
    el.onclick = () => {
      choice.kingdom = i;
      [...kWrap.children].forEach((c, j) => c.classList.toggle('sel', j === i));
    };
    kWrap.appendChild(el);
  });
  const cWrap = $('classes');
  Object.entries(CLASSES).forEach(([id, c]) => {
    const el = document.createElement('div');
    el.className = 'choice cls' + (id === choice.cls ? ' sel' : '');
    el.innerHTML = `<div class="cicon">${c.icon}</div><div class="cname">${c.name}</div><div class="cdesc">${c.desc}</div>`;
    el.onclick = () => {
      choice.cls = id;
      [...cWrap.children].forEach((ch) => ch.classList.toggle('sel', ch === el));
    };
    cWrap.appendChild(el);
  });
  const save = loadSave();
  if (save) {
    $('continue').classList.remove('hidden');
    $('continue').textContent = `Continua: ${save.name} — ${CLASSES[save.cls].name} Lv.${save.level}`;
    $('continue').onclick = () => startGame(save);
  }
  $('enter').onclick = () => {
    const name = ($('pname-input').value || '').trim().slice(0, 16) || 'Viandante';
    startGame({ name, cls: choice.cls, kingdom: choice.kingdom });
  };
}

// ---------------------------------------------------------------------------
// Giocatore
// ---------------------------------------------------------------------------
function createPlayer(save) {
  const cls = CLASSES[save.cls];
  const kingdom = KINGDOMS[save.kingdom ?? 0];
  const model = makeHumanoid({
    armor: cls.armor, accent: cls.accent, cloth: cls.cloth, hair: cls.hair, weapon: cls.weapon,
    cape: kingdom.color, robe: !!cls.robe, helmet: save.cls === 'guerriero',
  });
  scene.add(model.root);
  const p = {
    name: save.name, clsId: save.cls, cls, kingdom: save.kingdom ?? 0,
    level: save.level ?? 1, xp: save.xp ?? 0, gold: save.gold ?? 150,
    statPts: save.statPts ?? 0, vit: save.vit ?? 0, int: save.int ?? 0, str: save.str ?? 0, dex: save.dex ?? 0,
    inv: Object.assign({ rossa: 5, blu: 3, frammento: 0, pergamena: 0 }, save.inv || {}),
    weaponPlus: save.weaponPlus ?? 0,
    quest: save.quest ?? { idx: 0, count: 0, accepted: false },
    pos: new THREE.Vector3(0, 0, 8), rotY: Math.PI, model, moveTarget: null, attackMode: false,
    atkCd: 0, animAtk: 0, dead: false, buffs: {}, skillCd: [0, 0, 0, 0], lastCombat: -99, dash: null, moving: 0,
    radius: 0.5, pendingHit: null,
  };
  p.hp = maxHp(p);
  p.mp = maxMp(p);
  setWeaponGlow(model, p.weaponPlus);
  return p;
}

function maxHp(p = P) { return Math.round(p.cls.hp + (p.level - 1) * p.cls.hpL + p.vit * 14); }
function maxMp(p = P) { return Math.round(p.cls.mp + (p.level - 1) * p.cls.mpL + p.int * 8); }
function buffActive(name) { return P.buffs[name] && P.buffs[name].until > G.time; }
function buffValue(name) { return buffActive(name) ? P.buffs[name].value : 0; }
function playerAtk() {
  const main = P.cls.magic ? P.int : P.str;
  const base = P.cls.atk + P.level * 2.4 + main * 2.2 + P.weaponPlus * (4 + P.level * 0.3);
  return base * (1 + buffValue('atk') + buffValue('both'));
}
function playerDef() {
  return (P.cls.def + P.level * 1.2 + P.dex * 0.6 + P.vit * 0.4) * (1 + buffValue('def') + buffValue('both'));
}
function playerCrit() { return 0.05 + (P.cls.critBonus || 0) + P.dex * 0.004; }
function playerSpeed() { return P.cls.speed * (1 + buffValue('haste')); }
function playerAtkInterval() { return P.cls.atkSpeed / (1 + buffValue('haste')); }

// ---------------------------------------------------------------------------
// Collisioni
// ---------------------------------------------------------------------------
function wallBlocked(x, z) {
  const d = Math.hypot(x, z);
  if (Math.abs(d - VILLAGE_WALL_R) > 1.3) return false;
  const a = Math.atan2(z, x);
  for (const g of ROAD_ANGLES) {
    if (Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.05) return false;
  }
  return true;
}
function blocked(x, z, r = 0.5) {
  if (terrainBlocked(x, z) || wallBlocked(x, z)) return true;
  for (const c of G.world.colliders) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true;
  }
  for (const s of G.stones) {
    if (s.dead) continue;
    const dx = x - s.pos.x, dz = z - s.pos.z;
    if (dx * dx + dz * dz < (1.8 + r) * (1.8 + r)) return true;
  }
  return false;
}
function tryMove(ent, dx, dz, r = 0.5) {
  const nx = ent.pos.x + dx, nz = ent.pos.z + dz;
  if (!blocked(nx, nz, r)) { ent.pos.x = nx; ent.pos.z = nz; return true; }
  if (!blocked(nx, ent.pos.z, r)) { ent.pos.x = nx; return true; }
  if (!blocked(ent.pos.x, nz, r)) { ent.pos.z = nz; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Mostri e Pietre dello Spirito
// ---------------------------------------------------------------------------
function buildMobModel(def) {
  if (def.model === 'wolf') return makeWolf(def.color, def.scale, def.eye);
  if (def.model === 'boar') return makeBoar(def.color, def.scale);
  return makeHumanoid({
    skin: def.color, armor: 0x4a3b2a, accent: def.boss ? 0x8a1a1a : 0x6a6a6a, cloth: 0x2a2018,
    weapon: 'axe', helmet: true, scale: def.scale,
  });
}

function spawnMob(kind, x, z, level) {
  const def = MOBS[kind];
  const lvl = level ?? def.lvl + Math.floor(Math.random() * 3);
  const k = 1 + (lvl - def.lvl) * 0.12;
  const model = buildMobModel(def);
  scene.add(model.root);
  const m = {
    type: 'mob', kind, def, name: def.name, level: lvl, maxHp: Math.round(def.hp * k), atk: def.atk * k, defense: def.def * k,
    xp: Math.round(def.xp * k), speed: def.speed, pos: new THREE.Vector3(x, heightAt(x, z), z), home: new THREE.Vector3(x, 0, z),
    rotY: Math.random() * Math.PI * 2, state: 'idle', wanderT: rand(1, 6), wanderTo: null, atkCd: 0, animAtk: 0, model,
    radius: 0.7 * def.scale, dead: false, deathT: 0, respawn: true, pendingHit: 0, moving: 0, pop: 0,
  };
  m.hp = m.maxHp;
  model.root.userData.entity = m;
  G.mobs.push(m);
  G.pickables.push(model.root);
  return m;
}

function randomSpotInRing(rnd, r0, r1) {
  for (let t = 0; t < 200; t++) {
    const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!blocked(x, z, 1) && heightAt(x, z) > WATER_LEVEL + 0.3 && heightAt(x, z) < 20) return [x, z];
  }
  return [r0, 0];
}

function populate() {
  const rnd = mulberry32(42);
  for (const [kind, def] of Object.entries(MOBS)) {
    if (!def.zone) continue;
    // i mostri vivono in piccoli branchi
    let left = def.count;
    while (left > 0) {
      const [cx, cz] = randomSpotInRing(rnd, def.zone[0], def.zone[1]);
      const n = Math.min(left, 2 + Math.floor(rnd() * 3));
      for (let i = 0; i < n; i++) {
        const x = cx + (rnd() - 0.5) * 8, z = cz + (rnd() - 0.5) * 8;
        if (blocked(x, z, 1)) continue;
        spawnMob(kind, x, z);
      }
      left -= n;
    }
  }
  // Capo Orco a nord, tra le rocce
  let bx = 0, bz = -185;
  search: for (let r = 196; r > 150; r -= 3) {
    for (let da = 0; da < 1.2; da += 0.1) {
      for (const s of [1, -1]) {
        const a = Math.PI * 1.5 + da * s;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!blocked(x, z, 2) && heightAt(x, z) < 20 && heightAt(x, z) > WATER_LEVEL + 0.5) { bx = x; bz = z; break search; }
      }
    }
  }
  const boss = spawnMob('capoOrco', bx, bz, 20);
  boss.respawnDelay = 120;
  for (let i = 0; i < 3; i++) spawnMob('orco', bx + rand(-6, 6), bz + rand(-6, 6), 16);

  STONE_TIERS.forEach((tier, ti) => {
    for (let i = 0; i < 3; i++) {
      const [x, z] = randomSpotInRing(rnd, tier.r - 8, tier.r + 8);
      spawnStone(ti, x, z);
    }
  });
}

function spawnStone(tierIdx, x, z) {
  const tier = STONE_TIERS[tierIdx];
  const model = makeSpiritStone(tier.glow, GLOW);
  model.root.position.set(x, heightAt(x, z) - 0.3, z);
  scene.add(model.root);
  const s = {
    type: 'stone', tier: tierIdx, name: tier.name, level: tier.lvl, maxHp: tier.hp, hp: tier.hp, defense: tier.def,
    xp: tier.xp, pos: new THREE.Vector3(x, heightAt(x, z), z), model, radius: 1.8, dead: false, deathT: 0,
    waves: [0.8, 0.6, 0.4, 0.2], spawned: [],
  };
  model.root.userData.entity = s;
  G.stones.push(s);
  G.pickables.push(model.root);
  return s;
}

function zoneKindAt(r) {
  if (r < 100) return 'lupo';
  if (r < 135) return 'lupoAlfa';
  if (r < 165) return 'cinghiale';
  return 'orco';
}

// ---------------------------------------------------------------------------
// PNG del villaggio
// ---------------------------------------------------------------------------
function spawnNPCs() {
  const k = KINGDOMS[P.kingdom];
  const defs = [
    { id: 'guardiano', name: 'Capitano Wen', title: 'Guardiano', opts: { armor: 0x4a4f58, accent: k.color, weapon: 'spear', helmet: true, cape: k.color } },
    { id: 'mercante', name: 'Mercante Lian', title: 'Mercante', opts: { armor: 0x6a4a2a, accent: 0xc9a24a, cloth: 0x3a2a1a, hat: 'straw', robe: true } },
    { id: 'fabbro', name: 'Fabbro Tieh', title: 'Fabbro', opts: { armor: 0x5a3a2a, accent: 0x333333, cloth: 0x2a2a2a, skin: 0xc89870, beard: true } },
  ];
  for (const d of defs) {
    const [x, z] = G.world.npcSpots[d.id];
    const model = makeHumanoid(d.opts);
    model.root.position.set(x, heightAt(x, z), z);
    model.root.rotation.y = Math.atan2(-x, -z);
    scene.add(model.root);
    const n = { type: 'npc', id: d.id, name: d.name, title: d.title, pos: new THREE.Vector3(x, heightAt(x, z), z), model, radius: 0.6 };
    model.root.userData.entity = n;
    G.npcs.push(n);
    G.pickables.push(model.root);
    G.world.colliders.push({ x, z, r: 0.6 });
  }
}

// ---------------------------------------------------------------------------
// Effetti visivi
// ---------------------------------------------------------------------------
function fxMat(color, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}
const ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
const arcGeo = new THREE.RingGeometry(1.2, 2.2, 24, 1, -Math.PI * 0.35, Math.PI * 0.7).rotateX(-Math.PI / 2);

function addEffect(mesh, dur, update) {
  scene.add(mesh);
  G.effects.push({ mesh, t: 0, dur, update });
}
function fxRing(pos, color, radius, dur = 0.6) {
  const m = new THREE.Mesh(ringGeo, fxMat(color));
  m.position.set(pos.x, pos.y + 0.2, pos.z);
  addEffect(m, dur, (e, p) => { m.scale.setScalar(0.3 + p * radius); m.material.opacity = 0.9 * (1 - p); });
}
function fxPillar(pos, color, height = 12, dur = 1.4, radius = 1.4) {
  const m = new THREE.Mesh(pillarGeo, fxMat(color, 0.6));
  m.position.copy(pos);
  addEffect(m, dur, (e, p) => {
    m.scale.set(radius * (1 - p * 0.5), height * Math.min(1, p * 4), radius * (1 - p * 0.5));
    m.material.opacity = 0.6 * (1 - p);
  });
}
function fxSlash(pos, rotY, color = 0xffffff) {
  const m = new THREE.Mesh(arcGeo, fxMat(color, 0.8));
  m.position.set(pos.x, pos.y + 1.3, pos.z);
  m.rotation.y = rotY - Math.PI / 2;
  addEffect(m, 0.25, (e, p) => { m.material.opacity = 0.8 * (1 - p); m.rotation.y += 0.15; m.scale.setScalar(1 + p * 0.3); });
}
function fxBurst(pos, color, n = 10, spread = 3) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(pos.x, pos.y + 1.2, pos.z);
    const v = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.5), rand(-1, 1)).multiplyScalar(spread);
    addEffect(s, 0.7, (e, p, dt) => {
      s.position.addScaledVector(v, dt);
      v.y -= 6 * dt;
      s.scale.setScalar(0.9 * (1 - p) + 0.2);
      s.material.opacity = 1 - p;
    });
  }
}
function fxMeteor(pos, color, delay) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const from = new THREE.Vector3(pos.x + rand(-4, 4), pos.y + 22, pos.z + rand(-4, 4));
  const to = new THREE.Vector3(pos.x + rand(-3, 3), pos.y, pos.z + rand(-3, 3));
  s.scale.setScalar(2.2);
  s.visible = false;
  addEffect(s, 0.45 + delay, (e, p) => {
    const tt = (e.t - delay) / 0.45;
    if (tt < 0) return;
    s.visible = true;
    s.position.lerpVectors(from, to, Math.min(1, tt));
    if (tt >= 0.98 && !e.boom) { e.boom = true; fxRing(to, color, 3, 0.4); }
  });
}

// aura dei buff sotto i piedi del giocatore
const auraMesh = new THREE.Mesh(ringGeo, fxMat(0xffffff, 0.5));
auraMesh.visible = false;
scene.add(auraMesh);

// anello di selezione del bersaglio e marcatore di destinazione
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.9, depthWrite: false }));
selRing.visible = false;
scene.add(selRing);

// ---------------------------------------------------------------------------
// Testi fluttuanti e targhette con il nome
// ---------------------------------------------------------------------------
const labelsEl = $('labels');
const tmpV = new THREE.Vector3();
function toScreen(v) {
  tmpV.copy(v).project(camera);
  if (tmpV.z > 1) return null;
  return [(tmpV.x + 1) / 2 * window.innerWidth, (1 - tmpV.y) / 2 * window.innerHeight];
}

function floater(pos, text, cls) {
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  labelsEl.appendChild(el);
  G.floaters.push({ el, pos: pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 2.4, rand(-0.4, 0.4))), t: 0 });
}

const plates = new Map();
function plateFor(ent) {
  let el = plates.get(ent);
  if (!el) {
    el = document.createElement('div');
    el.className = 'plate';
    el.innerHTML = '<div class="pname"></div><div class="phpbar"><div></div></div>';
    labelsEl.appendChild(el);
    plates.set(ent, el);
  }
  return el;
}
function levelColor(lvl) {
  const d = lvl - P.level;
  if (d >= 5) return '#ff4a3a';
  if (d >= 2) return '#ffa53a';
  if (d >= -2) return '#ffffff';
  if (d >= -6) return '#7aff6a';
  return '#9a9a9a';
}

function updateLabels(dt) {
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i];
    f.t += dt;
    f.pos.y += dt * 1.6;
    const s = toScreen(f.pos);
    if (!s || f.t > 1.1) {
      if (f.t > 1.1) { f.el.remove(); G.floaters.splice(i, 1); continue; }
      f.el.style.display = 'none';
      continue;
    }
    f.el.style.display = '';
    f.el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.3 - f.t)})`;
    f.el.style.opacity = String(Math.min(1, 2.2 - f.t * 2));
  }

  const shown = new Set();
  const show = (ent, text, color, height, hpFrac) => {
    const el = plateFor(ent);
    tmpV.set(ent.pos.x, ent.pos.y + height, ent.pos.z);
    const s = toScreen(tmpV);
    if (!s) return;
    shown.add(ent);
    const nameEl = el.firstChild;
    if (nameEl.textContent !== text) nameEl.textContent = text;
    nameEl.style.color = color;
    const bar = el.lastChild;
    if (hpFrac !== null && hpFrac < 1) {
      bar.style.display = '';
      bar.firstChild.style.width = (hpFrac * 100).toFixed(1) + '%';
    } else bar.style.display = 'none';
    el.style.display = '';
    el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%, -100%)`;
  };
  if (P && !P.dead) show(P, P.name, KINGDOMS[P.kingdom].css, 2.7, null);
  for (const m of G.mobs) {
    if (m.dead || distXZ(m.pos, P.pos) > 40) continue;
    show(m, `Lv.${m.level} ${m.name}`, m.def.boss ? '#ff7aff' : levelColor(m.level), 2.4 * m.def.scale + 0.2, m.hp / m.maxHp);
  }
  for (const s of G.stones) {
    if (s.dead || distXZ(s.pos, P.pos) > 60) continue;
    show(s, `Lv.${s.level} ${s.name}`, '#d8a8ff', 7.4, s.hp / s.maxHp);
  }
  for (const n of G.npcs) {
    if (distXZ(n.pos, P.pos) > 40) continue;
    const mark = n.id === 'guardiano' && questMarker() ? questMarker() + ' ' : '';
    show(n, `${mark}${n.title} · ${n.name}`, '#ffe27a', 2.75, null);
  }
  for (const d of G.drops) {
    if (distXZ(d.pos, P.pos) > 30) continue;
    show(d, d.label, d.color, 0.9, null);
  }
  for (const [ent, el] of plates) {
    if (!shown.has(ent)) {
      if (ent.dead || ent.removed) { el.remove(); plates.delete(ent); } else el.style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// Messaggi in chat
// ---------------------------------------------------------------------------
function chat(text, cls = '') {
  const log = $('chatlog');
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.textContent = text;
  log.appendChild(el);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function notice(text) {
  const el = $('notice');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ---------------------------------------------------------------------------
// Combattimento
// ---------------------------------------------------------------------------
function rollDamage(atk, mult, def, critChance) {
  const crit = Math.random() < critChance;
  let dmg = atk * mult * rand(0.9, 1.1) - def * 0.6;
  dmg = Math.max(1, dmg) * (crit ? 2 : 1);
  return { dmg: Math.round(dmg), crit };
}

function hitEnemy(e, mult, color = 0xffffff) {
  if (!e || e.dead) return;
  const { dmg, crit } = rollDamage(playerAtk(), mult, e.defense, playerCrit());
  e.hp -= dmg;
  e.pop = 0.15;
  floater(e.pos, crit ? `${dmg}!` : String(dmg), crit ? 'crit' : 'dmg');
  fxBurst(e.pos, color, crit ? 8 : 4, 2.5);
  P.lastCombat = G.time;
  if (e.type === 'mob') {
    if (e.state !== 'chase') e.state = 'chase';
    // allerta il branco
    for (const o of G.mobs) if (!o.dead && o !== e && o.kind === e.kind && distXZ(o.pos, e.pos) < 9) o.state = 'chase';
  } else if (e.type === 'stone') {
    stoneWaves(e);
  }
  if (e.hp <= 0) killEnemy(e);
}

function stoneWaves(s) {
  const frac = s.hp / s.maxHp;
  while (s.waves.length && frac < s.waves[0]) {
    s.waves.shift();
    const kind = zoneKindAt(Math.hypot(s.pos.x, s.pos.z));
    const n = 3 + s.tier;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = s.pos.x + Math.cos(a) * 4.5, z = s.pos.z + Math.sin(a) * 4.5;
      if (blocked(x, z, 0.8)) continue;
      const m = spawnMob(kind, x, z, s.level + Math.floor(Math.random() * 2));
      m.respawn = false;
      m.state = 'chase';
      fxPillar(m.pos, STONE_TIERS[s.tier].glow, 5, 0.8, 1);
    }
    chat(`La ${s.name} evoca altre creature!`, 'warn');
  }
}

function killEnemy(e) {
  e.dead = true;
  e.hp = 0;
  e.deathT = 0;
  if (G.target === e) setTarget(null);
  const diff = P.level - e.level;
  const factor = Math.max(0.1, Math.min(1.4, 1 - diff * 0.08));
  const xp = Math.max(1, Math.round(e.xp * factor));
  gainXp(xp);
  const isStone = e.type === 'stone';
  const goldBase = isStone ? STONE_TIERS[e.tier].gold : e.def.gold;
  dropAt(e.pos, 'gold', Math.round(goldBase * rand(0.7, 1.3) * (1 + e.level * 0.05)));
  const roll = Math.random();
  if (isStone) {
    dropAt(e.pos, 'frammento', 2 + e.tier * 2);
    if (Math.random() < 0.5) dropAt(e.pos, 'pergamena', 1);
    dropAt(e.pos, 'rossa', 5);
    fxPillar(e.pos, STONE_TIERS[e.tier].glow, 25, 2, 3);
    fxRing(e.pos, STONE_TIERS[e.tier].glow, 12, 1.2);
    chat(`Hai distrutto la ${e.name}! +${xp} EXP`, 'good');
    notice(`${e.name} distrutta!`);
  } else {
    if (roll < 0.22) dropAt(e.pos, 'rossa', 1);
    else if (roll < 0.34) dropAt(e.pos, 'blu', 1);
    else if (roll < 0.34 + 0.03 + e.level * 0.003) dropAt(e.pos, 'frammento', 1);
    if (e.def.boss) { dropAt(e.pos, 'frammento', 8); dropAt(e.pos, 'pergamena', 3); notice(`${e.name} è stato sconfitto!`); }
    chat(`Hai sconfitto ${e.name}. +${xp} EXP`, 'sys');
  }
  // progresso missione
  const q = QUESTS[P.quest.idx];
  if (q && P.quest.accepted && P.quest.count < q.need) {
    if ((isStone && q.kind === 'stone') || (!isStone && e.kind === q.kind)) {
      P.quest.count++;
      if (P.quest.count >= q.need) { chat(`Missione completata: ${q.title}. Torna dal Capitano Wen.`, 'quest'); notice('Missione completata!'); }
      updateQuestTracker();
    }
  }
}

function gainXp(x) {
  P.xp += x;
  let leveled = false;
  while (P.xp >= xpNeed(P.level)) {
    P.xp -= xpNeed(P.level);
    P.level++;
    P.statPts += 3;
    leveled = true;
  }
  if (leveled) {
    P.hp = maxHp();
    P.mp = maxMp();
    fxPillar(P.pos, 0xffe27a, 16, 1.8, 1.6);
    fxRing(P.pos, 0xffe27a, 6, 1);
    notice(`Livello ${P.level}!`);
    chat(`Sei salito al livello ${P.level}! Hai 3 punti abilità da assegnare (C).`, 'good');
    const unlocked = P.cls.skills.find((s) => s.lvl === P.level);
    if (unlocked) chat(`Nuova abilità sbloccata: ${unlocked.name}`, 'quest');
    renderSkillbar();
    writeSave();
  }
}

function hurtPlayer(src, amount) {
  if (P.dead) return;
  const dmg = Math.max(1, Math.round(amount * rand(0.85, 1.15) - playerDef() * 0.5));
  P.hp -= dmg;
  P.lastCombat = G.time;
  floater(P.pos, String(dmg), 'hurt');
  $('hurtflash').classList.remove('on');
  void $('hurtflash').offsetWidth;
  $('hurtflash').classList.add('on');
  if (!G.target) setTarget(src);
  if (P.hp <= 0) playerDie();
}

function playerDie() {
  P.dead = true;
  P.hp = 0;
  P.attackMode = false;
  P.moveTarget = null;
  const lost = Math.floor(xpNeed(P.level) * 0.03);
  P.xp = Math.max(0, P.xp - lost);
  chat(`Sei stato sconfitto. Hai perso ${lost} EXP.`, 'warn');
  for (const m of G.mobs) if (m.state === 'chase') m.state = 'return';
  $('death').classList.remove('hidden');
  $('respawn').disabled = true;
  setTimeout(() => { $('respawn').disabled = false; }, 2500);
}

function respawn() {
  P.dead = false;
  P.hp = Math.round(maxHp() * 0.5);
  P.mp = Math.round(maxMp() * 0.5);
  P.pos.set(rand(-3, 3), 0, 8 + rand(-1, 1));
  P.model.root.rotation.set(0, 0, 0);
  $('death').classList.add('hidden');
  fxPillar(P.pos, 0xaaffcc, 10, 1.4);
}

// ---------------------------------------------------------------------------
// Bottino a terra
// ---------------------------------------------------------------------------
const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12);
const coinMat = new THREE.MeshPhongMaterial({ color: 0xffcc33, emissive: 0x553300, shininess: 100 });
const itemGeo = new THREE.OctahedronGeometry(0.28, 0);

function dropAt(pos, id, qty) {
  const x = pos.x + rand(-1.5, 1.5), z = pos.z + rand(-1.5, 1.5);
  let mesh, label, color;
  if (id === 'gold') {
    mesh = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(coinGeo, coinMat);
      c.position.set(rand(-0.2, 0.2), i * 0.1, rand(-0.2, 0.2));
      mesh.add(c);
    }
    label = `${qty} Monete`;
    color = '#ffd84a';
  } else {
    const it = ITEMS[id];
    mesh = new THREE.Mesh(itemGeo, new THREE.MeshLambertMaterial({ color: it.color, emissive: it.color, emissiveIntensity: 0.5 }));
    label = qty > 1 ? `${it.name} x${qty}` : it.name;
    color = it.color;
  }
  mesh.position.set(x, heightAt(x, z) + 0.3, z);
  scene.add(mesh);
  G.drops.push({ id, qty, mesh, pos: new THREE.Vector3(x, heightAt(x, z), z), label, color, t: 0 });
}

function updateDrops(dt) {
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i];
    d.t += dt;
    d.mesh.rotation.y += dt * 2;
    d.mesh.position.y = d.pos.y + 0.35 + Math.sin(d.t * 3) * 0.1;
    const near = !P.dead && distXZ(d.pos, P.pos) < 2.2 && d.t > 0.4;
    if (near || d.t > 90) {
      if (near) {
        if (d.id === 'gold') { P.gold += d.qty; chat(`+${d.qty} Monete`, 'gold'); }
        else { P.inv[d.id] = (P.inv[d.id] || 0) + d.qty; chat(`Hai ottenuto: ${d.label}`, 'item'); }
        if (!$('win-inv').classList.contains('hidden')) renderInventory();
      }
      scene.remove(d.mesh);
      d.removed = true;
      G.drops.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Proiettili
// ---------------------------------------------------------------------------
function launchProjectile(target, mult, color, size = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(1.4 * size);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.18 * size, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  s.add(core);
  const fwd = new THREE.Vector3(Math.sin(P.rotY), 0, Math.cos(P.rotY));
  s.position.copy(P.pos).addScaledVector(fwd, 0.8).add(new THREE.Vector3(0, 1.6, 0));
  scene.add(s);
  G.projectiles.push({ mesh: s, target, mult, color, speed: 26, t: 0 });
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.t += dt;
    const tp = pr.target.pos.clone().add(new THREE.Vector3(0, pr.target.type === 'stone' ? 3 : 1.1, 0));
    const dir = tp.sub(pr.mesh.position);
    const d = dir.length();
    if (pr.target.dead || pr.t > 3) {
      scene.remove(pr.mesh);
      G.projectiles.splice(i, 1);
      continue;
    }
    if (d < 0.8) {
      hitEnemy(pr.target, pr.mult, pr.color);
      fxRing(pr.target.pos, pr.color, 2.2, 0.35);
      scene.remove(pr.mesh);
      G.projectiles.splice(i, 1);
      continue;
    }
    pr.mesh.position.addScaledVector(dir.normalize(), Math.min(d, pr.speed * dt));
    // scia luminosa
    if (Math.random() < 0.6) {
      const tr = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: pr.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      tr.position.copy(pr.mesh.position);
      addEffect(tr, 0.3, (e, p) => { tr.scale.setScalar(0.9 * (1 - p)); tr.material.opacity = 0.7 * (1 - p); });
    }
  }
}

// ---------------------------------------------------------------------------
// Abilità
// ---------------------------------------------------------------------------
function enemiesNear(pos, r) {
  const out = [];
  for (const m of G.mobs) if (!m.dead && distXZ(m.pos, pos) < r + m.radius) out.push(m);
  for (const s of G.stones) if (!s.dead && distXZ(s.pos, pos) < r + s.radius) out.push(s);
  return out;
}
function hostileTarget() {
  return G.target && !G.target.dead && (G.target.type === 'mob' || G.target.type === 'stone') ? G.target : null;
}

function useSkill(i) {
  if (P.dead) return;
  const sk = P.cls.skills[i];
  if (!sk) return;
  if (P.level < sk.lvl) { chat(`${sk.name} si sblocca al livello ${sk.lvl}.`, 'warn'); return; }
  if (P.skillCd[i] > G.time) return;
  if (P.mp < sk.mp) { chat('PM insufficienti.', 'warn'); return; }
  const t = hostileTarget();
  const needsTarget = sk.type === 'dash' || sk.type === 'single' || sk.type === 'projectile';
  if (needsTarget && !t) { chat('Nessun bersaglio selezionato.', 'warn'); return; }
  const maxRange = sk.type === 'dash' ? 16 : sk.type === 'single' ? P.cls.range + 1.5 : sk.type === 'projectile' ? 20 : 999;
  if (needsTarget && distXZ(t.pos, P.pos) - t.radius > maxRange) { chat('Bersaglio troppo lontano.', 'warn'); return; }

  P.mp -= sk.mp;
  P.skillCd[i] = G.time + sk.cd;
  P.animAtk = 1;
  if (t) faceTowards(t.pos);

  switch (sk.type) {
    case 'aoe': {
      let center = P.pos;
      if (sk.atTarget) center = t ? t.pos : P.pos.clone().add(new THREE.Vector3(Math.sin(P.rotY) * 6, 0, Math.cos(P.rotY) * 6));
      fxRing(center, sk.color, sk.radius, 0.6);
      fxRing(center, sk.color, sk.radius * 0.6, 0.45);
      if (sk.atTarget) for (let k = 0; k < 6; k++) fxMeteor(center, sk.color, k * 0.08);
      else fxPillar(center, sk.color, 2.5, 0.5, sk.radius * 0.8);
      const hits = enemiesNear(center, sk.radius);
      setTimeout(() => hits.forEach((e) => hitEnemy(e, sk.mult, sk.color)), sk.atTarget ? 450 : 120);
      if (!t && hits[0]) setTarget(hits[0]);
      P.attackMode = !!hostileTarget();
      break;
    }
    case 'single':
      fxSlash(t.pos, P.rotY, sk.color);
      setTimeout(() => hitEnemy(t, sk.mult, sk.color), 150);
      P.attackMode = true;
      break;
    case 'dash': {
      const dir = new THREE.Vector3(t.pos.x - P.pos.x, 0, t.pos.z - P.pos.z);
      const len = dir.length();
      dir.normalize();
      const stop = Math.max(0, len - t.radius - 1.2);
      P.dash = { from: P.pos.clone(), to: P.pos.clone().addScaledVector(dir, stop), t: 0, target: t, sk };
      P.attackMode = true;
      break;
    }
    case 'projectile':
      launchProjectile(t, sk.mult, sk.color, sk.mult > 3.5 ? 1.5 : 1.1);
      P.attackMode = true;
      break;
    case 'buff':
      P.buffs[sk.buff] = { until: G.time + sk.dur, value: sk.value, color: sk.color };
      fxPillar(P.pos, sk.color, 6, 1, 1.3);
      chat(`${sk.name} attivato.`, 'good');
      break;
    case 'heal': {
      const amt = Math.round(maxHp() * sk.value);
      P.hp = Math.min(maxHp(), P.hp + amt);
      floater(P.pos, `+${amt}`, 'heal');
      fxPillar(P.pos, sk.color, 5, 1, 1.4);
      fxBurst(P.pos, sk.color, 12, 2);
      break;
    }
  }
}

function usePotion(id) {
  if (P.dead) return;
  if (!P.inv[id]) { chat(`Non hai ${ITEMS[id].name}.`, 'warn'); return; }
  if (id === 'rossa') {
    if (P.hp >= maxHp()) return;
    const a = Math.round(maxHp() * 0.4);
    P.hp = Math.min(maxHp(), P.hp + a);
    floater(P.pos, `+${a}`, 'heal');
  } else if (id === 'blu') {
    if (P.mp >= maxMp()) return;
    P.mp = Math.min(maxMp(), P.mp + Math.round(maxMp() * 0.4));
  } else return;
  P.inv[id]--;
  fxRing(P.pos, id === 'rossa' ? 0xff5a5a : 0x5a9aff, 2, 0.4);
  if (!$('win-inv').classList.contains('hidden')) renderInventory();
}

// ---------------------------------------------------------------------------
// Aggiornamento giocatore
// ---------------------------------------------------------------------------
function faceTowards(pos) {
  P.rotY = Math.atan2(pos.x - P.pos.x, pos.z - P.pos.z);
}

function updatePlayer(dt) {
  const m = P.model;
  P.atkCd -= dt;
  P.animAtk = Math.max(0, P.animAtk - dt * (2.6 / Math.min(1, playerAtkInterval())));
  let moved = 0;

  if (P.dead) {
    m.root.rotation.z = Math.min(Math.PI / 2, m.root.rotation.z + dt * 3);
    m.root.position.set(P.pos.x, heightAt(P.pos.x, P.pos.z) + 0.3, P.pos.z);
    return;
  }

  // rigenerazione
  const calm = G.time - P.lastCombat > 4;
  P.hp = Math.min(maxHp(), P.hp + maxHp() * (calm ? 0.025 : 0.002) * dt);
  P.mp = Math.min(maxMp(), P.mp + maxMp() * (calm ? 0.03 : 0.006) * dt);

  if (P.pendingHit) {
    P.pendingHit.t -= dt;
    if (P.pendingHit.t <= 0) {
      const ph = P.pendingHit;
      P.pendingHit = null;
      if (P.cls.magic) launchProjectile(ph.target, 1, P.clsId === 'mago' ? 0x8ac8ff : 0x7affc0, 0.8);
      else if (!ph.target.dead && distXZ(ph.target.pos, P.pos) - ph.target.radius < P.cls.range + 1) {
        fxSlash(P.pos, P.rotY, 0xffffff);
        hitEnemy(ph.target, 1, 0xffeeaa);
      }
    }
  }

  if (P.dash) {
    P.dash.t += dt / 0.22;
    const k = Math.min(1, P.dash.t);
    P.pos.lerpVectors(P.dash.from, P.dash.to, k);
    if (Math.random() < 0.8) fxBurst(P.pos, P.dash.sk.color, 1, 0.5);
    if (k >= 1) {
      fxRing(P.pos, P.dash.sk.color, 4, 0.45);
      fxSlash(P.pos, P.rotY, P.dash.sk.color);
      hitEnemy(P.dash.target, P.dash.sk.mult, P.dash.sk.color);
      P.dash = null;
    }
    moved = 1;
  } else {
    // movimento con WASD relativo alla telecamera
    let ix = 0, iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    const speed = playerSpeed();
    if (ix || iz) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      const rx = -fz, rz = fx;
      let dx = fx * iz + rx * ix, dz = fz * iz + rz * ix;
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      P.moveTarget = null;
      P.attackMode = false;
      P.rotY = Math.atan2(dx, dz);
      if (tryMove(P, dx * speed * dt, dz * speed * dt, P.radius)) moved = 1;
    } else {
      let goal = null, stopDist = 0.2;
      const t = hostileTarget();
      if (P.attackMode && t) {
        const range = P.cls.range + t.radius;
        if (distXZ(t.pos, P.pos) > range) { goal = t.pos; stopDist = range - 0.2; } else {
          faceTowards(t.pos);
          if (P.atkCd <= 0) {
            P.atkCd = playerAtkInterval();
            P.animAtk = 1;
            P.pendingHit = { t: 0.18 * playerAtkInterval(), target: t };
          }
        }
      } else if (G.target && G.target.type === 'npc') {
        if (distXZ(G.target.pos, P.pos) > 3) { goal = G.target.pos; stopDist = 2.8; } else if (P.talkPending) {
          P.talkPending = false;
          faceTowards(G.target.pos);
          openNpc(G.target);
        }
      } else if (P.moveTarget) {
        goal = P.moveTarget;
      }
      if (goal) {
        const dx = goal.x - P.pos.x, dz = goal.z - P.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > stopDist) {
          const step = Math.min(d - stopDist + 0.01, speed * dt);
          P.rotY = Math.atan2(dx, dz);
          if (tryMove(P, (dx / d) * step, (dz / d) * step, P.radius)) moved = 1;
          else if (goal === P.moveTarget) P.moveTarget = null;
        } else if (goal === P.moveTarget) P.moveTarget = null;
      }
    }
  }

  P.moving += ((moved ? 1 : 0) - P.moving) * Math.min(1, dt * 10);
  P.pos.y = heightAt(P.pos.x, P.pos.z);
  m.root.position.copy(P.pos);
  // rotazione morbida
  let dr = P.rotY - m.root.rotation.y;
  dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  m.root.rotation.y += dr * Math.min(1, dt * 14);
  animateHumanoid(m, G.time, P.moving, P.animAtk, dt);

  // aura dei buff
  const active = Object.values(P.buffs).filter((b) => b.until > G.time);
  auraMesh.visible = active.length > 0;
  if (auraMesh.visible) {
    auraMesh.material.color.setHex(active[0].color);
    auraMesh.position.set(P.pos.x, P.pos.y + 0.15, P.pos.z);
    auraMesh.scale.setScalar(1.3 + Math.sin(G.time * 5) * 0.1);
    auraMesh.rotation.y += dt;
  }
}

// ---------------------------------------------------------------------------
// IA dei mostri
// ---------------------------------------------------------------------------
function updateMob(m, dt) {
  const model = m.model;
  if (m.dead) {
    m.deathT += dt;
    if (m.deathT < 1) {
      model.root.rotation.z = Math.min(Math.PI / 2, m.deathT * 4);
      model.root.position.y = m.pos.y - m.deathT * 0.3;
    } else if (model.root.parent) {
      model.root.position.y -= dt * 1.2;
      if (m.deathT > 2.5) {
        scene.remove(model.root);
        G.pickables.splice(G.pickables.indexOf(model.root), 1);
      }
    }
    if (m.respawn && m.deathT > (m.respawnDelay ?? 18) && distXZ(m.home, P.pos) > 25) {
      const idx = G.mobs.indexOf(m);
      G.mobs.splice(idx, 1);
      const n = spawnMob(m.kind, m.home.x, m.home.z, m.def.boss ? m.level : undefined);
      n.respawnDelay = m.respawnDelay;
    } else if (!m.respawn && m.deathT > 3) {
      G.mobs.splice(G.mobs.indexOf(m), 1);
      m.removed = true;
    }
    return;
  }

  m.atkCd -= dt;
  m.animAtk = Math.max(0, m.animAtk - dt * 2.5);
  m.pop = Math.max(0, m.pop - dt);
  const dp = distXZ(m.pos, P.pos);
  const homeD = distXZ(m.pos, m.home);
  let moved = 0;

  if (!P.dead && m.state !== 'return' && m.def.aggro && dp < 11 && P.level <= m.level + 8) m.state = 'chase';
  if (P.dead && m.state === 'chase') m.state = 'return';

  const moveTo = (tx, tz, spd) => {
    const dx = tx - m.pos.x, dz = tz - m.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    m.rotY = Math.atan2(dx, dz);
    const st = Math.min(d, spd * dt);
    if (tryMove(m, (dx / d) * st, (dz / d) * st, m.radius * 0.6)) moved = 1;
  };

  switch (m.state) {
    case 'idle':
      m.wanderT -= dt;
      if (m.wanderT <= 0) {
        m.wanderTo = new THREE.Vector3(m.home.x + rand(-8, 8), 0, m.home.z + rand(-8, 8));
        m.state = 'wander';
      }
      break;
    case 'wander':
      moveTo(m.wanderTo.x, m.wanderTo.z, m.speed * 0.35);
      if (distXZ(m.pos, m.wanderTo) < 0.5 || !moved) { m.state = 'idle'; m.wanderT = rand(3, 8); }
      break;
    case 'chase': {
      if (homeD > 38) { m.state = 'return'; break; }
      const reach = 1.3 + m.radius + P.radius;
      if (dp > reach) moveTo(P.pos.x, P.pos.z, m.speed);
      else {
        m.rotY = Math.atan2(P.pos.x - m.pos.x, P.pos.z - m.pos.z);
        if (m.atkCd <= 0) {
          m.atkCd = m.def.boss ? 1.4 : 1.7;
          m.animAtk = 1;
          m.pendingHit = 0.3;
        }
      }
      break;
    }
    case 'return':
      moveTo(m.home.x, m.home.z, m.speed * 1.2);
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.3 * dt);
      if (homeD < 1 || !moved) { m.state = 'idle'; m.wanderT = rand(2, 5); m.hp = m.maxHp; }
      break;
  }

  if (m.pendingHit > 0) {
    m.pendingHit -= dt;
    if (m.pendingHit <= 0 && m.state === 'chase' && dp < 2.2 + m.radius + P.radius) {
      hurtPlayer(m, m.atk);
      if (m.def.boss && Math.random() < 0.3) {
        fxRing(m.pos, 0xff3a3a, 6, 0.5);
        if (dp < 6) hurtPlayer(m, m.atk * 0.6);
      }
    }
  }

  m.moving += (moved - m.moving) * Math.min(1, dt * 8);
  m.pos.y = heightAt(m.pos.x, m.pos.z);
  model.root.position.copy(m.pos);
  let dr = m.rotY - model.root.rotation.y;
  dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  model.root.rotation.y += dr * Math.min(1, dt * 8);
  const s = m.def.scale * (1 + m.pop * 0.6);
  model.root.scale.set(s, m.def.scale * (1 - m.pop * 0.5), s);
  if (dp < 90) {
    if (model.kind === 'quad') animateQuad(model, G.time + m.home.x, m.moving, m.animAtk);
    else animateHumanoid(model, G.time + m.home.x, m.moving, m.animAtk, dt);
  }
}

function updateStones(dt) {
  for (const s of G.stones) {
    if (s.dead) {
      s.deathT += dt;
      if (s.deathT < 1.5) {
        s.model.root.position.y = s.pos.y - 0.3 - s.deathT * 5;
        s.model.root.rotation.y += dt * 4;
      } else if (s.model.root.visible) s.model.root.visible = false;
      if (s.deathT > 75 && distXZ(s.pos, P.pos) > 30) {
        s.dead = false;
        s.hp = s.maxHp;
        s.waves = [0.8, 0.6, 0.4, 0.2];
        s.model.root.visible = true;
        s.model.root.position.y = s.pos.y - 0.3;
        fxPillar(s.pos, STONE_TIERS[s.tier].glow, 30, 2, 3);
      }
      continue;
    }
    if (distXZ(s.pos, P.pos) < 120) animateStone(s.model, G.time, s.hp / s.maxHp);
    s.model.root.position.x = s.pos.x + (s.pop > 0 ? rand(-0.08, 0.08) : 0);
    s.pop = Math.max(0, (s.pop || 0) - dt);
  }
}

// ---------------------------------------------------------------------------
// Bersaglio
// ---------------------------------------------------------------------------
function setTarget(e) {
  G.target = e;
  const tf = $('targetframe');
  if (!e) { tf.classList.add('hidden'); selRing.visible = false; return; }
  tf.classList.remove('hidden');
  selRing.visible = true;
  selRing.material.color.setHex(e.type === 'npc' ? 0xffe27a : 0xff3a3a);
  selRing.scale.setScalar(e.type === 'stone' ? 2.4 : e.radius * 1.4 + 0.3);
}

function targetNearest() {
  let best = null, bd = 18;
  for (const e of [...G.mobs, ...G.stones]) {
    if (e.dead || e === G.target) continue;
    const d = distXZ(e.pos, P.pos);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best && hostileTarget()) best = G.target;
  if (best) { setTarget(best); P.attackMode = true; P.moveTarget = null; }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function pickEntity(cx, cy) {
  mouse.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(G.pickables, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.entity) o = o.parent;
    if (o && !o.userData.entity.dead) return o.userData.entity;
  }
  return null;
}
function pickGround() {
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  let prev = 0;
  for (let t = 0.5; t < 400; t += 0.5) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < heightAt(x, z)) {
      let lo = prev, hi = t;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        if (o.y + d.y * mid < heightAt(o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid;
      }
      return new THREE.Vector3(o.x + d.x * hi, 0, o.z + d.z * hi);
    }
    prev = t;
  }
  return null;
}

function onLeftClick(e) {
  if (!G.started || P.dead) return;
  const ent = pickEntity(e.clientX, e.clientY);
  if (ent) {
    setTarget(ent);
    P.moveTarget = null;
    if (ent.type === 'npc') { P.attackMode = false; P.talkPending = true; } else P.attackMode = true;
    return;
  }
  const g = pickGround();
  if (g) {
    P.moveTarget = g;
    P.attackMode = false;
    P.talkPending = false;
    if (G.target && G.target.type === 'npc') setTarget(null);
    g.y = heightAt(g.x, g.z);
    fxRing(g, 0x9affc0, 1.2, 0.5);
  }
}

const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let downInfo = null;
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2 || e.button === 1) { cam.dragging = true; cam.lx = e.clientX; cam.ly = e.clientY; }
  if (e.button === 0) downInfo = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2 || e.button === 1) cam.dragging = false;
  if (e.button === 0 && downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) < 6 && e.target === canvas) onLeftClick(e);
  downInfo = null;
});
window.addEventListener('mousemove', (e) => {
  if (cam.dragging) {
    cam.yaw -= (e.clientX - cam.lx) * 0.006;
    cam.pitch = Math.max(0.08, Math.min(1.35, cam.pitch + (e.clientY - cam.ly) * 0.005));
    cam.lx = e.clientX; cam.ly = e.clientY;
  } else if (G.started && e.target === canvas) {
    const h = pickEntity(e.clientX, e.clientY);
    canvas.style.cursor = h ? (h.type === 'npc' ? 'help' : 'crosshair') : 'default';
  }
});
canvas.addEventListener('wheel', (e) => {
  cam.dist = Math.max(5, Math.min(32, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  e.preventDefault();
}, { passive: false });

// controlli touch: un dito tocca/trascina la visuale
let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, moved: false };
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!touchStart) return;
  const t = e.touches[0];
  if (Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 10) touchStart.moved = true;
  cam.yaw -= (t.clientX - touchStart.lx) * 0.006;
  cam.pitch = Math.max(0.08, Math.min(1.35, cam.pitch + (t.clientY - touchStart.ly) * 0.005));
  touchStart.lx = t.clientX; touchStart.ly = t.clientY;
}, { passive: true });
canvas.addEventListener('touchend', () => {
  if (touchStart && !touchStart.moved) onLeftClick({ clientX: touchStart.x, clientY: touchStart.y });
  touchStart = null;
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (!G.started) return;
  if (e.code === 'Space') { e.preventDefault(); if (!P.dead) targetNearest(); }
  if (e.code === 'Tab') { e.preventDefault(); targetNearest(); }
  if (e.code === 'Escape') { closeAllWindows(); setTarget(null); P.attackMode = false; }
  if (e.code === 'KeyI') toggleWin('win-inv');
  if (e.code === 'KeyC') toggleWin('win-char');
  if (e.code === 'KeyH') toggleWin('win-help');
  const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
  if (n !== undefined) useSkill(n);
  if (e.code === 'Digit5') usePotion('rossa');
  if (e.code === 'Digit6') usePotion('blu');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------------------------------------------------------------------------
// Interfaccia
// ---------------------------------------------------------------------------
function renderSkillbar() {
  const wrap = $('slots');
  wrap.innerHTML = '';
  P.cls.skills.forEach((sk, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (P.level < sk.lvl ? ' locked' : '');
    el.title = `${sk.name} (${sk.mp} PM, ${sk.cd}s)\n${sk.desc}${P.level < sk.lvl ? `\nSblocco al livello ${sk.lvl}` : ''}`;
    el.innerHTML = `<span class="ico">${sk.icon}</span><span class="key">${i + 1}</span><div class="cd"></div>${P.level < sk.lvl ? `<span class="lock">Lv${sk.lvl}</span>` : ''}`;
    el.onclick = () => useSkill(i);
    wrap.appendChild(el);
  });
  for (const [k, id] of [[5, 'rossa'], [6, 'blu']]) {
    const el = document.createElement('div');
    el.className = 'slot potion';
    el.title = ITEMS[id].name + ' — ' + ITEMS[id].desc;
    el.innerHTML = `<span class="ico">${ITEMS[id].icon}</span><span class="key">${k}</span><span class="qty" id="qty-${id}"></span>`;
    el.onclick = () => usePotion(id);
    wrap.appendChild(el);
  }
}

function zoneName() {
  const d = Math.hypot(P.pos.x, P.pos.z);
  if (d < VILLAGE_WALL_R) return `Villaggio di ${KINGDOMS[P.kingdom].short}`;
  if (d < 100) return 'Prati del Vento';
  if (d < 135) return 'Valle dei Lupi';
  if (d < 165) return 'Boschi Selvaggi';
  return 'Pendici degli Orchi';
}

const mmCanvas = $('minimap');
const mmCtx = mmCanvas.getContext('2d');
function drawMinimap() {
  const W = mmCanvas.width, view = 130, k = W / view;
  const src = G.world.minimapCanvas;
  const pxPerUnit = src.width / (HALF * 2);
  mmCtx.save();
  mmCtx.clearRect(0, 0, W, W);
  mmCtx.beginPath();
  mmCtx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
  mmCtx.clip();
  mmCtx.fillStyle = '#2a3a2a';
  mmCtx.fillRect(0, 0, W, W);
  mmCtx.imageSmoothingEnabled = true;
  mmCtx.drawImage(src, (P.pos.x - view / 2 + HALF) * pxPerUnit, (P.pos.z - view / 2 + HALF) * pxPerUnit, view * pxPerUnit, view * pxPerUnit, 0, 0, W, W);
  const dot = (x, z, color, r) => {
    const sx = (x - P.pos.x) * k + W / 2, sy = (z - P.pos.z) * k + W / 2;
    if (sx < 0 || sy < 0 || sx > W || sy > W) return;
    mmCtx.fillStyle = color;
    mmCtx.beginPath();
    mmCtx.arc(sx, sy, r, 0, Math.PI * 2);
    mmCtx.fill();
  };
  // mura del villaggio
  mmCtx.strokeStyle = 'rgba(80,70,60,0.9)';
  mmCtx.lineWidth = 2;
  mmCtx.beginPath();
  mmCtx.arc((0 - P.pos.x) * k + W / 2, (0 - P.pos.z) * k + W / 2, VILLAGE_WALL_R * k, 0, Math.PI * 2);
  mmCtx.stroke();
  for (const m of G.mobs) if (!m.dead) dot(m.pos.x, m.pos.z, m.def.boss ? '#ff4aff' : '#ff4a3a', m.def.boss ? 4 : 2);
  for (const s of G.stones) if (!s.dead) dot(s.pos.x, s.pos.z, '#c07aff', 4);
  for (const n of G.npcs) dot(n.pos.x, n.pos.z, '#ffe27a', 3);
  mmCtx.restore();
  mmCtx.save();
  mmCtx.translate(W / 2, W / 2);
  mmCtx.rotate(Math.PI - P.rotY);
  mmCtx.fillStyle = '#ffffff';
  mmCtx.strokeStyle = '#000';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(0, -7); mmCtx.lineTo(5, 5); mmCtx.lineTo(0, 2); mmCtx.lineTo(-5, 5);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.stroke();
  mmCtx.restore();
  // visuale della telecamera
  mmCtx.save();
  mmCtx.translate(W / 2, W / 2);
  mmCtx.strokeStyle = 'rgba(255,255,255,0.35)';
  mmCtx.beginPath();
  const ca = Math.atan2(-Math.cos(cam.yaw), -Math.sin(cam.yaw));
  mmCtx.moveTo(0, 0); mmCtx.arc(0, 0, 40, ca - 0.45, ca + 0.45); mmCtx.closePath();
  mmCtx.stroke();
  mmCtx.restore();
}

let hudTimer = 0;
function updateHUD(dt) {
  hudTimer += dt;
  const hp = Math.max(0, P.hp), mhp = maxHp(), mp = Math.max(0, P.mp), mmp = maxMp();
  $('hpfill').style.width = (hp / mhp * 100) + '%';
  $('mpfill').style.width = (mp / mmp * 100) + '%';
  $('hptext').textContent = `${Math.ceil(hp)} / ${mhp}`;
  $('mptext').textContent = `${Math.ceil(mp)} / ${mmp}`;
  const need = xpNeed(P.level);
  $('xpfill').style.width = (P.xp / need * 100) + '%';
  $('xptext').textContent = `EXP ${(P.xp / need * 100).toFixed(1)}%`;
  $('plevel').textContent = `Lv. ${P.level} ${P.cls.name}`;
  $('gold').textContent = `${P.gold.toLocaleString('it-IT')} Monete`;
  $('statpts').classList.toggle('hidden', P.statPts <= 0);

  P.cls.skills.forEach((sk, i) => {
    const slot = $('slots').children[i];
    if (!slot) return;
    const left = P.skillCd[i] - G.time;
    const cd = slot.querySelector('.cd');
    cd.style.height = left > 0 ? (left / sk.cd * 100) + '%' : '0%';
    cd.textContent = left > 0 ? Math.ceil(left) : '';
    slot.classList.toggle('nomp', P.mp < sk.mp && P.level >= sk.lvl);
  });
  for (const id of ['rossa', 'blu']) { const q = $('qty-' + id); if (q) q.textContent = P.inv[id] || 0; }

  const t = G.target;
  if (t) {
    if (t.dead || (t.type !== 'npc' && distXZ(t.pos, P.pos) > 70)) setTarget(null);
    else {
      $('tname').textContent = t.type === 'npc' ? `${t.title} · ${t.name}` : `Lv.${t.level} ${t.name}`;
      $('tname').style.color = t.type === 'npc' ? '#ffe27a' : (t.type === 'stone' ? '#d8a8ff' : levelColor(t.level));
      const hasHp = t.type !== 'npc';
      $('thpwrap').style.display = hasHp ? '' : 'none';
      if (hasHp) {
        $('thpfill').style.width = (t.hp / t.maxHp * 100) + '%';
        $('thptext').textContent = `${Math.max(0, Math.ceil(t.hp))} / ${t.maxHp}`;
      }
      selRing.position.set(t.pos.x, heightAt(t.pos.x, t.pos.z) + 0.15, t.pos.z);
      selRing.rotation.y += dt * 1.5;
    }
  }

  // buff attivi
  const bw = $('buffs');
  const html = Object.entries(P.buffs).filter(([, b]) => b.until > G.time)
    .map(([k, b]) => `<span class="buff" title="${k}">${({ atk: '🔥', def: '🛡️', haste: '🌪️', both: '✨' })[k]}<small>${Math.ceil(b.until - G.time)}</small></span>`).join('');
  if (bw.innerHTML !== html) bw.innerHTML = html;

  if (hudTimer > 0.15) {
    hudTimer = 0;
    drawMinimap();
    $('zonename').textContent = zoneName();
    $('coords').textContent = `${Math.round(P.pos.x + HALF)}, ${Math.round(P.pos.z + HALF)}`;
  }
}

function questMarker() {
  const q = QUESTS[P.quest.idx];
  if (!q) return '';
  if (!P.quest.accepted) return '❗';
  if (P.quest.count >= q.need) return '❓';
  return '';
}

function updateQuestTracker() {
  const q = QUESTS[P.quest.idx];
  const el = $('questtracker');
  if (!q) { el.innerHTML = '<div class="qt">Tutte le missioni completate!</div>'; return; }
  if (!P.quest.accepted) { el.innerHTML = `<div class="qt">❗ Parla con il Capitano Wen</div><div class="qd">al centro del villaggio</div>`; return; }
  const done = P.quest.count >= q.need;
  el.innerHTML = `<div class="qt">${q.title}</div><div class="qd ${done ? 'ok' : ''}">${done ? 'Torna dal Capitano Wen' : `${q.kind === 'stone' ? 'Pietre distrutte' : MOBS[q.kind].name}: ${P.quest.count} / ${q.need}`}</div>`;
}

// --- finestre --------------------------------------------------------------
function toggleWin(id) {
  const w = $(id);
  const open = w.classList.contains('hidden');
  w.classList.toggle('hidden', !open);
  if (open) {
    if (id === 'win-inv') renderInventory();
    if (id === 'win-char') renderChar();
  }
}
function closeAllWindows() {
  for (const w of document.querySelectorAll('.window')) w.classList.add('hidden');
}
document.querySelectorAll('.window .close').forEach((b) => { b.onclick = () => b.closest('.window').classList.add('hidden'); });
document.querySelectorAll('[data-win]').forEach((b) => { b.onclick = () => toggleWin(b.dataset.win); });

function renderInventory() {
  const grid = $('invgrid');
  grid.innerHTML = '';
  const cells = 45;
  const items = Object.entries(P.inv).filter(([, q]) => q > 0);
  for (let i = 0; i < cells; i++) {
    const c = document.createElement('div');
    c.className = 'cell';
    const it = items[i];
    if (it) {
      const def = ITEMS[it[0]];
      c.innerHTML = `<span class="ico">${def.icon}</span><span class="qty">${it[1]}</span>`;
      c.title = `${def.name}\n${def.desc}`;
      if (it[0] === 'rossa' || it[0] === 'blu') c.onclick = () => usePotion(it[0]);
    }
    grid.appendChild(c);
  }
  const wname = { sword: 'Spada', dagger: 'Pugnali Gemelli', staff: 'Bastone Arcano', fan: 'Ventaglio Celeste' }[P.cls.weapon];
  $('equip').innerHTML = `<div class="eqslot"><span class="ico">${P.cls.icon}</span></div><div><div class="wname plus${P.weaponPlus}">${wname} +${P.weaponPlus}</div><div class="wdesc">Attacco: ${Math.round(playerAtk())}</div></div>`;
  $('invgold').textContent = `${P.gold.toLocaleString('it-IT')} Monete`;
}

function renderChar() {
  const s = [
    ['Nome', P.name], ['Regno', KINGDOMS[P.kingdom].name], ['Classe', P.cls.name], ['Livello', P.level],
    ['EXP', `${P.xp} / ${xpNeed(P.level)}`], ['PV', `${Math.ceil(P.hp)} / ${maxHp()}`], ['PM', `${Math.ceil(P.mp)} / ${maxMp()}`],
    ['Attacco', Math.round(playerAtk())], ['Difesa', Math.round(playerDef())], ['Critico', `${(playerCrit() * 100).toFixed(1)}%`],
  ];
  $('charstats').innerHTML = s.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  const stats = [['vit', 'VIT', 'Vitalità: +PV'], ['int', 'INT', 'Intelligenza: +PM, +danno magico'], ['str', 'FOR', 'Forza: +danno fisico'], ['dex', 'DES', 'Destrezza: +critico, +difesa']];
  $('charpoints').innerHTML = `<div class="ptsleft">Punti da assegnare: <b>${P.statPts}</b></div>` + stats.map(([k, label, tip]) =>
    `<div class="row stat" title="${tip}"><span>${label}</span><b>${P[k]}</b><button data-stat="${k}" ${P.statPts <= 0 ? 'disabled' : ''}>+</button></div>`).join('');
  $('charpoints').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      if (P.statPts <= 0) return;
      P.statPts--;
      P[b.dataset.stat]++;
      renderChar();
      writeSave();
    };
  });
}

// --- dialoghi con i PNG ------------------------------------------------------
function dialog(title, html, buttons) {
  $('dtitle').textContent = title;
  $('dbody').innerHTML = html;
  const bw = $('dbuttons');
  bw.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.disabled) el.disabled = true;
    el.onclick = () => { if (b.fn) b.fn(); else $('win-dialog').classList.add('hidden'); };
    bw.appendChild(el);
  }
  $('win-dialog').classList.remove('hidden');
}

function openNpc(n) {
  if (n.id === 'guardiano') openGuardian();
  else if (n.id === 'mercante') openShop();
  else if (n.id === 'fabbro') openSmith();
}

function openGuardian() {
  const q = QUESTS[P.quest.idx];
  const close = { label: 'Arrivederci' };
  if (!q) { dialog('Capitano Wen', `<p>Hai riportato la pace nel ${KINGDOMS[P.kingdom].name}. Il tuo nome sarà cantato per generazioni.</p>`, [close]); return; }
  const reward = `<div class="reward">Ricompensa: ${q.xp} EXP · ${q.gold} Monete${q.item ? ` · ${ITEMS[q.item[0]].name} x${q.item[1]}` : ''}</div>`;
  if (!P.quest.accepted) {
    dialog('Capitano Wen', `<p>Salute, ${P.name}. Il regno ha bisogno di guerrieri come te.</p><h4>${q.title}</h4><p>${q.text}</p>${reward}`, [
      { label: 'Accetta', fn: () => { P.quest.accepted = true; P.quest.count = 0; updateQuestTracker(); chat(`Missione accettata: ${q.title}`, 'quest'); $('win-dialog').classList.add('hidden'); writeSave(); } },
      close,
    ]);
  } else if (P.quest.count < q.need) {
    dialog('Capitano Wen', `<h4>${q.title}</h4><p>${q.text}</p><p>Progresso: <b>${P.quest.count} / ${q.need}</b></p>${reward}`, [close]);
  } else {
    dialog('Capitano Wen', `<p>Ottimo lavoro, ${P.name}! Ecco la tua ricompensa.</p>${reward}`, [{
      label: 'Ritira la ricompensa',
      fn: () => {
        P.gold += q.gold;
        if (q.item) P.inv[q.item[0]] = (P.inv[q.item[0]] || 0) + q.item[1];
        chat(`Ricompensa: +${q.gold} Monete`, 'gold');
        gainXp(q.xp);
        P.quest = { idx: P.quest.idx + 1, count: 0, accepted: false };
        updateQuestTracker();
        writeSave();
        openGuardian();
      },
    }]);
  }
}

function openShop() {
  const row = (id) => {
    const it = ITEMS[id];
    return `<div class="shoprow"><span class="ico">${it.icon}</span><div class="sinfo"><b>${it.name}</b><small>${it.desc}</small></div>
      <span class="price">${it.price}</span><button data-buy="${id}" data-n="1">x1</button><button data-buy="${id}" data-n="10">x10</button></div>`;
  };
  dialog('Mercante Lian', `<p>Benvenuto! Le migliori pozioni di tutti e tre i regni.</p>${row('rossa')}${row('blu')}<div class="reward">Le tue monete: <b id="shopgold">${P.gold}</b></div>`, [{ label: 'Chiudi' }]);
  $('dbody').querySelectorAll('[data-buy]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.buy, n = +b.dataset.n, cost = ITEMS[id].price * n;
      if (P.gold < cost) { chat('Monete insufficienti.', 'warn'); return; }
      P.gold -= cost;
      P.inv[id] = (P.inv[id] || 0) + n;
      $('shopgold').textContent = P.gold;
      chat(`Hai acquistato ${ITEMS[id].name} x${n}.`, 'item');
      writeSave();
    };
  });
}

function upgradeCost(plus) {
  return { gold: Math.round(250 * Math.pow(plus + 1, 1.8)), frag: plus + 1 };
}

function openSmith() {
  const wname = { sword: 'Spada', dagger: 'Pugnali Gemelli', staff: 'Bastone Arcano', fan: 'Ventaglio Celeste' }[P.cls.weapon];
  if (P.weaponPlus >= 9) {
    dialog('Fabbro Tieh', `<p>La tua ${wname} +9 è un capolavoro. Non posso migliorarla oltre.</p>`, [{ label: 'Chiudi' }]);
    return;
  }
  const c = upgradeCost(P.weaponPlus);
  const useScroll = P.inv.pergamena > 0;
  const chance = Math.min(100, UPGRADE_CHANCE[P.weaponPlus] + (useScroll ? 20 : 0));
  const can = P.gold >= c.gold && P.inv.frammento >= c.frag;
  dialog('Fabbro Tieh', `<p>Vuoi rendere più forte la tua arma? Il fuoco della forgia non perdona: se fallisco, i materiali andranno perduti.</p>
    <div class="upg"><div class="wname plus${P.weaponPlus}">${wname} +${P.weaponPlus}</div><div class="arrow">➜</div><div class="wname plus${P.weaponPlus + 1}">${wname} +${P.weaponPlus + 1}</div></div>
    <div class="reward">Costo: <b>${c.gold}</b> Monete (hai ${P.gold}) · <b>${c.frag}</b> Frammenti di Giada (hai ${P.inv.frammento})${useScroll ? '<br>Userai 1 Pergamena della Fortuna (+20%)' : ''}<br>Probabilità di successo: <b>${chance}%</b></div>`, [
    {
      label: 'Potenzia', disabled: !can,
      fn: () => {
        P.gold -= c.gold;
        P.inv.frammento -= c.frag;
        if (useScroll) P.inv.pergamena--;
        if (Math.random() * 100 < chance) {
          P.weaponPlus++;
          setWeaponGlow(P.model, P.weaponPlus);
          fxPillar(P.pos, 0xffd27a, 8, 1.2, 1.2);
          notice(`Potenziamento riuscito! +${P.weaponPlus}`);
          chat(`Il fabbro ha potenziato la tua arma a +${P.weaponPlus}!`, 'good');
        } else {
          fxBurst(P.pos, 0x666666, 14, 3);
          notice('Potenziamento fallito...');
          chat('Il potenziamento è fallito. I materiali sono andati perduti.', 'warn');
        }
        writeSave();
        openSmith();
      },
    },
    { label: 'Chiudi' },
  ]);
}

$('respawn').onclick = respawn;

// ---------------------------------------------------------------------------
// Telecamera
// ---------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (keys.KeyQ) cam.yaw += dt * 1.8;
  if (keys.KeyE) cam.yaw -= dt * 1.8;
  if (G.started) camTarget.lerp(new THREE.Vector3(P.pos.x, P.pos.y + 1.6, P.pos.z), Math.min(1, dt * 12));
  else {
    cam.yaw += dt * 0.08;
    camTarget.set(0, 6, 0);
  }
  const dist = G.started ? cam.dist : 70;
  const pitch = G.started ? cam.pitch : 0.38;
  camera.position.set(
    camTarget.x + Math.sin(cam.yaw) * Math.cos(pitch) * dist,
    camTarget.y + Math.sin(pitch) * dist,
    camTarget.z + Math.cos(cam.yaw) * Math.cos(pitch) * dist,
  );
  const ground = heightAt(camera.position.x, camera.position.z) + 0.8;
  if (camera.position.y < ground) camera.position.y = ground;
  camera.lookAt(camTarget);
  scene.getObjectByName('sky').position.copy(camera.position);

  const focus = G.started ? P.pos : camTarget;
  sun.position.copy(focus).add(SUN_OFFSET);
  sun.target.position.copy(focus);
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
G.world = buildWorld(scene, KINGDOMS[0].color);
const jade = scene.getObjectByName('jade');
const clouds = scene.getObjectByName('clouds');
buildStartScreen();

function recolorKingdom(color) {
  // stendardi e targhe delle porte prendono il colore del regno scelto
  const kc = new THREE.Color(color);
  const base = new THREE.Color(KINGDOMS[0].color);
  scene.getObjectByName('village').traverse((o) => {
    if (o.isMesh && o.material && o.material.color && o.material.color.equals(base)) {
      o.material = o.material.clone();
      o.material.color.copy(kc);
    }
  });
}

function startGame(save) {
  P = createPlayer(save);
  if (P.kingdom !== 0) recolorKingdom(KINGDOMS[P.kingdom].color);
  spawnNPCs();
  populate();
  $('start').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('pname').textContent = P.name;
  $('pname').style.color = KINGDOMS[P.kingdom].css;
  $('portrait').textContent = P.cls.icon;
  renderSkillbar();
  updateQuestTracker();
  cam.yaw = 0;
  camTarget.set(P.pos.x, 1.6, P.pos.z);
  G.started = true;
  chat(`Benvenuto nel ${KINGDOMS[P.kingdom].name}, ${P.name}!`, 'good');
  chat('Clic sinistro: muoviti / attacca · Tasto destro: ruota la visuale · 1-4 abilità · 5-6 pozioni · Spazio: attacca il più vicino · H: aiuto', 'sys');
  if (!P.quest.accepted && P.quest.idx === 0) chat('Il Capitano Wen ti cerca al centro del villaggio.', 'quest');
  writeSave();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('beforeunload', writeSave);

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  G.time += dt;

  if (jade) { jade.rotation.y += dt * 0.6; jade.position.y = 4.4 + Math.sin(G.time * 1.5) * 0.15; }
  if (clouds) clouds.rotation.y += dt * 0.004;
  G.world.water.material.color.setHSL(0.56, 0.5, 0.42 + Math.sin(G.time * 0.8) * 0.02);

  if (G.started) {
    updatePlayer(dt);
    for (let i = G.mobs.length - 1; i >= 0; i--) if (G.mobs[i]) updateMob(G.mobs[i], dt);
    updateStones(dt);
    updateProjectiles(dt);
    updateDrops(dt);
    for (const n of G.npcs) animateHumanoid(n.model, G.time + n.pos.x, 0, 0, dt);
    updateHUD(dt);
    G.saveTimer += dt;
    if (G.saveTimer > 15) { G.saveTimer = 0; writeSave(); }
  }

  for (let i = G.effects.length - 1; i >= 0; i--) {
    const e = G.effects[i];
    e.t += dt;
    const p = Math.min(1, e.t / e.dur);
    e.update(e, p, dt);
    if (p >= 1) {
      scene.remove(e.mesh);
      if (e.mesh.material) e.mesh.material.dispose?.();
      G.effects.splice(i, 1);
    }
  }

  updateCamera(dt);
  if (G.started) updateLabels(dt);
  renderer.render(scene, camera);
}
loop();
$('loading').classList.add('hidden');

// accesso per il debug dalla console del browser
window.__regni = { G, get P() { return P; } };
