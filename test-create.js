import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  await page.goto("http://localhost:5173/admin");
  
  console.log("Waiting for events tab...");
  await page.waitForSelector("text=Events");
  await page.click("text=Events");
  
  console.log("Waiting for new event button...");
  await page.waitForSelector("text=New event");
  await page.click("text=New event");
  
  console.log("Filling form...");
  await page.waitForSelector("text=School");
  
  // Select department
  await page.click("text=Select a school");
  await page.waitForSelector("[role='option']");
  await page.click("[role='option'] >> nth=0");
  
  await page.fill("input[value=''] >> nth=0", "test"); // title
  
  // day and venue
  await page.fill("input[type='number']", "1");
  const venueInputs = await page.$$("input[required]");
  await venueInputs[1].fill("a"); // venue? Wait, title is 0, venue is 1?
  
  // Actually let's just find by label but playwright doesn't do that easily without label text.
  // Instead of testing UI, I can just call the function directly.
  
  await browser.close();
})();
