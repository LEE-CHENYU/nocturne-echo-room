// Finite panels preserve folds, creases and openings in the room envelope.
// The lower walls enclose a convex floor at piano and listener height.
SHAPES.ribbon = {
  params: {
    sweep: percent('Ridge sweep / half-width', 61, -75, 75),
    saddle: percent('Saddle depth / vault rise', 65, 0, 80),
    position: percent('Saddle position / length', 46, 25, 75),
    lift: percent('Opposing eave lift / vault rise', 49, 0, 70),
    taper: percent('End narrowing / width', 44, 0, 65),
  },
  mesh: buildRibbonHall,
};

function buildRibbonHall(L, W, H, p, key) {
  const mesh = new PanelMesh(), { V, edges } = mesh, stations = [];
  const spans = 20, bays = 12, eaves = Math.max(2.5, H * 0.16);
  let maxRise = 0;
  for (let i = 0; i <= spans; i++) {
    const u = i / spans, bulge = Math.sin(Math.PI * u);
    const half = W/2 * (1 - p.taper/100 * (1-bulge));
    const drift = p.sweep/100 * Math.sin(2*Math.PI*u);
    const dip = Math.exp(-(((u-p.position/100)/0.17) ** 2));
    const crown = (0.38 + 0.62*bulge) * (1 - p.saddle/100*dip);
    const roof = [];
    for (let j = 0; j <= bays; j++) {
      const angle = Math.PI*j/bays, c = -Math.cos(angle);
      // Monotone across the span even at maximum sweep; the two eaves stay put.
      const y = W/2 + half * (c+drift)/(1+drift*c);
      const rise = crown * Math.sin(angle);
      roof.push(mesh.vertex(L*u, y, rise));
      maxRise = Math.max(maxRise, rise);
    }
    stations.push({roof, left: mesh.vertex(L*u,W/2-half,0), right: mesh.vertex(L*u,W/2+half,0)});
  }
  for (let i=0; i<=spans; i++) {
    const tilt = Math.sin(2*Math.PI*i/spans);
    for (let j=0; j<=bays; j++) {
      const v = V[stations[i].roof[j]];
      const bank = p.lift/200 * (1 - Math.cos(Math.PI*j/bays)*tilt);
      v[2] = eaves + (H-eaves) * (bank + (1-bank)*v[2]/maxRise);
    }
  }

  const floorV = [...stations.map(s=>s.right), ...stations.map(s=>s.left).reverse()];
  mesh.panel(floorV, 'floor');
  for (let i = 0; i <= spans; i++) {
    const a = stations[i];
    if (i%2 === 0) for (let j = 0; j < bays; j++) edges.push([a.roof[j],a.roof[j+1]]);
    if (i === 0 || i === spans) {
      const cap = [a.left,...a.roof,a.right];
      mesh.panel(i === 0 ? cap : cap.reverse(), 'wall');
      edges.push([a.left,a.roof[0]], [a.right,a.roof[bays]], [a.left,a.right]);
    }
    if (i === spans) break;
    const b = stations[i+1];
    mesh.panel([a.left,b.left,b.roof[0],a.roof[0]], 'wall');
    mesh.panel([b.right,a.right,a.roof[bays],b.roof[bays]], 'wall');
    edges.push([a.left,b.left], [a.right,b.right]);
    for (let j = 0; j <= bays; j++) {
      if (j%2 === 0) edges.push([a.roof[j],b.roof[j]]);
      if (j === bays) break;
      mesh.splitQuad(a.roof[j], b.roof[j], b.roof[j+1], a.roof[j+1], 'roof');
    }
  }
  return mesh.room(key);
}

class PanelMesh {
  constructor() {
    this.V = [];
    this.faces = [];
    this.edges = [];
  }

  vertex(x, y, z) {
    return this.V.push([x, y, z]) - 1;
  }

