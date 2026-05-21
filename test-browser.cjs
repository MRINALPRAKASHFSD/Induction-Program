const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log("Navigating to http://localhost:8080/admin/scanner");
  await page.goto('http://localhost:8080/admin/scanner', { waitUntil: 'networkidle' }).catch(e => console.log("GOTO ERROR:", e));
  
  console.log("Waiting 4 seconds...");
  await page.waitForTimeout(4000);
  
  const content = await page.content();
  if (content.includes("Skeleton")) {
      console.log("SKELETON FOUND IN HTML");
  }
  if (content.includes("Access Denied") || content.includes("Awaiting role assignment")) {
      console.log("ACCESS DENIED SCREEN FOUND");
  }
  
  console.log("HTML length:", content.length);
  await browser.close();
})();
