import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClaimDetail } from '../../api/pedagogy';
import { ChatMarkdown, withClaimLinks } from '../ChatMarkdown';
import { ClaimCard } from './ClaimInfo';
import { claimLoader, ClaimsProvider } from './claims';

afterEach(cleanup);

const claim = (id: string, extra: Partial<ClaimDetail> = {}): ClaimDetail => ({
  id,
  text: 'Wider letter spacing helped children with dyslexia read faster.',
  support_type: 'paraphrase',
  verification: 'locator_to_confirm',
  entry: { id: 'adp-x', title: 'Individual spacing', type: 'adaptation', status: 'draft' },
  passages: [{ id: 'p', locator: 'Abstract', text: 'Spacing helped.', excerpt_type: 'paraphrase', verified_by_fetch: true, source: { id: 's', title: 'Extra-large letter spacing', publisher: 'PNAS', year: 2012, url: 'https://doi.org/x', evidence_weight: 'moderate', licence: 'x', reuse_rule: 'short_quote_only' } }],
  ...extra,
});

describe('claim citations in a reply', () => {
  it('turn each [[clm-…]] into an "i" marker after its sentence', () => {
    expect(withClaimLinks('Spacing helps [[clm-a]].')).toBe('Spacing helps[i](#claim:clm-a).');
    render(<ChatMarkdown text="Spacing helps [[clm-a]]. Bold too [[clm-b]]." />);
    expect(screen.getAllByRole('button', { name: /Source for this/ }).map((b) => b.dataset.claim)).toEqual(['clm-a', 'clm-b']);
    expect(screen.queryByText(/\[\[/)).toBeNull();
  });

  it('show the claim, its passage, source, check and draft status on hover, loading each once', async () => {
    const fetchClaims = vi.fn(async (ids: string[]) => ({ claims: ids.map((id) => claim(id)), missing: [] }));
    render(
      <ClaimsProvider fetchClaims={fetchClaims}>
        <ChatMarkdown text="Spacing helps [[clm-a]]." />
      </ClaimsProvider>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Source for this/ }).parentElement!);
    const tip = await screen.findByRole('tooltip');
    await waitFor(() => expect(tip.textContent).toContain('Wider letter spacing'));
    expect(tip.textContent).toContain('Extra-large letter spacing');
    expect(tip.textContent).toContain('where in it still to confirm');
    expect(tip.textContent).toContain('not yet reviewed by educators');
    expect(screen.getByRole('link', { name: 'Extra-large letter spacing' }).getAttribute('href')).toBe('https://doi.org/x');
    expect(fetchClaims).toHaveBeenCalledTimes(1);
  });

  it('name each source’s licence, and mark one not yet confirmed as unconfirmed', async () => {
    const unconfirmed = claim('clm-a');
    unconfirmed.passages = [
      { ...unconfirmed.passages[0]!, id: 'p1', source: { ...unconfirmed.passages[0]!.source, licence: 'UNCONFIRMED: free full text via PMC' } },
      { ...unconfirmed.passages[0]!, id: 'p2', source: { ...unconfirmed.passages[0]!.source, id: 's2', title: 'Social studies E&Os', licence: 'OGL v3 (Education Scotland terms of use)' } },
    ];
    render(
      <ClaimsProvider fetchClaims={async () => ({ claims: [unconfirmed], missing: [] })}>
        <ChatMarkdown text="So [[clm-a]]." />
      </ClaimsProvider>,
    );
    fireEvent.focus(screen.getByRole('button', { name: /Source for this/ }));
    const tip = await screen.findByRole('tooltip');
    await waitFor(() => expect(tip.textContent).toContain('(licence unconfirmed)'));
    expect(tip.textContent).toContain('OGL v3');
    expect(tip.textContent).not.toContain('UNCONFIRMED');
  });

  it("say when a claim is the curator's inference", async () => {
    render(
      <ClaimsProvider fetchClaims={async (ids) => ({ claims: ids.map((id) => claim(id, { support_type: 'inference_by_curator' })), missing: [] })}>
        <ChatMarkdown text="So [[clm-a]]." />
      </ClaimsProvider>,
    );
    fireEvent.focus(screen.getByRole('button', { name: /Source for this/ }));
    expect(await screen.findByText(/curator’s inference/)).toBeTruthy();
  });

  it('asks for claims wanted together in one call', async () => {
    const fetchClaims = vi.fn(async (ids: string[]) => ({ claims: ids.map((id) => claim(id)), missing: [] }));
    const load = claimLoader(fetchClaims);
    const [a, b, a2] = await Promise.all([load('clm-a'), load('clm-b'), load('clm-a')]);
    expect([a?.id, b?.id, a2?.id]).toEqual(['clm-a', 'clm-b', 'clm-a']);
    expect(fetchClaims).toHaveBeenCalledWith(['clm-a', 'clm-b']);
    expect(fetchClaims).toHaveBeenCalledTimes(1);
  });
});

describe('a claim source link', () => {
  const withUrl = (url: string) => {
    const c = claim('clm-a');
    c.passages = [{ ...c.passages[0]!, source: { ...c.passages[0]!.source, url } }];
    return c;
  };

  it('links only http: and https: urls; anything else is plain text', () => {
    render(<ClaimCard claim={withUrl('javascript:alert(1)')} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Extra-large letter spacing')).toBeTruthy();
    cleanup();
    for (const url of [' JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x', 'evil.example/x']) {
      render(<ClaimCard claim={withUrl(url)} />);
      expect(screen.queryByRole('link'), url).toBeNull();
      cleanup();
    }
    render(<ClaimCard claim={withUrl('http://example.org/a')} />);
    expect(screen.getByRole('link', { name: 'Extra-large letter spacing' }).getAttribute('href')).toBe('http://example.org/a');
  });
});
