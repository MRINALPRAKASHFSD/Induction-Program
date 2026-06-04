import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("https://induction-program-olive.vercel.app/scan/12345");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshot.png" });
  console.log("Screenshot taken");
  await browser.close();
})();
