import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the SMSGecko team.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <Section className="pt-16 sm:pt-24">
      <Container size="narrow">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">Contact</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          This is a demo replica, so messages aren&apos;t delivered anywhere — the form just shows
          the interaction.
        </p>

        <ContactForm />
      </Container>
    </Section>
  );
}
