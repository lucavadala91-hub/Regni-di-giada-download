import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHumanoid, mat } from './models.js';

export const HALF = 240;
export const SEG = 240;
export const STEP = (HALF * 2) / SEG;
export const WATER_LEVEL = -1.5;
export const VILLAGE_WALL_R = 46;

// Direzioni delle tre strade che escono dal villaggio (angolo -> (cos, sin) su x,z)
export const ROAD_ANGLES = [Math.PI * 0.5, Math.PI * 0.5 + 2.094, Math.PI * 0.5 + 4.189];

// ---------------------------------------------------------------------------
// Rumore procedurale
// ---------------------------------------------------------------------------
function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Strade
// ---------------------------------------------------------------------------
export const ROADS = ROAD_ANGLES.map((a, i) => {
  const dir = [Math.cos(a), Math.sin(a)];
  const perp = [-dir[1], dir[0]];
  const pts = [];
  for (let r = 0; r <= 230; r += 10) {
    const off = Math.sin(r * 0.03 + i * 1.7) * 14 * smooth(45, 90, r);
    pts.push([dir[0] * r + perp[0] * off, dir[1] * r + perp[1] * off]);
  }
  return pts;
});

export function roadDist(x, z) {
  let best = 1e9;
  for (const pts of ROADS) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const px = ax + dx * t - x, pz = az + dz * t - z;
      const d = px * px + pz * pz;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------
// Altezze del terreno
// ---------------------------------------------------------------------------
function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = (fbm(x * 0.012 + 100, z * 0.012 - 50) - 0.45) * 26;
  h += (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 3;
  h += smooth(150, 235, d) * 55 * (0.6 + 0.6 * fbm(x * 0.02, z * 0.02, 3));
  const v = smooth(38, 70, d);
  h = 1.2 + (h - 1.2) * v;
  const rd = roadDist(x, z);
  const r = smooth(2.5, 8, rd);
  const hr = Math.max(h * 0.7, WATER_LEVEL + 0.9);
  h = hr + (h - hr) * r;
  return h;
}

const N = SEG + 1;
const HGRID = new Float32Array(N * N);
const RGRID = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -HALF + i * STEP, z = -HALF + j * STEP;
    HGRID[j * N + i] = rawHeight(x, z);
    RGRID[j * N + i] = roadDist(x, z);
  }
}

function sampleGrid(grid, x, z) {
  const fx = Math.min(SEG - 0.001, Math.max(0, (x + HALF) / STEP));
  const fz = Math.min(SEG - 0.001, Math.max(0, (z + HALF) / STEP));
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = grid[j * N + i], b = grid[j * N + i + 1];
  const c = grid[(j + 1) * N + i], d = grid[(j + 1) * N + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function heightAt(x, z) { return sampleGrid(HGRID, x, z); }
export function roadAt(x, z) { return sampleGrid(RGRID, x, z); }

export function slopeAt(x, z) {
  const e = 1;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// Terreno non percorribile: acqua profonda, montagne, bordi del mondo
export function terrainBlocked(x, z) {
  if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) return true;
  const h = heightAt(x, z);
  if (h < WATER_LEVEL - 0.9) return true;
  if (h > 27) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Texture procedurali
// ---------------------------------------------------------------------------
function noiseTexture(size, lo, hi, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const v = lo + (hi - lo) * (0.55 * rnd() + 0.45 * fbm(x * 0.15, y * 0.15, 3));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Costruzione del mondo
// ---------------------------------------------------------------------------
const tmpColor = new THREE.Color();
function srgb(r, g, b) { return tmpColor.setRGB(r, g, b, THREE.SRGBColorSpace).clone(); }

export function buildWorld(scene, kingdomColor) {
  const colliders = [];
  const minimapCanvas = document.createElement('canvas');
  minimapCanvas.width = minimapCanvas.height = SEG + 1;

  buildSky(scene);
  const terrain = buildTerrain(scene, minimapCanvas);
  buildWater(scene);
  const water = scene.getObjectByName('water');
  buildVegetation(scene);
  const village = buildVillage(scene, kingdomColor, colliders);

  return { terrain, water, colliders, minimapCanvas, ...village };
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6fc4) },
      mid: { value: new THREE.Color(0x9cc6e8) },
      bottom: { value: new THREE.Color(0xe9dcc0) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.6, h)) : mix(bottom, mid, smoothstep(-0.05, 0.08, h));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, m);
  sky.name = 'sky';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  // Nuvole: sprite morbidi sparsi nel cielo
  const cloudTex = glowTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
  const rnd = mulberry32(77);
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 40; i++) {
    const cl = new THREE.Group();
    const a = rnd() * Math.PI * 2, r = 250 + rnd() * 350;
    cl.position.set(Math.cos(a) * r, 110 + rnd() * 70, Math.sin(a) * r);
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 }));
      s.position.set((rnd() - 0.5) * 60, (rnd() - 0.5) * 8, (rnd() - 0.5) * 30);
      const sc = 40 + rnd() * 40;
      s.scale.set(sc, sc * 0.45, 1);
      cl.add(s);
    }
    clouds.add(cl);
  }
  scene.add(clouds);
}

