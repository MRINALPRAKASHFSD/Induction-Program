const http = require('http');

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true);
    }).on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

(async () => {
  const ports = [3000, 5173, 8080];
  for (const port of ports) {
    if (await checkPort(port)) {
      console.log(`Port ${port} is active.`);
      process.exit(0);
    }
  }
  console.log("No active ports found among 3000, 5173, 8080");
})();
