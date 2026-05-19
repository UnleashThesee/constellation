const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
  
  // Injecter un profil dans IndexedDB pour passer l'onboarding
  await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ConstellationDB', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('profile')) { resolve(); return; }
        const tx = db.transaction('profile', 'readwrite');
        tx.objectStore('profile').add({
          onboardingDone: true,
          onboardingVerdicts: [],
          seedConcepts: [],
          categoryWeights: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      };
      req.onerror = reject;
    });
  });

  await page.reload({ waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/screen-03-swipe.png' });
  console.log('screen-03-swipe done');
  
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
