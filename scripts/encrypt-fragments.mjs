import { webcrypto as crypto, createHash } from 'crypto';
import { readFile, writeFile, readdir, mkdir, unlink, rmdir } from 'fs/promises';
import { join, dirname, resolve, extname, sep } from 'path';
import * as cheerio from 'cheerio';

const enc = new TextEncoder();
const ITER = 250000;
const PUBLIC = resolve('public');
const MEDIA_URL = '/enc-media';
const MEDIA_DIR = join(PUBLIC, 'enc-media');

// Files with these extensions are treated as post attachments: they are the
// things that would leak the contents of a locked section, and the only things
// the public/ cleanup pass is allowed to remove.
const MEDIA_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.tif',
  '.tiff', '.ico', '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.ogg',
  '.oga', '.opus', '.pdf', '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar',
]);

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

// One PBKDF2 pass per locked block; the derived key encrypts the block's HTML
// and every image inside it, so the browser also derives only once.
async function encryptWith(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv, ct: Buffer.from(ct) };
}

const b64 = (b) => Buffer.from(b).toString('base64');

// Maps an <img src> back to the file Hugo published, or null when it is not a
// local public/ file (external URL, data: URI, ...).
function srcToPath(src, htmlFile) {
  if (!src) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return null;
  let clean = src.split('#')[0].split('?')[0];
  if (!clean) return null;
  try { clean = decodeURIComponent(clean); } catch { /* keep as-is */ }
  const p = clean.startsWith('/')
    ? resolve(PUBLIC, '.' + clean)
    : resolve(dirname(htmlFile), clean);
  return p === PUBLIC || p.startsWith(PUBLIC + sep) ? p : null;
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const htmlFiles = (await walk(PUBLIC)).filter((p) => p.endsWith('.html'));

// ---------------------------------------------------------------------------
// Pass 1 - classify every image reference across the whole site.
//
// This has to complete before anything is deleted: the same file may be used
// freely on one page and inside a locked block on another, and only a
// site-wide view can tell the difference.
// ---------------------------------------------------------------------------
const freeRefs = new Set();    // safe to publish
const lockedRefs = new Set();  // must not survive in public/
const cleanDirs = new Set();   // resource dirs to sweep for orphans
const pagesWithLocked = new Set();

for (const file of htmlFiles) {
  const $ = cheerio.load(await readFile(file, 'utf8'));
  const blocks = $('.locked-content');
  if (blocks.length) pagesWithLocked.add(file);

  $('img[src]').each((_, el) => {
    const path = srcToPath($(el).attr('src'), file);
    if (!path) return;
    const block = $(el).closest('.locked-content');
    // A block whose password is missing stays in plaintext (see pass 2), so its
    // images have to stay published too - otherwise they break silently.
    const locked = block.length > 0 && !!secrets[block.attr('data-secret-key')];
    if (locked) {
      lockedRefs.add(path);
      cleanDirs.add(dirname(path));
    } else {
      freeRefs.add(path);
    }
  });

  if (blocks.length) cleanDirs.add(dirname(file));
}

// ---------------------------------------------------------------------------
// Pass 2 - encrypt locked blocks and the media they reference.
// ---------------------------------------------------------------------------
let mediaCount = 0;
const mediaCache = new Map(); // (secret key, file) -> blob name

// One salt/key per secret, shared by every block using it - notably the ru and
// en rendering of the same post. Per-block salts would encrypt the same image
// twice under different keys, so the two pages could not share a blob.
const keyring = new Map();
async function keyFor(secretKey, password) {
  let entry = keyring.get(secretKey);
  if (!entry) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    entry = { salt, key: await deriveKey(password, salt) };
    keyring.set(secretKey, entry);
  }
  return entry;
}

if (pagesWithLocked.size) await mkdir(MEDIA_DIR, { recursive: true });

