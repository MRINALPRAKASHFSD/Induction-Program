const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE LOG ERROR:', msg.text());
  });
  await page.goto('http://localhost:5173/admin/events');
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
