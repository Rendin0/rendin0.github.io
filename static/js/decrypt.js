const dec = new TextDecoder();
const enc = new TextEncoder();
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt, iter) {
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

function setup(box) {
  const payload = JSON.parse(box.dataset.payload);
  const form = box.querySelector('.secret-form');
  const input = box.querySelector('.secret-input');
  const error = box.querySelector('.secret-error');

  form.querySelector('.secret-btn').addEventListener('click', async () => {
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
    } catch {
      error.hidden = false;
    }
  });
}

document.querySelectorAll('.secret-locked').forEach(setup);