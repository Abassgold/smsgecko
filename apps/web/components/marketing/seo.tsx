import type { QA } from '@/components/ui/accordion';

export const SITE_URL = 'https://www.smsgecko.com';

/** Structured data (schema.org) for search engines. `data` is our own static content, never user input. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export function breadcrumbLd(trail: Array<[string, string]>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [['Home', ''], ...trail].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${path}` })),
  };
}

/** FAQPage data. Use it only next to an <Accordion> showing the same questions (Google ignores FAQ data that isn't visible). */
export function faqLd(items: QA[]) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}
