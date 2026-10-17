import * as THREE from 'three';

// I materiali senza opzioni vengono condivisi per colore
const cache = new Map();
export function mat(color, extra) {
  if (extra) return new THREE.MeshLambertMaterial({ color, ...extra });
  if (!cache.has(color)) cache.set(color, new THREE.MeshLambertMaterial({ color }));
  return cache.get(color);
}

function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const steel = () => new THREE.MeshPhongMaterial({ color: 0xd8dde3, shininess: 90, specular: 0xffffff });

// ---------------------------------------------------------------------------
// Armi
// ---------------------------------------------------------------------------
function makeWeapon(type, accent) {
  const g = new THREE.Group();
  let blade = null;
  if (type === 'sword') {
    blade = part(new THREE.BoxGeometry(0.1, 1.25, 0.03), steel(), 0, 0.8, 0);
    g.add(blade);
    g.add(part(new THREE.ConeGeometry(0.07, 0.2, 4), blade.material, 0, 1.52, 0));
    g.add(part(new THREE.BoxGeometry(0.36, 0.07, 0.12), mat(accent), 0, 0.15, 0));
    g.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), mat(0x3a2414), 0, 0, 0));
    g.add(part(new THREE.SphereGeometry(0.06, 8, 6), mat(accent), 0, -0.16, 0));
  } else if (type === 'dagger') {
    blade = part(new THREE.BoxGeometry(0.08, 0.55, 0.025), steel(), 0, 0.4, 0);
    g.add(blade);
    g.add(part(new THREE.BoxGeometry(0.22, 0.05, 0.08), mat(accent), 0, 0.1, 0));
    g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), mat(0x2a1a10), 0, 0, 0));
  } else if (type === 'staff') {
    g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), mat(0x5a3a22), 0, 0.4, 0));
    blade = part(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: 0x9ad7ff, emissive: 0x2a6cff, emissiveIntensity: 0.8, flatShading: true }), 0, 1.45, 0);
    g.add(blade);
    g.add(part(new THREE.TorusGeometry(0.16, 0.025, 6, 12), mat(accent), 0, 1.45, 0));
  } else if (type === 'fan') {
    g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), mat(0x2a1a10), 0, 0, 0));
    blade = part(new THREE.CircleGeometry(0.45, 14, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0xf2e6c8, emissive: 0x332200, side: THREE.DoubleSide }), 0, 0.15, 0);
    blade.rotation.z = 0;
    g.add(blade);
    g.add(part(new THREE.TorusGeometry(0.45, 0.02, 4, 14, Math.PI), mat(accent), 0, 0.15, 0));
  } else if (type === 'axe') {
    g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), mat(0x4a2e1a), 0, 0.4, 0));
    blade = part(new THREE.BoxGeometry(0.5, 0.45, 0.06), steel(), 0.22, 0.95, 0);
    g.add(blade);
  } else if (type === 'spear') {
    g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), mat(0x4a2e1a), 0, 0.6, 0));
    blade = part(new THREE.ConeGeometry(0.08, 0.45, 4), steel(), 0, 2.1, 0);
    g.add(blade);
  }
  return { group: g, blade };
}

// Bagliore dell'arma in base al livello di potenziamento (+0 .. +9)
export function setWeaponGlow(model, plus) {
  if (!model.blade) return;
  const m = model.blade.material;
  if (!m.emissive) return;
  const colors = [0x000000, 0x000000, 0x000000, 0x0a1a2a, 0x10304a, 0x1a4a7a, 0x2a2a9a, 0x6a1aaa, 0xaa2a2a, 0xffaa22];
  m.emissive.setHex(colors[Math.min(9, plus)]);
  if (m.emissiveIntensity !== undefined) m.emissiveIntensity = plus >= 7 ? 1.4 : 1;
}

