'use client';
import { useState } from 'react';
import type { CopyState } from '../types.js';

export function useCopyToClipboard(): [CopyState, (text: string) => Promise<void>] {
  const [state, setState] = useState<CopyState>('idle');

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
    }
  }

  return [state, copy];
}
