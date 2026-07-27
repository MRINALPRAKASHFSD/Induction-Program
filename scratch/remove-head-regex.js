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
  let content = fs.readFileSync(file, 'utf8');
  // Match `head: () => ({ ... }),` over multiple lines
  content = content.replace(/\s*head:\s*\(\)\s*=>\s*\(\{[^}]*?meta:[^\]]+\]\s*\}\),?/s, '');
  fs.writeFileSync(file, content);
}
console.log('Fixed lazy routes with multi-line regex');
