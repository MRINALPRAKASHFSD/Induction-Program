const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  
  const testCodes = [
    `try { await fetch("http://valid.com", { headers: { 'Authorization': 'Bearer a\\nb' } }); return "OK"; } catch(e) { return e.name + ": " + e.message }`,
    `try { const xhr = new XMLHttpRequest(); xhr.open("PUT", "http://a\\nb.com"); return "OK"; } catch(e) { return e.name + ": " + e.message }`,
    `try { document.querySelector("invalid[selector"); return "OK"; } catch(e) { return e.name + ": " + e.message }`
  ];
  
  for (const code of testCodes) {
    const res = await page.evaluate(`(async () => { ${code} })()`);
    console.log(code.substring(0, 60) + "... -> " + res);
  }
  
  await browser.close();
})();
