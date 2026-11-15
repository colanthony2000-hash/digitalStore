import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { bundles, categories, products } from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import { isDownloadSigningSecretConfigured } from './src/lib/security.ts';
import { checkDatabaseConnection, closeDbPool, db } from './src/db/index.ts';
import { isNeonObjectStorage, isObjectStorageConfigured, localObjectPath, objectKeyForUpload, signedObjectUrl } from './src/lib/object-storage.ts';
import publicRoutes from './src/routes/public.ts';
import customerRoutes from './src/routes/customer.ts';
import checkoutRoutes from './src/routes/checkout.ts';
import adminRoutes from './src/routes/admin.ts';

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Trust first reverse-proxy hop (Cloud Run / load balancer) for accurate req.ip and req.protocol
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production' && !isDownloadSigningSecretConfigured()) {
  throw new Error('Production startup blocked: DOWNLOAD_SIGNING_SECRET must be configured.');
}

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

// Preserve raw body for Paystack HMAC-SHA512 webhook signature verification
app.use(
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// Liveness checks do not disclose configuration or database details. Cloud Run
// routes /health normally; /healthz remains an alias for other platforms.
app.get(['/health', '/healthz'], (_req, res) => res.status(200).json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  try {
    await checkDatabaseConnection();
    if (!isObjectStorageConfigured()) {
      return res.status(503).json({ status: 'not_ready' });
    }
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});

// Public catalog assets stay behind a stable app URL. Production redirects to a
// short-lived signed URL; local development reads only the local public folder.
app.get('/uploads/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(filename)) {
      return res.status(404).end();
    }
    const key = objectKeyForUpload('public', filename);
    if (isNeonObjectStorage()) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.redirect(302, await signedObjectUrl(key, { expiresIn: 600 }));
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.sendFile(await localObjectPath(key));
  } catch {
    return res.status(404).end();
  }
});

// API routes
app.use('/api', publicRoutes);
app.use('/api', customerRoutes);
app.use('/api', checkoutRoutes);
app.use('/api/admin', adminRoutes);

// Dynamic SEO sitemap.xml & robots.txt
app.get('/robots.txt', (req, res) => {
  const baseUrl =
    process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')
      ? process.env.APP_URL.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;

  res.type('text/plain');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    await ensureSeeded();
    const baseUrl =
      process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')
        ? process.env.APP_URL.replace(/\/$/, '')
        : `${req.protocol}://${req.get('host')}`;

    const [activeCats, publishedProds, publishedBundles] = await Promise.all([
      db.select().from(categories).where(eq(categories.isActive, true)),
      db.select().from(products).where(eq(products.status, 'published')),
      db.select().from(bundles).where(eq(bundles.status, 'published')),
    ]);

    const staticPaths = [
      '/',
      '/shop',
      '/categories',
      ...(publishedBundles.length > 0 ? ['/bundles'] : []),
      '/free-resources',
      '/new-arrivals',
      '/bestsellers',
      '/ecosystem',
      '/about',
      '/contact',
      '/terms',
      '/privacy',
      '/refund-policy',
      '/licence-policy',
    ];

    const urls = [
      ...staticPaths.map((p) => ({ loc: `${baseUrl}${p}`, priority: p === '/' ? '1.0' : '0.8' })),
      ...activeCats.map((c) => ({
        loc: `${baseUrl}/categories/${c.slug}`,
        priority: '0.8',
      })),
      ...publishedProds.map((p) => ({
        loc: `${baseUrl}/products/${p.slug}`,
        lastmod: p.updatedAt.toISOString(),
        priority: '0.9',
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>${
            'lastmod' in u && u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''
          }\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n')}\n</urlset>`;

    res.type('application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Unable to generate sitemap');
  }
});

// Vite dev middleware vs static production build
const distDir = path.resolve(process.cwd(), 'dist');
const staticDir = process.env.VERCEL === '1' ? path.resolve(process.cwd(), 'public') : distDir;
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !fs.existsSync(path.join(staticDir, 'index.html'))) {
  throw new Error('Production startup blocked: the built frontend was not found in dist/.');
}

let viteServer: Awaited<ReturnType<typeof import('vite')['createServer']>> | undefined;
if (!isProd) {
  const { createServer: createViteServer } = await import('vite');
  viteServer = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(viteServer.middlewares);
} else {
  const indexFile = path.join(staticDir, 'index.html');
  app.use(express.static(staticDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(indexFile);
  });
}

if (process.env.NODE_ENV === 'production' && !isObjectStorageConfigured()) {
  throw new Error('Production startup blocked: configure Neon Object Storage; persistent local-disk uploads are disabled.');
}

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Jeneconk Digital Store running on port ${PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; beginning graceful shutdown.`);
  const forceExit = setTimeout(() => process.exit(1), 8000);
  forceExit.unref();
  httpServer.close(async (error) => {
    try {
      await viteServer?.close();
      await closeDbPool();
    } catch (closeError) {
      console.error('Error during graceful shutdown:', closeError);
      process.exitCode = 1;
    }
    clearTimeout(forceExit);
    if (error) {
      console.error('HTTP server shutdown error:', error);
      process.exitCode = 1;
    }
  });
  httpServer.closeIdleConnections?.();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
