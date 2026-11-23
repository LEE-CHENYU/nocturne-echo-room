const degrees = (label, value, min, max) => ({ label, value, min, max, step: 1, unit: '°' });

SHAPES.petal = {
  params: {
    petals: count('Roof petals', 5, 3, 8),
    oculus: percent('Oculus diameter / span', 26, 0, 55),
    relief: percent('Petal groove depth / roof rise', 74, 0, 85),
    curl: degrees('Petal rotation toward oculus', 28, -45, 45),
  },
  mesh: buildPetalAtrium,
};

SHAPES.fan = {
  params: {
    folds: count('Roof folds', 5, 2, 9),
    stage: percent('Stage width / rear width', 30, 20, 100),
    depth: percent('Fold depth / roof rise', 66, 0, 85),
    rake: percent('Valley rise toward rear', 65, 0, 95),
  },
  tone: [1.05, 0.89, 0.71],
  mesh: buildFoldedFan,
};

SHAPES.lantern = {
  params: {
    twist: degrees('Twist from base to crown', 108, -150, 150),
    sides: count('Sides of each section', 3, 3, 6),
    crown: percent('Crown width / base width', 76, 45, 100),
    rounding: percent('Corner rounding / side length', 18, 5, 45),
  },
  tone: [0.91, 0.87, 1.06],
  mesh: buildSpiralLantern,
};

function buildPetalAtrium(L, W, H, p, key) {
  const mesh = new PanelMesh(), rings = [];
  const bands = 6, sectors = 8*p.petals;
  const opening = p.oculus/100, collar = SHAPES.petal.params.oculus.max/100, curl = p.curl*Math.PI/180;
  const base = Math.max(2.5, 0.12*H), rise = H-base;
  // Crests peak halfway out. Their angular position turns as the radius changes.
  for (let band = 0; band <= bands; band++) {
    const t = band/bands, radius = collar + (1-collar)*t;
    const arch = Math.sin(Math.PI*t);
    const crest = t <= 0.5 ? 0.67 + 0.33*arch : 0.38 + 0.62*arch;
    const groove = (0.82*arch + 0.40*t)*p.relief/100;
    const ring = [];
    for (let i = 0; i < sectors; i++) {
      const angle = 2*Math.PI*i/sectors, azimuth = angle + curl*(1-t);
      const valley = (1-Math.cos(p.petals*angle))/2;
      ring.push(mesh.vertex(L/2*(1+radius*Math.cos(azimuth)), W/2*(1+radius*Math.sin(azimuth)),
        base + rise*(crest - groove*valley)));
    }
    rings.push(ring);
  }
  // Blades fill the flat collar up to the aperture. Opening it changes
  // the escape area while the enclosing volume and outer petals stay fixed.
  const lip = rings[0], eaves = rings[rings.length-1];
  mesh.outline(lip);
  if (opening === 0) mesh.panel(lip, 'roof');
  else if (opening === collar) mesh.panel(lip, 'opening');
  else {
    const inner = lip.map(k => {
      const [x,y,z] = mesh.V[k], ratio = opening/collar;
      return mesh.vertex(L/2 + (x-L/2)*ratio, W/2 + (y-W/2)*ratio, z);
    });
    mesh.panel(inner, 'opening');
    mesh.outline(inner);
    for (let i = 0; i < sectors; i++) {
      const next = (i+1)%sectors;
      mesh.panel([inner[i], lip[i], lip[next], inner[next]], 'roof');
      if (i%8 === 0) mesh.edges.push([inner[i], lip[i]]);
    }
  }
  for (let band = 1; band < rings.length; band++) {
    const inner = rings[band-1], outer = rings[band];
    for (let i = 0; i < sectors; i++) {
      const next = (i+1)%sectors;
      mesh.splitQuad(inner[i], outer[i], outer[next], inner[next], 'roof');
      if (i%4 === 0) mesh.edges.push([inner[i], outer[i]]);
    }
  }
  const floor = eaves.map(k => mesh.vertex(mesh.V[k][0], mesh.V[k][1], 0));
  for (let i = 0; i < sectors; i++) {
    const next = (i+1)%sectors;
    mesh.panel([floor[i], floor[next], eaves[next], eaves[i]], 'wall');
    if (i%4 === 0) mesh.edges.push([floor[i], eaves[i]]);
  }
  mesh.outline(floor);
  mesh.outline(eaves);
  mesh.panel(floor.reverse(), 'floor');
  return mesh.room(key);
}

