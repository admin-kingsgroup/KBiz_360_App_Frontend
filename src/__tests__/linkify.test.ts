import { splitLinks, hasLink, linkTarget } from '../logic/linkify';

describe('linkify', () => {
  it('returns one plain segment for text without links', () => {
    expect(splitLinks('hello team, meeting at 3')).toEqual([{ text: 'hello team, meeting at 3', url: null }]);
    expect(hasLink('no links here')).toBe(false);
  });

  it('links an explicit http(s) URL and keeps surrounding text', () => {
    expect(splitLinks('see https://kbiz360.duckdns.org/app now')).toEqual([
      { text: 'see ', url: null },
      { text: 'https://kbiz360.duckdns.org/app', url: 'https://kbiz360.duckdns.org/app' },
      { text: ' now', url: null },
    ]);
  });

  it('links www. hosts and bare domains with an https target', () => {
    expect(splitLinks('www.google.com')).toEqual([{ text: 'www.google.com', url: 'https://www.google.com' }]);
    expect(splitLinks('open kingsgroupco.com/crm please')).toEqual([
      { text: 'open ', url: null },
      { text: 'kingsgroupco.com/crm', url: 'https://kingsgroupco.com/crm' },
      { text: ' please', url: null },
    ]);
  });

  it('leaves trailing sentence punctuation out of the link', () => {
    expect(splitLinks('check https://x.com.')).toEqual([
      { text: 'check ', url: null },
      { text: 'https://x.com', url: 'https://x.com' },
      { text: '.', url: null },
    ]);
    expect(splitLinks('(see www.a.com/b)')).toEqual([
      { text: '(see ', url: null },
      { text: 'www.a.com/b', url: 'https://www.a.com/b' },
      { text: ')', url: null },
    ]);
  });

  it('keeps a balanced closing paren inside the URL', () => {
    expect(splitLinks('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', url: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
    ]);
  });

  it('does not linkify the domain of an email address', () => {
    expect(hasLink('mail me at anubhav@kingsgroupco.com')).toBe(false);
  });

  it('handles several links in one message', () => {
    const parts = splitLinks('a.com and b.net done');
    expect(parts.filter((p) => p.url).map((p) => p.url)).toEqual(['https://a.com', 'https://b.net']);
    expect(parts.map((p) => p.text).join('')).toBe('a.com and b.net done');
  });

  it('linkTarget only prefixes when a scheme is missing', () => {
    expect(linkTarget('https://x.com')).toBe('https://x.com');
    expect(linkTarget('http://x.com')).toBe('http://x.com');
    expect(linkTarget('x.com')).toBe('https://x.com');
  });
});
