import * as THREE from 'three';
import { windowsTexture } from './textures';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  resize(): void;
}

/** Renderer, lights, sky and the city backdrop for the sunset rooftop theme. */
export function createScene(container: HTMLElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const horizon = new THREE.Color(0xffb27a);
  scene.fog = new THREE.Fog(horizon, 38, 120);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(0, 9, 14);

  // Sky dome with a sunset gradient.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3a4a9a) },
      mid: { value: new THREE.Color(0xf59a8a) },
      bottom: { value: new THREE.Color(0xffc47e) },
      sunDir: { value: new THREE.Vector3(-0.5, 0.18, -0.85).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(bottom, mid, smoothstep(-0.05, 0.18, h));
        c = mix(c, top, smoothstep(0.18, 0.7, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.75, 0.45) * pow(s, 64.0) * 1.4 + vec3(1.0, 0.6, 0.35) * pow(s, 6.0) * 0.25;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  // Lights.
  const hemi = new THREE.HemisphereLight(0xffd4b8, 0x4b3d66, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a8, 2.6);
  sun.position.set(-9, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -13;
  sc.right = 13;
  sc.top = 13;
  sc.bottom = -13;
  sc.near = 1;
  sc.far = 50;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.7);
  rim.position.set(8, 6, -10);
  scene.add(rim);

  buildCity(scene);

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  return { renderer, scene, camera, sun, resize };
}

/** A ring of instanced buildings below and around the rooftop. */
function buildCity(scene: THREE.Scene): void {
  let s = 4242;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const winTex = windowsTexture();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    emissive: 0xffc68a,
    emissiveMap: winTex,
    emissiveIntensity: 0.9,
  });
  const count = 140;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const palette = [0x7d6a8f, 0x8e7a9e, 0x6b5f7d, 0xa58a8a, 0x5f6f8f, 0x9a8070, 0x77657f];
  const color = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    const ang = r() * Math.PI * 2;
    const rad = 16 + r() * 70;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    // Keep the camera side (positive Z, near) clearer so buildings don't block the view.
    if (z > 4 && Math.abs(x) < 26 && rad < 45) continue;
    const w = 4 + r() * 7;
    const d = 4 + r() * 7;
    const top = -6 + r() * (rad > 40 ? 30 : 10);
    const base = -30;
    m.compose(new THREE.Vector3(x, base, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 0.3), new THREE.Vector3(w, top - base, d));
    mesh.setMatrixAt(placed, m);
    mesh.setColorAt(placed, color.setHex(palette[Math.floor(r() * palette.length)]));
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // Street far below.
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x3b3346, roughness: 1 }),
  );
  street.rotation.x = -Math.PI / 2;
  street.position.y = -28;
  scene.add(street);
}
