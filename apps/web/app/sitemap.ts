import type { MetadataRoute } from 'next';

const SITE_URL = 'https://smsgecko.com';

const ROUTES: Array<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }> = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/platforms', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/docs', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/faq', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/login', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/register', priority: 0.5, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