function buildTerrain(scene, minimapCanvas) {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    pos.setY(k, heightAt(pos.getX(k), pos.getZ(k)));
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const mctx = minimapCanvas.getContext('2d');
  const mimg = mctx.createImageData(N, N);

  const grassA = [0.30, 0.52, 0.19], grassB = [0.47, 0.60, 0.24], grassDry = [0.58, 0.58, 0.30];
  const rock = [0.47, 0.44, 0.40], snow = [0.93, 0.94, 0.96], sand = [0.78, 0.71, 0.50];
  const dirt = [0.56, 0.44, 0.29], tile = [0.62, 0.59, 0.53];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const d = Math.hypot(x, z);
    const n1 = fbm(x * 0.03 + 7, z * 0.03 + 3, 3);
    const n2 = fbm(x * 0.11, z * 0.11, 2);
    let c = mix(grassA, grassB, n1);
    c = mix(c, grassDry, smooth(0.62, 0.8, n2) * 0.6);
    const slope = 1 - nrm.getY(k);
    c = mix(c, rock, smooth(0.18, 0.32, slope));
    c = mix(c, rock, smooth(16, 24, y));
    c = mix(c, snow, smooth(36, 44, y));
    c = mix(c, sand, 1 - smooth(WATER_LEVEL + 0.3, WATER_LEVEL + 1.4, y));
    const rd = roadAt(x, z);
    c = mix(c, dirt, (1 - smooth(2.5, 5.5, rd)) * (0.85 + 0.15 * n2));
    if (d < 36) {
      // lastricato della piazza con una leggera trama a griglia
      const grid = (Math.abs(Math.sin(x * 1.2)) < 0.08 || Math.abs(Math.sin(z * 1.2)) < 0.08) ? 0.85 : 1;
      const t = mix(tile, [0.55, 0.52, 0.47], n2);
      c = mix(c, [t[0] * grid, t[1] * grid, t[2] * grid], 1 - smooth(32, 36, d));
    }
    const lin = srgb(c[0], c[1], c[2]);
    colors[k * 3] = lin.r; colors[k * 3 + 1] = lin.g; colors[k * 3 + 2] = lin.b;

    const mi = k * 4;
    const under = y < WATER_LEVEL;
    mimg.data[mi] = under ? 60 : c[0] * 255;
    mimg.data[mi + 1] = under ? 110 : c[1] * 255;
    mimg.data[mi + 2] = under ? 170 : c[2] * 255;
    mimg.data[mi + 3] = 255;
  }
  mctx.putImageData(mimg, 0, 0);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const tex = noiseTexture(128, 175, 255, 11);
  tex.repeat.set(140, 140);
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }));
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);
  return terrain;
}

