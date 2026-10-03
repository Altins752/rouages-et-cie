/**
 * Post-traitement WebGL : la passe finale qui lie l'image.
 *  - éclairage : la scène 2D est un albédo, multiplié par une carte de lumière (ambiance de l'époque,
 *    flaques des lampes, soleil des verrières, voyants), avec un relief tiré des textures ;
 *  - distorsion de chaleur au-dessus du foyer et des machines en zone rouge ;
 *  - halo (bloom) à deux échelles sur la couche émissive ;
 *  - compression douce des hautes lumières, étalonnage par époque, nuit, vignettage, grain.
 * Les signaux (voyants, textes, cadres) sont sur une couche 2D au-dessus : jamais étalonnés.
 * Sans WebGL, le canvas 2D s'affiche seul avec son propre éclairage.
 */
import type { Grade } from './era';

const VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;`;
const FS_BLUR = `${HEAD}uniform sampler2D t;uniform vec2 d;
void main(){vec3 s=texture2D(t,v).rgb*.227027;
s+=(texture2D(t,v+d*1.384615).rgb+texture2D(t,v-d*1.384615).rgb)*.316216;
s+=(texture2D(t,v+d*3.230769).rgb+texture2D(t,v-d*3.230769).rgb)*.070270;
gl_FragColor=vec4(s,1.);}`;
export const HEAT_MAX = 8;
/** Composition ; FULL : éclairage, relief et chaleur (effets complets), sinon version sobre. */
const fsComp = (full: boolean) => `${full ? '#define FULL\n' : ''}${HEAD}
uniform sampler2D uScene,uLight,uBloom,uBloom2;
uniform vec2 uRes;
uniform float uTime,uNight,uBloomK,uRed,uBump,uGrain,uMotion,uHeatN;
uniform vec4 uHeat[${HEAT_MAX}];
uniform vec3 uLift,uGain,uShadow,uHigh;
uniform float uSat,uContrast,uSepia;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
 vec2 uv=v;
 vec2 px=1./uRes;
 float asp=uRes.x/uRes.y;
 // chaleur : l'air ondule dans une colonne qui monte au-dessus de la source
#ifdef FULL
 vec2 off=vec2(0.);
 for(int i=0;i<${HEAT_MAX};i++){
  if(float(i)>=uHeatN)break;
  vec4 h=uHeat[i];
  float dx=abs(uv.x-h.x)*asp;
  float up=(uv.y-h.y)/h.z;
  float f=h.w*smoothstep(h.z*.7,0.,dx)*smoothstep(-.25,.2,up)*smoothstep(1.6,.5,up);
  off+=f*vec2(sin(uv.y*uRes.y*.11-uTime*8.+float(i)*1.7),.5*cos(uv.x*uRes.x*.08+uTime*6.))*.0022;
 }
 uv+=off*uMotion;
#endif
 if(uRed>0.){uv+=vec2(sin(uv.y*170.+uTime*9.)*.0005,cos(uv.x*120.+uTime*7.)*.0004)*uRed*uMotion;}
 vec2 c=uv-.5;float e=dot(c,c);float ca=.004*e*(1.+uRed*2.);
 vec3 sc=vec3(texture2D(uScene,uv+c*ca).r,texture2D(uScene,uv).g,texture2D(uScene,uv-c*ca).b);
 vec3 col=sc;
#ifdef FULL
 {
  vec3 L=texture2D(uLight,uv).rgb*2.;
  // relief : le gradient de luminance des textures donne une normale, éclairée d'en haut à gauche
  vec2 o=px*1.5;
  float lx=lum(texture2D(uScene,uv+vec2(o.x,0.)).rgb)-lum(texture2D(uScene,uv-vec2(o.x,0.)).rgb);
  float ly=lum(texture2D(uScene,uv+vec2(0.,o.y)).rgb)-lum(texture2D(uScene,uv-vec2(0.,o.y)).rgb);
  vec3 n=normalize(vec3(-lx*uBump,-ly*uBump,1.));
  float ndl=dot(n,normalize(vec3(-.45,.6,.66)))/.66;
  // le relief ne se lit que dans les flaques de lumière (lampes, soleil), pas dans l'ombre
  float ex=clamp(max(L.r,max(L.g,L.b))-.95,0.,1.);
  col=sc*L*mix(1.,ndl,.1+clamp(ex*1.1,0.,.45));
  col+=L*pow(max(ndl-1.,0.),2.)*ex*.35;
 }
