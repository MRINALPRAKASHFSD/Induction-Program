const fs = require('fs');
const files = fs.readdirSync('./server/api-routes').filter(f => f.endsWith('.ts'));

let imports = '';
let switchCases = '';

files.forEach(file => {
  const name = file.replace('.ts', '');
  const camelName = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
  imports += `import ${camelName} from '../server/api-routes/${name}';\n`;
  switchCases += `    case '${name}': return await ${camelName}(req, res);\n`;
});

const template = `
${imports}

export default async function handler(req: any, res: any) {
  try {
    // Determine the route based on the URL or the query param
    // Vercel rewrites might preserve req.url or we can pass ?route=
    let path = req.url.split('?')[0];
    
    // Extract the part after /api/
    const match = path.match(/\\/api\\/([^/?]+)/);
    const route = match ? match[1] : null;

    if (!route) {
      return res.status(404).json({ error: 'API route not found' });
    }

    switch (route) {
${switchCases}
      default:
        return res.status(404).json({ error: 'API route not mapped' });
    }
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
`;

fs.writeFileSync('./api/index.ts', template);
console.log('Router generated');
