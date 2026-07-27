import { sanitizeEmailHtml } from '../logic/email';

// The email WebView additionally disables JavaScript, so these are defence-in-depth; the sanitizer
// must still strip every executable/dangerous construct while preserving normal email formatting.
describe('sanitizeEmailHtml', () => {
  it('removes <script> tags and their contents', () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>steal(document.cookie)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('steal(document.cookie)');
    expect(out).toContain('<p>hi</p>');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toContain('alert(1)');
    expect(out).toMatch(/<img/i); // the image element itself is preserved
  });

  it('neutralises javascript: and vbscript: URLs', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a><a href="VBScript:msgbox(1)">y</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/vbscript:/i);
  });

  it('removes iframe / object / embed / form injection', () => {
    const out = sanitizeEmailHtml(
      '<iframe src="//evil"></iframe><object data="x"></object><embed src="x"><form action="//evil"><input></form>',
    );
    expect(out).not.toMatch(/<iframe|<object|<embed|<form|<input/i);
  });

  it('removes svg (script execution vector), base and meta-refresh', () => {
    const out = sanitizeEmailHtml('<svg><script>x()</script></svg><base href="//evil"><meta http-equiv="refresh" content="0;url=//evil">');
    expect(out).not.toMatch(/<svg|<base|<meta/i);
    expect(out).not.toContain('x()');
  });

  it('strips data:text/html but preserves data: image URIs', () => {
    const out = sanitizeEmailHtml('<a href="data:text/html,<script>x</script>">bad</a><img src="data:image/png;base64,AAAA">');
    expect(out).not.toMatch(/data:\s*text\/html/i);
    expect(out).toContain('data:image/png;base64,AAAA'); // inline images still work
  });

  it('preserves normal formatting (tables, inline styles, links, images)', () => {
    const html = '<table><tr><td style="color:red">Cell</td></tr></table><a href="https://ok.com">link</a><img src="https://ok.com/i.png">';
    const out = sanitizeEmailHtml(html);
    expect(out).toContain('<table>');
    expect(out).toContain('style="color:red"');
    expect(out).toContain('href="https://ok.com"');
    expect(out).toContain('src="https://ok.com/i.png"');
  });
});