  // Vertices wind counterclockwise as viewed from outside. A panel is planar and convex.
  panel(ix, role) {
    const { V, faces } = this;
    const a = V[ix[0]], norm = [0,0,0];
    for (let i = 1; i+1 < ix.length; i++) {
      const b = V[ix[i]], c = V[ix[i+1]];
      const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
      const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
      norm[0] += uy*vz-uz*vy; norm[1] += uz*vx-ux*vz; norm[2] += ux*vy-uy*vx;
    }
    const length = Math.hypot(...norm), n = norm.map(v => v/length);
    const c = [0,1,2].map(q => ix.reduce((s,k) => s+V[k][q],0)/ix.length);
    const bounds = [0,1,2].map(q => ix.map(k => V[k][q]));
    // Inward edge planes provide a finite-polygon test after ray/plane intersection.
    const sides = [];
    for (let i = 0; i < ix.length; i++) {
      const v = V[ix[i]], w = V[ix[(i+1)%ix.length]];
      const x=w[0]-v[0], y=w[1]-v[1], z=w[2]-v[2];
      const nx=n[1]*z-n[2]*y, ny=n[2]*x-n[0]*z, nz=n[0]*y-n[1]*x;
      sides.push(nx,ny,nz,nx*v[0]+ny*v[1]+nz*v[2]);
    }
    faces.push({ix, n, c, id:faces.length, area:length/2, d:n[0]*a[0]+n[1]*a[1]+n[2]*a[2],
      lo:bounds.map(v=>Math.min(...v)), hi:bounds.map(v=>Math.max(...v)),
      sides, role, floor:role==='floor', open:role==='opening'});
  }

  splitQuad(a, b, c, d, role) {
    this.panel([a, b, c], role);
    this.panel([a, c, d], role);
  }

  outline(ring) {
    ring.forEach((a, i) => this.edges.push([a, ring[(i+1) % ring.length]]));
  }

  room(key) {
    const { V, faces, edges } = this;
    const floorV = faces.find(f => f.floor).ix, sec = floorV.map(k => V[k].slice(0, 2));
    const bounds = axis => [Math.min(...sec.map(p => p[axis])), Math.max(...sec.map(p => p[axis]))];
    const vol = faces.reduce((v, f) => v + f.area*f.d/3, 0);
    return { key, V, faces, edges, floorV, sec, vol, fx: bounds(0), fy: bounds(1),
      shaped: true, order: 1, openC: faces.find(f => f.open)?.c,
      walkFaces: faces.filter(f => f.role === 'wall'), tree: panelTree(faces), stack: [] };
  }
}

// A small bounding-volume hierarchy shared by reflection visibility and the wavefront tracer.
function panelTree(panels) {
  const lo = [0,1,2].map(k=>Math.min(...panels.map(f=>f.lo[k])));
  const hi = [0,1,2].map(k=>Math.max(...panels.map(f=>f.hi[k])));
  if (panels.length <= 6) return {lo, hi, panels};
  const spread = hi.map((v,k)=>v-lo[k]);
  const axis = spread.indexOf(Math.max(...spread));
  const ordered = [...panels].sort((a,b)=>a.c[axis]-b.c[axis]), half=ordered.length>>1;
  return {lo, hi, left:panelTree(ordered.slice(0,half)), right:panelTree(ordered.slice(half))};
}

function onPanel(f,x,y,z) {
  const e=f.sides;
  for (let i=0; i<e.length; i+=4) if (e[i]*x+e[i+1]*y+e[i+2]*z < e[i+3]-1e-8) return false;
  return true;
}

