const fs = require('fs');
const files = [
  'src/routes/admin.analytics.lazy.tsx',
  'src/routes/admin.attendance.lazy.tsx',
  'src/routes/admin.login.lazy.tsx',
  'src/routes/attendance.lazy.tsx',
  'src/routes/clubs.lazy.tsx',
  'src/routes/my-pass.lazy.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/head:\s*\(\)\s*=>\s*\(\{\s*meta:\s*\[[\s\S]*?\]\s*\}\),?/g, '');
  // sometimes it has a trailing comma, sometimes not, sometimes it has a meta without brackets
  content = content.replace(/head:\s*\(\)\s*=>\s*\(\{\s*meta:\s*\[[^\]]*\]\,?\s*\}\),?/g, '');
  fs.writeFileSync(file, content);
}
console.log('Fixed remaining files');
