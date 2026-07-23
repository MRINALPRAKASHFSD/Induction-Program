const fs = require('fs');
const css = fs.readFileSync('src/styles.css', 'utf8');

const blocks = css.match(/[^{]+{[^}]+}/g) || [];
const seen = new Map();
const duplicates = [];

blocks.forEach(block => {
  const normalized = block.replace(/\s+/g, ' ').trim();
  const selector = normalized.split('{')[0].trim();
  const body = normalized.split('{')[1].trim();
  
  if (seen.has(body)) {
    duplicates.push(`Duplicate body found:\n1. ${seen.get(body)}\n2. ${selector}\nBody: ${body}\n`);
  } else {
    seen.set(body, selector);
  }
});

fs.writeFileSync('css_duplicates.txt', duplicates.join('\n'));
console.log(`Found ${duplicates.length} identical bodies.`);
