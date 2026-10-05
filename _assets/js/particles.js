/*!
 * NexBridge particle field — WebGL 1, no dependencies.
 *
 *  Six shapes share one particle system and morph into each other:
 *    0 NexBridge mark · 1 fragmented silos · 2 four-ring platform
 *    3 layered vault  · 4 globe from Tokyo · 5 bridge
 *
 *  Modes
 *    narrative — fixed full-screen canvas; the shape follows [data-scene] sections on scroll
 *    hero      — canvas inside a page hero showing a single shape
 *
 *  Degrades gracefully: no WebGL → html.no-webgl (CSS fallback art),
 *  reduced motion → a single static frame.
 */
(function () {
  'use strict';

  var MARK = [
    'M 351.727 188.332 L 351.727 263.98 L 325.18 263.98 L 269.375 190.184 L 269.375 293.238 L 325.18 293.238 C 356 293.238 380.984 268.254 380.984 237.43 C 380.984 216.223 369.152 197.777 351.727 188.332 Z',
    'M 325.18 228.871 L 325.18 181.625 C 325.18 150.805 300.195 125.82 269.375 125.82 L 213.566 125.82 L 213.566 293.238 L 242.824 293.238 L 242.824 155.074 L 269.375 155.074 Z'
  ];
  var MARK_BOX = [213.566, 125.82, 167.418, 167.418];
  var SHAPES = 6;
  var TAU = Math.PI * 2;

  // Per-shape look: bright colour, deep colour, accent, alpha, point size, spin speed, wobble, tilt
  var STYLE = [
    { c1: [0.88, 0.93, 1.0], c2: [0.40, 0.55, 1.0], acc: [1.0, 0.42, 0.2], a: 1.0, s: 1.0, spin: 0.0, wob: 0.38, tilt: 0.08 },
    { c1: [0.74, 0.79, 0.94], c2: [0.36, 0.42, 0.68], acc: [1.0, 0.38, 0.18], a: 0.9, s: 0.95, spin: 0.06, wob: 0.15, tilt: 0.3 },
    { c1: [0.86, 0.91, 1.0], c2: [0.33, 0.51, 1.0], acc: [1.0, 0.46, 0.22], a: 1.0, s: 0.95, spin: 0.14, wob: 0.08, tilt: 0.38 },
    { c1: [0.86, 0.91, 1.0], c2: [0.38, 0.5, 0.98], acc: [1.0, 0.42, 0.2], a: 1.0, s: 0.95, spin: 0.09, wob: 0.08, tilt: 0.32 },
    { c1: [0.82, 0.89, 1.0], c2: [0.30, 0.45, 0.96], acc: [1.0, 0.45, 0.22], a: 1.0, s: 0.92, spin: 0.0, wob: 0.3, tilt: 0.22 },
    { c1: [0.92, 0.95, 1.0], c2: [0.44, 0.58, 1.0], acc: [1.0, 0.5, 0.25], a: 1.0, s: 1.0, spin: 0.0, wob: 0.16, tilt: 0.1 }
  ];

  // ── small helpers ────────────────────────────────────────────────────
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function gauss(r) { return (r() + r() + r() + r() - 2) / 2; }

  function mat4Perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function mat4Mul(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    return o;
  }
  function mat4Translate(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
  function mat4Scale(s) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]); }
  function mat4RotX(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function mat4RotY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }

  function rotate3(p, ax, ay, az) {
    var x = p[0], y = p[1], z = p[2], c, s, t;
    c = Math.cos(ax); s = Math.sin(ax); t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(ay); s = Math.sin(ay); t = x * c + z * s; z = -x * s + z * c; x = t;
    c = Math.cos(az); s = Math.sin(az); t = x * c - y * s; y = x * s + y * c; x = t;
    return [x, y, z];
  }
  function cubePoint(r, edgeBias) {
    // a point on the edges (lines) or faces of a unit cube [-1, 1]^3
    var p = [0, 0, 0], ax = Math.floor(r() * 3);
    if (r() < edgeBias) {
      p[ax] = r() * 2 - 1;
      p[(ax + 1) % 3] = r() < 0.5 ? -1 : 1;
      p[(ax + 2) % 3] = r() < 0.5 ? -1 : 1;
    } else {
      p[ax] = r() < 0.5 ? -1 : 1;
      p[(ax + 1) % 3] = r() * 2 - 1;
      p[(ax + 2) % 3] = r() * 2 - 1;
    }
    return p;
  }
  function spherePoint(r) {
    var z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), z, s * Math.sin(a)];
  }
  function latLon(lat, lon) {
    var la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  }

  // ── shape generators (each writes N points into out) ─────────────────
  function genMark(N, r, out) {
    var S = 220, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var k = S / MARK_BOX[2];
    ctx.setTransform(k, 0, 0, k, -MARK_BOX[0] * k, -MARK_BOX[1] * k);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < MARK.length; i++) ctx.fill(new Path2D(MARK[i]));
    var d = ctx.getImageData(0, 0, S, S).data, fill = [], edge = [];
    function a(x, y) { return d[(y * S + x) * 4 + 3]; }
    for (var y = 1; y < S - 1; y++) for (var x = 1; x < S - 1; x++) {
      if (a(x, y) > 127) {
        if (a(x - 1, y) < 128 || a(x + 1, y) < 128 || a(x, y - 1) < 128 || a(x, y + 1) < 128) edge.push(x, y);
        else fill.push(x, y);
      }
    }
    if (!fill.length) fill = edge;
    var size = 2.25;
    for (i = 0; i < N; i++) {
      var src = r() < 0.4 && edge.length ? edge : fill;
      var j = Math.floor(r() * (src.length / 2)) * 2;
      var px = src[j] + r() - 0.5, py = src[j + 1] + r() - 0.5;
      var z = (r() - 0.5) * 0.2;
      if (r() < 0.34) z = (r() < 0.5 ? -0.1 : 0.1) + (r() - 0.5) * 0.02;
      out[i * 3] = (px / S - 0.5) * size;
      out[i * 3 + 1] = -(py / S - 0.5) * size;
      out[i * 3 + 2] = z;
    }
  }

  function genFragments(N, r, out) {
    var C = [[-1.2, 0.58, 0.1], [-0.3, 0.98, -0.45], [0.78, 0.66, 0.2], [1.3, -0.18, -0.3], [0.38, -0.78, 0.35], [-0.82, -0.6, -0.25], [-0.06, 0.02, 0.55]];
    var SZ = [0.3, 0.2, 0.27, 0.23, 0.32, 0.21, 0.16];
    var ROT = C.map(function () { return [r() * TAU, r() * TAU, r() * TAU]; });
    var wsum = 0, W = SZ.map(function (s) { wsum += s * s; return wsum; });
    for (var i = 0; i < N; i++) {
      var p;
      if (r() < 0.08) {
        p = spherePoint(r); var rad = 0.5 + r() * 1.3;
        p = [p[0] * rad * 1.35, p[1] * rad * 0.85, p[2] * rad * 0.6];
      } else {
        var u = r() * wsum, c = 0;
        while (W[c] < u) c++;
        p = rotate3(cubePoint(r, 0.7), ROT[c][0], ROT[c][1], ROT[c][2]);
        var j = 0.012;
        p = [C[c][0] + p[0] * SZ[c] + (r() - 0.5) * j, C[c][1] + p[1] * SZ[c] + (r() - 0.5) * j, C[c][2] + p[2] * SZ[c] + (r() - 0.5) * j];
      }
      out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
    }
  }

  function genRings(N, r, out) {
    var R = [
      { r: 0.66, ax: 1.25, az: 0.25 },
      { r: 0.86, ax: 0.42, az: -0.62 },
      { r: 1.06, ax: -0.95, az: 0.5 },
      { r: 1.26, ax: 0.18, az: 1.1 }
    ];
    for (var i = 0; i < N; i++) {
      var p, u = r();
      if (u < 0.26) {
        p = spherePoint(r); var rad = 0.3 * Math.pow(r(), 0.35);
        p = [p[0] * rad, p[1] * rad, p[2] * rad];
      } else {
        var ring = R[Math.min(3, Math.floor((u - 0.26) / 0.74 * 4))];
        var th = r() * TAU, tube = 0.018;
        p = [Math.cos(th) * ring.r + gauss(r) * tube, gauss(r) * tube, Math.sin(th) * ring.r + gauss(r) * tube];
        p = rotate3(p, ring.ax, 0, ring.az);
      }
      out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
    }
  }

  function genVault(N, r, out) {
    for (var i = 0; i < N; i++) {
      var p, u = r();
      if (u < 0.24) {
        p = cubePoint(r, 0.62); var s = 0.25;
        p = rotate3([p[0] * s, p[1] * s, p[2] * s], 0.6, 0.75, 0);
      } else if (u < 0.62) {
        var R = 0.74;
        if (r() < 0.5) {
          var lon = Math.floor(r() * 12) / 12 * TAU, lat = (r() - 0.5) * Math.PI;
          p = [Math.cos(lat) * Math.sin(lon) * R, Math.sin(lat) * R, Math.cos(lat) * Math.cos(lon) * R];
        } else {
          var la = (Math.floor(r() * 7) - 3) / 3.5 * (Math.PI / 2) * 0.85, lo = r() * TAU;
          p = [Math.cos(la) * Math.sin(lo) * R, Math.sin(la) * R, Math.cos(la) * Math.cos(lo) * R];
        }
      } else {
        p = spherePoint(r); var R2 = 1.16 + (r() - 0.5) * 0.02;
        p = [p[0] * R2, p[1] * R2, p[2] * R2];
      }
      out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
    }
  }

  function genGlobe(N, r, out) {
    var LON0 = -139.7 - 16; // Tokyo turned towards the viewer, a little left of centre
    var cities = [[1.35, 103.8], [51.5, -0.1], [40.7, -74.0], [37.8, -122.4], [22.3, 114.2], [-33.9, 151.2], [50.1, 8.7], [25.2, 55.3]];
    var tokyo = latLon(35.7, 139.7 + LON0);
    var ends = cities.map(function (c) { return latLon(c[0], c[1] + LON0); });
    var R = 1.0;
    for (var i = 0; i < N; i++) {
      var p, u = r();
      if (u < 0.6) {
        if (r() < 0.72) {
          var lat = Math.round(((r() * 2 - 1) * 84) / 6) * 6, lon = r() * 360;
          p = latLon(lat + (r() - 0.5) * 0.6, lon);
        } else p = spherePoint(r);
        p = [p[0] * R, p[1] * R, p[2] * R];
      } else if (u < 0.92) {
        var e = ends[Math.floor(r() * ends.length)], t = r();
        var dot = clamp(tokyo[0] * e[0] + tokyo[1] * e[1] + tokyo[2] * e[2], -1, 1);
        var om = Math.acos(dot), so = Math.sin(om) || 1;
        var k0 = Math.sin((1 - t) * om) / so, k1 = Math.sin(t * om) / so;
        var h = 1 + Math.sin(Math.PI * t) * (0.1 + 0.22 * om / Math.PI);
        p = [(tokyo[0] * k0 + e[0] * k1) * h * R, (tokyo[1] * k0 + e[1] * k1) * h * R, (tokyo[2] * k0 + e[2] * k1) * h * R];
      } else {
        var g = 0.05;
        p = [tokyo[0] * 1.02 + gauss(r) * g, tokyo[1] * 1.02 + gauss(r) * g, tokyo[2] * 1.02 + gauss(r) * g];
      }
      out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
    }
  }

  function genBridge(N, r, out) {
    var T = 0.86, top = 0.74, deck = -0.36, half = 2.0, zc = 0.12;
    function cable(x) {
      var ax = Math.abs(x);
      if (ax <= T) return deck + 0.12 + (top - deck - 0.12) * Math.pow(ax / T, 2);
      var k = (ax - T) / (half - T);
      return top - (top - deck - 0.02) * Math.pow(k, 0.8);
    }
    for (var i = 0; i < N; i++) {
      var p, u = r(), z = r() < 0.5 ? -zc : zc;
      if (u < 0.2) { // deck
        p = [(r() * 2 - 1) * half, deck + (r() - 0.5) * 0.02, z + (r() - 0.5) * 0.03];
      } else if (u < 0.32) { // towers
        var side = r() < 0.5 ? -T : T;
        p = [side + (r() - 0.5) * 0.035, deck - 0.34 + r() * (top - deck + 0.36), z];
      } else if (u < 0.6) { // main cables
        var x = (r() * 2 - 1) * half;
        p = [x, cable(x) + (r() - 0.5) * 0.012, z];
      } else if (u < 0.82) { // hangers
        var hx = Math.round(((r() * 2 - 1) * half) / 0.09) * 0.09;
        var cy = cable(hx);
        p = [hx, deck + r() * Math.max(0, cy - deck), z];
      } else if (u < 0.93) { // flow along the deck
        p = [(r() * 2 - 1) * half, deck + 0.03 + gauss(r) * 0.03, gauss(r) * 0.06];
      } else { // reflection shimmer below
        p = [(r() * 2 - 1) * half * 1.05, deck - 0.5 - r() * 0.28, (r() - 0.5) * 0.9];
      }
      out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
    }
  }

  var GENERATORS = [genMark, genFragments, genRings, genVault, genGlobe, genBridge];

  // ── shaders ─────────────────────────────────────────────────────────
  var VS = [
    'precision highp float;',
    'attribute vec3 aP0; attribute vec3 aP1; attribute vec3 aP2; attribute vec3 aP3; attribute vec3 aP4; attribute vec3 aP5;',
    'attribute vec4 aR;',
    'uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;',
    'uniform float uTime; uniform float uScene; uniform float uIntro; uniform float uSize; uniform float uDpr;',
    'uniform float uAlpha; uniform float uHover; uniform float uStir; uniform float uMaxSize; uniform float uGlow;',
    'uniform vec3 uMouse; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uAcc;',
    'varying vec3 vCol; varying float vA; varying float vGlow;',
    'vec3 shapeAt(float k){',
    '  return aP0*(1.0-step(0.5,abs(k)))+aP1*(1.0-step(0.5,abs(k-1.0)))+aP2*(1.0-step(0.5,abs(k-2.0)))',
    '        +aP3*(1.0-step(0.5,abs(k-3.0)))+aP4*(1.0-step(0.5,abs(k-4.0)))+aP5*(1.0-step(0.5,abs(k-5.0)));',
    '}',
    'void main(){',
    '  float sc=clamp(uScene,0.0,5.0);',
    '  float b=floor(sc); float f=sc-b;',
    '  float st=aR.x*0.42;',
    '  float ff=smoothstep(st,st+0.58,f);',
    '  vec3 pos=mix(shapeAt(b),shapeAt(min(b+1.0,5.0)),ff);',
    '  float mid=sin(ff*3.14159265);',
    '  vec3 sw=vec3(sin(aR.y*6.2831+uTime*0.35+pos.y*1.7),cos(aR.z*6.2831+uTime*0.31+pos.x*1.7),sin(aR.w*6.2831+uTime*0.27));',
    '  pos+=sw*(mid*(0.26+aR.x*0.46)+uStir*0.07*(0.4+aR.y));',
    '  float t=uTime*0.4;',
    '  pos+=0.014*vec3(sin(t*1.3+aR.y*40.0+pos.y*2.3),cos(t*1.1+aR.z*40.0+pos.x*2.1),sin(t*0.9+aR.w*40.0+pos.z*1.9));',
    '  vec3 sc3=vec3(aR.y-0.5,aR.z-0.5,aR.w-0.5)+vec3(0.0001);',
    '  vec3 scatter=normalize(sc3)*(2.6+aR.x*3.2);',
    '  float ip=smoothstep(aR.x*0.45,aR.x*0.45+0.55,uIntro);',
    '  pos=mix(scatter,pos,ip);',
    '  vec4 world=uModel*vec4(pos,1.0);',
    '  vec2 d=world.xy-uMouse.xy; float dist=length(d);',
    '  float infl=(1.0-smoothstep(0.0,0.62,dist))*uHover;',
    '  world.xy+=(d/max(dist,0.0001))*infl*0.3; world.z+=infl*0.35;',
    '  vec4 mv=uView*world;',
    '  gl_Position=uProj*mv;',
    '  vGlow=uGlow;',
    '  float big=aR.y*aR.y*aR.y;',
    '  float sz=uSize*(0.62+big*2.6)*(1.0+infl*0.9)*mix(1.0,3.6,uGlow);',
    '  gl_PointSize=clamp(sz*uDpr*(4.2/-mv.z),1.0,uMaxSize);',
    '  float acc=step(0.968,aR.w);',
    '  vec3 base=mix(uC2,uC1,smoothstep(0.1,0.95,aR.z));',
    '  vCol=mix(base,uAcc,acc);',
    '  float tw=0.62+0.38*sin(uTime*(0.9+aR.y*2.2)+aR.x*31.0);',
    '  float depth=smoothstep(-7.0,-3.0,mv.z);',
    '  vA=uAlpha*tw*(0.3+0.7*ip)*(0.45+0.55*depth)*(1.0+acc*0.9+infl*0.8)/(0.75+big*2.2)*mix(1.0,0.075,uGlow);',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 vCol; varying float vA; varying float vGlow;',
    'void main(){',
    '  vec2 c=gl_PointCoord-0.5; float d2=dot(c,c);',
    '  if(d2>0.25) discard;',
    '  float a=exp(-d2*mix(18.0,9.0,vGlow))*vA;',
    '  gl_FragColor=vec4(vCol*a,a);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log || 'shader'); }
    return s;
  }

  function supportsWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  // ── Field ───────────────────────────────────────────────────────────
  function Field(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts || {};
    this.mode = this.opts.mode || 'hero';
    this.reduced = !!this.opts.reduced;
    this.alive = false;
  }

  Field.prototype.init = function () {
    var canvas = this.canvas, self = this;
    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return false;
    this.gl = gl;

    var w = window.innerWidth, fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var count;
    if (this.mode === 'narrative') count = w >= 1100 && fine ? 24000 : w >= 768 ? 15000 : 9000;
    else count = w >= 1100 && fine ? 15000 : w >= 768 ? 10000 : 6500;
    var cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;
    if (cores <= 4 || mem <= 4) count = Math.round(count * 0.7);
    this.N = count;
    this.drawCount = count;

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    gl.useProgram(prog);
    this.prog = prog;

    // geometry: 6 shapes × xyz + 4 randoms, interleaved
    var N = this.N, STRIDE = SHAPES * 3 + 4;
    var data = new Float32Array(N * STRIDE);
    var r = rng(20260930), tmp = new Float32Array(N * 3);
    var dustFrom = Math.floor(N * 0.9);
    var dr = rng(77);
    var dust = new Float32Array((N - dustFrom) * 3);
    for (var d = 0; d < dust.length; d += 3) {
      dust[d] = (dr() * 2 - 1) * 3.4; dust[d + 1] = (dr() * 2 - 1) * 2.1; dust[d + 2] = (dr() * 2 - 1) * 1.6 - 0.4;
    }
    for (var s = 0; s < SHAPES; s++) {
      GENERATORS[s](N, r, tmp);
      for (var i = 0; i < N; i++) {
        var o = i * STRIDE + s * 3;
        if (i >= dustFrom) {
          var k = (i - dustFrom) * 3;
          data[o] = dust[k]; data[o + 1] = dust[k + 1]; data[o + 2] = dust[k + 2];
        } else {
          data[o] = tmp[i * 3]; data[o + 1] = tmp[i * 3 + 1]; data[o + 2] = tmp[i * 3 + 2];
        }
      }
    }
    var rr = rng(4242);
    for (i = 0; i < N; i++) {
      var ro = i * STRIDE + SHAPES * 3;
      data[ro] = rr(); data[ro + 1] = rr(); data[ro + 2] = rr(); data[ro + 3] = rr();
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var BYTES = 4;
    for (s = 0; s < SHAPES; s++) {
      var loc = gl.getAttribLocation(prog, 'aP' + s);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, STRIDE * BYTES, s * 3 * BYTES);
    }
    var lr = gl.getAttribLocation(prog, 'aR');
    gl.enableVertexAttribArray(lr);
    gl.vertexAttribPointer(lr, 4, gl.FLOAT, false, STRIDE * BYTES, SHAPES * 3 * BYTES);

    var U = {};
    ['uProj', 'uView', 'uModel', 'uTime', 'uScene', 'uIntro', 'uSize', 'uDpr', 'uAlpha', 'uHover', 'uStir', 'uMaxSize', 'uGlow', 'uMouse', 'uC1', 'uC2', 'uAcc'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    this.U = U;
    var range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.maxPoint = Math.min(64, (range && range[1]) || 64);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    // state
    var first = this.opts.scene || 0;
    this.cur = { scene: first, x: 0, y: 0, scale: 1, alpha: 1 };
    this.tgt = { scene: first, x: 0, y: 0, scale: 1, alpha: 1 };
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0, hover: 0, last: -1e9 };
    this.spinAngle = 0;
    this.time = 0;
    this.intro = this.reduced ? 1 : 0;
    this.introStart = -1;
    this.stir = 0;
    this.lastScrollY = window.scrollY;
    this.frames = 0; this.slowFrames = 0; this.degraded = 0; this.verySlow = 0; this.throttle = 0; this.lastDraw = 0;

    this.resize();
    if (this.mode === 'narrative') {
      this.collect();
      this.applyTargets(true);
      // reduced motion: the canvas scrolls away with the hero, so always show the first shape
      if (this.reduced && this.sections.length) { this.cur = this.styleOf(this.sections[0]); this.tgt = this.cur; }
    } else this.applyHeroTargets(true);

    this.onResize = function () { self.resize(); if (self.mode === 'narrative') self.measure(); self.requestStatic(); };
    window.addEventListener('resize', this.onResize, { passive: true });
    if (window.ResizeObserver && this.mode === 'narrative') {
      this.ro = new ResizeObserver(function () { self.measure(); });
      this.ro.observe(document.body);
    }
    if (!this.reduced) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        self.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
        self.mouse.ny = -((e.clientY / window.innerHeight) * 2 - 1);
        if (self.mode === 'hero') {
          var rect = canvas.getBoundingClientRect();
          self.mouse.nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          self.mouse.ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        }
        self.mouse.last = performance.now();
      }, { passive: true });
      document.addEventListener('mouseleave', function () { self.mouse.last = -1e9; });
    }
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.alive = false; document.documentElement.classList.add('no-webgl'); }, false);

    this.visible = true;
    if (this.mode === 'hero' && window.IntersectionObserver) {
      new IntersectionObserver(function (en) { self.visible = en[0].isIntersecting; }, { rootMargin: '80px' }).observe(canvas);
    }

    this.alive = true;
    this.last = performance.now();
    if (this.reduced) { this.render(0); }
    else {
      var loop = function (now) {
        if (!self.alive) return;
        requestAnimationFrame(loop);
        self.frame(now);
      };
      requestAnimationFrame(loop);
    }
    canvas.classList.add('is-ready');
    return true;
  };

  Field.prototype.resize = function () {
    var c = this.canvas, gl = this.gl;
    var rect = c.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    var maxDpr = window.innerWidth < 768 ? 1.5 : 1.75;
    if (this.degraded) maxDpr = 1;
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    gl.viewport(0, 0, W, H);
    this.dpr = dpr; this.w = w; this.h = h; this.aspect = w / h;
    this.fov = 45 * Math.PI / 180; this.camZ = 4.2;
    this.halfH = Math.tan(this.fov / 2) * this.camZ;
    this.halfW = this.halfH * this.aspect;
    gl.uniformMatrix4fv(this.U.uProj, false, mat4Perspective(this.fov, this.aspect, 0.1, 50));
    gl.uniformMatrix4fv(this.U.uView, false, mat4Translate(0, 0, -this.camZ));
    // points should look similar at any resolution
    this.baseSize = (this.mode === 'narrative' ? 2.2 : 2.0) * clamp(Math.min(w, h * 1.6) / 900, 0.72, 1.25);
  };

  // narrative: read every [data-scene] section
  Field.prototype.collect = function () {
    this.sections = Array.prototype.map.call(document.querySelectorAll('[data-scene]'), function (el) {
      var d = el.dataset, n = function (v, f) { var x = parseFloat(v); return isNaN(x) ? f : x; };
      var s = { el: el, scene: n(d.scene, 0), x: n(d.sceneX, 0), y: n(d.sceneY, 0), scale: n(d.sceneScale, 1), alpha: n(d.sceneAlpha, 1) };
      s.mx = n(d.sceneMx, s.x); s.my = n(d.sceneMy, s.y); s.mscale = n(d.sceneMscale, s.scale); s.malpha = n(d.sceneMalpha, s.alpha);
      return s;
    });
    this.footer = document.querySelector('.site-footer');
    this.measure();
  };
  Field.prototype.measure = function () {
    var y = window.scrollY;
    (this.sections || []).forEach(function (s) { s.top = s.el.getBoundingClientRect().top + y; });
  };
  Field.prototype.styleOf = function (s) {
    var narrow = window.innerWidth < 900;
    return { scene: s.scene, x: narrow ? s.mx : s.x, y: narrow ? s.my : s.y, scale: narrow ? s.mscale : s.scale, alpha: narrow ? s.malpha : s.alpha };
  };
  Field.prototype.applyTargets = function (snap) {
    var S = this.sections;
    if (!S || !S.length) return;
    var vh = window.innerHeight, y = window.scrollY;
    var st = this.styleOf(S[0]);
    for (var i = 1; i < S.length; i++) {
      var rel = S[i].top - y;
      var p = clamp((0.86 * vh - rel) / (0.62 * vh), 0, 1);
      if (p <= 0) break;
      var nx = this.styleOf(S[i]), k = smooth(p);
      st = { scene: lerp(st.scene, nx.scene, k), x: lerp(st.x, nx.x, k), y: lerp(st.y, nx.y, k), scale: lerp(st.scale, nx.scale, k), alpha: lerp(st.alpha, nx.alpha, k) };
    }
    this.tgt = st;
    if (snap) this.cur = { scene: st.scene, x: st.x, y: st.y, scale: st.scale, alpha: st.alpha };
  };
  Field.prototype.applyHeroTargets = function (snap) {
    var d = this.canvas.dataset, n = function (v, f) { var x = parseFloat(v); return isNaN(x) ? f : x; };
    var narrow = window.innerWidth < 900;
    var st = {
      scene: n(d.fxScene, this.opts.scene || 0),
      x: narrow ? n(d.fxMx, 0) : n(d.fxX, 0.45),
      y: narrow ? n(d.fxMy, 0.3) : n(d.fxY, 0),
      scale: narrow ? n(d.fxMscale, 0.8) : n(d.fxScale, 1),
      alpha: narrow ? n(d.fxMalpha, 0.6) : n(d.fxAlpha, 1)
    };
    this.tgt = st;
    if (snap) this.cur = { scene: st.scene, x: st.x, y: st.y, scale: st.scale, alpha: st.alpha };
  };

  Field.prototype.requestStatic = function () {
    if (this.reduced && this.alive) {
      if (this.mode === 'narrative') { if (this.sections.length) { this.cur = this.styleOf(this.sections[0]); this.tgt = this.cur; } }
      else this.applyHeroTargets(true);
      this.render(0);
    }
  };

  Field.prototype.frame = function (now) {
    // very slow devices (see below) redraw only a few times per second
    if (this.throttle && now - this.lastDraw < this.throttle) return;
    this.lastDraw = now;
    var raw = (now - this.last) / 1000;
    var dt = Math.min(this.throttle ? 0.3 : 0.05, Math.max(0.001, raw));
    this.last = now;
    if (!this.visible || document.hidden) return;
    // the full-screen mobile menu covers everything — no need to draw
    if (document.documentElement.classList.contains('menu-open')) return;

    // footer fully covering the viewport → nothing to draw
    if (this.mode === 'narrative' && this.footer) {
      if (this.footer.getBoundingClientRect().top <= 0) return;
    }

    this.time += dt;
    if (this.introStart < 0) this.introStart = now;
    this.intro = clamp((now - this.introStart) / 2600, 0, 1);

    if (this.mode === 'narrative') this.applyTargets(false); else this.applyHeroTargets(false);
    var c = this.cur, t = this.tgt;
    var kf = 1 - Math.exp(-dt * 3.0), ks = 1 - Math.exp(-dt * 2.1);
    c.scene += (t.scene - c.scene) * ks;
    c.x += (t.x - c.x) * kf; c.y += (t.y - c.y) * kf;
    c.scale += (t.scale - c.scale) * kf; c.alpha += (t.alpha - c.alpha) * kf;

    // scroll velocity → gentle stir
    var sy = window.scrollY, v = Math.abs(sy - this.lastScrollY) / Math.max(dt, 0.001);
    this.lastScrollY = sy;
    this.stir += (clamp(v / 2600, 0, 1) - this.stir) * (1 - Math.exp(-dt * 4));

    // pointer
    var m = this.mouse;
    var active = now - m.last < 2600 ? 1 : 0;
    m.hover += (active - m.hover) * (1 - Math.exp(-dt * 3));
    m.tx += (m.nx - m.tx) * (1 - Math.exp(-dt * 6));
    m.ty += (m.ny - m.ty) * (1 - Math.exp(-dt * 6));

    this.render(dt);

    // adaptive quality: if the device struggles, draw fewer points at a lower resolution
    this.frames++;
    // severe case (under ~11 fps for a while, e.g. no GPU): go straight to the lightest
    // level, then redraw only ~4 times per second so scrolling and the page stay responsive
    if (this.frames > 30 && this.intro >= 1 && !this.throttle) {
      if (raw > 0.09) this.verySlow++; else this.verySlow = Math.max(0, this.verySlow - 1);
      if (this.verySlow > 15) {
        this.verySlow = 0;
        if (this.degraded < 2) { this.degraded = 2; this.drawCount = Math.round(this.N * 0.38); this.resize(); }
        else this.throttle = 240;
      }
    }
    if (this.frames > 45 && this.intro >= 1 && this.degraded < 2) {
      if (dt > 0.032) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 0.5);
      if (this.slowFrames > 40) {
        this.degraded++;
        this.drawCount = Math.round(this.N * (this.degraded === 1 ? 0.62 : 0.38));
        this.slowFrames = 0;
        this.resize();
      }
    }
  };

  Field.prototype.render = function (dt) {
    var gl = this.gl, U = this.U, c = this.cur;
    var sc = clamp(c.scene, 0, SHAPES - 1), i0 = Math.floor(sc), i1 = Math.min(SHAPES - 1, i0 + 1), f = smooth(sc - i0);
    var A = STYLE[i0], B = STYLE[i1];
    function mix3(a, b) { return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]; }
    var spin = lerp(A.spin, B.spin, f), wob = lerp(A.wob, B.wob, f), tilt = lerp(A.tilt, B.tilt, f);

    // continuous spin for 3D shapes; flat shapes (mark, bridge) ease back to facing the viewer
    this.spinAngle += spin * dt;
    if (this.spinAngle > Math.PI) this.spinAngle -= TAU;
    if (this.spinAngle < -Math.PI) this.spinAngle += TAU;
    var face = 1 - clamp(spin / 0.05, 0, 1);
    this.spinAngle += (0 - this.spinAngle) * face * Math.min(1, dt * 1.6);

    var m = this.mouse;
    var rotY = this.spinAngle + wob * Math.sin(this.time * 0.22) + m.tx * 0.3 * m.hover;
    var rotX = tilt * 0.5 + Math.sin(this.time * 0.17) * 0.05 - m.ty * 0.16 * m.hover;

    // responsive framing
    var fit = Math.min(1, 1.3 * this.aspect);
    var scale = c.scale * lerp(A.s, B.s, f) * (this.aspect < 1 ? fit : 1);
    var ox = c.x * this.halfW * 0.92, oy = c.y * this.halfH * 0.92;
    var model = mat4Mul(mat4Translate(ox, oy, 0), mat4Mul(mat4Scale(scale), mat4Mul(mat4RotX(rotX), mat4RotY(rotY))));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uModel, false, model);
    gl.uniform1f(U.uTime, this.time);
    gl.uniform1f(U.uScene, sc);
    gl.uniform1f(U.uIntro, this.reduced ? 1 : smooth(this.intro));
    gl.uniform1f(U.uSize, this.baseSize);
    gl.uniform1f(U.uDpr, this.dpr);
    var dens = this.mode === 'narrative' ? 0.92 : 0.88;
    gl.uniform1f(U.uAlpha, c.alpha * lerp(A.a, B.a, f) * dens * (this.degraded ? 1.25 : 1));
    gl.uniform1f(U.uHover, this.reduced ? 0 : m.hover);
    gl.uniform1f(U.uStir, this.reduced ? 0 : this.stir);
    gl.uniform1f(U.uMaxSize, this.maxPoint);
    gl.uniform3f(U.uMouse, m.tx * this.halfW, m.ty * this.halfH, 0);
    var c1 = mix3(A.c1, B.c1), c2 = mix3(A.c2, B.c2), ac = mix3(A.acc, B.acc);
    gl.uniform3f(U.uC1, c1[0], c1[1], c1[2]);
    gl.uniform3f(U.uC2, c2[0], c2[1], c2[2]);
    gl.uniform3f(U.uAcc, ac[0], ac[1], ac[2]);
    // two passes: a soft wide glow (cheap bloom), then crisp cores
    if (!this.degraded) {
      gl.uniform1f(U.uGlow, 1);
      gl.drawArrays(gl.POINTS, 0, this.drawCount);
    }
    gl.uniform1f(U.uGlow, 0);
    gl.drawArrays(gl.POINTS, 0, this.drawCount);
  };

  Field.prototype.destroy = function () {
    this.alive = false;
    window.removeEventListener('resize', this.onResize);
    if (this.ro) this.ro.disconnect();
  };

  window.NXParticles = {
    supported: supportsWebGL,
    create: function (canvas, opts) {
      if (!canvas || !supportsWebGL()) { document.documentElement.classList.add('no-webgl'); return null; }
      try {
        var f = new Field(canvas, opts);
        if (!f.init()) { document.documentElement.classList.add('no-webgl'); return null; }
        return f;
      } catch (e) {
        if (window.console) console.warn('[NexBridge] particles disabled:', e && e.message);
        document.documentElement.classList.add('no-webgl');
        return null;
      }
    }
  };
})();
