import { memo, useEffect, useMemo, useRef } from 'react';
import { Linking } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { escapeHtml, initialsOf } from '../../logic/email';
import { getApiBaseUrl } from '../../api/client';
import type { Email, AttachmentMeta } from '../../types';

// Outlook-style message viewer. The ENTIRE message — subject, sender header, attachment chips and
// the body — renders inside ONE WebView that owns its own scrolling, exactly like Outlook mobile.
//
// Why not a WebView embedded in a ScrollView (the old design)? That WebView had to be sized by a
// one-shot scrollHeight measurement: long emails ended up cut off ("can't scroll"), every image
// load invalidated the measured height, and Android rasterized the whole message as one giant
// layer — the lag and memory spikes users felt. Chromium scrolling its own document virtualizes
// rendering, so scrolling is native-smooth and memory stays flat no matter how long the mail is.
//
// Images: bodies are loaded with an https baseUrl + mixedContentMode so https, protocol-relative
// (`//cdn…`) AND plain-http images all resolve (no-baseUrl data documents silently failed on all
// but absolute-https URLs — that was the "alt text instead of image" bug). `cid:` inline images
// are already swapped to data: URIs by the backend (getMessage).
const BASE_URL = 'https://mail.kbiz360.local/';

const humanSize = (b: number): string => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const CLIP = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#5A6472" stroke-width="2" stroke-linecap="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