function nearestPanel(x,y,z, dx,dy,dz, limit, result) {
  const stack=ROOM.stack, invX=dx ? 1/dx : 1e30, invY=dy ? 1/dy : 1e30, invZ=dz ? 1/dz : 1e30;
  stack.length=0; stack.push(ROOM.tree);
  let hit=null;
  while (stack.length) {
    const node=stack.pop(), a=node.lo, b=node.hi;
    const x0=(a[0]-x)*invX, x1=(b[0]-x)*invX, y0=(a[1]-y)*invY, y1=(b[1]-y)*invY, z0=(a[2]-z)*invZ, z1=(b[2]-z)*invZ;
    if (Math.max(0,Math.min(x0,x1),Math.min(y0,y1),Math.min(z0,z1)) >
        Math.min(limit,Math.max(x0,x1),Math.max(y0,y1),Math.max(z0,z1))+1e-8) continue;
    if (!node.panels) { stack.push(node.left,node.right); continue; }
    for (const f of node.panels) {
      const n=f.n, den=n[0]*dx+n[1]*dy+n[2]*dz;
      if (den <= 1e-10) continue; // first exit from the interior
      const t=(f.d-n[0]*x-n[1]*y-n[2]*z)/den;
      if (t<=1e-7 || t>=limit || !onPanel(f,x+t*dx,y+t*dy,z+t*dz)) continue;
      limit=t; hit=f;
    }
  }
  if (hit && result) result.distance=limit;
  return hit;
}

function clearSegment(a,b) {
  const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2], len=Math.hypot(dx,dy,dz);
  return len < 1e-6 || !nearestPanel(...a,dx/len,dy/len,dz/len,len-1e-6);
}

function ribbonImages(src, head, dmax) {
  const cached = ROOM.echoPaths;
  if (cached && cached.x===src[0] && cached.y===src[1] && cached.z===src[2] &&
      cached.hx===head[0] && cached.hy===head[1] && cached.hz===head[2]) {
    return dmax ? cached.images.filter(im=>Math.hypot(im.x-head[0],im.y-head[1],im.z-head[2])<=dmax+1) : cached.images;
  }
  const result=[{x:src[0],y:src[1],z:src[2],o:0,g:1}];
  for (const f of ROOM.faces) {
    if (f.open) continue;
    const n=f.n, sd=n[0]*src[0]+n[1]*src[1]+n[2]*src[2]-f.d;
    if (sd >= 0) continue;
    const x=src[0]-2*sd*n[0], y=src[1]-2*sd*n[1], z=src[2]-2*sd*n[2];
    const dx=head[0]-x, dy=head[1]-y, dz=head[2]-z;

    const t=sd/(n[0]*dx+n[1]*dy+n[2]*dz);
    if (!(t>0 && t<1)) continue;
    const h=[x+t*dx,y+t*dy,z+t*dz];
    if (!onPanel(f,...h) || !clearSegment(src,h) || !clearSegment(head,h)) continue;
    if (result.some(im=>Math.abs(im.x-x)+Math.abs(im.y-y)+Math.abs(im.z-z)<1e-6)) continue;
    result.push({x,y,z,o:1,g:1,hit:h,face:f});
  }
  ROOM.echoPaths={x:src[0],y:src[1],z:src[2],hx:head[0],hy:head[1],hz:head[2],images:result};
  return dmax ? result.filter(im=>Math.hypot(im.x-head[0],im.y-head[1],im.z-head[2])<=dmax+1) : result;
}

// Only the distance changes when the next video frame redraws the same ray.
// Cache its segments up to the maximum displayed travel distance.
function ribbonRay(src,dx,dy,dz) {
  let [x,y,z]=src, start=0, sig=0;
  const segments=[], hit={distance:0};
  for (let i=0; i<=6; i++) {
    const f=nearestPanel(x,y,z,dx,dy,dz,C-start,hit);
    const end=f ? start+hit.distance : C;
    segments.push({x,y,z,dx,dy,dz,start,end,sig});
    if (!f || f.open) break;
    x+=dx*hit.distance; y+=dy*hit.distance; z+=dz*hit.distance;
    const n=f.n, dot=2*(n[0]*dx+n[1]*dy+n[2]*dz);
    dx-=dot*n[0]; dy-=dot*n[1]; dz-=dot*n[2];
    sig=(sig*541+f.id+1)%1e12;
    start=end;
  }
  return segments;
}