for (const file of pagesWithLocked) {
  const $ = cheerio.load(await readFile(file, 'utf8'));

  for (const el of $('.locked-content').toArray()) {
    const secretKey = $(el).attr('data-secret-key');
    const password = secrets[secretKey];
    if (!password) { console.warn(`No secret for ${secretKey}, skipping`); continue; }

    const { salt, key } = await keyFor(secretKey, password);

    for (const node of $(el).find('img[src]').toArray()) {
      const img = $(node);
      const path = srcToPath(img.attr('src'), file);
      if (!path) continue;

      const cacheId = `${secretKey}\0${path}`;
      let name = mediaCache.get(cacheId);
      if (!name) {
        let bytes;
        try {
          bytes = await readFile(path);
        } catch (e) {
          console.warn(`Cannot read ${path} for ${secretKey}: ${e.code}`);
          continue;
        }
        const { iv, ct } = await encryptWith(key, bytes);
        // iv || ciphertext; the salt travels with the block payload.
        const blob = Buffer.concat([Buffer.from(iv), ct]);
        name = createHash('sha256').update(blob).digest('hex').slice(0, 32) + '.bin';
        await writeFile(join(MEDIA_DIR, name), blob);
        mediaCache.set(cacheId, name);
        mediaCount++;
      }

      // Drop src so the browser never requests the (soon deleted) plaintext
      // file and never leaks its name in the network log.
      img.removeAttr('src').removeAttr('srcset').removeAttr('loading');
      img.attr('data-enc-src', `${MEDIA_URL}/${name}`);
      img.addClass('enc-img');
    }

    const payload = await encryptWith(key, enc.encode($(el).html()));
    const meta = {
      salt: b64(salt), iv: b64(payload.iv), data: b64(payload.ct), iter: ITER,
    };
    $(el).replaceWith(`
      <div class="secret-locked" data-payload='${JSON.stringify(meta)}'>
        <form class="secret-form" onsubmit="return false">
          <input type="password" class="secret-input" autocomplete="off" />
          <button class="secret-btn">Unlock</button>
          <p class="secret-error" hidden>Wrong password</p>
        </form>
      </div>`);
    console.log(`Encrypted block "${secretKey}" in ${file}`);
  }

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).contents().text();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      let changed = false;
      const scrub = (obj) => {
        if (obj && typeof obj === 'object') {
          if ('articleBody' in obj) { delete obj.articleBody; changed = true; }
          for (const k of Object.keys(obj)) scrub(obj[k]);
        }
      };
      scrub(data);
      if (changed) $(node).text(JSON.stringify(data));
    } catch { /* leave malformed json alone */ }
  });

  await writeFile(file, $.html());
}

// ---------------------------------------------------------------------------
// Pass 3 - strip plaintext media out of public/.
//
// Hugo publishes every page-bundle resource whether or not the page links to
// it, so removing only the referenced files is not enough: an unused screenshot
// sitting in the bundle would still be downloadable.
// ---------------------------------------------------------------------------
const removed = [];

async function removeFile(path) {
  try {
    await unlink(path);
    removed.push(path);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

for (const path of lockedRefs) {
  if (!freeRefs.has(path)) await removeFile(path);
}

// Sweep resource directories for orphans. Recursion stops at any directory
// holding its own index.html: that is a different page's output, not a
// resource folder of this one.
async function sweep(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (p === MEDIA_DIR) continue;
      const kids = await readdir(p).catch(() => []);
      if (!kids.includes('index.html')) await sweep(p);
      continue;
    }
    if (!MEDIA_EXT.has(extname(e.name).toLowerCase())) continue;
    if (freeRefs.has(p)) continue;
    await removeFile(p);
  }
}

for (const dir of cleanDirs) {
  if (dir === PUBLIC || !dir.startsWith(PUBLIC + sep)) continue;
  await sweep(dir);
}

// Drop directories the sweep emptied out.
for (const dir of [...cleanDirs].sort((a, b) => b.length - a.length)) {
  try { await rmdir(dir); } catch { /* not empty, or gone */ }
}

console.log(
  `Encrypted ${mediaCount} media file(s); removed ${removed.length} plaintext file(s) from public/`
);
for (const p of removed) console.log(`  removed ${p.slice(PUBLIC.length + 1)}`);
