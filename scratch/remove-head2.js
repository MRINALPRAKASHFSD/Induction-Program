const fs = require('fs');
const files = [
  'src/routes/admin.activity.lazy.tsx',
  'src/routes/admin.analytics.lazy.tsx',
  'src/routes/admin.attendance.lazy.tsx',
  'src/routes/admin.clubs.lazy.tsx',
  'src/routes/admin.events.lazy.tsx',
  'src/routes/admin.login.lazy.tsx',
  'src/routes/admin.schedule.lazy.tsx',
  'src/routes/attendance.lazy.tsx',
  'src/routes/clubs.lazy.tsx',
  'src/routes/my-pass.lazy.tsx'
];

for (const file of files) {
  let lines = fs.readFileSync(file, 'utf8').split('\n');
  lines = lines.filter(line => !line.includes('head: () => ({'));
  fs.writeFileSync(file, lines.join('\n'));
}
console.log('Fixed lazy routes with new script');
