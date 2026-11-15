# 06 · Optimization and SEO

## 1. `next/image`

> **In short:** The Image component resizes, converts to modern formats, lazy-loads and reserves space automatically — fixing the biggest LCP and CLS problems for free.

```tsx
import Image from 'next/image';
import hero from '@/public/hero.jpg';          // static import: width/height/blur inferred

<Image src={hero} alt="Dashboard overview" priority placeholder="blur" />

<Image
  src={product.imageUrl}                        // remote: dimensions required
  alt={product.name}
  width={400}
  height={300}
  sizes="(max-width: 768px) 100vw, 400px"       // ⚠️ tells the browser which size to download
  quality={80}
/>

<div className="relative h-64">
  <Image src={url} alt="" fill style={{ objectFit: 'cover' }} sizes="100vw" />
</div>
```

```ts
// next.config.ts — remote images must be allow-listed
export default {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.example.com', pathname: '/images/**' }],
    formats: ['image/avif', 'image/webp'],
  },
};
```

| Rule | Why |
| --- | --- |
| `priority` on the LCP image only | Preloads it; using it everywhere hurts |
| Always give a meaningful `alt` (or `alt=""` if decorative) | Accessibility |
| Set `sizes` whenever you use `fill` or responsive widths | Otherwise the browser downloads the largest candidate |
| Don't use `next/image` for tiny icons | Inline SVG is cheaper |

Self-hosting note: optimization runs on the server and costs CPU/memory — install `sharp`, or point `loader` at a CDN (Cloudinary, imgix) in production.

## 2. `next/font`

> **In short:** Fonts are downloaded at build time and self-hosted, so there's no external request and no layout shift.

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const brand = localFont({ src: './brand.woff2', variable: '--font-brand', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

Benefits: zero requests to Google at runtime (better privacy and latency), automatic `size-adjust` fallbacks to avoid CLS, and subsetting to shrink the file.

## 3. Metadata, sitemaps and robots

> **In short:** Export metadata from layouts/pages, and use `sitemap.ts`/`robots.ts` file conventions for crawler files.

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL('https://tasks.example.com'),
  title: { default: 'Task Dashboard', template: '%s · Task Dashboard' },
  description: 'Plan and track your work',
  openGraph: { type: 'website', siteName: 'Task Dashboard', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};
```

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  return [
    { url: 'https://tasks.example.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    ...posts.map((p) => ({ url: `https://tasks.example.com/blog/${p.slug}`, lastModified: p.updatedAt })),
  ];
}
```

```ts
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/'] }],
    sitemap: 'https://tasks.example.com/sitemap.xml',
  };
}
```

### Dynamic OG images

> **In short:** `ImageResponse` renders social preview images from JSX at request or build time.

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  return new ImageResponse(
    <div style={{ display: 'flex', fontSize: 64, background: '#0f172a', color: 'white', width: '100%', height: '100%', padding: 64 }}>
      {post.title}
    </div>,
    size,
  );
}
```

### Structured data (JSON-LD)

> **In short:** Machine-readable page metadata that enables rich results in search.

```tsx
const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, datePublished: post.publishedAt };

<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
```

## 4. Why Next.js is good for SEO

> **In short:** Crawlers get fully-rendered HTML with correct metadata and fast Core Web Vitals, instead of an empty div they must execute JavaScript to fill.

| Need | How Next.js handles it |
| --- | --- |
| Content in the HTML | SSR/SSG render on the server |
| Per-page title/description | `metadata` / `generateMetadata` |
| Canonical URLs, OG tags | `alternates.canonical`, `openGraph` |
| Sitemap and robots | File conventions |
| Fast LCP/CLS | `next/image`, `next/font`, streaming |
| Clean URLs | File-system routing |

## 5. Bundle size

> **In short:** Watch "First Load JS" after every build, and attack it with Server Components, dynamic imports and lighter dependencies.

```bash
npm install -D @next/bundle-analyzer
ANALYZE=true npm run build
```

```ts
// next.config.ts
import withBundleAnalyzer from '@next/bundle-analyzer';
export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })({ /* config */ });
```

Biggest wins, in order:
1. **Move components to the server** — Server Component code never ships.
2. **`next/dynamic`** for heavy client-only widgets (charts, editors, maps).
3. **Lighter libraries** — `date-fns` over `moment`, native `Intl` over heavy formatters.
4. **Tree-shakeable imports** — `import { debounce } from 'lodash-es'`, not the whole package.
5. `optimizePackageImports` in `next.config` for big icon/UI libraries.

```tsx
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('@/components/Chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,                        // ⚠️ only allowed in Client Components
});
```

## 6. Third-party scripts

> **In short:** Load analytics and widgets with `next/script` so they don't block rendering, and use `@next/third-parties` for common vendors.

```tsx
import Script from 'next/script';

<Script src="https://analytics.example.com/s.js" strategy="afterInteractive" />
<Script src="https://widget.example.com/w.js" strategy="lazyOnload" />
```

| Strategy | Loads |
| --- | --- |
| `beforeInteractive` | Before hydration (rare: bot detection, polyfills) |
| `afterInteractive` | Right after hydration (**default**; analytics) |
| `lazyOnload` | During idle time (chat widgets, social embeds) |
| `worker` | In a web worker (experimental, Partytown) |

## 7. Core Web Vitals in Next.js

> **In short:** Measure LCP, INP and CLS in the field, and fix them with image/font handling, streaming and less client JavaScript.

| Metric | Target | Next.js lever |
| --- | --- | --- |
| **LCP** (loading) | < 2.5 s | `priority` on the hero image, SSG/ISR, streaming, CDN |
| **INP** (interactivity) | < 200 ms | Less client JS, smaller hydration trees, `useTransition` for heavy updates |
| **CLS** (stability) | < 0.1 | `next/image` dimensions, `next/font`, reserve space for ads/embeds |
| **TTFB** | < 800 ms | Static/ISR over SSR, cache data, fast DB queries |

```tsx
// app/_components/WebVitals.tsx
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    navigator.sendBeacon('/api/vitals', JSON.stringify(metric));
  });
  return null;
}
```

Lab tools (Lighthouse, `npm run build && npx lighthouse`) catch regressions; field data (Vercel Analytics, CrUX, your own beacon) tells the truth.

## 8. Other optimizations

> **In short:** Prefetching, route segment config, partial prerendering and caching headers each shave off latency.

- `<Link prefetch>` is on by default for visible links — disable on very long lists.
- `loading.tsx` improves perceived performance even when total time is unchanged.
- Use ISR instead of SSR wherever the data can be a few seconds old.
- Set `Cache-Control` on route handlers serving public data.
- Enable `compress` (on by default) and serve assets from a CDN.

---

## 9. Exercises

1. Replace `<img>` with `next/image` on a page and compare Lighthouse LCP and CLS before/after.
2. Add `next/font` and confirm in the Network tab that no request goes to Google.
3. Add `generateMetadata`, `sitemap.ts`, `robots.ts` and a dynamic OG image; validate the OG tags with a preview tool.
4. Run the bundle analyzer, find your biggest client chunk, and move it behind `next/dynamic`.
5. Add a `useReportWebVitals` beacon and log INP while clicking around.