function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0x3b7fa8, transparent: true, opacity: 0.78, shininess: 120, specular: 0xbfdfff,
  }));
  water.position.y = WATER_LEVEL;
  water.name = 'water';
  water.receiveShadow = true;
  scene.add(water);
}

function scatter(rnd, count, tries, test) {
  const out = [];
  for (let t = 0; t < tries && out.length < count; t++) {
    const x = (rnd() * 2 - 1) * (HALF - 10), z = (rnd() * 2 - 1) * (HALF - 10);
    if (test(x, z)) out.push([x, z]);
  }
  return out;
}

function placeInstanced(scene, geo, material, spots, rnd, opts = {}) {
  const im = new THREE.InstancedMesh(geo, material, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  spots.forEach(([x, z, sc], i) => {
    const scale = sc ?? 1;
    e.set(opts.tilt ? (rnd() - 0.5) * opts.tilt : 0, rnd() * Math.PI * 2, opts.tilt ? (rnd() - 0.5) * opts.tilt : 0);
    q.setFromEuler(e);
    s.set(scale, scale * (opts.yJitter ? 0.8 + rnd() * 0.4 : 1), scale);
    p.set(x, heightAt(x, z) - (opts.sink ?? 0.1), z);
    m4.compose(p, q, s);
    im.setMatrixAt(i, m4);
    if (opts.colors) im.setColorAt(i, opts.colors[Math.floor(rnd() * opts.colors.length)]);
  });
  im.castShadow = opts.shadow ?? true;
  im.receiveShadow = true;
  scene.add(im);
  return im;
}

function buildVegetation(scene) {
  const rnd = mulberry32(1234);
  const okGround = (x, z, minD = 50) => {
    const d = Math.hypot(x, z);
    if (d < minD) return false;
    const h = heightAt(x, z);
    if (h < WATER_LEVEL + 0.6 || h > 22) return false;
    if (roadAt(x, z) < 6) return false;
    if (slopeAt(x, z) > 0.55) return false;
    return true;
  };

  // Pini
  const pineSpots = scatter(rnd, 750, 9000, (x, z) => okGround(x, z) && fbm(x * 0.02 + 40, z * 0.02, 2) > 0.45)
    .map(([x, z]) => [x, z, 0.8 + rnd() * 0.8]);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 2.2, 6).translate(0, 1.1, 0);
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(2.1, 3.0, 7).translate(0, 3.0, 0),
    new THREE.ConeGeometry(1.7, 2.6, 7).translate(0, 4.5, 0),
    new THREE.ConeGeometry(1.15, 2.3, 7).translate(0, 5.9, 0),
  ]);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b3d26 });
  const pineMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const pineColors = [srgb(0.16, 0.36, 0.20), srgb(0.20, 0.42, 0.22), srgb(0.13, 0.31, 0.19), srgb(0.24, 0.44, 0.20)];
  placeInstanced(scene, trunkGeo, trunkMat, pineSpots, mulberry32(5));
  placeInstanced(scene, pineGeo, pineMat, pineSpots, mulberry32(5), { colors: pineColors });

  // Ciliegi in fiore (più frequenti vicino al villaggio)
  const cherrySpots = scatter(rnd, 170, 6000, (x, z) => {
    const d = Math.hypot(x, z);
    return okGround(x, z) && d < 130 && rnd() < 1 - d / 160;
  }).map(([x, z]) => [x, z, 0.9 + rnd() * 0.5]);
  // qualche ciliegio decorativo nel villaggio
  for (const [x, z] of [[-12, -6], [12, -6], [-9, 20], [9, 20], [-30, -10], [30, -10], [0, 32]]) cherrySpots.push([x, z, 1.1]);
  const cTrunkGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.25, 0.4, 2.4, 6).translate(0, 1.2, 0),
    new THREE.CylinderGeometry(0.12, 0.2, 1.6, 5).rotateZ(0.7).translate(0.55, 2.6, 0),
    new THREE.CylinderGeometry(0.12, 0.2, 1.6, 5).rotateZ(-0.7).translate(-0.55, 2.6, 0),
  ]);
  const blossomGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(1.6, 0).translate(0, 3.6, 0),
    new THREE.IcosahedronGeometry(1.2, 0).translate(1.3, 3.2, 0.4),
    new THREE.IcosahedronGeometry(1.2, 0).translate(-1.2, 3.3, -0.3),
    new THREE.IcosahedronGeometry(1.0, 0).translate(0.2, 4.6, 0.3),
  ]);
  const blossomColors = [srgb(0.96, 0.68, 0.78), srgb(0.98, 0.78, 0.85), srgb(0.92, 0.58, 0.70)];
  placeInstanced(scene, cTrunkGeo, new THREE.MeshLambertMaterial({ color: 0x4a2f22 }), cherrySpots, mulberry32(9));
  placeInstanced(scene, blossomGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), cherrySpots, mulberry32(9), { colors: blossomColors });

  // Rocce
  const rockSpots = scatter(rnd, 380, 5000, (x, z) => Math.hypot(x, z) > 48 && roadAt(x, z) > 5 && heightAt(x, z) > WATER_LEVEL - 0.5)
    .map(([x, z]) => [x, z, 0.4 + rnd() * rnd() * 2.6]);
  const rockColors = [srgb(0.50, 0.48, 0.45), srgb(0.42, 0.41, 0.40), srgb(0.56, 0.53, 0.48)];
  placeInstanced(scene, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), rockSpots, mulberry32(3), { colors: rockColors, tilt: 0.6, yJitter: true, sink: 0.3 });

  // Ciuffi d'erba
  const bladeGeo = (() => {
    const g = new THREE.BufferGeometry();
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.25, cz = Math.sin(a) * 0.25;
      v.push(-cx, 0, -cz, cx, 0, cz, 0, 0.7, 0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  })();
  const grassSpots = scatter(rnd, 9000, 30000, (x, z) => {
    const d = Math.hypot(x, z);
    return d > 37 && d < 175 && roadAt(x, z) > 3.5 && heightAt(x, z) > WATER_LEVEL + 0.5 && heightAt(x, z) < 16;
  }).map(([x, z]) => [x, z, 0.7 + rnd() * 0.9]);
  const grassColors = [srgb(0.33, 0.58, 0.20), srgb(0.42, 0.65, 0.24), srgb(0.28, 0.50, 0.18), srgb(0.55, 0.64, 0.28)];
  placeInstanced(scene, bladeGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), grassSpots, mulberry32(21), { colors: grassColors, shadow: false, sink: 0.05 });

  // Fiori
  const flowerSpots = scatter(rnd, 1500, 8000, (x, z) => {
    const d = Math.hypot(x, z);
    return d > 37 && d < 140 && roadAt(x, z) > 3.5 && heightAt(x, z) > WATER_LEVEL + 0.5 && fbm(x * 0.05, z * 0.05, 2) > 0.55;
  }).map(([x, z]) => [x, z, 0.8 + rnd() * 0.5]);
  const flowerGeo = new THREE.IcosahedronGeometry(0.13, 0).translate(0, 0.35, 0);
  const flowerColors = [srgb(0.95, 0.9, 0.3), srgb(0.95, 0.95, 0.95), srgb(0.85, 0.35, 0.55), srgb(0.6, 0.5, 0.95)];
  placeInstanced(scene, flowerGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), flowerSpots, mulberry32(33), { colors: flowerColors, shadow: false, sink: 0 });
}

