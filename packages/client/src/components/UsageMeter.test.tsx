import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UsageMeter, formatPounds, formatTokens } from './UsageMeter';

afterEach(cleanup);

describe('UsageMeter', () => {
  it('shortens token counts', () => {
    expect([0, 950, 1000, 12_345, 123_456, 1_234_567].map(formatTokens)).toEqual(['0', '950', '1k', '12.3k', '123k', '1.2M']);
  });

  it('shows pence to three places under a pound', () => {
    expect([0, 0.0042, 0.25, 3.456].map(formatPounds)).toEqual(['£0.000', '£0.004', '£0.250', '£3.46']);
  });

  it('shows tokens and the cost', () => {
    render(<UsageMeter usage={{ input_tokens: 12_345, output_tokens: 678, gbp: 0.0251 }} />);
    const label = 'This chat: 12345 tokens in, 678 out, £0.025';
    const meter = screen.getByTitle(label);
    expect(screen.getByText(label).className).toBe('sr-only');
    expect([...meter.querySelectorAll('[aria-hidden="true"]:not(svg)')].map((e) => e.textContent)).toEqual(['12.3k', '678', '£0.025']);
  });
});
