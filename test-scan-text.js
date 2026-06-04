import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("https://induction-program-olive.vercel.app/scan/12345");
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  console.log("PAGE TEXT:");
  console.log(text);
  await browser.close();
})();