// ---------------------------------------------------------------------------
// Villaggio
// ---------------------------------------------------------------------------
const ROOF_PROFILE = [
  [1.0, 0], [0.86, 0.1], [0.7, 0.24], [0.52, 0.45], [0.33, 0.7], [0.15, 0.92], [0.02, 1.0],
].map(([r, y]) => new THREE.Vector2(r, y));
const roofGeo = new THREE.LatheGeometry(ROOF_PROFILE, 4).rotateY(Math.PI / 4);

function makeRoof(w, d, h, color) {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(roofGeo, mat(color, { side: THREE.DoubleSide, flatShading: true }));
  roof.scale.set(w / Math.SQRT2 * 1.0, h, d / Math.SQRT2 * 1.0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  // trave dorata del colmo e punte degli angoli rivolte verso l'alto
  const gold = mat(0xc9a24a);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), gold);
  tip.position.y = h + 0.3;
  g.add(tip);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 4), mat(color));
    c.position.set(sx * w * 0.5, 0.25, sz * d * 0.5);
    c.rotation.set(sz * -0.9, 0, sx * 0.9);
    g.add(c);
  }
  return g;
}

export function makePagoda(w, d, floors, opts = {}) {
  const g = new THREE.Group();
  const roofColor = opts.roof ?? 0x3d4a52;
  const wallColor = opts.wall ?? 0xeee3cc;
  const pillarColor = opts.pillar ?? 0x9c2a1c;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 1.2, d + 1.4), mat(0x8c8579));
  base.position.y = 0.2;
  base.receiveShadow = base.castShadow = true;
  g.add(base);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2), mat(0x8c8579));
  step.position.set(0, 0.0, d / 2 + 1.1);
  g.add(step);
  let y = 0.8, cw = w, cd = d;
  for (let f = 0; f < floors; f++) {
    const fh = f === 0 ? 3.4 : 2.6;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(cw, fh, cd), mat(wallColor));
    walls.position.y = y + fh / 2;
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    // travi di legno orizzontali
    const beam = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.1, 0.25, cd + 0.1), mat(0x5a2a1a));
    beam.position.y = y + fh - 0.15;
    g.add(beam);
    // colonne rosse
    const pg = new THREE.CylinderGeometry(0.18, 0.2, fh, 8);
    const nx = Math.max(2, Math.round(cw / 2.6));
    for (let i = 0; i < nx; i++) {
      const px = -cw / 2 + (cw * i) / (nx - 1);
      for (const pz of [-cd / 2 - 0.05, cd / 2 + 0.05]) {
        const p = new THREE.Mesh(pg, mat(pillarColor));
        p.position.set(px, y + fh / 2, pz);
        p.castShadow = true;
        g.add(p);
      }
    }
    // porta e finestre a grata (solo davanti)
    if (f === 0) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.1), mat(0x4a2414));
      door.position.set(0, y + 1.2, cd / 2 + 0.06);
      g.add(door);
    }
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.08), mat(0x6b3a22));
      win.position.set(sx * cw * 0.3, y + fh * 0.6, cd / 2 + 0.06);
      g.add(win);
    }
    y += fh;
    const roof = makeRoof(cw + 2.6, cd + 2.6, f === floors - 1 ? 2.6 : 1.4, roofColor);
    roof.position.y = y - 0.1;
    g.add(roof);
    y += f === floors - 1 ? 0 : 0.9;
    cw *= 0.78;
    cd *= 0.78;
  }
  return g;
}

