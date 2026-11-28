import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { POSTS } from '@/lib/blog';
import { JsonLd, SITE_URL, breadcrumbLd } from '@/components/marketing/seo';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return {};
  const path = `/blog/${post.slug}`;
  return { title: post.title, description: post.excerpt, alternates: { canonical: path }, openGraph: { type: 'article', url: path, title: post.title, description: post.excerpt } };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) notFound();
  const path = `/blog/${post.slug}`;
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([['Blog', '/blog'], [post.title, path]]),
          { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt, datePublished: post.date, url: `${SITE_URL}${path}`, publisher: { '@type': 'Organization', name: 'SMSGecko', url: SITE_URL } },
        ]}
      />
      <Section className="pt-16 sm:pt-24">
        <Container size="narrow">
          <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/blog" className="hover:text-text">Blog</Link></nav>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{post.title}</h1>
          <time className="mt-2 block text-sm text-faint">{post.date}</time>
          <article className="mt-8 flex flex-col gap-4 text-[16px] leading-relaxed text-muted">
            {post.body.map((para, i) => <p key={i}>{para}</p>)}
          </article>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button href="/register" size="lg">Get your API key</Button>
            <Button href="/sms-api" size="lg" variant="outline">About the SMS API</Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
