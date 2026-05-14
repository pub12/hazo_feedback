'use client';
import { Info } from 'lucide-react';

interface PrivacyDisclosureProps {
  translate: (key: string) => string;
}

export function PrivacyDisclosure({ translate }: PrivacyDisclosureProps) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-xs text-muted-foreground leading-relaxed">
        {translate('feedback.privacy.notice')}
      </p>
    </div>
  );
}