// ---------------------------------------------------------------------------
// Umanoidi (giocatore, PNG, orchi)
// ---------------------------------------------------------------------------
export function makeHumanoid(o = {}) {
  const {
    skin = 0xe8c39e, armor = 0x7a2b1f, accent = 0xc9a24a, cloth = 0x2b2b2b, hair = 0x1a1410,
    weapon = null, scale = 1, helmet = false, cape = null, hat = null, robe = false, beard = false,
  } = o;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  body.add(part(new THREE.BoxGeometry(0.55, 0.25, 0.32), mat(cloth), 0, 1.0, 0));
  body.add(part(new THREE.BoxGeometry(0.66, 0.72, 0.38), mat(armor), 0, 1.46, 0));
  body.add(part(new THREE.BoxGeometry(0.48, 0.34, 0.06), mat(accent), 0, 1.56, 0.2));
  body.add(part(new THREE.BoxGeometry(0.7, 0.1, 0.42), mat(accent), 0, 1.12, 0));
  const skirtH = robe ? 1.0 : 0.55;
  body.add(part(new THREE.CylinderGeometry(0.34, robe ? 0.62 : 0.48, skirtH, 10, 1, true), mat(armor, { side: THREE.DoubleSide }), 0, 1.1 - skirtH / 2, 0));
  body.add(part(new THREE.CylinderGeometry(0.09, 0.1, 0.15, 6), mat(skin), 0, 1.88, 0));

  const head = new THREE.Group();
  head.position.y = 2.08;
  body.add(head);
  head.add(part(new THREE.SphereGeometry(0.22, 14, 10), mat(skin)));
  for (const sx of [-1, 1]) head.add(part(new THREE.BoxGeometry(0.05, 0.03, 0.02), mat(0x111111), sx * 0.08, 0.02, 0.205));
  if (helmet) {
    head.add(part(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(accent), 0, 0.02, 0));
    head.add(part(new THREE.ConeGeometry(0.05, 0.3, 5), mat(accent), 0, 0.32, 0));
  } else {
    head.add(part(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(hair), 0, 0.03, -0.01));
    head.add(part(new THREE.SphereGeometry(0.1, 8, 6), mat(hair), 0, 0.2, -0.12));
  }
  if (hat === 'straw') head.add(part(new THREE.ConeGeometry(0.5, 0.25, 14), mat(0xcfae6a), 0, 0.22, 0));
  if (hat === 'cap') head.add(part(new THREE.CylinderGeometry(0.2, 0.24, 0.22, 10), mat(0x1a1a1a), 0, 0.2, 0));
  if (beard) head.add(part(new THREE.ConeGeometry(0.12, 0.3, 6), mat(0xdddddd), 0, -0.25, 0.1));

  for (const sx of [-1, 1]) {
    const p = part(new THREE.SphereGeometry(0.18, 10, 8), mat(accent), sx * 0.42, 1.76, 0);
    p.scale.set(1.1, 0.75, 1.1);
    body.add(p);
  }

  const makeArm = (sx) => {
    const a = new THREE.Group();
    a.position.set(sx * 0.43, 1.74, 0);
    a.add(part(new THREE.CylinderGeometry(0.09, 0.08, 0.42, 6), mat(armor), 0, -0.2, 0));
    a.add(part(new THREE.CylinderGeometry(0.085, 0.07, 0.38, 6), mat(skin), 0, -0.56, 0));
    a.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6), mat(accent), 0, -0.45, 0));
    a.add(part(new THREE.SphereGeometry(0.08, 8, 6), mat(skin), 0, -0.78, 0));
    body.add(a);
    return a;
  };
  const armL = makeArm(-1), armR = makeArm(1);

  const makeLeg = (sx) => {
    const l = new THREE.Group();
    l.position.set(sx * 0.16, 0.95, 0);
    l.add(part(new THREE.CylinderGeometry(0.12, 0.1, 0.48, 6), mat(cloth), 0, -0.24, 0));
    l.add(part(new THREE.CylinderGeometry(0.1, 0.09, 0.42, 6), mat(cloth), 0, -0.64, 0));
    l.add(part(new THREE.BoxGeometry(0.17, 0.14, 0.3), mat(0x2a1c12), 0, -0.88, 0.04));
    body.add(l);
    return l;
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  let capeMesh = null;
  if (cape !== null) {
    capeMesh = new THREE.Group();
    capeMesh.position.set(0, 1.78, -0.21);
    const c = part(new THREE.PlaneGeometry(0.7, 1.3), mat(cape, { side: THREE.DoubleSide }), 0, -0.65, 0);
    capeMesh.add(c);
    body.add(capeMesh);
  }

  const model = { root, body, head, armL, armR, legL, legR, cape: capeMesh, blade: null, kind: 'humanoid', weaponType: weapon };
  if (weapon) {
    const w = makeWeapon(weapon, accent);
    w.group.position.y = -0.8;
    w.group.rotation.x = weapon === 'spear' ? 0 : Math.PI / 2;
    armR.add(w.group);
    model.blade = w.blade;
    model.weapon = w.group;
    if (weapon === 'dagger') {
      const w2 = makeWeapon('dagger', accent);
      w2.group.position.y = -0.8;
      w2.group.rotation.x = Math.PI / 2;
      armL.add(w2.group);
    }
  }
  root.scale.setScalar(scale);
  return model;
}

