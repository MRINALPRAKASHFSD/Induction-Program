import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const response = await page.goto("https://induction-program-olive.vercel.app/scan/12345");
  console.log("Status:", response.status());
  await browser.close();
})();
