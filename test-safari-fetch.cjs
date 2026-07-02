const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  
  const res = await page.evaluate(`(async () => {
    try {
      const res = new Response('<html></html>');
      await res.json();
    } catch(e) {
      return e.name + ": " + e.message;
    }
  })()`);
  
  console.log(res);
  await browser.close();
})();
