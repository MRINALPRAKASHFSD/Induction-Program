const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  
  const testCodes = [
    `try { document.querySelector("invalid[selector") } catch(e) { return e.name + ": " + e.message }`,
    `try { fetch("http://valid.com", { headers: { 'Authorization': 'Bearer a\\nb' } }) } catch(e) { return e.name + ": " + e.message }`,
    `try { const xhr = new XMLHttpRequest(); xhr.open("PUT", "http://v.com"); xhr.setRequestHeader("Content-Type", "invalid\\r\\nheader"); } catch(e) { return e.name + ": " + e.message }`
  ];
  
  for (const code of testCodes) {
    const res = await page.evaluate(`(async () => { ${code} })()`);
    console.log(code.substring(0, 60) + "... -> " + res);
  }
  
  await browser.close();
})();
