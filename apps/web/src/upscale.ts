// Enhanced render mode: a WebGL overlay that upscales the engine's 640x400
// framebuffer with antialiased ("sharp bilinear") sampling for a smoother,
// higher-resolution look without blurring the pixel art. The engine keeps
// rendering to its own canvas underneath (still the input target); this just
// samples that canvas as a texture each frame. No engine changes.

const VERT = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2((p.x+1.0)*0.5, (1.0-p.y)*0.5); gl_Position = vec4(p,0.0,1.0); }`;

// scale = source texels per output pixel; antialias the pixel-cell boundaries
// so edges stay crisp but diagonals and motion read as higher resolution.
const FRAG = `precision mediump float;
uniform sampler2D tex; uniform vec2 texSize; uniform vec2 scale; varying vec2 uv;
void main(){
  vec2 pix = uv * texSize;
  vec2 cell = floor(pix) + 0.5;
  vec2 frac = pix - cell;
  vec2 aa = clamp(frac / max(scale, vec2(0.0005)), -0.5, 0.5);
  gl_FragColor = texture2D(tex, (cell + aa) / texSize);
}`;

export interface Upscaler { stop(): void }

export function createUpscaler(source: HTMLCanvasElement, display: HTMLCanvasElement): Upscaler | null {
  const gl = (display.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    || display.getContext('experimental-webgl', { antialias: false })) as WebGLRenderingContext | null;
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
  } catch { return null; }

  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

  const uTexSize = gl.getUniformLocation(program, 'texSize');
  const uScale = gl.getUniformLocation(program, 'scale');

  let raf = 0;
  let stopped = false;
  const render = () => {
    if (stopped) return;
    const rect = display.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (display.width !== w || display.height !== h) { display.width = w; display.height = h; }
    const sw = source.width || 640, sh = source.height || 400;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uTexSize, sw, sh);
      gl.uniform2f(uScale, sw / w, sh / h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch { /* source not ready this frame */ }
    raf = requestAnimationFrame(render);
  };
  raf = requestAnimationFrame(render);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}