function headerHtml(email: Email, attachments: AttachmentMeta[]): string {
  const when = new Date(email.ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const to = email.to.map((a) => a.name || a.email).join(', ');
  const cc = (email.cc ?? []).map((a) => a.name || a.email).join(', ');
  const chips = attachments.map((at) => `
    <div class="att" data-att="${escapeHtml(at.id).replace(/"/g, '&quot;')}">
      ${CLIP}
      <div class="att-t"><div class="att-n">${escapeHtml(at.name)}</div><div class="att-s">${humanSize(at.size)}</div></div>
      <div class="att-dl">↓</div>
    </div>`).join('');
  return `
  <div class="hdr">
    <div class="subject">${escapeHtml(email.subject)}</div>
    <div class="sender">
      <div class="avatar" style="background:${escapeHtml(email.color)}">${escapeHtml(initialsOf(email.from))}</div>
      <div class="who">
        <div class="name">${escapeHtml(email.from.name || email.from.email)}</div>
        <div class="addr">${escapeHtml(email.from.email)}</div>
      </div>
      <div class="when">${escapeHtml(when)}</div>
    </div>
    <div class="rcpt">To: ${escapeHtml(to)}${cc ? ` · Cc: ${escapeHtml(cc)}` : ''}</div>
    ${chips ? `<div class="atts">${chips}</div>` : ''}
  </div>
  <div class="rule"></div>`;
}

function docHtml(email: Email, attachments: AttachmentMeta[]): string {
  // The backend rewrites remote <img> URLs to relative signed-proxy paths (/api/email/img?…) —
  // senders serving Cross-Origin-Resource-Policy: same-origin images (claude.ai etc.) can only
  // render via our own origin. Point those paths at the real backend host here.
  const api = getApiBaseUrl();
  const body = email.bodyType === 'html'
    ? email.body.split('src="/api/email/img').join(`src="${api}/api/email/img`).split("src='/api/email/img").join(`src='${api}/api/email/img`)
    : `<div class="plain">${escapeHtml(email.body)}</div>`;
  // Full body still on its way (list rows only carry the preview snippet) → preview + spinner.
  const loading = !email.bodyFull && email.folder !== 'drafts';
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin:0; padding:0; background:#fff; -webkit-text-size-adjust:100%; }
  body { font-family:-apple-system,Roboto,'Segoe UI',sans-serif; color:#1A1A1A; word-wrap:break-word; overflow-wrap:break-word; }
  .hdr { padding:16px 16px 4px 16px; }
  .subject { font-size:21px; font-weight:700; line-height:1.3; letter-spacing:-0.2px; color:#101418; }
  .sender { display:flex; align-items:center; gap:11px; margin-top:14px; }
  .avatar { width:42px; height:42px; border-radius:21px; flex:none; display:flex; align-items:center; justify-content:center; color:#fff; font-size:15px; font-weight:700; }
  .who { flex:1; min-width:0; }
  .name { font-size:15px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .addr { font-size:12px; color:#5A6472; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .when { font-size:11.5px; color:#5A6472; flex:none; align-self:flex-start; margin-top:2px; }
  .rcpt { font-size:12px; color:#5A6472; margin-top:8px; }
  .atts { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  .att { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #E3E7EC; border-radius:12px; max-width:100%; background:#fff; }
  .att.busy { opacity:0.45; }
  .att svg { flex:none; }
  .att-t { min-width:0; }
  .att-n { font-size:12.5px; font-weight:600; color:#101418; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px; }
  .att-s { font-size:10.5px; color:#5A6472; }
  .att-dl { color:#0984E3; font-weight:700; font-size:14px; padding-left:2px; }
  .rule { height:1px; background:#E9EDF1; margin:14px 0 0 0; }
  .body-wrap { padding:14px 16px 32px 16px; font-size:15.5px; line-height:1.5; }
  .plain { white-space:pre-wrap; word-break:break-word; }
  .body-wrap img { max-width:100% !important; height:auto !important; }
  .body-wrap table { max-width:100% !important; }
  .body-wrap a { color:#0984E3; }
  .body-wrap pre { white-space:pre-wrap; word-wrap:break-word; }
  .body-wrap blockquote { border-left:3px solid #ddd; margin:0 0 0 8px; padding-left:10px; color:#555; }
  .loading { display:flex; align-items:center; gap:8px; color:#5A6472; font-size:12.5px; padding:2px 16px 10px 16px; }
  .spin { width:14px; height:14px; border:2px solid #D6DCE3; border-top-color:#0984E3; border-radius:50%; animation:sp 0.8s linear infinite; }
  @keyframes sp { to { transform:rotate(360deg); } }
</style></head><body>
${headerHtml(email, attachments)}
${loading ? '<div class="loading"><div class="spin"></div>Loading full message…</div>' : ''}
<div class="body-wrap">${body}</div>
<script>
  var post = function (m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  // One capture-phase click handler: attachment chips + every link open on the NATIVE side.
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute('data-att')) { ev.preventDefault(); post({ type: 'att', id: el.getAttribute('data-att') }); return; }
      if (el.tagName === 'A' && el.getAttribute('href')) { ev.preventDefault(); post({ type: 'link', url: el.href || el.getAttribute('href') }); return; }
      el = el.parentElement;
    }
  }, true);
  // Native toggles a chip's busy state while an attachment downloads.
  window.setBusy = function (id) {
    var b = document.querySelectorAll('.att.busy'); for (var i = 0; i < b.length; i++) b[i].classList.remove('busy');
    if (id) { var all = document.querySelectorAll('.att'); for (var j = 0; j < all.length; j++) if (all[j].getAttribute('data-att') === id) all[j].classList.add('busy'); }
  };
</script></body></html>`;
}

export const EmailMessageView = memo(function EmailMessageView({ email, attachments, downloadingId, onAttachment, onMailto }: {
  email: Email;
  attachments: AttachmentMeta[];
  downloadingId: string | null;
  onAttachment: (id: string) => void;
  onMailto?: (address: string) => void;
}) {
  const ref = useRef<WebView>(null);

  // The document only changes when the body itself or the attachment list does — NOT when the
  // busy state toggles (that goes through injectJavaScript so the page never reloads).
  const html = useMemo(() => docHtml(email, attachments), [email, attachments]);

  useEffect(() => {
    ref.current?.injectJavaScript(`window.setBusy && window.setBusy(${JSON.stringify(downloadingId ?? '')}); true;`);
  }, [downloadingId]);

  const openExternally = (url: string): void => {
    if (url.startsWith('mailto:')) {
      const addr = url.slice(7).split('?')[0];
      if (onMailto && addr) { onMailto(addr); return; }
    }
    Linking.openURL(url).catch(() => undefined);
  };

  const onMessage = (e: WebViewMessageEvent): void => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; id?: string; url?: string };
      if (m.type === 'att' && m.id) onAttachment(m.id);
      else if (m.type === 'link' && m.url) openExternally(m.url);
    } catch { /* ignore malformed */ }
  };

  return (
    <WebView
      ref={ref}
      originWhitelist={['*']}
      source={{ html, baseUrl: BASE_URL }}
      style={{ flex: 1, backgroundColor: '#fff' }}
      onMessage={onMessage}
      // Safety net for navigations the click handler didn't catch (redirects, window.open with
      // multiple-windows off): keep the message document, open everything else outside.
      onShouldStartLoadWithRequest={(req) => {
        if (req.url.startsWith(BASE_URL) || req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
        openExternally(req.url);
        return false;
      }}
      setSupportMultipleWindows={false}
      // Pinch-zoom like Outlook (Android needs the built-in zoom controls on, minus the buttons).
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      // http images inside an https-based document (newsletters still use them) — allow, or they
      // fall back to alt text.
      mixedContentMode="always"
      nestedScrollEnabled
      showsVerticalScrollIndicator
    />
  );
});
