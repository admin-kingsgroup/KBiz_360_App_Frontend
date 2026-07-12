import { useState } from 'react';
import { Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../theme';

// Wrap raw email HTML in a responsive document (mobile viewport, clamp images/tables, readable
// font) and post its height back so the WebView can size itself inline inside the scroll view.
const wrapHtml = (html: string): string => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  body { margin:0; padding:14px; font-family:-apple-system,Roboto,'Segoe UI',sans-serif; font-size:15px; line-height:1.5; color:#1A1A1A; word-wrap:break-word; overflow-wrap:break-word; }
  img { max-width:100% !important; height:auto !important; }
  table { max-width:100% !important; }
  a { color:#0984E3; }
  pre { white-space:pre-wrap; word-wrap:break-word; }
  blockquote { border-left:3px solid #ddd; margin:0 0 0 8px; padding-left:10px; color:#555; }
</style></head><body>${html}
<script>
  function post(){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(document.body.scrollHeight)); }
  window.addEventListener('load', post); setTimeout(post, 250); setTimeout(post, 900);
</script></body></html>`;

// Renders an email body — HTML via a WebView, plain text via a Text node.
export function EmailBody({ body, bodyType }: { body: string; bodyType?: 'html' | 'text' }) {
  const [height, setHeight] = useState(180);
  if (bodyType !== 'html') {
    return <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>{body}</Text>;
  }
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: wrapHtml(body) }}
      style={{ height, backgroundColor: 'transparent' }}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      onMessage={(e) => { const h = Number(e.nativeEvent.data); if (h && Math.abs(h - height) > 2) setHeight(h); }}
    />
  );
}
