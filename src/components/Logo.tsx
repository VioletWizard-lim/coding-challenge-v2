/** 사이트 아이콘(src/app/icon.svg)과 같은 그림: 글줄 세 개 + 노란 커서 */
export default function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-bg)" />
      <g stroke="#fff" strokeWidth="6" strokeLinecap="round">
        <line x1="14" y1="19" x2="47" y2="19" />
        <line x1="14" y1="32" x2="39" y2="32" />
        <line x1="14" y1="45" x2="26" y2="45" />
      </g>
      <line x1="35" y1="39" x2="35" y2="51" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
