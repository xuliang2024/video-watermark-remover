export function BrandLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none">
      <rect x="1.6" y="5.2" width="16" height="15.6" rx="4.2" stroke="#4CE0A5" strokeWidth="1.5" />
      <path d="M6.2 10h6.6M6.2 13.6h4.6" stroke="#4CE0A5" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      <path d="M19.4 12.6l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z" fill="#4CE0A5" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2.6 4L5 6.4 7.4 4" stroke="#5E6873" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ color = '#06231A' }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.2 7.4l3.3 3.2 6.3-6.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon({ color = '#06231A' }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2.2v6.4M4.2 5.8L7 8.6l2.8-2.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.4 10.4v1.1a.8.8 0 00.8.8h7.6a.8.8 0 00.8-.8v-1.1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M3 3l7 7M10 3l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="#5E6873" strokeWidth="1.1" />
      <path d="M6 5.4v3.2" stroke="#5E6873" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="3.5" r="0.65" fill="#5E6873" />
    </svg>
  );
}
