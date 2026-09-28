import { useEffect } from 'react';

interface SEOData {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  keywords?: string;
}

export default function useSEO(data: SEOData) {
  useEffect(() => {
    document.title = data.title;

    const setMeta = (attr: string, attrValue: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${attrValue}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', data.description);

    if (data.keywords) {
      setMeta('name', 'keywords', data.keywords);
    }

    setMeta('property', 'og:title', data.ogTitle || data.title);
    setMeta('property', 'og:description', data.ogDescription || data.description);
    if (data.ogImage) {
      setMeta('property', 'og:image', data.ogImage);
    }

    setMeta('name', 'twitter:title', data.ogTitle || data.title);
    setMeta('name', 'twitter:description', data.ogDescription || data.description);

    if (data.canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', data.canonical);
    }
  }, [data.title, data.description, data.ogTitle, data.ogDescription, data.ogImage, data.canonical, data.keywords]);
}
