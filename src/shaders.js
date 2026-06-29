// Fragment shaders for the animated WebGL backgrounds. Both expose the same
// uniforms (u_resolution: vec2, u_time: float) so they can share one renderer
// component. Written for WebGL1 / GLSL ES 1.00.

// Intro background: domain-warped fbm noise drifting as slow phosphor wisps.
export const NEBULA_FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time * 0.08;

  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + t),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) - t)
  );
  float f = fbm(p + 4.0 * r);
  f = f * 0.5 + 0.5;

  vec3 deep   = vec3(0.01, 0.04, 0.02);
  vec3 mid    = vec3(0.03, 0.24, 0.10);
  vec3 bright = vec3(0.29, 0.87, 0.50);

  vec3 col = mix(deep, mid, smoothstep(0.15, 0.6, f));
  col = mix(col, bright, smoothstep(0.62, 0.98, f) * (0.45 + 0.55 * r.x));
  col *= 0.72;

  gl_FragColor = vec4(col, 1.0);
}
`

// Gameplay / result background: thin streaks sweeping past like meteors.
// Adapted from thanh's "animated shader background" (21st.dev) — re-themed from
// its blue aurora to phosphor green and dialled down to a minimal intensity so
// it lives quietly in the gaps around the opaque UI panels. tanh() is missing
// in GLSL ES 1.00, so it's polyfilled below.
export const METEOR_FRAG = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

float rand(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  float res = mix(
    mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
    mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
  return res * res;
}

float fbm(vec2 x) {
  float v = 0.0;
  float a = 0.3;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 3; ++i) {
    v += a * noise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.4;
  }
  return v;
}

vec4 tanh4(vec4 x) {
  vec4 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

void main() {
  vec2 shake = vec2(sin(u_time * 1.2) * 0.005, cos(u_time * 2.1) * 0.005);
  vec2 p = ((gl_FragCoord.xy + shake * u_resolution.xy) - u_resolution.xy * 0.5) / u_resolution.y * mat2(6.0, -4.0, 4.0, 6.0);
  vec2 v;
  vec4 o = vec4(0.0);

  float f = 2.0 + fbm(p + vec2(u_time * 5.0, 0.0)) * 0.5;

  for (float i = 0.0; i < 22.0; i++) {
    v = p + cos(i * i + (u_time + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5
        + vec2(sin(u_time * 3.0 + i) * 0.003, cos(u_time * 3.5 - i) * 0.003);
    float tailNoise = fbm(v + vec2(u_time * 0.5, i)) * 0.3 * (1.0 - (i / 22.0));
    // Phosphor-green streak palette (was blue/purple aurora): green dominant,
    // red/blue kept low so streaks stay green rather than tinting cyan.
    vec4 streakColors = vec4(
      0.03 + 0.07 * sin(i * 0.3 + u_time * 0.4),
      0.45 + 0.45 * cos(i * 0.3 + u_time * 0.5),
      0.05 + 0.06 * sin(i * 0.4 + u_time * 0.3),
      1.0
    );
    vec4 currentContribution = streakColors * exp(sin(i * i + u_time * 0.8)) / length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));
    float thinnessFactor = smoothstep(0.0, 1.0, i / 22.0) * 0.6;
    o += currentContribution * (1.0 + tailNoise * 0.8) * thinnessFactor;
  }

  o = tanh4(pow(o / 100.0, vec4(1.6)));
  gl_FragColor = vec4(o.rgb * 0.8, 1.0);
}
`
