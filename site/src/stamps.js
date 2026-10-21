// Loyalty stamps, one card per product line: each unit bought stamps that line's card;
// 10 stamps on a card put one free unit of the same line (flavor of the buyer's choice) into the next order.
// Members only: the counts come from the server (account.js) and change when the shop confirms an order.
const STAMPS_PER_REWARD = 10;
const stampUnit = p => (p.id === 6 ? '盒' : '支');
const stampStore = (() => {
  const subs = [];
  let all = {};
  return {
    get: pid => all[pid] || 0,
    all: () => ({ ...all }),
    // replace every count; quiet repaints without the stamper (sign-in, sign-out, first paint)
    reset(next, quiet = false) {
      const changes = {}, prev = {};
      for (const pid of new Set([...Object.keys(all), ...Object.keys(next)])) {
        const n = Math.max(0, next[pid] || 0);
        if (n !== (all[pid] || 0)) { changes[pid] = n; prev[pid] = all[pid] || 0; }
      }
      all = Object.fromEntries(Object.entries(next).filter(([, n]) => n > 0));
      if (Object.keys(changes).length || quiet) subs.forEach(f => f(changes, prev, quiet));
    },
    on(f) { subs.push(f); },
  };
})();
try { localStorage.removeItem('vs3d-stamps-by-line'); } catch (e) { /* the old browser-only cards */ }

