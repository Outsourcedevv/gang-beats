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

export function hazardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#222';
  for (let i = -128; i < 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 + 128, 128);
    g.lineTo(i + 128, 128);
    g.closePath();
    g.fill();
  }
  return tex(c, 1);
}

export function beltTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#2b2b30';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3d3d44';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 6, 64);
  return tex(c, 1);
}

export function gratingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#9aa7b2';
  g.lineWidth = 4;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  return tex(c, 1);
}

export function plankTexture(rotten = false): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rand(rotten ? 9 : 5);
  for (let i = 0; i < 8; i++) {
    const l = rotten ? 22 + r() * 8 : 38 + r() * 12;
    g.fillStyle = rotten ? `hsl(${70 + r() * 20}, 25%, ${l}%)` : `hsl(${26 + r() * 8}, 45%, ${l}%)`;
    g.fillRect(0, i * 16, 128, 15);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, i * 16 + 15, 128, 1);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(r() * 128, i * 16 + r() * 14, 20 + r() * 30, 1);
    }
  }
  if (rotten) {
    g.strokeStyle = 'rgba(10,15,5,0.7)';
    g.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      let x = r() * 128;
      let y = r() * 128;
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  return tex(c, 1);
}

export function roadTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rand(17);
  g.fillStyle = '#4a4850';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 60 + r() * 30;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  // Lane dashes (texture u runs along the road).
  g.fillStyle = '#f4f1e6';
  for (const y of [84, 172]) for (let x = 0; x < 256; x += 64) g.fillRect(x, y, 34, 5);
  g.fillStyle = '#f2c230';
  g.fillRect(0, 6, 256, 4);
  g.fillRect(0, 246, 256, 4);
  return tex(c, 1);
}

export function sandTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rand(23);
  g.fillStyle = '#d9b77e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(170,130,80,0.25)' : 'rgba(250,225,170,0.25)';
    g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 1 + r() * 2);
  }
  return tex(c, 1);
}

export function lavaTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rand(31);
  const grd = g.createLinearGradient(0, 0, 128, 128);
  grd.addColorStop(0, '#ff5a00');
  grd.addColorStop(1, '#ffb000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(90,20,0,${0.2 + r() * 0.4})`;
    g.beginPath();
    g.ellipse(r() * 128, r() * 128, 6 + r() * 14, 3 + r() * 8, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, 1);
}

export function waterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rand(41);
  g.fillStyle = '#123a5c';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(140,200,255,${0.08 + r() * 0.18})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    const x = r() * 128;
    const y = r() * 128;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 8, y - 3, x + 16 + r() * 10, y);
    g.stroke();
  }
  return tex(c, 1);
}

export function ringTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = '#ff3b3b';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 22, 0, Math.PI * 2);
  g.stroke();
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
