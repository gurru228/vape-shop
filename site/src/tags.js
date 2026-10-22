// Product wall: each product poster is a stiff verlet sheet clipped to a hanger bar that swings from a rail.
function createTags({ rail, canvas, products, onPick }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null;
  }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RAIL_Y = 0, WALL_Z = -0.8, GAP = 0.34, GRAVITY = -22, FOV = 26;
  const POSTER_W = 1.7;

  // phones: fewer pixels and a smaller shadow map; the wall is cloth physics + shadows, the heaviest scene here
  const SMALL = matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, SMALL ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8a826c, 0.85));
  const key = new THREE.DirectionalLight(0xfff6e6, 0.65);
  key.position.set(-3, 5, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 512 : 1024);
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 5, bottom: -9, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  const wallMat = new THREE.ShadowMaterial({ opacity: 0.2 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), wallMat);
  wall.position.set(0, -6, WALL_Z);
  wall.receiveShadow = true;
  scene.add(wall);
  const syncTheme = () => {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shadow-alpha'));
    wallMat.opacity = Number.isFinite(v) ? v : 0.2;
  };
  syncTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const span = products.length * POSTER_W + GAP * (products.length - 1);
  const railEnd = span / 2 + 0.45;
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f33, metalness: 0.6, roughness: 0.35 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, railEnd * 2 + 0.3, 20), metal);
  bar.rotation.z = Math.PI / 2;
  bar.castShadow = true;
  scene.add(bar);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, -WALL_Z, 12), metal);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(s * (railEnd + 0.1), RAIL_Y, WALL_Z / 2);
    arm.castShadow = true;
    scene.add(arm);
  }
  const wood = new THREE.MeshStandardMaterial({ color: 0xb8915e, roughness: 0.6 });
  const cord = new THREE.MeshStandardMaterial({ color: 0x2f3329, roughness: 0.8 });
  const clipMat = new THREE.MeshStandardMaterial({ color: 0x24271f, metalness: 0.5, roughness: 0.3 });
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---------- poster texture: product photo + price strip ----------
  function paintPoster(p, h) {
    const cw = 512, ch = Math.round(512 * h / POSTER_W);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const strip = Math.round(ch * 0.2);
    const draw = (img, hex) => {
      g.fillStyle = '#F8F3E8';
      g.fillRect(0, 0, cw, ch);
      if (img) {
        const ar = img.width / img.height, box = cw / (ch - strip);
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        if (ar > box) { sw = img.height * box; sx = (img.width - sw) / 2; } else { sh = img.width / box; sy = (img.height - sh) / 2; }
        g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch - strip);
      }
      g.fillStyle = '#F8F3E8';
      g.fillRect(0, ch - strip, cw, strip);
      g.fillStyle = hex || '#52675B';
      g.fillRect(0, ch - strip, cw, 8);
      g.fillStyle = '#24271F';
      g.textBaseline = 'alphabetic';
      g.font = '900 46px Nunito, sans-serif';
      g.textAlign = 'right';
      if (p.clearance) g.fillStyle = '#9A4329';
      g.fillText(euro(p.price), cw - 28, ch - strip + 68);
      const room = cw - 28 * 2 - g.measureText(euro(p.price)).width - 20;
      if (p.was) {
        // the old price, struck through, under the clearance price
        g.font = '800 26px Nunito, sans-serif'; g.fillStyle = '#625F53';
        const ow = g.measureText(euro(p.was)).width;
        g.fillText(euro(p.was), cw - 28, ch - strip + 106);
        g.fillRect(cw - 28 - ow, ch - strip + 97, ow, 3);
        g.font = '900 46px Nunito, sans-serif';
      }
      g.fillStyle = '#24271F';
      g.textAlign = 'left';
      // long names (RELX) shrink rather than run into the price
      const fitFont = (weight, size, text, max) => {
        do g.font = `${weight} ${size}px Nunito, "Chiron GoRound TC", "PingFang SC", sans-serif`;
        while (g.measureText(text).width > max && --size > 16);
      };
      fitFont(800, 44, shortName(p), room);
      g.fillText(shortName(p), 28, ch - strip + 66);
      g.fillStyle = '#625F53';
      const sub = p.clearance ? `清仓 · ${p.flavors.length} 种口味` : `${p.flavors.length} 种口味 · ${p.nameEs}`;
      fitFont(700, 26, sub, cw - 56);
      g.fillText(sub, 28, ch - strip + 108);
      // punch holes so the clips read as gripping paper
      g.fillStyle = 'rgba(0,0,0,.18)';
      for (const x of [0.22, 0.78]) { g.beginPath(); g.arc(cw * x, 22, 7, 0, Math.PI * 2); g.fill(); }
    };
    draw(null);
    return { canvas: c, draw };
  }

  function Tag(p, i, home) {
    this.p = p; this.home = home; this.half = POSTER_W / 2;
    this.x = home; this.vx = 0;
    this.roll = 0; this.rollV = 0; this.swing = 0; this.swingV = 0;
    this.yaw = (i % 2 ? 1 : -1) * 0.06; this.yawV = 0;
    const H = POSTER_W * (p.image.includes('dash/') || p.image.includes('relx/') ? 1.42 : 1.2);
    this.H = H;
    const DROP = 0.42;
    const cols = 10, rows = Math.round(cols * H / POSTER_W);
    const n = (cols + 1) * (rows + 1);
    Object.assign(this, { cols, rows, n });
    this.rest = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    const uvs = new Float32Array(n * 2);
    const at = (r, c) => r * (cols + 1) + c;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const k = at(r, c);
      this.rest[k * 3] = (c / cols - 0.5) * POSTER_W;
      this.rest[k * 3 + 1] = -DROP - (r / rows) * H;
      this.rest[k * 3 + 2] = 0;
      uvs[k * 2] = c / cols; uvs[k * 2 + 1] = 1 - r / rows;
      if (r === 0) this.pinned[k] = 1;
    }
    const cons = [];
    const link = (a, b, stiff) => {
      cons.push(a, b, Math.hypot(this.rest[a * 3] - this.rest[b * 3], this.rest[a * 3 + 1] - this.rest[b * 3 + 1]), stiff);
    };
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      if (c < cols) link(at(r, c), at(r, c + 1), 1);
      if (r < rows) link(at(r, c), at(r + 1, c), 1);
      if (r < rows && c < cols) { link(at(r, c), at(r + 1, c + 1), 1); link(at(r, c + 1), at(r + 1, c), 1); }
      // bending springs: paper resists folding more than cloth
      if (c < cols - 2) link(at(r, c), at(r, c + 3), 0.6);
      if (r < rows - 2) link(at(r, c), at(r + 3, c), 0.6);
    }
    const m = cons.length / 4;
    this.cA = new Int32Array(m); this.cB = new Int32Array(m); this.cL = new Float32Array(m); this.cS = new Float32Array(m);
    for (let j = 0; j < m; j++) { this.cA[j] = cons[j * 4]; this.cB[j] = cons[j * 4 + 1]; this.cL[j] = cons[j * 4 + 2]; this.cS[j] = cons[j * 4 + 3]; }

    const index = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) index.push(at(r, c), at(r + 1, c), at(r, c + 1), at(r, c + 1), at(r + 1, c), at(r + 1, c + 1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    this.geo = geo;

    this.poster = paintPoster(p, H);
    const tex = this.tex = new THREE.CanvasTexture(this.poster.canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = maxAniso;
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.FrontSide });
    const back = new THREE.MeshStandardMaterial({ color: 0xeee8da, roughness: 0.9, side: THREE.BackSide });
    this.mesh = new THREE.Mesh(geo, front);
    const backMesh = new THREE.Mesh(geo, back);
    for (const mm of [this.mesh, backMesh]) { mm.castShadow = true; mm.receiveShadow = true; mm.frustumCulled = false; scene.add(mm); }
    this.mesh.userData.tag = this; backMesh.userData.tag = this; this.backMesh = backMesh;

    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);
    const barMesh = new THREE.Mesh(new THREE.BoxGeometry(POSTER_W + 0.08, 0.07, 0.07), wood);
    barMesh.position.set(0, -DROP + 0.02, 0);
    barMesh.castShadow = true;
    this.group.add(barMesh);
    for (const x of [-0.42, 0.42]) {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), clipMat);
      clip.position.set(x * POSTER_W, -DROP - 0.04, 0);
      clip.castShadow = true;
      this.group.add(clip);
    }
    // two cords up to a single hook on the rail
    for (const x of [-0.46, 0.46]) {
      const a = new THREE.Vector3(x * POSTER_W, -DROP + 0.05, 0), b = new THREE.Vector3(0, -0.02, 0);
      const len = a.distanceTo(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), cord);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      c.castShadow = true;
      this.group.add(c);
    }
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), metal);
    hook.rotation.y = Math.PI / 2;
    this.group.add(hook);

    this.syncGroup();
    for (let k = 0; k < n; k++) this.place(k, this.pos);
    this.prev.set(this.pos);
  }
  Tag.prototype.syncGroup = function () {
    this.group.position.set(this.x, RAIL_Y, 0);
    this.group.rotation.set(this.swing, this.yaw, this.roll);
    this.group.updateMatrixWorld(true);
  };
  Tag.prototype.place = function (k, out) {
    const e = this.group.matrixWorld.elements;
    const x = this.rest[k * 3], y = this.rest[k * 3 + 1], z = this.rest[k * 3 + 2];
    out[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  };
  Tag.prototype.nudge = function (s = 1) { this.rollV += 0.9 * s; this.swingV += 0.8 * s; this.yawV += 0.7 * s; };
  Tag.prototype.showFlavor = async function (path) {
    const [img, hex] = await Promise.all([loadImage(path).catch(() => null), flavorColor(path)]);
    this.poster.draw(img, hex);
    this.tex.needsUpdate = true;
  };

  let cx = -span / 2;
  const tags = products.map((p, i) => { const t = new Tag(p, i, cx + POSTER_W / 2); cx += POSTER_W + GAP; return t; });
  document.fonts.ready.then(() => tags.forEach(t => t.showFlavor(t.p.image)));

  // ---------- interaction ----------
  const pointer = { x: 0, y: 0, px: 0, py: 0, inside: false, moved: false, down: null };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let grab = null, hovered = null, camX = 0, camTargetX = 0, narrow = false, viewW = 1, viewH = 1;
  const local = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  const clampCam = x => Math.max(-span / 2 + 1, Math.min(span / 2 - 1, x));

  function pick(sx, sy) {
    ndc.set(sx / viewW * 2 - 1, -(sy / viewH) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(tags.flatMap(t => [t.mesh, t.backMesh]))[0];
    return hit ? { t: hit.object.userData.tag, point: hit.point } : null;
  }
  function setHover(t) {
    if (t === hovered) return;
    hovered = t;
    rail.classList.toggle('over', !!t);
  }

  canvas.addEventListener('pointermove', ev => {
    const [x, y] = local(ev);
    if (!pointer.inside) { pointer.px = x; pointer.py = y; }
    pointer.x = x; pointer.y = y; pointer.inside = true; pointer.moved = true;
    const d = pointer.down;
    if (d && Math.hypot(x - d.x, y - d.y) > 6) d.dragged = true;
    if (d && d.pan) {
      const wpp = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / viewH;
      camTargetX = clampCam(d.camX - (x - d.x) * wpp);
    }
  });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; setHover(null); });
  canvas.addEventListener('pointerdown', ev => {
    const [x, y] = local(ev);
    pointer.x = pointer.px = x; pointer.y = pointer.py = y; pointer.inside = true;
    const hit = pick(x, y);
    // on touch screens a swipe pans the wall; a tap still opens the product
    const pan = narrow && (ev.pointerType !== 'mouse' || !hit);
    pointer.down = { x, y, t: performance.now(), hit, camX: camTargetX, pan };
    if (hit && !pan) {
      const tg = hit.t;
      let best = -1, bd = Infinity;
      for (let k = 0; k < tg.n; k++) {
        if (tg.pinned[k]) continue;
        const dd = (tg.pos[k * 3] - hit.point.x) ** 2 + (tg.pos[k * 3 + 1] - hit.point.y) ** 2 + (tg.pos[k * 3 + 2] - hit.point.z) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      }
      const p = new THREE.Vector3(tg.pos[best * 3], tg.pos[best * 3 + 1], tg.pos[best * 3 + 2]);
      grab = { tg, k: best, depth: p.clone().project(camera).z, target: p };
    }
    canvas.setPointerCapture(ev.pointerId);
  });
  const release = ev => {
    const d = pointer.down;
    if (d && d.hit && !d.dragged && performance.now() - d.t < 450) { d.hit.t.nudge(0.6); onPick(d.hit.t.p.id); }
    pointer.down = null; grab = null;
    if (ev.pointerType !== 'mouse') pointer.inside = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const projM = new THREE.Matrix4();
  function brush(dt) {
    const dx = pointer.x - pointer.px, dy = pointer.y - pointer.py;
    pointer.px = pointer.x; pointer.py = pointer.y;
    if (!pointer.inside || !pointer.moved) return;
    pointer.moved = false;
    if (!grab && !pointer.down) setHover(pick(pointer.x, pointer.y)?.t || null);
    const len = Math.hypot(dx, dy);
    if (len < 0.5 || grab || pointer.down?.pan) return;
    const R = Math.max(40, Math.min(80, viewW * 0.04));
    const ax = pointer.x - dx, ay = pointer.y - dy;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const m = projM.elements;
    for (const tg of tags) {
      let hits = 0, sx0 = 0, sz = 0, syaw = 0;
      const pos = tg.pos;
      for (let k = 0; k < tg.n; k++) {
        if (tg.pinned[k]) continue;
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2 * viewW;
        const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) / 2 * viewH;
        const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / (len * len)));
        const d = Math.hypot(sx - (ax + dx * t), sy - (ay + dy * t));
        if (d > R) continue;
        const f = (1 - d / R) ** 2;
        const wpp = (2 * w * tanHalf) / viewH;
        let mx = dx * wpp * f * 0.45, my = -dy * wpp * f * 0.3, mz = -len * wpp * f * 0.3;
        const mag = Math.hypot(mx, my, mz);
        if (mag > 0.18) { mx *= 0.18 / mag; my *= 0.18 / mag; mz *= 0.18 / mag; }
        pos[k * 3] += mx; pos[k * 3 + 1] += my; pos[k * 3 + 2] += mz;
        hits++; sx0 += mx; sz += mz; syaw += -mz * (x - tg.x);
      }
      if (!hits) continue;
      tg.rollV += sx0 / hits * 8;
      tg.swingV += -sz / hits * 5;
      tg.yawV += syaw / hits * 8;
      if (len / dt > 1100) tg.vx += sx0 / hits * 8;
    }
  }

  // ---------- simulation ----------
  let elapsed = 0;
  const introUntil = REDUCED ? 0 : 2.4;
  let started = REDUCED;

  function stepRail(dt) {
    const kHome = elapsed < introUntil ? 4 : 0.7;
    for (const tg of tags) {
      tg.vx += (tg.home - tg.x) * kHome * dt;
      tg.vx *= Math.exp(-3.4 * dt);
      tg.x += tg.vx * dt;
      tg.rollV += (-18 * tg.roll - 3.4 * tg.rollV) * dt;
      tg.swingV += (-14 * tg.swing - 3.2 * tg.swingV) * dt;
      tg.yawV += (-8 * tg.yaw - 2.4 * tg.yawV) * dt;
      if (tg.lastVx !== undefined) tg.rollV -= (tg.vx - tg.lastVx) * 0.5;
      tg.lastVx = tg.vx;
      tg.roll = THREE.MathUtils.clamp(tg.roll + tg.rollV * dt, -0.5, 0.5);
      tg.swing = THREE.MathUtils.clamp(tg.swing + tg.swingV * dt, -0.45, 0.45);
      tg.yaw = THREE.MathUtils.clamp(tg.yaw + tg.yawV * dt, -0.8, 0.8);
    }
    for (let i = 0; i < tags.length - 1; i++) {
      const a = tags[i], b = tags[i + 1];
      const overlap = (a.half + b.half) * 0.55 - (b.x - a.x);
      if (overlap > 0) {
        a.x -= overlap / 2; b.x += overlap / 2;
        const knock = (a.vx - b.vx) * 0.5, v = (a.vx + b.vx) / 2;
        a.vx = v; b.vx = v;
        if (knock > 0.05) { a.rollV -= knock * 0.8; b.rollV += knock * 0.8; }
      }
    }
    for (const tg of tags) {
      const lim = railEnd - 0.1;
      if (tg.x < -lim) { tg.x = -lim; tg.vx = Math.abs(tg.vx) * 0.3; }
      if (tg.x > lim) { tg.x = lim; tg.vx = -Math.abs(tg.vx) * 0.3; }
      tg.syncGroup();
    }
  }

  function stepSheet(tg, dt) {
    const { pos, prev, pinned, n } = tg;
    const gdt = GRAVITY * dt * dt, damp = 0.982;
    const breeze = REDUCED ? 0 : 0.08 * dt * dt;
    for (let k = 0; k < n; k++) {
      const i = k * 3;
      if (pinned[k]) { tg.place(k, pos); prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2]; continue; }
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      pos[i] += (x - prev[i]) * damp;
      pos[i + 1] += (y - prev[i + 1]) * damp + gdt;
      pos[i + 2] += (z - prev[i + 2]) * damp + breeze * Math.sin(elapsed * 0.8 + tg.home * 1.3 + y) * (RAIL_Y - y);
      prev[i] = x; prev[i + 1] = y; prev[i + 2] = z;
    }
    if (grab && grab.tg === tg) {
      const k = grab.k;
      pos[k * 3] += (grab.target.x - pos[k * 3]) * 0.5;
      pos[k * 3 + 1] += (grab.target.y - pos[k * 3 + 1]) * 0.5;
      pos[k * 3 + 2] += (grab.target.z - pos[k * 3 + 2]) * 0.5;
    }
    const { cA, cB, cL, cS } = tg;
    for (let it = 0; it < 8; it++) {
      for (let j = 0; j < cA.length; j++) {
        const a = cA[j] * 3, b = cB[j] * 3;
        const wa = pinned[cA[j]] ? 0 : 1, wb = pinned[cB[j]] ? 0 : 1;
        if (!(wa + wb)) continue;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const s = (d - cL[j]) / d / (wa + wb) * cS[j];
        pos[a] += dx * s * wa; pos[a + 1] += dy * s * wa; pos[a + 2] += dz * s * wa;
        pos[b] -= dx * s * wb; pos[b + 1] -= dy * s * wb; pos[b + 2] -= dz * s * wb;
      }
    }
    for (let k = 0; k < n; k++) if (pos[k * 3 + 2] < WALL_Z + 0.05) pos[k * 3 + 2] = WALL_Z + 0.05;
  }

  const gw = new THREE.Vector3();
  function updateGrab() {
    if (!grab) return;
    gw.set(pointer.x / viewW * 2 - 1, -(pointer.y / viewH) * 2 + 1, grab.depth).unproject(camera);
    grab.target.copy(gw);
  }

  const tallest = Math.max(...tags.map(t => t.H)) + 0.5;
  function fit() {
    viewW = rail.clientWidth;
    narrow = viewW < 860;
    const sceneW = narrow ? POSTER_W * 1.9 : span + 0.9;
    // size the wall to the posters instead of leaving dead space below
    const want = Math.round(Math.max(400, Math.min(760, viewW * (tallest + 1.3) / sceneW)));
    if (Math.abs(rail.clientHeight - want) > 2) rail.style.height = want + 'px';
    viewH = rail.clientHeight;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    const hv = Math.max(sceneW / camera.aspect, (tallest + 0.5) / 0.92);
    const dist = hv / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.userData = { dist, cy: RAIL_Y + 0.07 * hv - hv / 2 + 0.15 };
    camTargetX = narrow ? clampCam(camTargetX || tags[0].home + POSTER_W * 0.45) : 0;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(rail);
  fit();

  const STEP = 1 / 90;
  let last = performance.now(), acc = 0, running = false, first = true;
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    // one frame loop at a time: scrolling back into view must not start a second one
    if (!running || was) return;
    // drop the posters in from the right the first time the wall scrolls into view
    if (!started) {
      started = true;
      let x = railEnd - 0.2;
      for (let i = tags.length - 1; i >= 0; i--) {
        const tg = tags[i];
        tg.x = x; x -= POSTER_W * 0.6;
        tg.syncGroup();
        for (let k = 0; k < tg.n; k++) tg.place(k, tg.pos);
        tg.prev.set(tg.pos);
      }
      elapsed = 0;
    }
    last = performance.now();
    requestAnimationFrame(frame);
  }, { threshold: 0.25 }).observe(rail);

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    camX += (camTargetX - camX) * Math.min(1, dt * 7);
    const { dist, cy } = camera.userData;
    camera.position.set(camX, cy - 0.3, dist);
    camera.lookAt(camX, cy, 0);
    camera.updateMatrixWorld();
    brush(Math.max(dt, 1e-3));
    updateGrab();
    acc += dt;
    while (acc >= STEP) {
      elapsed += STEP;
      stepRail(STEP);
      for (const tg of tags) stepSheet(tg, STEP);
      acc -= STEP;
    }
    // the cloth moves every frame; the bounding sphere must follow or the raycast skips the poster
    for (const tg of tags) { tg.geo.attributes.position.needsUpdate = true; tg.geo.computeVertexNormals(); tg.geo.computeBoundingSphere(); }
    renderer.render(scene, camera);
    if (first) { first = false; rail.querySelector('.rail-loading')?.classList.add('done'); }
    requestAnimationFrame(frame);
  }

  return {
    nudge(id, s) { tags.find(t => t.p.id === id)?.nudge(s); },
    showFlavor(id, path) { tags.find(t => t.p.id === id)?.showFlavor(path); },
    focus(id) {
      const t = tags.find(tt => tt.p.id === id);
      if (t && narrow) camTargetX = clampCam(t.home);
    },
    pan(dir) { camTargetX = clampCam(camTargetX + dir * (POSTER_W + GAP)); },
    visible: () => running,
  };
}
