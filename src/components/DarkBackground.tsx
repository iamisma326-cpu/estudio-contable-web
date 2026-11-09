import { useEffect, useRef, useState } from 'react';
import DotField from './DotField';
import DarkVeil from './DarkVeil';

/** Light surfaces use DotField; dark surfaces use DarkVeil, with static motion fallbacks. */
export default function DarkBackground({ tone = 'dark' }: { tone?: 'light' | 'dark' }) {
  const light = tone === 'light';
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
    let visible = false;
    const sync = () => setActive(media.matches && visible);
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      sync();
    });
    if (root.current) observer.observe(root.current);
    media.addEventListener('change', sync);
    return () => { observer.disconnect(); media.removeEventListener('change', sync); };
  }, []);
  return (
    <div ref={root} className="dark-dot-background" data-tone={tone} data-animated={active} aria-hidden="true">
      {active && !light && <DarkVeil color="#5D8ACB" speed={0.2} scale={1.3} flow={0.6} brightness={0.7} glow={0.3} grain={0.01} quality={0.35} mouseInteraction={true} mouseStrength={0.8} intro={false} opacity={0.55} dpr={1} />}
      {active && light && <DotField dotRadius={1.25} dotSpacing={24} gradientFrom="#2E5486" gradientTo="#832C4A" lightMode={true} baseOpacity={0.2} opacity={0.8} interactive={true} cursorRadius={200} bulgeStrength={0.5} glowColor="#2E5486" glowIntensity={0.85} glowRadius={160} waveAmplitude={0} speed={0} sparkle={false} holdToZoom={false} intro={false} maxDevicePixelRatio={1} />}
    </div>
  );
}
