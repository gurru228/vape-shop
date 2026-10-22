// A modelled device (Dash by default, or opts.build = buildIcemax) that can be spun by dragging and re-tinted per flavor.
function createDevice(canvas, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null;
  }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.75 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0.35, 9.2);
  camera.lookAt(0, 0.1, 0);

  // Soft studio environment so the clearcoat and translucent cap pick up reflections.
  const envScene = new THREE.Scene();
  const gc = document.createElement('canvas');
  gc.width = 16; gc.height = 256;
  const gx = gc.getContext('2d');
  const grad = gx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(.45, '#efe9db'); grad.addColorStop(1, '#8d8878');
  gx.fillStyle = grad; gx.fillRect(0, 0, 16, 256);
  const envTex = new THREE.CanvasTexture(gc);
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })));
  for (const [x, y, z, w, h] of [[-6, 2, 3, 3, 6], [6, 1, 2, 2, 5], [0, 7, 0, 6, 2]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    panel.position.set(x, y, z); panel.lookAt(0, 0, 0);
    envScene.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-3, 4, 5);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

  const dash = (opts.build || buildDash)(renderer.capabilities.getMaxAnisotropy());
  const { bodyMat } = dash;
  const device = dash.group;
  const H = dash.height;
  device.position.y = -H / 2;
  const pivot = new THREE.Group();
  pivot.add(device);
  scene.add(pivot);

  // contact shadow
  const sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  const sg = sc.getContext('2d');
  const rg = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(40,36,24,.45)'); rg.addColorStop(1, 'rgba(40,36,24,0)');
  sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -H / 2 - 0.3;
  scene.add(shadow);

  // ---- colour transitions ----
  // only the shell changes per flavor, like the real lineup; the mouthpiece stays clear and the liquid stays gold
  const from = new THREE.Color(), to = new THREE.Color();
  const liqFrom = new THREE.Color(), liqTo = new THREE.Color(), AMBER = new THREE.Color(0xd98200).convertSRGBToLinear();
  let mix = 1;
  function setFlavor(hex, label) {
    const hsl = {}; new THREE.Color(hex).getHSL(hsl);
    from.copy(bodyMat.color);
    // the shell takes the flavor's colour outright; the liquid keeps its amber body with a hint of the flavor
    to.setHSL(hsl.h, Math.min(0.78, Math.max(0.5, hsl.s * 1.1)), 0.66).convertSRGBToLinear();
    liqFrom.copy(dash.liquidMat.color);
    if (dash.liquidFor) liqTo.copy(dash.liquidFor(hsl));
    else liqTo.copy(AMBER).lerp(new THREE.Color().setHSL(hsl.h, 0.95, 0.45).convertSRGBToLinear(), 0.28);
    if (label) dash.setLabel(label);
    mix = 0;
    if (!REDUCED) spin.v += 7;
  }

  // ---- drag to spin ----
  const spin = { a: -0.5, v: REDUCED ? 0 : 0.35, tilt: 0, tiltT: 0, dragging: false, lastX: 0, lastT: 0 };
  canvas.addEventListener('pointerdown', e => {
    spin.dragging = true; spin.lastX = e.clientX; spin.lastT = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    spin.tiltT = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
    if (!spin.dragging) return;
    const now = performance.now();
    const dx = e.clientX - spin.lastX;
    spin.a += dx * 0.012;
    spin.v = dx * 0.012 / Math.max(1, now - spin.lastT) * 1000;
    spin.lastX = e.clientX; spin.lastT = now;
  });
  const end = () => { spin.dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { spin.tiltT = 0; });

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = (w < 500 ? 7.8 : 9.2) / Math.min(1, camera.aspect * 1.05);
    camera.lookAt(0, w < 500 ? -0.22 : 0.1, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();

  const slosh = { x: 0, vx: 0, lastV: spin.v };
  const up = new THREE.Vector3(), qInv = new THREE.Quaternion(), qTmp = new THREE.Quaternion();

  let visible = false, last = performance.now(), t = 0;
  let disposed = false;
  const io = new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting && !disposed;
    // only one frame loop at a time: re-entering view must not start a second one
    if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
  });
  io.observe(canvas);

  function frame(now) {
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    if (!spin.dragging) {
      const idle = REDUCED ? 0 : 0.35;
      spin.v += (idle - spin.v) * Math.min(1, dt * 1.6);
      spin.a += spin.v * dt;
    }
    spin.tilt += (spin.tiltT - spin.tilt) * Math.min(1, dt * 4);
    pivot.rotation.set(spin.tilt * 0.5, spin.a, 0.12 + Math.sin(t * 0.7) * (REDUCED ? 0 : 0.03));
    pivot.position.y = REDUCED ? 0 : Math.sin(t * 1.1) * 0.06;
    shadow.scale.setScalar(1 - pivot.position.y * 0.6);

    if (mix < 1) {
      mix = Math.min(1, mix + dt * 2.2);
      const e = 1 - (1 - mix) ** 3;
      bodyMat.color.copy(from).lerp(to, e);
      dash.liquidMat.color.copy(liqFrom).lerp(liqTo, e);
    }
    // liquid stays level in world space, with a damped slosh kicked by spin acceleration
    const kick = (spin.v - slosh.lastV) * 0.012;
    slosh.lastV = spin.v;
    slosh.vx += (-slosh.x * 60 - slosh.vx * 4) * dt + kick;
    slosh.x += slosh.vx * dt;
    pivot.updateMatrixWorld();
    up.set(0, 1, 0).applyQuaternion(qInv.copy(device.getWorldQuaternion(qTmp)).invert());
    up.x += slosh.x * Math.cos(spin.a); up.z -= slosh.x * Math.sin(spin.a);
    dash.setSurface(up.x / up.y, up.z / up.y);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // for tests and stills: hold the model at a given angle
  const pose = a => { spin.a = a; spin.v = 0; spin.dragging = true; };
  // forceContextLoss() would block the page for seconds while the GPU flushes; dropping the renderer is enough
  const dispose = () => { disposed = true; visible = false; io.disconnect(); ro.disconnect(); renderer.dispose(); };
  return { setFlavor, pose, dispose };
}