function pointAlongRay(ray,r,q) {
  for (let i=0; i<ray.length; i++) {
    const s=ray[i];
    if (r>s.end) continue;
    const t=r-s.start;
    q[0]=s.x+t*s.dx; q[1]=s.y+t*s.dy; q[2]=s.z+t*s.dz;
    TSIG=s.sig;
    return i;
  }
  return -1;
}

function traceRibbon(src,dx,dy,dz,r,q) {
  return pointAlongRay(ribbonRay(src,dx,dy,dz),r,q);
}

function wavePoint(src,directions,i,r,q) {
  const k=3*i;
  if (!ROOM.tree) return tracePt(src,directions[k],directions[k+1],directions[k+2],r,q);
  let cache=ROOM.waveCache;
  if (!cache || cache.x!==src[0] || cache.y!==src[1] || cache.z!==src[2]) {
    cache=ROOM.waveCache={x:src[0],y:src[1],z:src[2],bundles:new Map()};
  }
  let rays=cache.bundles.get(directions);
  if (!rays) { rays=[]; cache.bundles.set(directions,rays); }
  if (!rays[i]) rays[i]=ribbonRay(src,directions[k],directions[k+1],directions[k+2]);
  return pointAlongRay(rays[i],r,q);
}

function drawPanelSurfaces(g, projected, eye) {
  const tone = SHAPES[S.shape].tone || [1, 1, 1];
  const surfaces = [];
  for (const face of ROOM.faces) {
    if (face.floor || face.open) continue;
    const points = face.ix.map(k => projected[k]);
    if (points.every(Boolean)) {
      surfaces.push({face, points, depth: points.reduce((v, p) => v + p[2], 0)/points.length});
    }
  }
  surfaces.sort((a, b) => b.depth - a.depth);
  for (const {face, points} of surfaces) {
    const {n, c} = face;
    const front = n[0]*(eye[0]-c[0]) + n[1]*(eye[1]-c[1]) + n[2]*(eye[2]-c[2]) > 0;
    if (face.role === 'wall') {
      g.fillStyle = front ? 'rgba(109,177,190,0.08)' : 'rgba(118,176,190,0.24)';
    } else {
      const light = Math.max(0, Math.min(1, 0.41 + 0.22*n[0] - 0.44*n[1] + 0.51*n[2]));
      const value = 66 + 171*light;
      const rgb = [value, value+13, value+19].map((v, i) => Math.min(250, Math.round(v*tone[i])));
      g.fillStyle = 'rgba('+rgb.join(',')+','+(front ? 0.58 : 0.52)+')';
    }
    poly(g, points, true); g.fill();
  }
}

// The horizontal ray family stays at piano height, below the lowest eave.
const sliceRays = new Float64Array(3*320);
for (let i=0;i<320;i++) {
  const theta=2*Math.PI*i/320;
  sliceRays[3*i]=Math.cos(theta);
  sliceRays[3*i+1]=Math.sin(theta);
}
function drawRibbonSlice(g,ev,src,r,beta,fade) {
  let prev=null, prevSignature=-1;
  const paths=[new Path2D(),new Path2D(),new Path2D()], q=[0,0,0];
  for (let i=0;i<=320;i++) {
    const order=wavePoint(src,sliceRays,i%320,r,q);
    const point=order<0 ? null : proj(...q);
    if (point && prev && TSIG===prevSignature) {
      const path=paths[Math.min(2,order)];
      path.moveTo(prev[0],prev[1]); path.lineTo(point[0],point[1]);
    }
    prev=point; prevSignature=TSIG;
  }
  for (const [i,color] of ['246,214,150','127,227,216','168,160,255'].entries()) {
    g.strokeStyle='rgba('+color+','+Math.min(0.95,ev.amp*fade*beta**i)+')';
    g.lineWidth=ev.big?1.5:1; g.stroke(paths[i]);
  }
}
