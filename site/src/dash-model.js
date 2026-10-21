// Dash X geometry, measured off product photos: squircle body with a slanted, scooped front cut,
// a clear duckbill mouthpiece, and the liquid tank showing through the window.
function buildDash(maxAniso) {
  const W = 0.62, D = 0.5, BODY_H = 2.3, DROP = 0.55, CAP_H = 0.78, SEG = 72;
  const smooth = t => t * t * (3 - 2 * t);

  // SEG points on a superellipse (n≈4 reads as a soft rounded rectangle); y may follow a cut function
  function ring(w, d, n, yAt) {
    const pts = [];
    for (let i = 0; i < SEG; i++) {
      const a = i / SEG * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const x = w / 2 * Math.sign(c) * Math.abs(c) ** (2 / n);
      const z = d / 2 * Math.sign(s) * Math.abs(s) ** (2 / n);
      pts.push(x, typeof yAt === 'number' ? yAt : yAt(x, z), z);
    }
    return pts;
  }
  function loft(rings, { capBottom = false, capTop = false } = {}) {
    const pos = [], idx = [];
    rings.forEach(r => pos.push(...r));
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < SEG; i++) {
      const a = j * SEG + i, b = j * SEG + (i + 1) % SEG;
      idx.push(a, a + SEG, b, b, a + SEG, b + SEG);
    }
    const fan = (r, top) => {
      const base = r * SEG;
      let cy = 0;
      for (let i = 0; i < SEG; i++) cy += pos[(base + i) * 3 + 1];
      const ci = pos.length / 3;
      pos.push(0, cy / SEG, 0);
      for (let i = 0; i < SEG; i++) {
        const a = base + i, b = base + (i + 1) % SEG;
        top ? idx.push(ci, b, a) : idx.push(ci, a, b);
      }
    };
    if (capBottom) fan(0, false);
    if (capTop) fan(rings.length - 1, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  const group = new THREE.Group();
  // hex values below are picked off the photos (sRGB); the renderer works in linear
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  // ---- body: the top edge drops from the back face toward a U-shaped window on the front ----
  const topY = (x, z) => BODY_H - DROP * smooth(Math.min(1, Math.max(0, z / D + 0.5))) * (1 - 0.5 * Math.min(1, (2 * x / W) ** 2));
  const bodyRings = [ring(W * 0.86, D * 0.84, 3.2, 0), ring(W * 0.96, D * 0.95, 3.6, 0.02), ring(W, D, 4, 0.07)];
  for (let k = 1; k <= 22; k++) bodyRings.push(ring(W, D, 4, (x, z) => 0.07 + (topY(x, z) - 0.07) * k / 22));
  const inset = (sw, sd, dy) => ring(W * sw, D * sd, 4, (x, z) => topY(x / sw, z / sd) + dy);
  bodyRings.push(inset(0.985, 0.975, 0.006), inset(0.95, 0.93, 0), inset(0.95, 0.93, -0.25));
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: lin(0xebe3b0), roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.55, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(loft(bodyRings, { capBottom: true }), bodyMat));

  // ---- e-liquid: fills the window and rises into the clear mouthpiece; chimney runs through it ----
  // the cap's cross-section at height y, shared by the shell and the liquid inside it
  const capAt = y => {
    const t = Math.min(1, Math.max(0, (y - BODY_H) / CAP_H));
    return [W * 0.95 * (1 - 0.12 * t ** 1.6), D * 0.93 * (1 - 0.6 * t ** 1.1), 4 - 1.2 * t];
  };
  const LEVEL = BODY_H + CAP_H * 0.9;
  const liqRings = [];
  for (let k = 0; k <= 10; k++) {
    const y = BODY_H - DROP - 0.04 + (LEVEL - (BODY_H - DROP - 0.04)) * k / 10;
    const [w, d, n] = capAt(y);
    liqRings.push(ring(w * 0.92 - 0.012, d * 0.9 - 0.012, n, y));
  }
  const liquidGeo = loft(liqRings, { capBottom: true, capTop: true });
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: lin(0xd98200), emissive: lin(0x7a3c00), roughness: 0.03, clearcoat: 0.3,
    transparent: true, opacity: 0.62, depthWrite: false, envMapIntensity: 0.25,
  });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  liquid.renderOrder = 1;
  const surfBase = (liqRings.length - 1) * SEG;
  const surfPos = liquidGeo.attributes.position;
  // keep the surface level in world space: y = LEVEL - sx*x - sz*z (slopes in the model's frame)
  function setSurface(sx, sz) {
    for (let i = 0; i < SEG; i++) {
      const v = surfBase + i;
      surfPos.setY(v, LEVEL - sx * surfPos.getX(v) - sz * surfPos.getZ(v));
    }
    surfPos.needsUpdate = true;
    liquidGeo.computeVertexNormals();
  }
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, CAP_H + DROP - 0.1, 20), new THREE.MeshStandardMaterial({ color: 0xdfe3e0, metalness: 0.6, roughness: 0.3 }));
  chimney.position.y = BODY_H - DROP + (CAP_H + DROP - 0.1) / 2;
  group.add(liquid, chimney);

  // ---- duckbill mouthpiece: thins to about half the depth, stays nearly full width, oval lip ----
  const capRings = [ring(W * 0.95, D * 0.93, 4, BODY_H - DROP - 0.08), ring(W * 0.95, D * 0.93, 4, BODY_H)];
  let tw = 0, td = 0, tn = 4;
  for (let k = 1; k <= 14; k++) {
    const t = k / 14;
    [tw, td, tn] = capAt(BODY_H + t * CAP_H);
    capRings.push(ring(tw, td, tn, BODY_H + t * CAP_H));
  }
  const TOP = BODY_H + CAP_H;
  capRings.push(ring(tw * 0.9, td * 0.86, tn, TOP + 0.025), ring(tw * 0.62, td * 0.52, 2.6, TOP + 0.042), ring(tw * 0.4, td * 0.3, 2.4, TOP + 0.045));
  const capMat = new THREE.MeshPhysicalMaterial({
    color: lin(0x9ccdb3), roughness: 0.04, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.03,
    depthWrite: false,
  });
  const cap = new THREE.Mesh(loft(capRings, { capTop: true }), capMat);
  cap.renderOrder = 3;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x3c4a44, transparent: true, opacity: 0.75 }));
  hole.scale.set(tw * 0.17, td * 0.09, 1);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = TOP + 0.047;
  hole.renderOrder = 4;
  group.add(cap, hole);

  // ---- printed decals: front wordmark, side flavor line, back hex logo, bottom USB-C ----
  const decal = (cw, ch, w, h) => {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = maxAniso;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, depthWrite: false }));
    group.add(mesh);
    return { g: c.getContext('2d'), tex, mesh, cw, ch };
  };
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  const front = decal(160, 880, 0.3, 1.65);
  front.mesh.position.set(0, BODY_H - DROP - 0.12 - 0.825, D / 2 + 0.004);
  const side = decal(120, 880, 0.22, 1.62);
  side.mesh.rotation.y = Math.PI / 2;
  side.mesh.position.set(W / 2 + 0.004, 0.86, 0);
  const back = decal(128, 128, 0.14, 0.14);
  back.mesh.rotation.y = Math.PI;
  back.mesh.position.set(0, 0.3, -D / 2 - 0.004);
  const bottom = decal(256, 200, W * 0.6, D * 0.47);
  bottom.mesh.rotation.x = Math.PI / 2;
  bottom.mesh.position.y = -0.003;

  let ink = '#9a4329', label = '';
  function paint() {
    // front: "Snowplus" reads top-to-bottom, then the asterisk mark and the LED pinhole
    let { g, cw, ch } = front;
    g.clearRect(0, 0, cw, ch);
    g.save();
    g.translate(cw / 2 - 32, 24); g.rotate(Math.PI / 2);
    g.fillStyle = ink; g.font = `500 92px ${SANS}`; g.textBaseline = 'alphabetic';
    g.fillText('Snowplus', 0, 0);
    g.restore();
    g.strokeStyle = ink; g.lineWidth = 9; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4;
      g.beginPath();
      g.moveTo(cw / 2 + Math.cos(a) * 26, 650 + Math.sin(a) * 26);
      g.lineTo(cw / 2 - Math.cos(a) * 26, 650 - Math.sin(a) * 26);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(cw / 2, 820, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.arc(cw / 2, 822, 6, 0, Math.PI * 2); g.fill();
    front.tex.needsUpdate = true;

    // side: "DASH X  <flavor>" reads bottom-to-top, shrunk to fit
    ({ g, cw, ch } = side);
    g.clearRect(0, 0, cw, ch);
    g.save();
    g.translate(cw / 2 + 18, ch - 30); g.rotate(-Math.PI / 2);
    g.fillStyle = ink;
    let size = 50;
    const fit = () => {
      g.font = `700 ${size}px ${SANS}`; const a = g.measureText('DASH X   ').width;
      g.font = `400 ${size}px ${SANS}`; return a + g.measureText(label).width;
    };
    while (fit() > ch - 60 && size > 20) size--;
    g.font = `700 ${size}px ${SANS}`; g.fillText('DASH X', 0, 0);
    const lead = g.measureText('DASH X   ').width;
    g.font = `400 ${size}px ${SANS}`; g.fillText(label, lead, 0);
    g.restore();
    side.tex.needsUpdate = true;

    // back: embossed hexagon, a shade of the ink
    ({ g, cw, ch } = back);
    g.clearRect(0, 0, cw, ch);
    g.strokeStyle = ink; g.globalAlpha = 0.35; g.lineWidth = 6;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); }
    g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(40, 72); g.quadraticCurveTo(64, 30, 88, 72); g.moveTo(64, 40); g.lineTo(64, 90); g.stroke();
    g.globalAlpha = 1;
    back.tex.needsUpdate = true;
  }
  // bottom never changes colour: USB-C port and the gold airflow pin
  (() => {
    const { g } = bottom;
    g.fillStyle = '#2b2c29';
    g.beginPath(); g.roundRect ? g.roundRect(108, 50, 44, 100, 22) : g.rect(108, 50, 44, 100); g.fill();
    g.fillStyle = '#5d605b';
    g.fillRect(124, 70, 12, 60);
    g.fillStyle = '#c9a24a';
    g.beginPath(); g.arc(70, 100, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a6227';
    g.beginPath(); g.arc(70, 100, 5, 0, Math.PI * 2); g.fill();
    bottom.tex.needsUpdate = true;
  })();

  return {
    group, bodyMat, liquidMat, setSurface, height: TOP + 0.05,
    setInk(css) { ink = css; paint(); },
    setLabel(text) { label = text; paint(); },
  };
}
