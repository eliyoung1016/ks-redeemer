// redeem-file.js
const { chromium } = require('playwright');
const fs = require('fs');

const SITE = 'https://ks-giftcode.centurygame.com/';
const REDEEM_URL = 'https://kingshot-giftcode.centurygame.com/api/gift_code';

function classifyRedeem(payload) {
  if (payload?.code === 0 && payload?.err_code === 20000) {
    return { status: 'SUCCESS', reason: payload?.msg || 'SUCCESS', code: payload.err_code };
  }
  if (payload?.code === 1 && payload?.err_code === 40008) {
    return { status: 'ALREADY_REDEEMED', reason: payload?.msg || 'RECEIVED', code: payload.err_code };
  }
  // fallback
  return {
    status: 'UNKNOWN',
    reason: payload?.msg || (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    code: payload.err_code
  };
}

async function redeemOnce(page, fid, gift) {
  // wait for the exact API call the moment you click "Confirm"
  const respPromise = page.waitForResponse(
    r => r.url().startsWith(REDEEM_URL) && ['POST', 'GET'].includes(r.request().method()),
    { timeout: 16000 }
  ).catch(() => null);

  // === your existing UI flow ===
  const idBox = page.getByPlaceholder(/player\s*id/i).first();
  await idBox.fill('');
  await idBox.fill(fid);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);

  if (!await clickByText(page, /login/i)) throw new Error('Login not found/clickable');
  await page.waitForTimeout(1600);

  const giftBox = page.getByPlaceholder(/gift\s*code/i).first();
  await giftBox.fill('');
  await giftBox.fill(gift);

  if (!await clickByText(page, /confirm|redeem/i)) throw new Error('Confirm not found/clickable');

  // === parse the API response ===
  const resp = await respPromise;
  if (!resp) return { status: 'UNKNOWN', detail: 'No network response captured' };

  let payload;
  try {
    const ctype = resp.headers()['content-type'] || '';
    payload = ctype.includes('application/json') ? await resp.json() : await resp.text();
  } catch (e) {
    return { status: 'UNKNOWN', detail: `Response parse error: ${e.message}` };
  }

  const { status, reason, code } = classifyRedeem(payload);
  return { status, detail: reason, raw: payload, code };
}

function parseGiftCodes(argv) {
  const raw = argv.slice(2).join(' ').trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
}

async function clickByText(page, rx, timeout = 5000) {
  try { await page.getByText(rx).first().click({ timeout }); return true; } catch {}
  for (const f of page.frames()) {
    try { await f.getByText(rx).first().click({ timeout }); return true; } catch {}
  }
  return false;
}

(async () => {
  // Read IDs from ids.txt (one per line)
  const ids = fs.readFileSync('ids.txt', 'utf8')
    .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!ids.length) { console.error('ids.txt is empty'); process.exit(1); }

  // Parse gift codes from CLI (supports one or many; space/comma separated)
  const codes = parseGiftCodes(process.argv);
  if (!codes.length) {
    console.error('Usage: node redeem-file.js CODE1 [CODE2 CODE3]  (you can also separate by commas)');
    process.exit(1);
  }

  console.log(`IDs: ${ids.length} | Gift codes: ${codes.join(', ')}`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });

  for (const fid of ids) {
    console.log(`\n=== Player ${fid} ===`);
    for (const gift of codes) {
      console.log(`Redeem: ${gift}`);
      try {
        const { status, detail, code } = await redeemOnce(page, fid, gift);
        console.log(`→ ${status} :: ${detail} :: ${code}`);
      } catch (e) {
        console.warn(`Issue on ${fid} / ${gift}: ${e.message}`);
      } finally {
        // ALWAYS refresh after each submission (your priority)
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
      }
    }
  }

  console.log('\nAll done.');
  await browser.close();
})();