#endif
 col+=(texture2D(uBloom,uv).rgb*.75+texture2D(uBloom2,uv).rgb*.55)*uBloomK;
 // hautes lumières compressées en douceur
 vec3 t=max(col-.84,0.);
 col=min(col,.84)+.16*(1.-exp(-t*5.));
 // étalonnage de l'époque
 col=(col-.5)*uContrast+.5;
 col=col*uGain+uLift*(1.-col);
 float l=lum(col);
 col=mix(vec3(l),col,uSat);
 vec3 sep=vec3(dot(col,vec3(.393,.769,.189)),dot(col,vec3(.349,.686,.168)),dot(col,vec3(.272,.534,.131)));
 col=mix(col,sep,uSepia);
 col+=uShadow*(1.-smoothstep(0.,.5,l))+uHigh*smoothstep(.5,1.,l);
 // nuit : un peu moins de couleur, un peu plus de bleu
 col=mix(col,mix(vec3(l),col,.78)*vec3(.92,.97,1.08),uNight*.35);
 float vig=smoothstep(1.,.32,length(c*vec2(1.,1.15)));
 col*=mix(.74,1.,vig);
 col+=(hash(gl_FragCoord.xy+fract(uTime*7.)*91.*uMotion)-.5)*uGrain;
 gl_FragColor=vec4(clamp(col,0.,1.),1.);}`;

interface Fbo {
  t: WebGLTexture;
  f: WebGLFramebuffer;
  w: number;
  h: number;
}

export interface PostOpts {
  /** Éclairage par carte de lumière (effets complets). */
  lit: boolean;
  light: HTMLCanvasElement | null;
  /** Sources de chaleur : x, y (uv, origine en bas), rayon (en hauteur d'écran), force. */
  heat: Float32Array;
  grade: Grade;
  night: number;
  red: boolean;
  reduced: boolean;
  dt: number;
}

const NEUTRAL: Grade = { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1, sepia: 0, shadow: [0, 0, 0], high: [0, 0, 0] };

export class PostFx {
  ok = false;
  /** Rendu logiciel (pas de carte graphique) : on démarre en effets sobres. */
  software = false;
  private gl: WebGLRenderingContext | null = null;
  private pBlur: WebGLProgram | null = null;
  private pComp: WebGLProgram | null = null;
  private pLite: WebGLProgram | null = null;
  private UL: Record<string, WebGLUniformLocation | null> = {};
  private U: Record<string, WebGLUniformLocation | null> = {};
  private sceneTex: WebGLTexture | null = null;
  private glowTex: WebGLTexture | null = null;
  private lightTex: WebGLTexture | null = null;
  private A: Fbo | null = null;
  private B: Fbo | null = null;
  private C: Fbo | null = null;
  private D: Fbo | null = null;
  private quad: WebGLBuffer | null = null;
  private cw = 1;
  private ch = 1;
  /** Étalonnage courant, glissé vers celui de l'époque. */
  private g: Grade = structuredClone(NEUTRAL);
  private first = true;

  constructor(private canvas: HTMLCanvasElement) {
    try {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!gl) return;
      this.gl = gl;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      this.software = /swiftshader|llvmpipe|software|basic render/i.test(name);
      const sh = (t: number, src: string) => {
        const o = gl.createShader(t)!;
        gl.shaderSource(o, src);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? 'shader');
        return o;
      };
      const pr = (fs: string) => {
        const p = gl.createProgram()!;
        gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'a');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
        return p;
      };
      this.pBlur = pr(FS_BLUR);
      this.pComp = pr(fsComp(true));
      this.pLite = pr(fsComp(false));
      const ul = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
      this.U = { bt: ul(this.pBlur, 't'), bd: ul(this.pBlur, 'd') };
      for (const n of ['uScene', 'uLight', 'uBloom', 'uBloom2', 'uRes', 'uTime', 'uNight', 'uBloomK', 'uRed', 'uBump', 'uGrain', 'uMotion', 'uHeatN',
        'uHeat', 'uLift', 'uGain', 'uShadow', 'uHigh', 'uSat', 'uContrast', 'uSepia']) {
        this.U[n] = ul(this.pComp, n);
        this.UL[n] = ul(this.pLite, n);
      }
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.sceneTex = this.tex();
      this.glowTex = this.tex();
      this.lightTex = this.tex();
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.ok = false;
      });
      this.ok = true;
    } catch {
      this.ok = false;
      this.gl = null;
    }
  }

  private tex(): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private fbo(w: number, h: number): Fbo {
    const gl = this.gl!;
    const t = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, f, w, h };
  }

  resize(cw: number, ch: number): void {
    this.cw = cw;
    this.ch = ch;
    this.canvas.width = cw;
    this.canvas.height = ch;
    if (!this.ok || !this.gl) return;
    const gl = this.gl;
    for (const o of [this.A, this.B, this.C, this.D]) if (o) {
      gl.deleteTexture(o.t);
      gl.deleteFramebuffer(o.f);
    }
    const q = (k: number) => [Math.max(1, Math.round(cw / k)), Math.max(1, Math.round(ch / k))] as const;
    this.A = this.fbo(...q(4));
    this.B = this.fbo(...q(4));
    this.C = this.fbo(...q(10));
    this.D = this.fbo(...q(10));
  }

  private draw(): void {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private blur(src: WebGLTexture, dst: Fbo, dx: number, dy: number): void {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(this.U.bt, 0);
    gl.uniform2f(this.U.bd, dx, dy);
    this.draw();
  }

  private upload(t: WebGLTexture, src: HTMLCanvasElement): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  /** Glisse l'étalonnage vers celui de l'époque (changement d'acte en douceur). */
  private ease(target: Grade, dt: number): Grade {
    const g = this.g;
    const k = this.first ? 1 : 1 - Math.exp(-dt * 1.5);
    this.first = false;
    const v3 = (a: number[], b: number[]) => {
      for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k;
    };
    v3(g.lift, target.lift);
    v3(g.gain, target.gain);
    v3(g.shadow, target.shadow);
    v3(g.high, target.high);
    g.sat += (target.sat - g.sat) * k;
    g.contrast += (target.contrast - g.contrast) * k;
    g.sepia += (target.sepia - g.sepia) * k;
    return g;
  }

  /** Compose la scène 2D, sa lumière et sa couche émissive ; masque le canvas WebGL si désactivé. */
  render(on: boolean, scene: HTMLCanvasElement, glow: HTMLCanvasElement, time: number, o: PostOpts): void {
    const active = on && this.ok && !!this.gl && !!this.A;
    this.canvas.style.visibility = active ? 'visible' : 'hidden';
    scene.style.visibility = active ? 'hidden' : 'visible';
    if (!active) return;
    const gl = this.gl!;
    const [A, B, C, D] = [this.A!, this.B!, this.C!, this.D!];
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    this.upload(this.sceneTex!, scene);
    this.upload(this.glowTex!, glow);
    const lit = o.lit && !!o.light;
    if (lit) this.upload(this.lightTex!, o.light!);
    // halo serré (1/4) puis large (1/10)
    gl.useProgram(this.pBlur);
    this.blur(this.glowTex!, A, 1.4 / A.w, 0);
    this.blur(A.t, B, 0, 1.4 / A.h);
    this.blur(B.t, A, 3 / A.w, 0);
    this.blur(A.t, B, 0, 3 / A.h);
    this.blur(B.t, C, 1.6 / C.w, 0);
    this.blur(C.t, D, 0, 1.6 / C.h);
    this.blur(D.t, C, 3.2 / C.w, 0);
    this.blur(C.t, D, 0, 3.2 / C.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cw, this.ch);
    gl.useProgram(lit ? this.pComp : this.pLite);
    const U = lit ? this.U : this.UL;
    const bind = (unit: number, t: WebGLTexture, u: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u, unit);
    };
    bind(0, this.sceneTex!, U.uScene);
    bind(1, this.lightTex!, U.uLight);
    bind(2, B.t, U.uBloom);
    bind(3, D.t, U.uBloom2);
    const g = this.ease(o.grade, o.dt);
    gl.uniform2f(U.uRes, this.cw, this.ch);
    gl.uniform1f(U.uTime, o.reduced ? 0 : time);
    gl.uniform1f(U.uNight, o.night);
    gl.uniform1f(U.uBloomK, 0.65 + 0.7 * o.night);
    gl.uniform1f(U.uRed, o.red ? 1 : 0);
    gl.uniform1f(U.uBump, 3.2);
    gl.uniform1f(U.uGrain, o.reduced ? 0.012 : 0.026);
    gl.uniform1f(U.uMotion, o.reduced ? 0 : 1);
    if (lit) {
      gl.uniform4fv(U.uHeat, o.heat);
      let n = 0;
      while (n < HEAT_MAX && o.heat[n * 4 + 3] > 0) n++;
      gl.uniform1f(U.uHeatN, n);
    }
    gl.uniform3fv(U.uLift, g.lift);
    gl.uniform3fv(U.uGain, g.gain);
    gl.uniform3fv(U.uShadow, g.shadow);
    gl.uniform3fv(U.uHigh, g.high);
    gl.uniform1f(U.uSat, g.sat);
    gl.uniform1f(U.uContrast, g.contrast);
    gl.uniform1f(U.uSepia, g.sepia);
    this.draw();
  }
}
