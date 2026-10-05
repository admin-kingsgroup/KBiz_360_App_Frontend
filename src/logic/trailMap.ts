// Self-contained HTML for the admin trail / roster map, rendered in a WebView (the app ships no
// native map module, and react-native-webview is already in every build). Leaflet + OpenStreetMap
// tiles are loaded from the network; all DATA is inlined as JSON. Pure → unit-tested.

export interface MapPoint { at: string; lat: number; lng: number; accuracy: number | null }
export interface MapOffice { label: string | null; lat: number; lng: number; radius: number }
export interface MapPerson { name: string; lat: number; lng: number; at: string; accuracy: number | null; color: string; live: boolean }

export interface TrailMapInput {
  points?: MapPoint[]; // one person's day, in time order
  offices?: MapOffice[];
  people?: MapPerson[]; // roster mode: everyone's last-known position
  live?: boolean; // trail mode: the last point is "now" (pulsing marker) rather than the day's end
}

// JSON that is safe inside a <script> block: "</script>" or "<!--" in a name must not end the script.
export function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function buildTrailMapHtml(input: TrailMapInput): string {
  const data = safeJson({ points: input.points ?? [], offices: input.offices ?? [], people: input.people ?? [], live: !!input.live });
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html,body,#map{height:100%;margin:0;background:#EEF1F4}
  #msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:14px -apple-system,Roboto,sans-serif;color:#6B7280;text-align:center;padding:24px;z-index:1}
  .dot{width:14px;height:14px;border-radius:7px;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
  .pulse{animation:p 1.6s ease-out infinite}
  @keyframes p{0%{box-shadow:0 0 0 0 rgba(18,140,126,.55)}100%{box-shadow:0 0 0 16px rgba(18,140,126,0)}}
  .lbl{font:600 11px -apple-system,Roboto,sans-serif;background:#fff;border-radius:6px;padding:2px 6px;box-shadow:0 1px 3px rgba(0,0,0,.25);white-space:nowrap}
</style></head>
<body><div id="msg">Loading map…</div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var D=${data};
  var msg=document.getElementById('msg');
  if(typeof L==='undefined'){msg.textContent='The map could not load — check the internet connection.';return;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function t(iso){try{return new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}catch(e){return '';}}
  function dot(color,pulse){return L.divIcon({className:'',iconSize:[19,19],iconAnchor:[9.5,9.5],html:'<div class="dot'+(pulse?' pulse':'')+'" style="background:'+color+'"></div>'});}
  var map=L.map('map',{zoomControl:true,attributionControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  var bounds=[];
  D.offices.forEach(function(o){
    L.circle([o.lat,o.lng],{radius:o.radius,color:'#E3674E',weight:1.5,fillColor:'#E3674E',fillOpacity:.10}).addTo(map).bindTooltip(esc(o.label||'Office'));
  });
  if(D.points.length){
    var ll=D.points.map(function(p){return [p.lat,p.lng];});
    L.polyline(ll,{color:'#128C7E',weight:4,opacity:.85,lineJoin:'round'}).addTo(map);
    D.points.forEach(function(p,i){
      if(i===0||i===D.points.length-1) return;
      L.circleMarker([p.lat,p.lng],{radius:3,color:'#128C7E',weight:1,fillColor:'#fff',fillOpacity:1}).addTo(map)
        .bindTooltip(t(p.at)+(p.accuracy!=null?' · ±'+Math.round(p.accuracy)+' m':''));
    });
    var a=D.points[0], z=D.points[D.points.length-1];
    L.marker([a.lat,a.lng],{icon:dot('#4F8BFF',false)}).addTo(map).bindTooltip('Start · '+t(a.at));
    L.marker([z.lat,z.lng],{icon:dot('#128C7E',D.live),zIndexOffset:500}).addTo(map).bindTooltip((D.live?'Now · ':'End · ')+t(z.at)+(z.accuracy!=null?' · ±'+Math.round(z.accuracy)+' m':''));
    if(z.accuracy!=null&&z.accuracy>15) L.circle([z.lat,z.lng],{radius:z.accuracy,color:'#128C7E',weight:1,fillOpacity:.08}).addTo(map);
    bounds=bounds.concat(ll);
  }
  D.people.forEach(function(p){
    L.marker([p.lat,p.lng],{icon:dot(p.live?'#128C7E':'#9CA3AF',p.live)}).addTo(map)
      .bindTooltip('<span class="lbl">'+esc(p.name)+' · '+t(p.at)+'</span>',{permanent:true,direction:'top',offset:[0,-8],opacity:1,className:''});
    bounds.push([p.lat,p.lng]);
  });
  if(!bounds.length) D.offices.forEach(function(o){bounds.push([o.lat,o.lng]);});
  if(bounds.length===1) map.setView(bounds[0],17);
  else if(bounds.length) map.fitBounds(bounds,{padding:[36,36],maxZoom:18});
  else map.setView([20.59,78.96],4);
  msg.style.display='none';
})();
</script></body></html>`;
}