function buildFoldedFan(L, W, H, p, key) {
  const mesh = new PanelMesh(), last = 2*p.folds;
  const base = Math.max(2.5, H*0.18), rise = H-base, depth = p.depth/100;
  function section(u) {
    const width = p.stage/100 + (1-p.stage/100)*u;
    const valley = base + rise*(1-depth)*(1 - p.rake/100*(1-u));
    const floor = [], roof = [];
    for (let j = 0; j <= last; j++) {
      const y = W*(0.5 + width*(j/last - 0.5));
      floor.push(mesh.vertex(L*u, y, 0));
      roof.push(mesh.vertex(L*u, y, valley + (j%2)*rise*depth*width));
    }
    return {floor, roof};
  }
  const front = section(0), back = section(1);
  for (let j = 0; j < last; j++) {
    const k = j+1;
    // Fold height and bay width increase in proportion, so each roof plate is planar.
    mesh.panel([front.roof[j], back.roof[j], back.roof[k], front.roof[k]], 'roof');
    mesh.panel([front.floor[k], front.floor[j], front.roof[j], front.roof[k]], 'wall');
    mesh.panel([back.floor[j], back.floor[k], back.roof[k], back.roof[j]], 'wall');
    mesh.edges.push([front.roof[j], front.roof[k]], [back.roof[j], back.roof[k]]);
  }
  for (let j = 0; j <= last; j++) mesh.edges.push([front.roof[j], back.roof[j]]);
  mesh.panel([front.floor[0], back.floor[0], back.roof[0], front.roof[0]], 'wall');
  mesh.panel([back.floor[last], front.floor[last], front.roof[last], back.roof[last]], 'wall');
  for (const end of [front, back]) {
    mesh.edges.push([end.floor[0], end.roof[0]], [end.floor[last], end.roof[last]]);
  }
  const floor = front.floor.concat([...back.floor].reverse());
  mesh.outline(floor);
  mesh.panel(floor, 'floor');
  return mesh.room(key);
}

function buildSpiralLantern(L, W, H, p, key) {
  const mesh = new PanelMesh(), section = [], rings = [];
  const corners = Array.from({ length: p.sides }, (_, i) => {
    const a = 2*Math.PI*i/p.sides - Math.PI/2;
    return [Math.cos(a), Math.sin(a)];
  });
  const fillet = p.rounding/100, samplesPerSide = 9;
  for (let i = 0; i < corners.length; i++) {
    const v = corners[i], prev = corners[(i+p.sides-1)%p.sides], next = corners[(i+1)%p.sides];
    // A quadratic curve rounds each corner and joins both straight sides tangentially.
    for (let k = 0; k <= 4; k++) {
      const t = k/4;
      section.push(v.map((a, axis) => a + fillet*((1-t)**2*(prev[axis]-a) + t*t*(next[axis]-a))));
    }
    // Subdivide each straight side too. Its surface curves as the section rotates.
    for (let k = 1; k <= 4; k++) {
      const t = fillet + (1-2*fillet)*k/5;
      section.push(v.map((a, axis) => a + t*(next[axis]-a)));
    }
  }
  const base = Math.max(2.5, H*0.09), tiers = 12;
  const floor = section.map(([x,y]) => mesh.vertex(x, y, 0));
  for (let tier = 0; tier <= tiers; tier++) {
    const t = tier/tiers, angle = p.twist*Math.PI/180*t;
    const radius = 1 + (p.crown/100-1)*t;
    rings.push(section.map(([x,y]) => mesh.vertex(
      radius*(x*Math.cos(angle)-y*Math.sin(angle)),
      radius*(x*Math.sin(angle)+y*Math.cos(angle)), base + (H-base)*t)));
  }
  // Fit the entire twisting envelope to the requested dimensions before measuring the faces.
  for (const [axis, span] of [L, W].entries()) {
    const values = mesh.V.map(v => v[axis]), low = Math.min(...values), high = Math.max(...values);
    for (const v of mesh.V) v[axis] = span*(v[axis]-low)/(high-low);
  }
  mesh.panel([...floor].reverse(), 'floor');
  mesh.outline(floor);
  for (let tier = 0; tier <= tiers; tier++) {
    const low = tier === 0 ? floor : rings[tier-1], high = rings[tier];
    for (let i = 0; i < section.length; i++) {
      const next = (i+1)%section.length;
      if (tier === 0) mesh.panel([low[i], low[next], high[next], high[i]], 'wall');
      else mesh.splitQuad(low[i], low[next], high[next], high[i], 'shell');
      if (i%samplesPerSide === 0 || i%samplesPerSide === 4) mesh.edges.push([low[i], high[i]]);
    }
    if (tier%3 === 0) mesh.outline(high);
  }
  mesh.panel(rings[tiers], 'roof');
  return mesh.room(key);
}
