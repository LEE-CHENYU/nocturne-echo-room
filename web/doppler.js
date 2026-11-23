// Phase counts turns. The tangent is the derivative with respect to radians,
// so multiplying it by 2π times the cycle frequency gives velocity in m/s.
const fullTurn = 2 * Math.PI;
const motionClock = () => ctx ? ctx.currentTime : performance.now() / 1000;
let listenerPass = null, delayLoop = null;
const phaseAt = (pass, time) => pass.phase + (time - pass.epoch) * pass.hz;
const passHz = maxTangent => maxTangent > 0 ? Number($('passSpeed').value) / (fullTurn * maxTangent) : 0;

function samplePass(pass, phase) {
  const angle = fullTurn * phase, sin = Math.sin(angle), cos = Math.cos(angle);
  // For the straight path, the cross-axis vector has zero length.
  const cross = pass.shape === 'eight' ? 2 * sin * cos : cos;
  const crossSlope = pass.shape === 'eight' ? 2 * Math.cos(2 * angle) : -sin;
  return {
    x: pass.cx + pass.rx * sin + pass.sx * cross,
    y: pass.cy + pass.ry * sin + pass.sy * cross,
    tx: pass.rx * cos + pass.sx * crossSlope,
    ty: pass.ry * cos + pass.sy * crossSlope,
  };
}

function earClearance(face, x, y) {
  const [nx, ny, nz] = face.n;
  return face.d - nx*x - ny*y - nz*S.ez - 0.18 * Math.hypot(nx, ny);
}

// The oval's extent along a wall normal is hypot(n·major, n·minor).
// A figure eight with cross term b sin(2θ) fits inside an ellipse of
// half-width 2b because |sin(2θ)| <= 2|cos(θ)|.
function fitLoopWidth(cx, cy, ux, uy, major, eight) {
  let width = Math.abs(major) * 0.65;
  for (const face of (ROOM.walkFaces || ROOM.faces)) {
    const [nx, ny] = face.n;
    const across = Math.abs(-nx*uy + ny*ux);
    if (across < 1e-10) continue;
    const clearance = Math.max(0, earClearance(face, cx, cy));
    const along = major * (nx*ux + ny*uy);
    const available = Math.sqrt(Math.max(0, clearance**2 - along**2));
    width = Math.min(width, available / (across * (eight ? 2 : 1)));
  }
  return width * 0.96;
}

function startListenerPass() {
  if ((ROOM.walkFaces || ROOM.faces).some(face => earClearance(face, ...S.seat) < -1e-8)) pullInside(S.seat, S.ez, 0.2);
  if (!listenerPass || listenerPass.room !== ROOM || listenerPass.seat !== S.seat) facePiano();
  const [x, y] = S.seat;
  let dx = S.piano[0] - x, dy = S.piano[1] - y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) {
    dx = S.L >= S.W ? 1 : 0;
    dy = 1 - dx;
  } else {
    // Aim just beside the instrument so the listener passes it on one side.
    const miss = Math.min(1.4, 0.1 * S.W, 0.2 * distance);
    const nx = -dy / distance, ny = dx / distance;
    dx += nx * miss;
    dy += ny * miss;
  }
  const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
  let near = -Infinity, far = Infinity;
  for (const face of (ROOM.walkFaces || ROOM.faces)) {
    const n = face.n;
    const slope = n[0] * ux + n[1] * uy;
    if (Math.abs(slope) < 1e-10) continue;
    const space = earClearance(face, x, y);
    if (slope > 0) far = Math.min(far, space / slope);
    else near = Math.max(near, space / slope);
  }
  const shape = $('passShape').value;
  let major = Math.max(0, (far - near) / 2), mid = (far + near) / 2;
  let phase = major ? Math.asin(Math.max(-1, Math.min(1, -mid / major))) / fullTurn : 0;
  let width = 0;
  if (shape !== 'straight') {
    // Start the loop at the current seat. Turn into the room when the source
    // is immediately against the near wall.
    const reach = far >= -near * 0.45 ? far : near;
    major = 0.46 * reach;
    mid = major;
    phase = -0.25;
    width = fitLoopWidth(x + ux*mid, y + uy*mid, ux, uy, major, shape === 'eight');
  }
  const maxTangent = shape === 'eight' ? Math.hypot(major, 2*width) : Math.max(Math.abs(major), width);
  listenerPass = {
    shape, cx: x + ux * mid, cy: y + uy * mid, rx: ux * major, ry: uy * major,
    sx: -uy * width, sy: ux * width, maxTangent,
    phase, epoch: motionClock(), hz: passHz(maxTangent), room: ROOM, seat: S.seat,
  };
  const phases = shape === 'straight' ? [-0.25, 0.25] : Array.from({length: 97}, (_, i) => i/96);
  listenerPass.outline = phases.map(p => {
    const point = samplePass(listenerPass, p);
    return [point.x, point.y];
  });
  configurePassDelays();
}

