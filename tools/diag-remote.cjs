function loadPuppeteer() {
  try {
    return require("puppeteer");
  } catch {
    console.error(
      "This script needs Puppeteer. Install with: npm i -D puppeteer"
    );
    process.exit(1);
  }
}

const url = 'https://DilipS533.github.io/FlowBuildAI/';

(async () => {
  const puppeteer = loadPuppeteer();
  console.log('\n=== Testing', url, '===\n');
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      try {
        console.log('PAGE LOG:', msg.text());
      } catch (e) {
        console.log('PAGE LOG (err reading):', e.message);
      }
    });

    page.on('pageerror', (err) => {
      console.error('PAGE ERROR:', err.toString());
    });

    const failedRequests = [];
    page.on('requestfailed', (req) => {
      failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure() && req.failure().errorText });
    });

    page.on('response', (res) => {
      if (res.status() >= 400) {
        console.warn('BAD RESPONSE', res.status(), res.url());
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => {
      console.error('GOTO ERROR:', e.message);
    });

    const html = await page.content();
    console.log('HTML length:', html.length);

    if (failedRequests.length) {
      console.log('\nFailed requests:');
      failedRequests.forEach((f) => console.log(f.method, f.url, f.failure));
    } else {
      console.log('No failed requests captured.');
    }

    const shotPath = `diag-remote-screenshot.png`;
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log('Saved screenshot to', shotPath);
    } catch (e) {
      console.warn('Screenshot failed:', e.message);
    }

    await browser.close();
  } catch (e) {
    console.error('BROWSER ERROR:', e.message);
  }
  process.exit(0);
})();