// A paper stamp card lying on the table: drag to flip it over, a rubber stamper presses each new stamp in.
function createStampCard(canvas, { onFlip } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null;
  }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8878, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 0.75);
  key.position.set(-2, 4, 5);
  scene.add(key);

  // ---- the card: rounded board with a dark olive core, printed faces on both sides ----
  const W = 3.4, H = 2.14, R = 0.16, T = 0.035, CW = 1600, CH = 1007;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2 + R, -H / 2);
  shape.lineTo(W / 2 - R, -H / 2); shape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
  shape.lineTo(W / 2, H / 2 - R); shape.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2);
  shape.lineTo(-W / 2 + R, H / 2); shape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R);
  shape.lineTo(-W / 2, -H / 2 + R); shape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);

  const tilt = new THREE.Group(), flip = new THREE.Group();
  tilt.add(flip);
  scene.add(tilt);
  const core = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
  core.translate(0, 0, -T / 2);
  flip.add(new THREE.Mesh(core, new THREE.MeshStandardMaterial({ color: lin(0x343b2c), roughness: 0.7 })));

  const faceGeo = new THREE.ShapeGeometry(shape, 10);
  const uv = faceGeo.attributes.uv, fp = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, fp.getX(i) / W + 0.5, fp.getY(i) / H + 0.5);
  const faceTex = () => {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return { g: c.getContext('2d'), tex };
  };
  const front = faceTex(), back = faceTex();
  const frontMesh = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: front.tex, roughness: 0.85 }));
  frontMesh.position.z = T / 2 + 0.009;
  const backMesh = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: back.tex, roughness: 0.85 }));
  backMesh.rotation.y = Math.PI;
  backMesh.position.z = -T / 2 - 0.009;
  flip.add(frontMesh, backMesh);

  // slot centres on the printed face (canvas px) and on the card (scene units)
  const SLOT_R = 96;
  const slots = Array.from({ length: STAMPS_PER_REWARD }, (_, i) => {
    const px = 280 + (i % 5) * 260, py = 470 + Math.floor(i / 5) * 250;
    return { px, py, x: (px / CW - 0.5) * W, y: (0.5 - py / CH) * H };
  });

  const INK = '#9a4329', SANS = '"Chiron GoRound TC","Nunito","PingFang SC","Microsoft YaHei",sans-serif', LATIN = '"Nunito","Helvetica Neue",sans-serif';
  const grain = (g, alpha) => {
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(60,50,30,${Math.random() * alpha})`;
      g.fillRect(Math.random() * CW, Math.random() * CH, 2, 2);
    }
  };
  const pill = (g, x, y, w, h) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, h / 2) : g.rect(x, y, w, h); g.fill(); };
  // where the device sits in each line's poster photo (fraction of width, height) and how far to zoom in
  const PHOTO_FOCUS = { 1: [0.5, 0.6, 1.9], 2: [0.8, 0.76, 2.6], 3: [0.62, 0.5, 1.7], 4: [0.52, 0.45, 1.5], 5: [0.84, 0.82, 2.8], 6: [0.5, 0.56, 1.9] };
  // the front is printed per product line: its name, its photo, and its colour on the reward slot
  let line = null, lineColor = '#c9d96a', lineImg = null;
  function paintFront() {
    const { g } = front;
    const unit = line ? stampUnit(line) : '支';
    g.fillStyle = '#f6f0e2'; g.fillRect(0, 0, CW, CH);
    grain(g, 0.06);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#625f53'; g.font = `800 26px ${LATIN}`;
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    g.fillText('口粮专卖店 · STAMP CARD', 112, 112);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    const name = line ? shortName(line) : '口粮专卖店';
    let size = 96;
    g.font = `900 ${size}px ${SANS}`;
    while (g.measureText(name).width > 790 && size > 48) g.font = `900 ${--size}px ${SANS}`;
    g.fillStyle = '#24271f'; g.fillText(name, 108, 214);
    const sub = line ? (line.name.match(/\(([^)]*)\)/) || [])[1] || '' : '';
    if (sub) { g.fillStyle = '#625f53'; g.font = `700 34px ${LATIN}`; g.fillText(sub, 112, 270); }
    // product photo in a round window, top right
    g.save();
    g.beginPath(); g.arc(1360, 200, 150, 0, Math.PI * 2);
    g.fillStyle = lineColor; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
    if (lineImg) {
      // crop in on the device itself, past the poster's printed title
      g.clip();
      const [fx, fy, z] = PHOTO_FOCUS[line?.id] || [0.5, 0.5, 1.6];
      const s = 300 * z / Math.min(lineImg.width, lineImg.height);
      g.drawImage(lineImg, 1360 - lineImg.width * s * fx, 200 - lineImg.height * s * fy, lineImg.width * s, lineImg.height * s);
    }
    g.restore();
    g.fillStyle = '#343b2c'; pill(g, 930, 150, 250, 78);
    g.fillStyle = '#f6f0e2'; g.textAlign = 'center';
    g.font = `900 40px ${SANS}`; g.fillText(`满 10 送 1`, 1055, 202);
    slots.forEach(({ px, py }, i) => {
      const last = i === slots.length - 1;
      g.beginPath(); g.arc(px, py, SLOT_R, 0, Math.PI * 2);
      if (last) {
        g.fillStyle = lineColor; g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
        g.strokeStyle = '#343b2c'; g.lineWidth = 5; g.setLineDash([]); g.stroke();
        g.fillStyle = '#24271f'; g.font = `900 44px ${SANS}`; g.fillText(`送 1 ${unit}`, px, py + 6);
        g.fillStyle = '#343b2c'; g.font = `800 22px ${LATIN}`; g.fillText('GRATIS', px, py + 44);
      } else {
        g.strokeStyle = '#aaa38f'; g.lineWidth = 4; g.setLineDash([12, 12]); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#cfc7b3'; g.font = `700 50px ${LATIN}`; g.fillText(String(i + 1), px, py + 18);
      }
    });
    g.textAlign = 'left';
    g.fillStyle = '#cfc7b3'; g.fillRect(110, 860, CW - 220, 3);
    g.fillStyle = '#625f53'; g.font = `700 32px ${SANS}`;
    g.fillText(`这一款每买 1 ${unit}盖 1 个章 · 集满 10 个，下一单送 1 ${unit}同款`, 110, 930);
    front.tex.needsUpdate = true;
  }
  function paintBack() {
    const { g } = back;
    g.fillStyle = '#343b2c'; g.fillRect(0, 0, CW, CH);
    grain(g, 0.12);
    // the shop's asterisk, oversized and cropped by the corner
    g.strokeStyle = '#c9d96a'; g.lineWidth = 46; g.lineCap = 'round'; g.globalAlpha = 0.9;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4;
      g.beginPath();
      g.moveTo(1390 + Math.cos(a) * 190, 800 + Math.sin(a) * 190);
      g.lineTo(1390 - Math.cos(a) * 190, 800 - Math.sin(a) * 190);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#f6f0e2'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `900 76px ${SANS}`; g.fillText('怎么集章', 110, 175);
    const rules = ['每个款式一张卡，分开集', '这一款每买 1 支盖 1 个章（烟弹按盒算）', '集满 10 个章，下一单送 1 支同款', '送的那支口味你自己挑，下单时选'];
    rules.forEach((r, i) => {
      const y = 300 + i * 112;
      g.fillStyle = '#c9d96a'; g.font = `900 44px ${LATIN}`; g.fillText(String(i + 1), 112, y);
      g.fillStyle = '#f6f0e2'; g.font = `700 44px ${SANS}`; g.fillText(r, 180, y);
    });
    g.fillStyle = '#a7a290'; g.font = `700 28px ${LATIN}`;
    g.fillText('Una tarjeta por modelo · 10 sellos = 1 gratis del mismo modelo', 112, 900);
    back.tex.needsUpdate = true;
  }
  const paintAll = () => { paintFront(); paintBack(); };
  paintAll();
  document.fonts?.ready.then(paintAll);

  // ---- ink stamp: double ring, shop name, roughened like a real rubber print ----
  const sc = document.createElement('canvas');
  sc.width = sc.height = 512;
  (() => {
    const g = sc.getContext('2d');
    g.strokeStyle = g.fillStyle = INK;
    g.lineWidth = 20; g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 7; g.beginPath(); g.arc(256, 256, 190, 0, Math.PI * 2); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 150px ${SANS}`; g.fillText('口粮', 256, 236);
    g.font = `900 40px ${LATIN}`;
    if ('letterSpacing' in g) g.letterSpacing = '8px';
    g.fillText('✱ MADRID ✱', 262, 350);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      g.globalAlpha = Math.random() * 0.8;
      g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, Math.random() * 3 + 0.5, 0, Math.PI * 2); g.fill();
    }
  })();
  const stampTex = new THREE.CanvasTexture(sc);
  stampTex.encoding = THREE.sRGBEncoding;
  // the reward slot gets a solid seal instead, so the full card reads as "unlocked" rather than as ink over the print
  const gc = document.createElement('canvas');
  gc.width = gc.height = 512;
  (() => {
    const g = gc.getContext('2d');
    g.fillStyle = INK; g.beginPath(); g.arc(256, 256, 232, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f6f0e2'; g.lineWidth = 8; g.beginPath(); g.arc(256, 256, 196, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f6f0e2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 132px ${SANS}`; g.fillText('集满', 256, 236);
    g.font = `900 44px ${LATIN}`;
    if ('letterSpacing' in g) g.letterSpacing = '8px';
    g.fillText('GRATIS', 262, 346);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1800; i++) {
      g.globalAlpha = Math.random() * 0.6;
      g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, Math.random() * 3 + 0.5, 0, Math.PI * 2); g.fill();
    }
  })();
  const sealTex = new THREE.CanvasTexture(gc);
  sealTex.encoding = THREE.sRGBEncoding;
  const STAMP_Z = T / 2 + 0.012;
  const prints = slots.map((s, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: i === slots.length - 1 ? sealTex : stampTex, transparent: true, roughness: 0.9, depthWrite: false }));
    m.position.set(s.x, s.y, STAMP_Z);
    m.rotation.z = (Math.random() - 0.5) * 0.7;
    m.visible = false;
    flip.add(m);
    return m;
  });

  // ---- the stamper: rubber pad, olive mount, turned wooden handle (built along +z, the card normal) ----
  const stamper = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: lin(0xc79a63), roughness: 0.55 });
  const along = (geo, z) => { geo.rotateX(Math.PI / 2); geo.translate(0, 0, z); return geo; };
  stamper.add(
    new THREE.Mesh(along(new THREE.CylinderGeometry(0.235, 0.235, 0.04, 40), 0.02), new THREE.MeshStandardMaterial({ color: lin(0x6e2c1b), roughness: 0.9 })),
    new THREE.Mesh(along(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 40), 0.1), new THREE.MeshStandardMaterial({ color: lin(0x343b2c), roughness: 0.5 })),
    new THREE.Mesh(along(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 24), 0.41), wood),
    new THREE.Mesh(along(new THREE.SphereGeometry(0.15, 24, 16), 0.72), wood),
  );
  flip.add(stamper);
  const HOVER = 0.95;
  const restAt = i => { const s = slots[Math.min(i, slots.length - 1)]; return new THREE.Vector3(s.x + 0.04, s.y - 0.42, HOVER * 0.7); };
  stamper.position.copy(restAt(0));

  // soft contact shadow under the card; stays put while the card flips
  const shc = document.createElement('canvas');
  shc.width = shc.height = 128;
  const sg = shc.getContext('2d');
  const rg = sg.createRadialGradient(64, 64, 10, 64, 64, 64);
  rg.addColorStop(0, 'rgba(40,36,24,.38)'); rg.addColorStop(1, 'rgba(40,36,24,0)');
  sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.3, H * 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shc), transparent: true, depthWrite: false }));
  shadow.position.set(0.08, -0.12, -0.45);
  tilt.add(shadow);

  // ---- stamping queue: `shown` prints are on the card, `target` is where the count says it should be ----
  let shown = 0, target = 0, job = null;
  const ease = t => t * t * (3 - 2 * t);
  // instant: stamps the visitor already had appear without the stamper replaying them
  function set(n, instant) {
    target = Math.min(STAMPS_PER_REWARD, n);
    if (target < shown) { prints.forEach(p => { p.visible = false; }); shown = 0; }
    if (REDUCED || instant) { prints.forEach((p, i) => { p.visible = i < target; p.material.opacity = 1; p.scale.setScalar(1); }); shown = target; }
  }
  let press = 0;
  function runJob(dt) {
    if (!job) {
      if (shown >= target || !faceUp() || Math.abs(rot.yaw - rot.yawT) > 0.15) return;
      job = { i: shown, t: 0, from: stamper.position.clone() };
    }
    job.t += dt / 0.62;
    const s = slots[job.i], t = job.t;
    if (t < 0.35) {
      const e = ease(t / 0.35);
      stamper.position.set(job.from.x + (s.x - job.from.x) * e, job.from.y + (s.y - job.from.y) * e, job.from.z + (HOVER - job.from.z) * e);
    } else if (t < 0.52) {
      const e = ((t - 0.35) / 0.17) ** 2;
      stamper.position.set(s.x, s.y, HOVER + (STAMP_Z - 0.004 - HOVER) * e);
    } else if (t < 0.64) {
      stamper.position.z = STAMP_Z - 0.004;
      const p = prints[job.i];
      if (!p.visible) { p.visible = true; p.material.opacity = 0; press = 1; }
    } else {
      stamper.position.z = STAMP_Z + (HOVER - STAMP_Z) * ease(Math.min(1, (t - 0.64) / 0.36));
    }
    const p = prints[job.i];
    if (p.visible) { p.material.opacity = Math.min(1, p.material.opacity + dt * 9); p.scale.setScalar(1 + 0.12 * (1 - p.material.opacity)); }
    if (t >= 1) { shown = job.i + 1; job = null; }
  }

  // ---- drag to flip around the card's own vertical axis; release snaps to the nearest face ----
  const BASE_TILT = -0.5;
  const rot = { yaw: 0, yawT: 0, v: 0, pitch: 0, pitchT: 0, hx: 0, hy: 0, dragging: false, lastX: 0, lastY: 0, lastT: 0, moved: 0 };
  const faceUp = () => Math.cos(rot.yaw) > 0.5;
  let wasUp = true;
  canvas.addEventListener('pointerdown', e => {
    rot.dragging = true; rot.moved = 0;
    rot.lastX = e.clientX; rot.lastY = e.clientY; rot.lastT = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    rot.hx = ((e.clientX - r.left) / r.width - 0.5); rot.hy = ((e.clientY - r.top) / r.height - 0.5);
    if (!rot.dragging) return;
    const now = performance.now(), dx = e.clientX - rot.lastX;
    rot.yaw += dx * 0.011; rot.yawT = rot.yaw;
    rot.pitchT = Math.max(-0.35, Math.min(0.35, rot.pitchT + (e.clientY - rot.lastY) * 0.004));
    rot.v = dx * 0.011 / Math.max(1, now - rot.lastT) * 1000;
    rot.moved += Math.abs(dx);
    rot.lastX = e.clientX; rot.lastY = e.clientY; rot.lastT = now;
  });
  const release = () => {
    if (!rot.dragging) return;
    rot.dragging = false;
    rot.yawT = Math.round((rot.yaw + rot.v * 0.18) / Math.PI) * Math.PI;
    rot.pitchT = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { rot.hx = rot.hy = 0; });

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const d = Math.max(6.2, 7.4 / camera.aspect);
    camera.position.set(0, d * 0.06, d);
    camera.lookAt(0, 0.12, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(canvas);
  fit();

  let visible = false, last = performance.now(), t = 0;
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }, { threshold: 0.35 }).observe(canvas);

  function frame(now) {
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    if (!rot.dragging) {
      rot.yaw += (rot.yawT - rot.yaw) * Math.min(1, dt * (REDUCED ? 30 : 7));
      rot.pitch += (rot.pitchT - rot.pitch) * Math.min(1, dt * 5);
    } else {
      rot.pitch += (rot.pitchT - rot.pitch) * Math.min(1, dt * 12);
    }
    const sway = REDUCED ? 0 : Math.sin(t * 0.6) * 0.03;
    tilt.rotation.set(BASE_TILT + rot.pitch + rot.hy * 0.12, rot.hx * 0.16 + sway, -0.05);
    flip.rotation.y = rot.yaw;
    press = Math.max(0, press - dt * 5);
    flip.position.z = -0.05 * press;

    const up = faceUp();
    if (up !== wasUp) { wasUp = up; onFlip?.(up); }
    stamper.visible = Math.cos(rot.yaw) > 0.15;
    if (!REDUCED) runJob(dt);
    if (!job && !REDUCED) {
      // idle: hover over the next empty slot (or by the bottom-right corner once the card is full)
      const rest = shown >= STAMPS_PER_REWARD ? new THREE.Vector3(W / 2 - 0.3, -H / 2 - 0.05, HOVER * 0.7) : restAt(shown);
      rest.z += Math.sin(t * 1.6) * 0.05;
      stamper.position.lerp(rest, Math.min(1, dt * 3));
    } else if (REDUCED) {
      stamper.position.copy(shown >= STAMPS_PER_REWARD ? new THREE.Vector3(W / 2 - 0.3, -H / 2 - 0.05, HOVER * 0.7) : restAt(shown));
    }
    stamper.rotation.set(job ? 0 : 0.2, job ? 0 : -0.25, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // switch the card to another product line: a quick spin, reprinted mid-turn
  let showToken = 0;
  function show(p, n, color) {
    const token = ++showToken;
    line = p; lineColor = color || lineColor; lineImg = null;
    paintFront();
    loadImage(p.image).then(im => { if (token === showToken) { lineImg = im; paintFront(); } }).catch(() => {});
    job = null;
    set(n, true);
    if (!REDUCED && faceUp()) rot.yawT = Math.round(rot.yaw / (2 * Math.PI)) * 2 * Math.PI + 2 * Math.PI;
  }

  return {
    set,
    show,
    flip() { rot.yawT = (Math.round(rot.yaw / Math.PI) + 1) * Math.PI; },
  };
}