function placeListener(pass, phase) {
  const point = samplePass(pass, phase);
  S.seat[0] = point.x;
  S.seat[1] = point.y;
  return point;
}

function stopListenerPass() {
  if (!listenerPass) return;
  placeListener(listenerPass, phaseAt(listenerPass, motionClock()));
  listenerPass = null;
  configurePassDelays();
}

// Drive the existing delay AudioParams with one looping four-channel control
// signal. Its samples are travel times in seconds. The audio thread interpolates
// them even between animation frames. The music source keeps its own clock.
function configurePassDelays() {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (delayLoop) {
    delayLoop.source.stop(t);
    delayLoop.source.disconnect();
    delayLoop.splitter.disconnect();
    delayLoop = null;
  }
  const params = [dirDelay[0].delayTime, dirDelay[1].delayTime, earlyDelay.delayTime, tailDelay.delayTime];
  const [leftX, leftY] = leftVec(S.face);
  const ex = leftX * S.ear, ey = leftY * S.ear, dz = S.ez - S.pz;
  function delaysAt(x, y) {
    const dx = x - S.piano[0], dy = y - S.piano[1];
    const direct = Math.hypot(dx, dy, dz) / C;
    return [Math.hypot(dx + ex, dy + ey, dz) / C, Math.hypot(dx - ex, dy - ey, dz) / C,
      Math.max(0, direct - 0.001), direct];
  }
  const stationary = delaysAt(...S.seat);
  const moving = listenerPass && listenerPass.hz > 0;
  params.forEach((param, i) => {
    param.cancelScheduledValues(t);
    param.setValueAtTime(moving ? 0 : stationary[i], t);
  });
  if (!moving) return;

  const pass = listenerPass, samples = 2048;
  const cycle = ctx.createBuffer(params.length, samples, ctx.sampleRate);
  const channels = params.map((_, i) => cycle.getChannelData(i));
  for (let i = 0; i < samples; i++) {
    const point = samplePass(pass, i / samples);
    const delays = delaysAt(point.x, point.y);
    for (let ch = 0; ch < channels.length; ch++) channels[ch][i] = delays[ch];
  }
  const source = ctx.createBufferSource(), splitter = ctx.createChannelSplitter(params.length);
  source.buffer = cycle;
  source.loop = true;
  source.playbackRate.value = cycle.duration * pass.hz;
  source.connect(splitter);
  params.forEach((param, i) => splitter.connect(param, i));
  const phase = phaseAt(pass, t);
  source.start(t, (phase - Math.floor(phase)) * cycle.duration);
  delayLoop = { source, splitter };
}

function stepListenerPass(ts) {
  const pass = listenerPass, phase = phaseAt(pass, motionClock());
  const point = placeListener(pass, phase);
  if (ts - lastIRTs < 110) return;
  lastIRTs = ts;
  const dx = S.seat[0] - S.piano[0], dy = S.seat[1] - S.piano[1];
  const distance = Math.hypot(dx, dy, S.ez - S.pz);
  const radial = fullTurn * pass.hz * (dx * point.tx + dy * point.ty) / distance;
  const percent = Math.round(-1000 * radial / C) / 10;
  const direction = percent === 0 ? (pass.hz ? 'Level pitch' : 'Still')
    : radial < 0 ? 'Approaching' : 'Receding';
  $('passPitch').textContent = direction + ' · direct pitch ' + (percent > 0 ? '+' : '') + percent.toFixed(1) + '%';
  if (pass.hz > 0) { rebuildAudioIR(); showStats(); }
}

$('passSpeed').addEventListener('input', () => {
  $('passSpeedValue').textContent = $('passSpeed').value + ' m/s';
  if (!listenerPass) return;
  const t = motionClock(), pass = listenerPass;
  pass.phase = phaseAt(pass, t);
  pass.epoch = t;
  pass.hz = passHz(pass.maxTangent);
  placeListener(pass, pass.phase);
  if (delayLoop && pass.hz > 0) {
    delayLoop.source.playbackRate.setValueAtTime(delayLoop.source.buffer.duration * pass.hz, t);
  } else {
    configurePassDelays();
    scheduleIR();
  }
});

$('passShape').addEventListener('change', () => {
  if (!listenerPass) return;
  placeListener(listenerPass, phaseAt(listenerPass, motionClock()));
  startListenerPass();
  scheduleIR();
});

$('dopplerOn').addEventListener('change', () => {
  const enabled = $('dopplerOn').checked;
  $('passControls').hidden = !enabled;
  for (const radio of document.querySelectorAll('input[name=dance]')) radio.disabled = enabled;
  if (enabled) {
    holoReset();
    startListenerPass();
  } else {
    stopListenerPass();
    lastWaltzTs = null;
    lastBeatPos = null;
    if (!waltzOn()) facePiano();
  }
  setSrcLabels();
  $('planHint').textContent = enabled
    ? 'The listener follows the blue path. Switch trajectories while listening, or drag your head or the source to set a new path.'
    : HINTS[dance()];
  applyRoomToggle();
  scheduleIR();
});
