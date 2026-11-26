import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TurnSteps } from './TurnSteps';

afterEach(cleanup);

describe('TurnSteps', () => {
  it("shows a tool's plain-words summary first, with the raw request and response folded away", () => {
    const step = { kind: 'tool' as const, title: 'Edited the document (2 changes)', request: '{"operations": []}', response: '{"accepted": 1}', summary: ['Added a picture of a zoo', 'Not made: removed a part of the document (it named a part of the document that is not there)'] };
    render(<TurnSteps steps={[step]} running />);
    fireEvent.click(screen.getByRole('button', { name: /Edited the document/ }));
    expect(screen.getByText('Added a picture of a zoo')).toBeTruthy();
    expect(screen.getByText(/^Not made:/).className).toContain('text-destructive');
    expect(screen.queryByText('{"accepted": 1}')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Technical details/ }));
    expect(screen.getByText('{"accepted": 1}')).toBeTruthy();
  });

  it('shows the raw request and response at once for a tool with no summary', () => {
    render(<TurnSteps steps={[{ kind: 'tool', title: 'Read “Similes”', request: '{"doc_id": "x"}', response: 'text' }]} running />);
    fireEvent.click(screen.getByRole('button', { name: /Read/ }));
    expect(screen.getByText('Request')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Technical details/ })).toBeNull();
  });
});
