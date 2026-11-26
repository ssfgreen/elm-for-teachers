import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockLogger } from '../test-utils';
import { ChatComposer, COMPOSER_NOTE } from './ChatComposer';

afterEach(cleanup);

describe('ChatComposer', () => {
  it('says under the box that the AI can be wrong and asks for no identifiable pupil data', () => {
    render(<ChatComposer logger={mockLogger()} onSend={vi.fn()} />);
    expect(screen.getByText(COMPOSER_NOTE)).toBeTruthy();
    expect(COMPOSER_NOTE).toBe('AI makes mistakes. Don’t enter personal data.');
  });

  it('shows a given text read-only, for the session replay, and logs nothing', () => {
    const logger = mockLogger();
    render(<ChatComposer logger={logger} onSend={vi.fn()} shown="Make it shorter" />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    expect(box.value).toBe('Make it shorter');
    expect(box.readOnly).toBe(true);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);
    expect(logger.log).not.toHaveBeenCalled();
  });
});
