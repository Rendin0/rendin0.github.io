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
    } catch {}
  });

  await writeFile(path, $.html());
}