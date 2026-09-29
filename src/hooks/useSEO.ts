import { useEffect } from 'react';

interface Crumb {
  name: string;
  path: string;
}

interface SEOData {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  keywords?: string;
  /** Migas de pan; se traducen a un BreadcrumbList de schema.org. */
  breadcrumb?: Crumb[];
  /** Preguntas para inyectar un FAQPage de schema.org (rich results). */
  faq?: { q: string; a: string }[];
}

const SITE = 'https://sanchezdelgado.pe';
const BREADCRUMB_ID = 'seo-breadcrumb';
const FAQ_ID = 'seo-faq';

/**
 * SEO por ruta.
 *
 * Además de title/description/OG, inyecta el BreadcrumbList de cada
 * subpágina. Se hace en runtime porque las rutas se renderizan en el
 * cliente: el HTML estático sólo conoce la home.
 */
export default function useSEO(data: SEOData) {
  const { breadcrumb, ...meta } = data;

  useEffect(() => {
    document.title = meta.title;

    const setMeta = (attr: string, attrValue: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${attrValue}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', meta.description);

    if (meta.keywords) {
      setMeta('name', 'keywords', meta.keywords);
    }

    setMeta('property', 'og:title', meta.ogTitle || meta.title);
    setMeta('property', 'og:description', meta.ogDescription || meta.description);
    if (meta.ogImage) {
      setMeta('property', 'og:image', meta.ogImage);
    }

    setMeta('name', 'twitter:title', meta.ogTitle || meta.title);
    setMeta('name', 'twitter:description', meta.ogDescription || meta.description);

    const canonicalUrl = meta.canonical || SITE;
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonicalUrl);
    setMeta('property', 'og:url', canonicalUrl);

    // --- BreadcrumbList ---
    const existing = document.getElementById(BREADCRUMB_ID);
    if (!breadcrumb || breadcrumb.length === 0) {
      existing?.remove();
      return;
    }

    const items = [{ name: 'Inicio', path: '/' }, ...breadcrumb];
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: `${SITE}${c.path === '/' ? '' : c.path}`,
      })),
    };

    const script = (existing as HTMLScriptElement | null) ?? document.createElement('script');
    if (!existing) {
      script.type = 'application/ld+json';
      script.id = BREADCRUMB_ID;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);

    // --- FAQPage ---
    // Un solo nodo reutilizable por ruta; el contenido debe coincidir con el
    // visible en la página (requisito de Google para rich results).
    const faqScript = document.getElementById(FAQ_ID) as HTMLScriptElement | null;
    if (!meta.faq || meta.faq.length === 0) {
      faqScript?.remove();
    } else {
      const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: meta.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.a,
          },
        })),
      };
      const el = faqScript ?? document.createElement('script');
      if (!faqScript) {
        el.type = 'application/ld+json';
        el.id = FAQ_ID;
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(faqJsonLd);
    }
  }, [
    meta.title,
    meta.description,
    meta.ogTitle,
    meta.ogDescription,
    meta.ogImage,
    meta.canonical,
    meta.keywords,
    meta.faq,
    breadcrumb,
  ]);
}
