const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  
  const testCodes = [
    `try { atob("invalid string\\n") } catch(e) { return e.name + ": " + e.message }`,
    `try { btoa("🦄") } catch(e) { return e.name + ": " + e.message }`,
    `try { const xhr = new XMLHttpRequest(); xhr.open("PUT", "http://a\\nb.com"); } catch(e) { return e.name + ": " + e.message }`,
    `try { const xhr = new XMLHttpRequest(); xhr.open("PUT", "http://valid.com"); xhr.setRequestHeader("Content-Type", "invalid\\nheader"); } catch(e) { return e.name + ": " + e.message }`,
    `try { document.querySelector("invalid[selector") } catch(e) { return e.name + ": " + e.message }`,
    `try { await crypto.subtle.digest('SHA-256', new ArrayBuffer(0)) } catch(e) { return e.name + ": " + e.message }`,
    `try { await crypto.subtle.digest('invalid-algo', new ArrayBuffer(0)) } catch(e) { return e.name + ": " + e.message }`
  ];
  
  for (const code of testCodes) {
    const res = await page.evaluate(`(async () => { ${code} })()`);
    console.log(code.substring(0, 60) + "... -> " + res);
  }
  
  await browser.close();
})();
