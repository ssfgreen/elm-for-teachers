import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDoc } from '../../core/collection.js';
import { htmlToMarkdown, linkedFiles } from './markdown.js';
import { levelName, resourceDoc, type TrailsResource } from './resource.js';

/** One resource from the TRAILS REST API as it was on 8 Nov 2026. */
const raw = JSON.parse(readFileSync(new URL('./fixtures/resource.json', import.meta.url), 'utf8'));
const resource: TrailsResource = {
  id: raw.id,
  slug: raw.slug,
  link: raw.link,
  modified_gmt: raw.modified_gmt,
  title: raw.title.rendered,
  content: raw.content.rendered,
  excerpt: raw.excerpt.rendered,
  areas: ['AI Literacy', 'Child Rights and Ethics', 'Social Studies', 'Technologies'],
  levels: ['Third'],
  topics: ['Computer Science', 'Digital Literacy'],
};

describe('levelName', () => {
  it('keeps the level and drops the school years', () => {
    expect(levelName('Early (Pre 5 & P1)')).toBe('Early');
    expect(levelName('Third (S1-S3)')).toBe('Third');
    expect(levelName('Senior Phase (S4-S6)')).toBe('Senior Phase');
    expect(levelName('For teachers')).toBe('For teachers');
  });
});

describe('TRAILS resources', () => {
  it('lists linked files once each, with their names, and not the Download buttons', () => {
    const files = linkedFiles(resource.content);
    expect(files).toEqual([
      { url: 'https://trails.scot/wp-content/uploads/2026/08/1.-How-AI-influences-you.zip', text: '1. How AI influences you – WHOLE LESSON' },
      { url: 'https://trails.scot/wp-content/uploads/2025/01/How-AI-Influences-You-Topic-1.pdf', text: 'How AI Influences You – Primary WHOLE LESSON PDF Slides' },
      { url: 'https://trails.scot/wp-content/uploads/2026/09/How-AI-Influences-You-Primary.zip', text: 'How AI Influences You – WHOLE LESSON ZIP – Primary' },
    ]);
  });

  it('converts the HTML to markdown with headings, links and lists', () => {
    const md = htmlToMarkdown(resource.content);
    expect(md).toContain('## For Secondary');
    expect(md).toContain('[https://dataed.in/social-media-calculator](https://dataed.in/social-media-calculator)');
    expect(md).toContain('- [Movie Night](https://trails.scot/resource/movie-night-2/)');
    expect(md).not.toMatch(/Download\]/);
    expect(md).not.toContain('wp-block');
  });

  it('keeps embedded videos as links and drops pictures with no description', () => {
    const md = htmlToMarkdown(
      '<h2><img src="https://a.example/x.jpg" alt=""></h2><p>Watch:</p><iframe src="https://media.ed.ac.uk/embed/1" title="How to play"></iframe><script>alert(1)</script><img src="https://a.example/y.jpg" alt="A map">',
    );
    expect(md).toBe('Watch:\n\n[How to play](https://media.ed.ac.uk/embed/1)\n\n![A map](https://a.example/y.jpg)');
  });

  it('writes a document with frontmatter the library can filter on', () => {
    const { path, content } = resourceDoc(resource, { licence: 'All rights reserved', fetchedOn: '2026-11-08', sha256: 'abc' });
    expect(path).toBe('how-ai-influences-you.md');
    const doc = parseDoc(path, content);
    expect(doc.frontmatter).toMatchObject({
      title: 'How AI influences you',
      source_url: 'https://trails.scot/resource/how-ai-influences-you/',
      licence: 'All rights reserved',
      fetched_at: '2026-11-08',
      source_modified: '2026-09-11',
      type: 'resource',
      subject: ['AI Literacy', 'Child Rights and Ethics', 'Social Studies', 'Technologies'],
      level: ['Third'],
      topics: ['Computer Science', 'Digital Literacy'],
      trails_id: 28,
    });
    expect(String(doc.frontmatter.summary)).toMatch(/^This unit is split into three lessons/);
    expect(String(doc.frontmatter.summary)).not.toContain('Continue reading');
    expect(doc.lines[0]).toBe('');
    expect(doc.lines[1]).toBe('# How AI influences you');
    expect(content).toContain('## Linked files');
  });
});
