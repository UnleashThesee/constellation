const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/screen-01-welcome.png' });
  console.log('screen-01 done');

  // Click "COMMENCER"
  const btns = await page.$$('button');
  for (const btn of btns) {
    const txt = await btn.evaluate(el => el.textContent);
    if (txt && txt.includes('COMMENCER')) { await btn.click(); break; }
  }
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/screen-02-quizz.png' });
  console.log('screen-02 done');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
