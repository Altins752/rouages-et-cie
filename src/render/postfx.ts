/**
 * Post-traitement WebGL optionnel (repris de la v5) : bloom sur une couche émissive,
 * aberration chromatique, grain, vignettage, teinte de nuit. Sans WebGL, le canvas 2D s'affiche seul.
 */
import { ambient } from '../sim/env';
import type { GameState } from '../sim/types';

const VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
const FS_BLUR = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;
void main(){vec3 s=texture2D(t,v).rgb*.227027;
s+=(texture2D(t,v+d*1.384615).rgb+texture2D(t,v-d*1.384615).rgb)*.316216;
s+=(texture2D(t,v+d*3.230769).rgb+texture2D(t,v-d*3.230769).rgb)*.070270;
gl_FragColor=vec4(s,1.);}`;
const FS_COMP = `precision mediump float;varying vec2 v;
uniform sampler2D uScene,uBloom;uniform vec2 uRes;uniform float uTime,uNight,uBloomK,uRed;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
 vec2 uv=v;
 if(uRed>0.){uv+=vec2(sin(uv.y*170.+uTime*9.)*.0012,cos(uv.x*120.+uTime*7.)*.001)*uRed;}
 vec2 c=uv-.5;float e=dot(c,c);float ca=.006*e*(1.+uRed*2.);
 vec3 col=vec3(texture2D(uScene,uv+c*ca).r,texture2D(uScene,uv).g,texture2D(uScene,uv-c*ca).b);
 col+=texture2D(uBloom,uv).rgb*uBloomK;
 col=mix(col,col*col*(3.-2.*col),.2);
 float l=dot(col,vec3(.299,.587,.114));
 col+=mix(vec3(-.015,.0,.035),vec3(.035,.018,-.025),l)*(1.-uNight*.5);
 col=mix(col,mix(vec3(l),col,.75)*vec3(.9,.96,1.1),uNight*.4);
 float vig=smoothstep(.95,.3,length(c*vec2(1.,1.2)));
 col*=mix(.7,1.,vig);
 col+=(hash(v*uRes+fract(uTime*7.)*91.)-.5)*.035;
 gl_FragColor=vec4(clamp(col,0.,1.),1.);}`;

interface Fbo {
  t: WebGLTexture;
  f: WebGLFramebuffer;
  w: number;
  h: number;
}

export class PostFx {
  ok = false;
  private gl: WebGLRenderingContext | null = null;
  private pBlur: WebGLProgram | null = null;
  private pComp: WebGLProgram | null = null;
  private U: Record<string, WebGLUniformLocation | null> = {};
  private sceneTex: WebGLTexture | null = null;
  private glowTex: WebGLTexture | null = null;
  private A: Fbo | null = null;
  private B: Fbo | null = null;
  private quad: WebGLBuffer | null = null;
  private cw = 1;
  private ch = 1;

  constructor(private canvas: HTMLCanvasElement) {
    try {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!gl) return;
      this.gl = gl;
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
      this.pComp = pr(FS_COMP);
      const ul = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
      this.U = {
        bt: ul(this.pBlur, 't'), bd: ul(this.pBlur, 'd'), sc: ul(this.pComp, 'uScene'), bl: ul(this.pComp, 'uBloom'),
        res: ul(this.pComp, 'uRes'), time: ul(this.pComp, 'uTime'), night: ul(this.pComp, 'uNight'), bk: ul(this.pComp, 'uBloomK'), red: ul(this.pComp, 'uRed'),
      };
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.sceneTex = this.tex();
      this.glowTex = this.tex();
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
    for (const o of [this.A, this.B]) if (o) {
      gl.deleteTexture(o.t);
      gl.deleteFramebuffer(o.f);
    }
    const bw = Math.max(1, Math.round(cw / 4));
    const bh = Math.max(1, Math.round(ch / 4));
    this.A = this.fbo(bw, bh);
    this.B = this.fbo(bw, bh);
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

  /** Compose la scène 2D et sa couche émissive ; masque le canvas WebGL si désactivé. */
  render(on: boolean, scene: HTMLCanvasElement, glow: HTMLCanvasElement, time: number, s: GameState, red: boolean): void {
    const active = on && this.ok && !!this.gl && !!this.A && !!this.B;
    this.canvas.style.visibility = active ? 'visible' : 'hidden';
    scene.style.visibility = active ? 'hidden' : 'visible';
    if (!active) return;
    const gl = this.gl!;
    const A = this.A!;
    const B = this.B!;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glow);
    gl.useProgram(this.pBlur);
    this.blur(this.glowTex!, A, 1.6 / A.w, 0);
    this.blur(A.t, B, 0, 1.6 / A.h);
    this.blur(B.t, A, 3.6 / A.w, 0);
    this.blur(A.t, B, 0, 3.6 / A.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cw, this.ch);
    gl.useProgram(this.pComp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.U.sc, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, B.t);
    gl.uniform1i(this.U.bl, 1);
    const night = 1 - ambient(s.t);
    gl.uniform2f(this.U.res, this.cw, this.ch);
    gl.uniform1f(this.U.time, time);
    gl.uniform1f(this.U.night, night);
    gl.uniform1f(this.U.bk, 0.7 + 0.8 * night);
    gl.uniform1f(this.U.red, red ? 1 : 0);
    this.draw();
  }
}
