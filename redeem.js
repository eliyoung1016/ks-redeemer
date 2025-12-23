// redeem-file.js
const { chromium } = require('playwright');
const fs = require('fs');

const SITE = 'https://ks-giftcode.centurygame.com/';
const REDEEM_URL = 'https://kingshot-giftcode.centurygame.com/api/gift_code';

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function classifyRedeem(payload) {
  // Success can be code 0 + err_code 20000 OR just code 0 + err_code 0 (or missing)
  if (payload?.code === 0 && (payload?.err_code === 20000 || !payload?.err_code)) {
    return { status: 'SUCCESS', reason: payload?.msg || 'SUCCESS', code: payload.err_code || 0 };
  }
  if (payload?.code === 1 && payload?.err_code === 40008) {
    return { status: 'ALREADY_REDEEMED', reason: payload?.msg || 'RECEIVED', code: payload.err_code };
  }
  if (payload?.err_code === 40004) {
    return { status: 'TIMEOUT', reason: payload?.msg || 'TIMEOUT', code: payload.err_code };
  }
  // fallback
  return {
    status: 'UNKNOWN',
    reason: payload?.msg || (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    code: payload?.err_code !== undefined ? payload.err_code : (payload?.code !== undefined ? payload.code : -1),
    raw: payload
  };
}

async function redeemOnce(page, fid, gift) {
  // === your existing UI flow ===
  try {
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

    // wait for the exact API call the moment you click "Confirm"
    const respPromise = page.waitForResponse(
      r => r.url().startsWith(REDEEM_URL) && ['POST', 'GET'].includes(r.request().method()),
      { timeout: 16000 }
    ).catch(() => null);

    if (!await clickByText(page, /confirm|redeem/i)) throw new Error('Confirm not found/clickable');

    // === parse the API response ===
    const resp = await respPromise;
    if (!resp) return { status: 'UNKNOWN', detail: 'No network response captured' };

    let payload;
    try {
      const ctype = resp.headers()['content-type'] || '';
      payload = ctype.includes('application/json') ? await resp.json() : await resp.text();
      // Omit 'data' field from raw payload to reduce noise
      if (payload && typeof payload === 'object' && 'data' in payload) {
        delete payload.data;
      }
    } catch (e) {
      return { status: 'UNKNOWN', detail: `Response parse error: ${e.message}` };
    }

    const { status, reason, code, raw } = classifyRedeem(payload);
    // If unknown, add raw payload to detail for debugging
    const detail = status === 'UNKNOWN' ? `${reason} [RAW: ${JSON.stringify(raw)}]` : reason;
    return { status, detail, raw: payload, code };

  } catch (e) {
    return { status: 'ERROR', detail: `UI Error: ${e.message}`, code: -999 };
  }
}

function parseGiftCodes(argv) {
  const raw = argv.slice(2).join(' ').trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
}

async function clickByText(page, rx, timeout = 5000) {
  try { await page.getByText(rx).first().click({ timeout }); return true; } catch { }
  for (const f of page.frames()) {
    try { await f.getByText(rx).first().click({ timeout }); return true; } catch { }
  }
  return false;
}

(async () => {
  // Read IDs from ids.txt (one per line) or ENV
  let ids = [];
  try {
    if (fs.existsSync('ids.txt')) {
      ids = fs.readFileSync('ids.txt', 'utf8')
        .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }
  } catch (e) {
    log(`Error reading ids.txt: ${e.message}`);
  }

  // Fallback to environment variable if FILE is missing or empty
  if (!ids.length && process.env.PLAYER_IDS) {
    log('Reading IDs from PLAYER_IDS environment variable...');
    ids = process.env.PLAYER_IDS.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  }

  if (!ids.length) {
    console.error('Error: No IDs found in ids.txt or PLAYER_IDS environment variable.');
    process.exit(1);
  }

  // Parse gift codes from CLI (supports one or many; space/comma separated)
  const codes = parseGiftCodes(process.argv);
  if (!codes.length) {
    console.error('Usage: node redeem-file.js CODE1 [CODE2 CODE3]  (you can also separate by commas)');
    process.exit(1);
  }

  log(`IDs: ${ids.length} | Gift codes: ${codes.join(', ')}`);

  const results = [];
  const reportName = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  log(`Report will be saved to ${reportName}`);

  const CONCURRENCY = 3;
  // Use headless mode in CI, headful mode locally for debugging
  const isCI = !!process.env.CI;
  const browser = await chromium.launch({ headless: isCI });
  // Create a shared queue (copy of ids)
  const queue = [...ids];

  // Worker function
  const runWorker = async (workerId) => {
    const page = await browser.newPage();
    await page.goto(SITE, { waitUntil: 'domcontentloaded' });

    // Process until queue is empty
    while (queue.length > 0) {
      // atomic pop due to single-threaded JS event loop
      const fid = queue.shift();
      if (!fid) break;

      log(`[Worker ${workerId}] Starting Player ${fid}`);

      for (const gift of codes) {
        log(`[Worker ${workerId}] Redeem: ${gift} for ${fid}`);
        let attempts = 0;
        const MAX_RETRIES = 3;
        let successOrFatal = false;
        let finalResult = { status: 'UNKNOWN', code: -1, detail: 'Not processed' };

        while (attempts < MAX_RETRIES && !successOrFatal) {
          attempts++;
          if (attempts > 1) log(`[Worker ${workerId}]   Retry attempt ${attempts}/${MAX_RETRIES}...`);

          try {
            finalResult = await redeemOnce(page, fid, gift);
            const { status, detail, code } = finalResult;

            // Check if result is final (Success or Already Redeemed or Code 0)
            if (code === 20000 || code === 40008 || code === 0) {
              log(`[Worker ${workerId}] → ${status} :: ${detail} :: ${code}`);
              successOrFatal = true;
            } else {
              log(`[Worker ${workerId}] → ${status} (Code: ${code}) :: ${detail}`);
              console.warn(`[Worker ${workerId}]   [Retryable] Unexpected code ${code}.`);
            }

          } catch (e) {
            console.warn(`[Worker ${workerId}]   Issue on ${fid} / ${gift}: ${e.message}`);
            finalResult = { status: 'ERROR', detail: e.message, code: -999 };
          }

          if (!successOrFatal && attempts < MAX_RETRIES) {
            // RELOAD page to clear any blocking popups/state
            log(`[Worker ${workerId}]   Refreshing page before retry...`);
            try {
              await page.reload({ waitUntil: 'domcontentloaded' });
              await page.waitForTimeout(1000); // extra buffer
            } catch (re) {
              log(`[Worker ${workerId}]   Reload failed: ${re.message}`);
            }
          }
        }

        results.push({
          playerId: fid,
          giftCode: gift,
          timestamp: new Date().toISOString(),
          ...finalResult
        });

        // Progressive save (sync write is safe enough for this scale)
        fs.writeFileSync(reportName, JSON.stringify(results, null, 2));

        // ALWAYS refresh after processing a code (whether success or fail)
        // Only if we didn't JUST refresh in the retry loop (successful attempt doesn't refresh at end of loop)
        if (successOrFatal) {
          try {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(800);
          } catch (e) {
            console.error(`[Worker ${workerId}] Error reloading page:`, e.message);
          }
        }
      }

      const MIN_DELAY = 2000;
      const MAX_DELAY = 5000;
      const waitTime = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
      log(`[Worker ${workerId}] Waiting ${waitTime}ms...`);
      await page.waitForTimeout(waitTime);
    }

    await page.close();
  };

  log(`Starting ${CONCURRENCY} workers...`);
  const workers = [];
  for (let i = 1; i <= CONCURRENCY; i++) {
    workers.push(runWorker(i));
  }

  await Promise.all(workers);

  log('\nAll done.');
  await browser.close();

  // Final report write
  log(`Final report updated: ${reportName}`);
})();
