// Distances are in metres. Profile ratios are expressed as percentages of the
// named dimension so that changing the overall scale preserves the architecture.
const percent = (label, value, min, max, step = 1) => ({ label, value, min, max, step, unit: '%' });
const count = (label, value, min, max, step = 1) => ({ label, value, min, max, step, unit: '' });
const ringXY = (n, cx, cy, rx, ry, z) => Array.from({ length: n }, (_, i) => {
  const angle = 2 * Math.PI * i / n;
  return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle), z];
});
const ellipse = (L, W, z, diameter, sides) => ringXY(sides, L / 2, W / 2, L * diameter / 2, W * diameter / 2, z);
const rectangle = (L, W) => [[0, 0], [L, 0], [L, W], [0, W]];
const horizontalCap = n => n[2] > 1 - 1e-10;

const SHAPES = {
  hall: {
    params: {
      stage: percent('Stage-end width / hall width', 62, 25, 100),
      spring: percent('Vault spring height / height', 60, 15, 90),
    },
    pts(L, W, H, p) {
      return [[0, p.stage / 100], [L, 1]].flatMap(([x, width]) => {
        const radius = W * width / 2;
        const wall = H * p.spring / 100;
        const arch = Array.from({ length: 9 }, (_, i) => {
          const angle = Math.PI * i / 8;
          return [x, W / 2 + radius * Math.cos(angle), wall + (H - wall) * Math.sin(angle)];
        });
        return [[x, W / 2 - radius, 0], [x, W / 2 + radius, 0], ...arch];
      });
    },
  },
  salon: {
    params: {
      spring: percent('Cove spring height / height', 62, 20, 85),
      crown: percent('Flat ceiling width / width', 40, 15, 75),
    },
    pts(L, W, H, p) {
      const wall = H * p.spring / 100, top = p.crown / 100;
      return [[0, 1], [wall, 1], [wall + (H - wall) * 13 / 19, 1 - (1 - top) * 11 / 30], [H, top]]
        .flatMap(([z, width]) => ellipse(L, W, z, width, 10));
    },
  },
  showroom: {
    params: {
      chamfer: percent('Corner cut / shorter side', 16, 2, 40),
      eaves: percent('Eaves height / height', 68, 20, 90),
      ridge: percent('Ridge length / length', 40, 10, 90),
    },
    pts(L, W, H, p) {
      const cut = Math.min(L, W) * p.chamfer / 100, inset = L * (1 - p.ridge / 100) / 2;
      const plan = [[cut, 0], [L-cut, 0], [L, cut], [L, W-cut], [L-cut, W], [cut, W], [0, W-cut], [0, cut]];
      return [...plan.map(([x,y]) => [x,y,0]), ...plan.map(([x,y]) => [x,y,H*p.eaves/100]),
        [inset, W/2, H], [L-inset, W/2, H]];
    },
  },
  pyramid: {
    params: {
      apexX: percent('Apex position / length', 50, 25, 75),
      apexY: percent('Apex position / width', 50, 25, 75),
    },
    pts: (L, W, H, p) => [...rectangle(L, W).map(([x,y]) => [x,y,0]), [L*p.apexX/100, W*p.apexY/100, H]],
  },
  queens: {
    params: {
      eaves: percent('Eaves height / height', 75, 20, 90),
      ridge: percent('Ridge position / width', 50, 25, 75),
    },
    pts: (L, W, H, p) => [...rectangle(L, W).flatMap(([x,y]) => [[x,y,0], [x,y,H*p.eaves/100]]),
      [0, W*p.ridge/100, H], [L, W*p.ridge/100, H]],
  },
  gallery: {
    params: { top: percent('Ceiling width / floor width', 48, 15, 100) },
    pts(L, W, H, p) {
      const inset = W * (1 - p.top / 100) / 2;
      return [0, L].flatMap(x => [[x,0,0], [x,W,0], [x,inset,H], [x,W-inset,H]]);
    },
  },
  ear: {
    params: {
      backWidth: percent('Rear width / mouth width', 62, 25, 100),
      backHeight: percent('Rear height / mouth height', 72, 35, 100),
      profile: { label: 'Arch profile exponent', value: 0.75, min: 0.4, max: 1, step: 0.05, unit: '' },
    },
    pts(L, W, H, p) {
      return [[0, p.backWidth/100, p.backHeight/100], [L, 1, 1]].flatMap(([x, width, height]) => {
        const section = [];
        for (let i = 0; i < 7; i++) {
          const u = i/7, half = W * width/2 * Math.pow(Math.cos(Math.PI*u/2), p.profile);
          section.push([x,W/2-half,H*height*u], [x,W/2+half,H*height*u]);
        }
        return [...section, [x, W/2, H*height]];
      });
    },
    open: n => n[0] > 1 - 1e-10,
  },
  plaza: {
    params: {
      floor: percent('Plaza floor width / rim width', 60, 30, 90),
      terraces: count('Visible terrace count', 5, 2, 12),
    },
    pts: (L, W, H, p) => [...ellipse(L,W,0,p.floor/100,20), ...ellipse(L,W,H,1,20)],
    open: horizontalCap,
    ground: 0.14,
    decor(L, W, H, p) {
      const lines = [], bottom = p.floor/100;
      for (let i = 0; i < p.terraces; i++) {
        const width = bottom + (1-bottom)*i/p.terraces;
        for (const level of [i, i+1]) {
          const ring = ellipse(L,W,H*level/p.terraces,width,40);
          lines.push([...ring, ring[0]]);
        }
        for (const [x,y] of ellipse(L,W,0,width,20))
          lines.push([[x,y,H*i/p.terraces], [x,y,H*(i+1)/p.terraces]]);
      }
      return lines;
    },
  },
  pantheon: {
    params: {
      drum: percent('Drum height / height', 50, 20, 80),
      oculus: percent('Oculus diameter / drum diameter', 20.8, 0, 65, 0.1),
    },
    pts(L, W, H, p) {
      const wall = H*p.drum/100, top = p.oculus/100, angle = Math.acos(top);
      const points = [...ellipse(L,W,0,1,12), ...ellipse(L,W,wall,1,12)];
      for (const fraction of [0.38, 0.74]) {
        const tilt = angle * fraction;
        points.push(...ellipse(L,W,wall + (H-wall)*Math.sin(tilt)/Math.sin(angle), Math.cos(tilt),12));
      }
      return points.concat(top ? ellipse(L,W,H,top,12) : [[L/2,W/2,H]]);
    },
    open: horizontalCap,
  },
  cistern: {
    params: {
      sides: count('Perimeter facets', 18, 6, 24, 2),
      top: percent('Ceiling width / floor width', 100, 40, 100),
    },
    pts: (L, W, H, p) => [...ellipse(L,W,0,1,p.sides), ...ellipse(L,W,H,p.top/100,p.sides)],
  },
  cathedral: {
    params: {
      apse: percent('Apse depth / length', 20, 5, 45),
      spring: percent('Vault spring height / height', 30, 15, 75),
      shoulder: percent('Upper nave width / floor width', 50, 30, 80),
    },
    pts(L, W, H, p) {
      const depth = L*p.apse/100, wall = H*p.spring/100, rise = H-wall;
      const profile = [[0,1], [wall,1], [wall + rise*0.76,p.shoulder/100], [wall + rise*0.93,p.shoulder/200]];
      const points = [];
      for (const [x, scale] of [[0,1], ...[0, Math.PI/6, Math.PI/3].map(a => [L-depth+depth*Math.sin(a), Math.cos(a)])]) {
        for (const [z, width] of profile) {
          const half = W*width*scale/2;
          points.push([x,W/2-half,z], [x,W/2+half,z]);
        }
        points.push([x,W/2,H]);
      }
      return [...points, [L,W/2,0], [L,W/2,H]];
    },
  },
};
