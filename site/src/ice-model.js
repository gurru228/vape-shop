// IceMax geometry, measured off the shop's own photos: a frosted pearl body that shades into the flavour
// colour toward the top, a clear tinted tank cap with a short oval mouthpiece, "ICEMAX" down the front,
// FEELM MAX embossed on the back, LED + black display on one narrow side, Type-C on the bottom.
// Same interface as buildDash so createDevice can drive either.
function buildIcemax(maxAniso) {
  const S = 1.62;                       // scale so it stands as tall as the Dash on the hero stage
  const W = 0.62, D = 0.46, BH = 1.36, CAPH = 0.3, NOZ = 0.17, SEG = 72;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  // squircle ring; yAt may be a number or a function of (x, z); col = value for the gradient mask
  function ring(w, d, n, y, mask) {
    const pts = [], m = [];
    for (let i = 0; i < SEG; i++) {
      const a = i / SEG * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pts.push(w / 2 * Math.sign(c) * Math.abs(c) ** (2 / n), y, d / 2 * Math.sign(s) * Math.abs(s) ** (2 / n));
      m.push(mask);
    }
    return { pts, m };
  }
  function loft(rings, { capBottom = false, capTop = false } = {}) {
    const pos = [], col = [], idx = [];
    rings.forEach(r => { pos.push(...r.pts); r.m.forEach(v => col.push(v, v, v)); });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < SEG; i++) {
      const a = j * SEG + i, b = j * SEG + (i + 1) % SEG;
      idx.push(a, a + SEG, b, b, a + SEG, b + SEG);
    }
    const fan = (r, top) => {
      const base = r * SEG;
      let cy = 0;
      for (let i = 0; i < SEG; i++) cy += pos[(base + i) * 3 + 1];
      const ci = pos.length / 3;
      pos.push(0, cy / SEG, 0); col.push(col[base * 3], col[base * 3], col[base * 3]);
      for (let i = 0; i < SEG; i++) {
        const a = base + i, b = base + (i + 1) % SEG;
        top ? idx.push(ci, b, a) : idx.push(ci, a, b);
      }
    };
    if (capBottom) fan(0, false);
    if (capTop) fan(rings.length - 1, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const smooth = t => t * t * (3 - 2 * t);
  // a filleted block profile: flat sides, edge radius r at both ends; fn(y) -> inset on every side
  const fillet = (y, h, r) => r * (1 - Math.sqrt(Math.max(0, 1 - (Math.max(0, r - Math.min(y, h - y)) / r) ** 2)));

  const group = new THREE.Group();

  // ---- body: white at the base, taking the flavour colour in the top third (the mask drives the gradient) ----
  const R = 0.1, bodyRings = [];
  const Y = [0, 0.012, 0.03, 0.055, 0.08, 0.1];
  for (let k = 0; k < 40; k++) Y.push(0.1 + (BH - 0.1) * (k + 1) / 40);
  for (const y of Y) {
    const inset = y < R ? R * (1 - Math.sqrt(Math.max(0, 1 - ((R - y) / R) ** 2))) : 0;
    // a faint shoulder: the body is a touch fuller at mid-height than at the ends
    const mask = smooth(Math.min(1, Math.max(0, (y / BH - 0.38) / 0.62)));
    bodyRings.push(ring(W - 2 * inset, D - 2 * inset, 4.4, y, mask));
  }
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: lin(0xb8b27a), roughness: 0.5, metalness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.45, envMapIntensity: 0.9, vertexColors: true, side: THREE.DoubleSide });
  // the shader mixes the pearl white with bodyMat.color (the flavour tint, animated by createDevice) by the vertex mask
  bodyMat.onBeforeCompile = shader => {
    shader.uniforms.uTint = { value: bodyMat.color };
    shader.fragmentShader = 'uniform vec3 uTint;\n' + shader.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = mix(vec3(0.80, 0.80, 0.84), uTint, vColor.r);');
  };
  group.add(new THREE.Mesh(loft(bodyRings, { capBottom: true }), bodyMat));

  // ---- tank cap: tinted, translucent; a smaller amber core inside gives it depth ----
  const capRings = [], coreRings = [];
  const capTop = BH + CAPH;
  const capYs = [BH - 0.05, BH - 0.02, BH];
  for (let k = 1; k <= 9; k++) capYs.push(BH + CAPH * 0.62 * k / 9);
  [0.7, 0.8, 0.88, 0.94, 0.98, 1].forEach(f => capYs.push(BH + CAPH * f));
  const CR = 0.12;
  for (const y of capYs) {
    const t = Math.max(0, (y - (capTop - CR)) / CR);
    const inset = CR * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
    const sink = y < BH ? 0.004 : 0;
    capRings.push(ring(W - 2 * inset - sink, D - 2 * inset - sink, 4.4, y, 1));
  }
  for (const y of [BH, BH + 0.08, BH + 0.16, BH + 0.24, capTop - 0.05]) coreRings.push(ring(W * 0.8, D * 0.72, 4, y, 1));
  const capMat = new THREE.MeshPhysicalMaterial({ color: lin(0x8a9a3a), roughness: 0.06, transparent: true, opacity: 0.58, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false, side: THREE.DoubleSide, vertexColors: false });
  const liquidMat = new THREE.MeshPhysicalMaterial({ color: lin(0x9c8a1c), emissive: lin(0x3a3000), roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false });
  const cap = new THREE.Mesh(loft(capRings, { capTop: true }), capMat);
  const core = new THREE.Mesh(loft(coreRings, { capBottom: true, capTop: true }), liquidMat);
  cap.renderOrder = 3; core.renderOrder = 1;

  // ---- mouthpiece: about half the front width, a third of the side depth, rounded tip with a slot ----
  const nozRings = [];
  const nzb = capTop - 0.08, nzt = capTop + NOZ;
  for (let k = 0; k <= 12; k++) {
    const y = nzb + (nzt - nzb) * k / 12, tt = k / 12;
    const t = Math.max(0, (y - (nzt - 0.07)) / 0.07);
    const inset = 0.07 * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
    nozRings.push(ring(W * 0.46 * (1 - 0.1 * tt) - 2 * inset, D * 0.36 * (1 - 0.14 * tt) - 2 * inset, 3.2, y, 1));
  }
  const noz = new THREE.Mesh(loft(nozRings, { capTop: true }), capMat);
  noz.renderOrder = 3;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x2c3326, transparent: true, opacity: 0.8 }));
  hole.scale.set(W * 0.13, D * 0.07, 1);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = nzt + 0.002;
  hole.renderOrder = 4;
  group.add(core, cap, noz, hole);
  const TOP = nzt;

  // ---- decals ----
  const decal = (cw, ch, w, h) => {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = maxAniso;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0.3, depthWrite: false }));
    group.add(mesh);
    return { g: c.getContext('2d'), tex, mesh, cw, ch };
  };
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  // front: ICEMAX down the face (reads top to bottom, foil white) and the flavour line near the foot
  const front = decal(512, 1024, W * 0.84, W * 0.84 * 2);
  front.mesh.position.set(0, BH * 0.46, D / 2 + 0.004);
  // side with the display: LED window and the black screen
  const side = decal(256, 1024, D * 0.84, D * 0.84 * 4);
  side.mesh.rotation.y = Math.PI / 2;
  side.mesh.position.set(W / 2 + 0.004, BH * 0.46, 0);
  // back: FEELM / MAX embossed near the foot
  const back = decal(256, 256, 0.34, 0.34);
  back.mesh.rotation.y = Math.PI;
  back.mesh.position.set(0, 0.34, -D / 2 - 0.004);
  const bottom = decal(256, 192, W * 0.62, D * 0.62);
  bottom.mesh.rotation.x = Math.PI / 2;
  bottom.mesh.position.y = -0.003;

  let label = '';
  function paint() {
    let { g, cw, ch } = front;
    g.clearRect(0, 0, cw, ch);
    // wordmark: rotated a quarter turn so it reads down the body
    g.save();
    g.translate(cw * 0.5 + 62, ch * 0.215); g.rotate(Math.PI / 2);
    g.font = `600 150px ${SANS}`; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = 'rgba(96,100,104,.55)'; g.strokeText('ICEMAX', 0, 0);
    const fg = g.createLinearGradient(0, -120, 0, 20);
    fg.addColorStop(0, '#f4f6f7'); fg.addColorStop(.5, '#c4c9cc'); fg.addColorStop(1, '#eef0f1');
    g.fillStyle = fg; g.fillText('ICEMAX', 0, 0);
    g.restore();
    // flavour name, small and dark, across the bottom
    g.fillStyle = 'rgba(40,42,38,.78)'; g.textAlign = 'center';
    let size = 30;
    g.font = `700 ${size}px ${SANS}`;
    const text = (label || '').toUpperCase();
    while (g.measureText(text).width > cw * 0.9 && size > 14) { size--; g.font = `700 ${size}px ${SANS}`; }
    g.fillText(text, cw / 2, ch * 0.9);
    g.textAlign = 'left';
    front.tex.needsUpdate = true;

    ({ g, cw, ch } = side);
    g.clearRect(0, 0, cw, ch);
    // LED window: a small rounded slot with two dots
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.strokeStyle = 'rgba(70,74,66,.55)'; g.lineWidth = 3; rr(cw * 0.37, ch * 0.25, 46, 92, 20); g.stroke();
    for (const dy of [0.285, 0.335]) { g.fillStyle = 'rgba(230,236,210,.95)'; g.beginPath(); g.arc(cw * 0.37 + 23, ch * dy + 2, 9, 0, Math.PI * 2); g.fill(); }
    // display
    const sg = g.createLinearGradient(0, ch * 0.62, 0, ch * 0.9);
    sg.addColorStop(0, '#15171a'); sg.addColorStop(1, '#050607');
    g.fillStyle = sg; rr(cw * 0.22, ch * 0.62, cw * 0.56, ch * 0.26, 14); g.fill();
    g.fillStyle = 'rgba(255,255,255,.07)'; rr(cw * 0.25, ch * 0.635, cw * 0.18, ch * 0.23, 8); g.fill();
    side.tex.needsUpdate = true;

    ({ g, cw, ch } = back);
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = 'rgba(80,84,76,.5)'; g.textAlign = 'center';
    g.font = `800 44px ${SANS}`; g.fillText('FEELM', cw / 2, ch * 0.6);
    g.strokeStyle = 'rgba(80,84,76,.5)'; g.lineWidth = 4; rr(cw * 0.37, ch * 0.66, cw * 0.26, 34, 5); g.stroke();
    g.font = `900 24px ${SANS}`; g.fillText('MAX', cw / 2, ch * 0.66 + 26);
    back.tex.needsUpdate = true;
  }
  // bottom: Type-C port, indicator dot, CE mark
  (() => {
    const { g } = bottom;
    g.fillStyle = 'rgba(60,62,58,.55)'; g.font = `700 26px ${SANS}`; g.textAlign = 'center'; g.fillText('CE', 62, 70);
    g.fillStyle = '#6b2a2a'; g.beginPath(); g.arc(128, 78, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1c1a';
    g.beginPath(); g.roundRect ? g.roundRect(92, 108, 72, 26, 13) : g.rect(92, 108, 72, 26); g.fill();
    bottom.tex.needsUpdate = true;
  })();

  group.scale.setScalar(S);
  // the cap and core use their own colours; the device re-tints them through setCapTint
  const capTintFrom = new THREE.Color();
  return {
    group, bodyMat, liquidMat, height: (TOP + 0.04) * S,
    setSurface() { /* sealed tank: nothing sloshes */ },
    setLabel(text) { label = text; paint(); },
    setInk() {},
    // the tank and core follow the flavour; called by createDevice with the transition colours
    liquidFor(hsl) { return new THREE.Color().setHSL(hsl.h, 0.7, 0.42).convertSRGBToLinear(); },
    capMat,
  };
}
