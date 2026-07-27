const fs = require('fs');
const glob = require('glob'); // Note: we can just manually list files if glob isn't present
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
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\s*head:\s*\(\)\s*=>\s*\(\{[^}]+\}\),?/g, '');
  fs.writeFileSync(file, content);
}
console.log('Fixed lazy routes');
