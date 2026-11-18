import * as THREE from 'three';

// Procedurally generated canvas textures so the game ships without binary assets.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function roofTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rand(7);
  g.fillStyle = '#5d5763';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 70 + r() * 40;
    g.fillStyle = `rgba(${v},${v - 6},${v + 6},${0.25 + r() * 0.3})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  // Tar seams.
  g.strokeStyle = 'rgba(30,26,34,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(0, i * 64);
    g.lineTo(256, i * 64 + (r() - 0.5) * 6);
    g.stroke();
  }
  return tex(c, 4);
}

export function brickTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rand(3);
  g.fillStyle = '#6e3326';
  g.fillRect(0, 0, 256, 256);
  const bh = 16;
  const bw = 40;
  for (let y = 0; y < 256 / bh; y++) {
    for (let x = -1; x < 256 / bw + 1; x++) {
      const off = (y % 2) * (bw / 2);
      const h = 10 + r() * 14;
      g.fillStyle = `hsl(${h}, ${45 + r() * 15}%, ${34 + r() * 10}%)`;
      g.fillRect(x * bw + off + 1.5, y * bh + 1.5, bw - 3, bh - 3);
    }
  }
  return tex(c, 1);
}

export function windowsTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  const r = rand(11);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 6; x++) {
      if (r() < 0.38) {
        const warm = r() < 0.75;
        g.fillStyle = warm ? `hsl(${35 + r() * 15}, 90%, ${55 + r() * 20}%)` : `hsl(195, 70%, ${55 + r() * 20}%)`;
        g.fillRect(6 + x * 20, 6 + y * 16, 12, 9);
      }
    }
  }
  return tex(c, 1);
}

export function crateTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c98a4b';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#7a4d22';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(10, 10);
  g.lineTo(118, 118);
  g.stroke();
  g.strokeStyle = 'rgba(122,77,34,0.35)';
  g.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(10, i * 21);
    g.lineTo(118, i * 21);
    g.stroke();
  }
  return tex(c, 1);
}

export function stripeTexture(a: string, b: string, bands = 4): THREE.CanvasTexture {
  const [c, g] = canvas(16, 128);
  const h = 128 / bands;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, i * h, 16, h);
  }
  return tex(c, 1);
}

/** Comic "POW" burst used for hit flashes. */
export function burstTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.translate(64, 64);
  const spikes = 11;
  g.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? 26 : 60;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#fff6b0';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#ff9a2e';
  g.stroke();
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function starTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.translate(32, 32);
  g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 11 : 28;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffe14a';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#e08a00';
  g.stroke();
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
