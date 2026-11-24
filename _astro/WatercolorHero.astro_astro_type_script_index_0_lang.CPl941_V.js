var e=32,t=`
precision highp float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;
uniform float uDark;
uniform vec3  uPts[${e}];   // xy = position (aspect-corrected uv), z = strength

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = ROT * p; a *= 0.5; }
  return v;
}

// Domain-warped density field for one pigment layer.
float density(vec2 p, float seed, float t) {
  vec2 q = vec2(fbm(p + seed + t * 0.030), fbm(p + seed * 1.7 - t * 0.025));
  vec2 r = vec2(fbm(p + 1.8 * q + seed * 2.3 + t * 0.020),
                fbm(p + 1.8 * q + seed * 0.7 - t * 0.015));
  return fbm(p + 1.6 * r);
}

// Wash coverage: pale, uneven interior + darkened drying edge.
float pigment(float d, float th, float grain, float flow) {
  float wet  = smoothstep(th, th + 0.18, d);                       // pigment pools toward the centre
  float edge = smoothstep(th - 0.004, th + 0.010, d)
             * (1.0 - smoothstep(th + 0.010, th + 0.055, d));      // coffee-ring rim
  float body = wet * (0.22 + 0.22 * flow) + edge * 0.42;            // flow = uneven pigment load
  return body * (0.82 + 0.36 * grain);                              // granulation
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv;
  vec2 p  = vec2(uv.x * aspect, uv.y);
  float t = uTime;

  // ---- paper -------------------------------------------------------------
  vec2 px     = uv * uRes;
  float tooth  = fbm(px / 3.5);
  float fibre  = noise(vec2(px.x / 60.0, px.y / 2.2) + tooth) * 0.5 + noise(px / 1.3) * 0.5;
  float hx = fbm((px + vec2(1.5, 0.0)) / 3.5) - tooth;
  float hy = fbm((px + vec2(0.0, 1.5)) / 3.5) - tooth;
  float emboss = clamp(0.5 + (hx + hy) * 2.2, 0.0, 1.0);

  vec3 paperL = vec3(0.965, 0.945, 0.905);
  vec3 paperD = vec3(0.085, 0.085, 0.105);
  vec3 paper  = mix(paperL, paperD, uDark);
  paper *= 0.975 + 0.04 * emboss + 0.015 * fibre;

  float grain = smoothstep(0.3, 0.7, fbm(px / 7.0));
  float flow  = fbm(p * 3.0 + t * 0.01);

  // ---- pigment layers (transmittance colours: what each wash lets through) -
  vec2 sp = p * 0.85;
  float dA = density(sp,               1.3, t);
  float dB = density(sp * 1.2 + 4.0,  7.1, t * 0.8);
  float dC = density(sp * 0.9 - 2.0, 13.7, t * 1.2);

  // fade washes toward the lower-left so text stays readable
  float vignette = smoothstep(0.0, 1.0, uv.x * 0.95 + uv.y * 0.45);

  float aA = pigment(dA, 0.54, grain, flow) * vignette;
  float aB = pigment(dB, 0.58, grain, 1.0 - flow) * vignette;
  float aC = pigment(dC, 0.60, grain, flow) * vignette;

  // ---- wet brush from pointer trail --------------------------------------
  float brush = 0.0;
  vec2 rag = vec2(fbm(p * 9.0 + t * 0.2), fbm(p * 9.0 - 3.1)) - 0.5;
  for (int i = 0; i < ${e}; i++) {
    vec3 s = uPts[i];
    if (s.z <= 0.001) continue;
    float d = length(p + rag * 0.06 - s.xy);
    brush = max(brush, s.z * (1.0 - smoothstep(0.02, 0.11, d)));
  }
  float bd = brush * (0.85 + 0.3 * fbm(p * 14.0));
  float aBrush = (smoothstep(0.25, 0.45, bd) * 0.30 + smoothstep(0.24, 0.26, bd) * (1.0 - smoothstep(0.26, 0.36, bd)) * 0.42)
               * (0.82 + 0.36 * grain);

  vec3 indigo = vec3(0.36, 0.50, 0.74);
  vec3 rose   = vec3(0.86, 0.48, 0.55);
  vec3 ochre  = vec3(0.93, 0.76, 0.42);
  vec3 sap    = vec3(0.47, 0.65, 0.56);

  // light paper: subtractive glazing
  vec3 lit = paper;
  lit *= mix(vec3(1.0), indigo, aA);
  lit *= mix(vec3(1.0), rose,   aB);
  lit *= mix(vec3(1.0), ochre,  aC);
  lit *= mix(vec3(1.0), sap,    aBrush);

  // dark paper: pigment glows like gouache on black card
  vec3 drk = paper;
  drk = mix(drk, indigo, aA * 0.70);
  drk = mix(drk, rose,   aB * 0.62);
  drk = mix(drk, ochre,  aC * 0.55);
  drk = mix(drk, sap,    aBrush * 0.70);

  vec3 col = mix(lit, drk, uDark);
  col += (hash(px + fract(t)) - 0.5) * 0.012;   // dither, kills banding
  gl_FragColor = vec4(col, 1.0);
}`;function n(e,t,n){let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw Error(e.getShaderInfoLog(r)??`shader compile failed`);return r}function r(r){let i=r.getContext(`webgl`,{antialias:!1,premultipliedAlpha:!1});if(!i){r.classList.add(`no-webgl`);return}let a=i.createProgram();if(i.attachShader(a,n(i,i.VERTEX_SHADER,`
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`)),i.attachShader(a,n(i,i.FRAGMENT_SHADER,t)),i.linkProgram(a),!i.getProgramParameter(a,i.LINK_STATUS)){console.error(i.getProgramInfoLog(a));return}i.useProgram(a);let o=i.createBuffer();i.bindBuffer(i.ARRAY_BUFFER,o),i.bufferData(i.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),i.STATIC_DRAW);let s=i.getAttribLocation(a,`aPos`);i.enableVertexAttribArray(s),i.vertexAttribPointer(s,2,i.FLOAT,!1,0,0);let c=i.getUniformLocation(a,`uRes`),l=i.getUniformLocation(a,`uTime`),u=i.getUniformLocation(a,`uDark`),d=i.getUniformLocation(a,`uPts`),f=matchMedia(`(prefers-reduced-motion: reduce)`).matches,p=new Float32Array(96),m=0,h={x:-9,y:-9},g=()=>{let e=Math.min(devicePixelRatio||1,1.5),t=Math.floor(r.clientWidth*e),n=Math.floor(r.clientHeight*e);(r.width!==t||r.height!==n)&&(r.width=t,r.height=n,i.viewport(0,0,t,n))};window.addEventListener(`pointermove`,t=>{let n=r.getBoundingClientRect(),i=(t.clientX-n.left)/n.width,a=1-(t.clientY-n.top)/n.height;if(i<0||i>1||a<0||a>1)return;let o=i*(n.width/n.height);Math.hypot(o-h.x,a-h.y)<.025||(h={x:o,y:a},p.set([o,a,1],m*3),m=(m+1)%e)},{passive:!0});let _=()=>{let e=document.documentElement.dataset.theme;return e?e===`dark`:matchMedia(`(prefers-color-scheme: dark)`).matches},v=+!!_(),y=!0;new IntersectionObserver(([e])=>y=e.isIntersecting).observe(r);let b=performance.now(),x=Math.random()*100,S=b,C=t=>{let n=Math.min((t-S)/1e3,.1);if(S=t,y&&!document.hidden){g();for(let t=0;t<e;t++)p[t*3+2]=Math.max(0,p[t*3+2]-n*.28);let a=+!!_();v=f?a:v+(a-v)*Math.min(1,n*4),i.uniform2f(c,r.width,r.height),i.uniform1f(l,x+(t-b)/1e3),i.uniform1f(u,v),i.uniform3fv(d,p),i.drawArrays(i.TRIANGLES,0,3)}f||requestAnimationFrame(C)};if(f){let e=()=>C(performance.now());addEventListener(`resize`,e),new MutationObserver(e).observe(document.documentElement,{attributes:!0,attributeFilter:[`data-theme`]}),window.addEventListener(`pointermove`,()=>requestAnimationFrame(e),{passive:!0}),e()}else requestAnimationFrame(C)}document.querySelectorAll(`canvas.wash`).forEach(e=>{try{r(e)}catch(t){console.error(t),e.classList.add(`no-webgl`)}});