const dec = new TextDecoder();
const enc = new TextEncoder();
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const objectUrls = [];
addEventListener('pagehide', () => {
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls.length = 0;
});

async function deriveKey(password, salt, iter) {
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

// Media blobs are `iv (12 bytes) || ciphertext`, encrypted with the same key as
// the block they belong to, so unlocking costs exactly one PBKDF2 pass.
async function revealImage(img, key) {
  const url = img.dataset.encSrc;
  if (!url || img.dataset.encState) return;
  img.dataset.encState = 'loading';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf.subarray(0, 12) }, key, buf.subarray(12)
    );
    const objectUrl = URL.createObjectURL(new Blob([plain]));
    objectUrls.push(objectUrl);
    img.src = objectUrl;
    img.dataset.encState = 'done';
  } catch {
    img.dataset.encState = 'failed';
  }
}

// Small pool: a long writeup can hold dozens of screenshots, and decrypting
// them all at once would spike memory for no gain.
function pooled(limit, tasks) {
  let i = 0;
  const next = async () => {
    while (i < tasks.length) await tasks[i++]();
  };
  return Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, next));
}

function revealImages(root, key) {
  const imgs = [...root.querySelectorAll('img[data-enc-src]')];
  if (!imgs.length) return;

  if (!('IntersectionObserver' in window)) {
    pooled(4, imgs.map((img) => () => revealImage(img, key)));
    return;
  }

  // Decrypt on approach rather than up front, so opening a post does not pull
  // down every screenshot at once.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      revealImage(e.target, key);
    }
  }, { rootMargin: '800px 0px' });

  for (const img of imgs) io.observe(img);
}

function setup(box) {
  const payload = JSON.parse(box.dataset.payload);
  const form = box.querySelector('.secret-form');
  const input = box.querySelector('.secret-input');
  const error = box.querySelector('.secret-error');
  const btn = form.querySelector('.secret-btn');

  const submit = async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    error.hidden = true;
    try {
      const key = await deriveKey(input.value, fromB64(payload.salt), payload.iter);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(payload.iv) },
        key, fromB64(payload.data)
      );
      const div = document.createElement('div');
      div.className = 'secret-revealed';
      div.innerHTML = dec.decode(plain);
      box.replaceWith(div);
      revealImages(div, key);
    } catch {
      error.hidden = false;
      btn.disabled = false;
    }
  };

  btn.addEventListener('click', submit);
  form.addEventListener('submit', submit);
}

document.querySelectorAll('.secret-locked').forEach(setup);
