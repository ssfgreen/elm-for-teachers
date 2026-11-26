import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Our theme's extra sizes, so tailwind-merge knows `shadow-float` replaces `shadow-card`, and
 * that the front page's `text-title` is a size, not a colour (screens/landing/landing.css).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title', 'lead'],
      shadow: ['card', 'float', 'pop', 'soft', 'dot'],
      radius: ['sm', 'md', 'lg'],
    },
  },
});

/** Joins class names, letting later Tailwind classes win over earlier ones (shadcn's `cn`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
