const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the same geometry scripts in the same order as the browser build.
const scripts = ['architecture.js', 'loft.js', 'studies.js'].map(name =>
  fs.readFileSync(path.join(__dirname, '..', 'web', name), 'utf8')
).join('\n');

function hall(dimensions = [78, 38, 26], overrides = {}, name = 'ribbon') {
  const context = vm.createContext({ C: 343 });
  vm.runInContext(scripts, context);
  const shape = vm.runInContext('SHAPES', context)[name];
  const defaults = Object.fromEntries(Object.entries(shape.params).map(([k, p]) => [k, p.value]));
  context.ROOM = shape.mesh(...dimensions, { ...defaults, ...overrides }, 'test');
  return context;
}

test('a ray between the two crests is blocked by the saddle', () => {
  const { clearSegment, nearestPanel } = hall();
  const start = [19.5, 19, 18.5], end = [56.16, 19, 18.5];
  for (const [x, y, z] of [start, end]) {
    const hit = {};
    assert.equal(nearestPanel(x, y, 1, 0, 0, 1, 40, hit).role, 'roof');
    assert.ok(1 + hit.distance > z, 'both ends of the segment are inside');
  }
  assert.equal(clearSegment(start, end), false);
  assert.equal(clearSegment(end, start), false);
  assert.equal(clearSegment([start[0], 19, 1.6], [end[0], 19, 1.6]), true);
});

test('volume equals the integral of roof height at slider limits', () => {
  for (const [dimensions, controls] of [
    [[78, 38, 26], {}],
    [[5, 2, 4], { sweep: -75, taper: 65, position: 25, saddle: 80, lift: 70 }],
    [[150, 50, 45], { sweep: 75, taper: 0, position: 75, saddle: 0, lift: 0 }],
  ]) {
    const { ROOM, nearestPanel } = hall(dimensions, controls);
    const roof = ROOM.faces.filter(f => f.role === 'roof');
    let volume = 0, footprint = 0;
    for (const f of roof) {
      const [a, b, c] = f.ix.map(i => ROOM.V[i]);
      const area = ((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])) / 2;
      assert.ok(area > 0, 'each triangle covers positive floor area');
      volume += area * (a[2] + b[2] + c[2]) / 3;
      footprint += area;
      const hit = {};
      assert.equal(nearestPanel(f.c[0], f.c[1], 1, 0, 0, 1, dimensions[2], hit), f);
      assert.ok(Math.abs(1 + hit.distance - f.c[2]) < 1e-7);
    }
    assert.ok(Math.abs(volume - ROOM.vol) < 1e-7 * volume);
    assert.ok(Math.abs(footprint - ROOM.faces.find(f => f.floor).area) < 1e-7 * footprint);
  }
});

test('roof echoes connect source and seat along two visible legs', () => {
  const { clearSegment, ribbonImages } = hall();
  const src = [14, 18, 1.2], seat = [47, 22, 1.6];
  const paths = ribbonImages(src, seat, 0).filter(im => im.face?.role === 'roof');
  assert.ok(paths.length > 0);
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  for (const im of paths) {
    assert.ok(clearSegment(src, im.hit) && clearSegment(seat, im.hit));
    const length = distance(src, im.hit) + distance(im.hit, seat);
    assert.ok(Math.abs(length - distance([im.x, im.y, im.z], seat)) < 1e-8);
  }
});

test('rays escape through the petal oculus and reflect when it closes', () => {
  const size = [52, 48, 19], source = [26, 24, 1.2], listener = [26, 24, 1.6];
  const volumes = [];
  for (const oculus of [0, 1, 55]) {
    const { ROOM, nearestPanel, ribbonRay, ribbonImages } = hall(size, { oculus }, 'petal');
    volumes.push(ROOM.vol);
    const hit = {}, face = nearestPanel(...source, 0, 0, 1, 100, hit);
    const segments = ribbonRay(source, 0, 0, 1);
    assert.equal(face.open, oculus > 0);
    assert.equal(segments.length === 1, oculus > 0);
    assert.ok(Math.abs(hit.distance - segments[0].end) < 1e-8);
    assert.ok(ribbonImages(source, listener, 0).every(im => !im.face?.open));
    if (oculus) {
      // Polygonal ellipse of semiaxes a, b with equally spaced parameter angles.
      const n = face.ix.length, [a, b] = size.slice(0, 2).map(v => v*oculus/200);
      assert.ok(Math.abs(face.area - n/2*a*b*Math.sin(2*Math.PI/n)) < 1e-8);
    } else assert.equal(ROOM.faces.filter(f => f.open).length, 0);
  }
  assert.ok(Math.max(...volumes) - Math.min(...volumes) < 1e-7, 'opening changes independently of volume');
});

test('the flat fan and untwisted lantern agree with their prism volumes', () => {
  const [L, W, H] = [52, 28, 17];
  const fan = hall([L,W,H], { folds: 9, stage: 35, depth: 0, rake: 0 }, 'fan').ROOM;
  const lantern = hall([L,W,H], { twist: 0, sides: 4, crown: 100 }, 'lantern').ROOM;
  assert.ok(Math.abs(fan.vol - H*L*W*(1+0.35)/2) < 1e-7);
  assert.ok(Math.abs(lantern.vol - H*lantern.faces.find(f => f.floor).area) < 1e-7);
});

test('the three envelopes close edge to edge at the slider extremes', () => {
  const settings = {
    petal: [{ petals: 3, curl: -45, relief: 85, oculus: 0 }, { petals: 8, curl: 45, relief: 0, oculus: 55 }],
    fan: [{ folds: 2, stage: 20, depth: 85, rake: 95 }, { folds: 9, stage: 100, depth: 0, rake: 0 }],
    lantern: [{ sides: 3, twist: -150, rounding: 5, crown: 45 }, { sides: 6, twist: 150, rounding: 45, crown: 100 }],
  };
  for (const [name, extremes] of Object.entries(settings)) {
    for (const [index, controls] of extremes.entries()) {
      const size = index === 0 ? [5, 2, 4] : [150, 50, 45];
      const { ROOM } = hall(size, controls, name);
      assert.ok(ROOM.vol > 0 && ROOM.vol <= size[0]*size[1]*size[2]*(1+1e-10));
      const edges = new Map();
      for (const face of ROOM.faces) {
        assert.ok(face.area > 0);
        for (let i = 0; i < face.ix.length; i++) {
          const a = face.ix[i], b = face.ix[(i+1)%face.ix.length];
          const key = [Math.min(a,b), Math.max(a,b)].join(',');
          const incident = edges.get(key) || [];
          incident.push(Math.sign(b-a));
          edges.set(key, incident);
          const v = ROOM.V[a];
          assert.ok(Math.abs(face.n.reduce((s,n,i) => s+n*v[i], 0)-face.d) < 1e-7, 'panel is planar');
        }
      }
      for (const [a,b,...extra] of edges.values()) {
        assert.ok(a === -b && extra.length === 0, 'adjacent panels wind in opposite directions');
      }
    }
  }
});