export function animateHumanoid(m, t, move, atk, dt) {
  const s = Math.sin(t * 10) * 0.75 * move;
  m.legL.rotation.x = s;
  m.legR.rotation.x = -s;
  m.armL.rotation.x = -s * 0.8;
  m.armL.rotation.z = -0.08;
  m.armR.rotation.z = 0.08;
  if (atk > 0) {
    const p = 1 - atk;
    m.armR.rotation.x = p < 0.35 ? -2.7 * (p / 0.35) : -2.7 + 2.3 * ((p - 0.35) / 0.65);
    m.body.rotation.y = p < 0.35 ? 0.3 * (p / 0.35) : 0.3 - 0.6 * ((p - 0.35) / 0.65);
    if (m.weaponType === 'dagger') m.armL.rotation.x = -m.armR.rotation.x * 0.6 - 0.6;
  } else {
    m.armR.rotation.x = s * 0.8 + (m.weaponType === 'spear' ? -0.3 : 0);
    m.body.rotation.y *= 0.8;
  }
  m.body.position.y = Math.abs(Math.sin(t * 10)) * 0.07 * move + Math.sin(t * 2) * 0.012;
  if (m.cape) m.cape.rotation.x = 0.15 + move * 0.45 + Math.sin(t * 6) * 0.05;
}

// ---------------------------------------------------------------------------
// Quadrupedi (lupi, cinghiali)
// ---------------------------------------------------------------------------
function quadLegs(body, color, xs, zs, top, len, thick) {
  const legs = [];
  for (const z of zs) for (const x of xs) {
    const l = new THREE.Group();
    l.position.set(x, top, z);
    l.add(part(new THREE.CylinderGeometry(thick, thick * 0.75, len, 6), mat(color), 0, -len / 2, 0));
    l.add(part(new THREE.BoxGeometry(thick * 2, 0.08, thick * 2.4), mat(0x2a2420), 0, -len, 0.03));
    body.add(l);
    legs.push(l);
  }
  return legs; // [fl, fr, bl, br]
}

export function makeWolf(color = 0x8a8178, scale = 1, eye = 0xffd23a) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25).getHex();
  body.add(part(new THREE.BoxGeometry(0.6, 0.55, 1.3), mat(color), 0, 0.88, 0));
  body.add(part(new THREE.BoxGeometry(0.68, 0.68, 0.55), mat(light), 0, 0.95, 0.45));
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.85);
  body.add(head);
  head.add(part(new THREE.BoxGeometry(0.42, 0.38, 0.42), mat(color)));
  head.add(part(new THREE.BoxGeometry(0.22, 0.18, 0.36), mat(light), 0, -0.07, 0.33));
  head.add(part(new THREE.BoxGeometry(0.08, 0.07, 0.06), mat(0x111111), 0, -0.02, 0.52));
  for (const sx of [-1, 1]) {
    head.add(part(new THREE.ConeGeometry(0.08, 0.22, 4), mat(color), sx * 0.13, 0.27, -0.05));
    head.add(part(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: eye }), sx * 0.11, 0.06, 0.215));
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.02, -0.65);
  tail.rotation.x = -0.9;
  tail.add(part(new THREE.CylinderGeometry(0.06, 0.12, 0.65, 6), mat(color), 0, -0.32, 0));
  body.add(tail);
  const legs = quadLegs(body, color, [-0.2, 0.2], [0.45, -0.45], 0.66, 0.66, 0.08);
  root.scale.setScalar(scale);
  return { root, body, head, legs, tail, kind: 'quad' };
}

