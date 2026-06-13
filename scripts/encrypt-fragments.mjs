import { webcrypto as crypto } from 'crypto';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import * as cheerio from 'cheerio';

const enc = new TextEncoder();
const ITER = 250000;
const secrets = JSON.parse(await readFile('/tmp/secrets.json', 'utf8'));

async function deriveKey(password, salt) {
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
}

async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
  );
  const b64 = (b) => Buffer.from(b).toString('base64');
  return { salt: b64(salt), iv: b64(iv), data: b64(ct), iter: ITER };
}

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.html')) await processFile(p);
  }
}

async function processFile(path) {
  const html = await readFile(path, 'utf8');
  const $ = cheerio.load(html);
  const blocks = $('.locked-content');
  if (blocks.length === 0) return;

  for (const el of blocks.toArray()) {
    const key = $(el).attr('data-secret-key');
    const password = secrets[key];
    if (!password) { console.warn(`No secret for ${key}, skipping`); continue; }

    const payload = await encrypt($(el).html(), password);
    $(el).replaceWith(`
      <div class="secret-locked" data-payload='${JSON.stringify(payload)}'>
        <form class="secret-form" onsubmit="return false">
          <input type="password" class="secret-input" autocomplete="off" />
          <button class="secret-btn">Unlock</button>
          <p class="secret-error" hidden>Wrong password</p>
        </form>
      </div>`);
    console.log(`Encrypted block "${key}" in ${path}`);
  }
  await writeFile(path, $.html());
}

await walk('public');