function makeLantern() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), mat(0x3a2a1c));
  post.position.y = 1.1;
  post.castShadow = true;
  g.add(post);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xffb35a, emissive: 0xff7a1a, emissiveIntensity: 0.9 }));
  lamp.position.y = 2.4;
  g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 8), mat(0x2a2a2a));
  cap.position.y = 2.8;
  g.add(cap);
  return g;
}

function makeBanner(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 6), mat(0x3a2a1c));
  pole.position.y = 3;
  pole.castShadow = true;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2, 1, 6), mat(color, { side: THREE.DoubleSide }));
  flag.position.set(0.62, 4.2, 0);
  flag.castShadow = true;
  flag.name = 'flag';
  g.add(flag);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), mat(0xe8c85a, { side: THREE.DoubleSide }));
  emblem.position.set(0.62, 4.6, 0.01);
  g.add(emblem);
  return g;
}

function makeGate(kingdomColor) {
  const g = new THREE.Group();
  const red = mat(0x9c2a1c);
  for (const sx of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 7, 2.4), mat(0x9a948a));
    tower.position.set(sx * 4.2, 3.5, 0);
    tower.castShadow = tower.receiveShadow = true;
    g.add(tower);
    const tr = makeRoof(3.6, 3.6, 1.6, 0x3d4a52);
    tr.position.set(sx * 4.2, 7, 0);
    g.add(tr);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 10), red);
    p.position.set(sx * 2.6, 3, 0);
    p.castShadow = true;
    g.add(p);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 0.8), red);
  lintel.position.y = 6.2;
  g.add(lintel);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.1), mat(kingdomColor));
  plaque.position.set(0, 5.4, 0.45);
  g.add(plaque);
  const roof = makeRoof(8.4, 2.4, 1.2, 0x3d4a52);
  roof.position.y = 6.5;
  g.add(roof);
  return g;
}