export function makeBoar(color = 0x5a3a24, scale = 1) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dark = new THREE.Color(color).lerp(new THREE.Color(0x000000), 0.4).getHex();
  body.add(part(new THREE.BoxGeometry(0.95, 0.85, 1.55), mat(color), 0, 0.95, 0));
  body.add(part(new THREE.BoxGeometry(0.3, 0.25, 1.4), mat(dark), 0, 1.46, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.9);
  body.add(head);
  head.add(part(new THREE.BoxGeometry(0.62, 0.58, 0.55), mat(color)));
  head.add(part(new THREE.CylinderGeometry(0.16, 0.18, 0.25, 8).rotateX(Math.PI / 2), mat(0xb88a78), 0, -0.1, 0.36));
  for (const sx of [-1, 1]) {
    const tusk = part(new THREE.ConeGeometry(0.05, 0.3, 5), mat(0xf2ead8), sx * 0.2, -0.12, 0.38);
    tusk.rotation.set(-0.6, 0, -sx * 0.35);
    head.add(tusk);
    head.add(part(new THREE.ConeGeometry(0.1, 0.2, 4), mat(dark), sx * 0.22, 0.34, -0.1));
    head.add(part(new THREE.BoxGeometry(0.06, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3a1a }), sx * 0.16, 0.1, 0.28));
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.15, -0.8);
  tail.add(part(new THREE.CylinderGeometry(0.03, 0.05, 0.3, 5), mat(dark), 0, -0.15, 0));
  body.add(tail);
  const legs = quadLegs(body, dark, [-0.3, 0.3], [0.5, -0.5], 0.6, 0.55, 0.11);
  root.scale.setScalar(scale);
  return { root, body, head, legs, tail, kind: 'quad' };
}

export function animateQuad(m, t, move, atk) {
  const s = Math.sin(t * 13) * 0.65 * move;
  const [fl, fr, bl, br] = m.legs;
  fl.rotation.x = s; br.rotation.x = s;
  fr.rotation.x = -s; bl.rotation.x = -s;
  m.body.position.y = Math.abs(Math.sin(t * 13)) * 0.05 * move;
  m.tail.rotation.z = Math.sin(t * 8) * 0.3;
  if (atk > 0) {
    const p = 1 - atk;
    const lunge = Math.sin(p * Math.PI);
    m.head.rotation.x = -lunge * 0.5;
    m.body.position.z = lunge * 0.35;
    m.body.rotation.x = lunge * 0.12;
  } else {
    m.head.rotation.x = Math.sin(t * 1.5) * 0.05;
    m.body.position.z *= 0.8;
    m.body.rotation.x *= 0.8;
  }
}

// ---------------------------------------------------------------------------
// Pietra dello Spirito
// ---------------------------------------------------------------------------
export function makeSpiritStone(glow, glowTex) {
  const root = new THREE.Group();
  const stoneMat = new THREE.MeshPhongMaterial({ color: 0x24222c, flatShading: true, shininess: 40, specular: 0x554466 });
  const stone = part(new THREE.IcosahedronGeometry(1, 0), stoneMat, 0, 3.1, 0);
  stone.scale.set(1.5, 3.4, 1.4);
  stone.rotation.y = 0.4;
  root.add(stone);
  const veins = new THREE.Mesh(new THREE.IcosahedronGeometry(1.015, 1), new THREE.MeshBasicMaterial({ color: glow, wireframe: true, transparent: true, opacity: 0.85 }));
  veins.position.copy(stone.position);
  veins.scale.copy(stone.scale);
  veins.rotation.copy(stone.rotation);
  root.add(veins);
  // macerie alla base
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = part(new THREE.DodecahedronGeometry(0.35 + (i % 3) * 0.15, 0), mat(0x3a3640, { flatShading: true }), Math.cos(a) * 1.6, 0.2, Math.sin(a) * 1.6);
    r.rotation.set(i, i * 2, 0);
    root.add(r);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  halo.position.y = 3;
  halo.scale.set(10, 12, 1);
  root.add(halo);
  const shards = [];
  for (let i = 0; i < 4; i++) {
    const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: glow }));
    root.add(sh);
    shards.push(sh);
  }
  return { root, stone, veins, halo, shards, kind: 'stone' };
}

export function animateStone(m, t, hpFrac) {
  m.veins.material.opacity = 0.55 + Math.sin(t * 3) * 0.3;
  m.halo.material.opacity = 0.35 + Math.sin(t * 2) * 0.15 + (1 - hpFrac) * 0.3;
  m.shards.forEach((s, i) => {
    const a = t * 0.9 + (i / m.shards.length) * Math.PI * 2;
    s.position.set(Math.cos(a) * 2.6, 3.4 + Math.sin(t * 2 + i) * 0.8, Math.sin(a) * 2.6);
    s.rotation.set(t * 2, t * 3 + i, 0);
  });
}
