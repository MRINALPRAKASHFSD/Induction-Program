import { defineConfig, Plugin, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const apiMockPlugin = (): Plugin => ({
  name: 'api-mock-plugin',
  configureServer(server) {
    server.middlewares.use(async (req: any, res: any, next) => {
      if (req.url?.startsWith('/api/')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filePath = `/api${url.pathname.replace('/api', '')}.ts`;
        req.query = Object.fromEntries(url.searchParams);
        try {
          const module = await server.ssrLoadModule(filePath);
          
          const chunks: Buffer[] = [];
          req.on('data', (chunk: any) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          req.on('end', async () => {
             const rawBuffer = Buffer.concat(chunks);
             if (rawBuffer.length > 0) {
                try {
                   req.body = JSON.parse(rawBuffer.toString('utf8'));
                } catch(e) {
                   req.body = rawBuffer;
                }
             }
             
             res.status = (code: number) => {
               res.statusCode = code;
               return res;
             };
             res.json = (data: any) => {
               res.setHeader('Content-Type', 'application/json');
               res.end(JSON.stringify(data));
             };
             
             try {
               await module.default(req, res);
             } catch (err: any) {
               console.error("API Error:", err);
               if (!res.writableEnded) {
                 res.status(500).json({ error: err.message || "Internal Server Error" });
               }
             }
          });
          return;
        } catch (e) {
          console.error(`Error loading API route ${filePath}:`, e);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Failed to load API route." }));
          }
          return;
        }
      }
      next();
    });
  }
});

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env = { ...process.env, ...env };

  const isDev = command === 'serve' && process.env.npm_lifecycle_event === 'dev';

  return {
    plugins: [
      apiMockPlugin(),
      tanstackStart(),
      command === 'build' ? nitro({ preset: 'vercel' }) : undefined,
      react(),
      tailwindcss(),
      tsconfigPaths(),
    ].filter(Boolean) as Plugin[],
    resolve: {
      alias: {
        "@": "/src",
      },
      dedupe: ["react", "react-dom", "@tanstack/react-router"],
    },
    server: {
      port: 8080,
      host: true,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Disabled manual chunks to prevent circular dependencies in production
          }
        }
      }
    }
  };
});