function makeFountain() {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.9, 24), mat(0x9a948a));
  basin.position.y = 0.45;
  basin.castShadow = basin.receiveShadow = true;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 24), new THREE.MeshPhongMaterial({ color: 0x4fa3c7, shininess: 120, transparent: true, opacity: 0.85 }));
  water.position.y = 0.8;
  g.add(water);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3.2, 8), mat(0x8c8579));
  pillar.position.y = 2.2;
  pillar.castShadow = true;
  g.add(pillar);
  const jade = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshPhongMaterial({ color: 0x2fbf7a, emissive: 0x0f6b3e, shininess: 100, flatShading: true }));
  jade.position.y = 4.4;
  jade.name = 'jade';
  g.add(jade);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(120,255,180,0.9)', 'rgba(60,255,140,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 4.4;
  halo.scale.set(5, 5, 1);
  g.add(halo);
  return g;
}

function buildVillage(scene, kingdomColor, colliders) {
  const village = new THREE.Group();
  village.name = 'village';
  scene.add(village);
  const place = (obj, x, z, faceCenter = true, r = 0) => {
    obj.position.set(x, heightAt(x, z), z);
    if (faceCenter) obj.rotation.y = Math.atan2(-x, -z);
    village.add(obj);
    if (r) colliders.push({ x, z, r });
    return obj;
  };

  place(makeFountain(), 0, 0, false, 4.4);

  // Edifici. Le strade escono a ROAD_ANGLES, gli edifici stanno negli spazi liberi
  const free = [Math.PI * 1.5, Math.PI * 0.5 + 1.047 + 0.0, Math.PI * 0.5 - 1.047];
  const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  const [tx, tz] = at(free[0], 27);
  place(makePagoda(9, 7, 3, { roof: 0x2f4a3f }), tx, tz, true, 6.5);
  const [sx, sz] = at(free[1], 25);
  place(makePagoda(7, 5.5, 2), sx, sz, true, 5);
  const [fx, fz] = at(free[2], 25);
  const smithy = place(makePagoda(7, 5.5, 1, { roof: 0x4a3a32 }), fx, fz, true, 5);
  // forgia e incudine del fabbro
  const forge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), mat(0x5a524a));
  forge.position.set(3, 0.6, 4.2);
  smithy.add(forge);
  const fire = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 1.1), new THREE.MeshLambertMaterial({ color: 0xff6a1a, emissive: 0xff4a00, emissiveIntensity: 1 }));
  fire.position.set(3, 1.25, 4.2);
  smithy.add(fire);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.4), mat(0x333338));
  anvil.position.set(-2.4, 0.9, 4.4);
  smithy.add(anvil);
  const anvilBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.7, 6), mat(0x4a3a2a));
  anvilBase.position.set(-2.4, 0.35, 4.4);
  smithy.add(anvilBase);

  for (const [a, off, r] of [[free[0], 0.55, 30], [free[0], -0.55, 30], [free[1], 0.42, 31], [free[1], -0.42, 31], [free[2], 0.42, 31], [free[2], -0.42, 31]]) {
    const [hx, hz] = at(a + off, r);
    place(makePagoda(5.5, 4.5, 1, { roof: [0x3d4a52, 0x5a3328, 0x2f4a3f][Math.floor(Math.abs(off * 10)) % 3] }), hx, hz, true, 4);
  }

  // Mura con porte
  const wallMat = mat(0x9a948a);
  const capMat = mat(0x3d4a52);
  const segCount = 80;
  for (let i = 0; i < segCount; i++) {
    const a = (i / segCount) * Math.PI * 2;
    const nearGate = ROAD_ANGLES.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.12);
    if (nearGate) continue;
    const len = (2 * Math.PI * VILLAGE_WALL_R) / segCount + 0.3;
    const [wx, wz] = at(a, VILLAGE_WALL_R);
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, 6, 1.6), wallMat);
    w.position.set(wx, heightAt(wx, wz) + 1.2, wz);
    w.rotation.y = -a + Math.PI / 2;
    w.castShadow = w.receiveShadow = true;
    village.add(w);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 2.2), capMat);
    cap.position.set(wx, heightAt(wx, wz) + 4.35, wz);
    cap.rotation.y = w.rotation.y;
    village.add(cap);
  }
  const gates = [];
  for (const g of ROAD_ANGLES) {
    const [gx, gz] = at(g, VILLAGE_WALL_R);
    const gate = makeGate(kingdomColor);
    gate.position.set(gx, heightAt(gx, gz) - 0.2, gz);
    gate.rotation.y = -g + Math.PI / 2;
    village.add(gate);
    for (const s of [-1, 1]) {
      const px = gx + Math.cos(g + Math.PI / 2) * 4.2 * s, pz = gz + Math.sin(g + Math.PI / 2) * 4.2 * s;
      colliders.push({ x: px, z: pz, r: 1.8 });
    }
    gates.push({ x: gx, z: gz, a: g });
    // stendardi e lanterne ai lati dell'ingresso interno
    for (const s of [-1, 1]) {
      const bx = Math.cos(g) * (VILLAGE_WALL_R - 5) + Math.cos(g + Math.PI / 2) * 5 * s;
      const bz = Math.sin(g) * (VILLAGE_WALL_R - 5) + Math.sin(g + Math.PI / 2) * 5 * s;
      place(makeBanner(kingdomColor), bx, bz, true, 0.4);
    }
  }

  // Lanterne attorno alla piazza
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const [lx, lz] = at(a, 11);
    place(makeLantern(), lx, lz, false, 0.35);
  }

  // Guardie statiche alle porte
  for (const g of gates) {
    for (const s of [-1, 1]) {
      const gx = Math.cos(g.a) * (VILLAGE_WALL_R - 2.5) + Math.cos(g.a + Math.PI / 2) * 2.2 * s;
      const gz = Math.sin(g.a) * (VILLAGE_WALL_R - 2.5) + Math.sin(g.a + Math.PI / 2) * 2.2 * s;
      const guard = makeHumanoid({ armor: 0x4a4f58, accent: kingdomColor, cloth: 0x2a2a30, weapon: 'spear', helmet: true });
      guard.root.position.set(gx, heightAt(gx, gz), gz);
      guard.root.rotation.y = Math.atan2(Math.cos(g.a), Math.sin(g.a));
      village.add(guard.root);
      colliders.push({ x: gx, z: gz, r: 0.6 });
    }
  }

  const toward = (x, z, dist) => {
    const l = Math.hypot(x, z);
    return [x - (x / l) * dist, z - (z / l) * dist];
  };
  return {
    npcSpots: {
      guardiano: toward(tx, tz, 8.5),
      mercante: toward(sx, sz, 6.5),
      fabbro: toward(fx, fz, 7),
    },
    gates,
  };
}
