const TIME_HOSTS = ["worldtimeapi.org", "utctime.app", "time.now", "sunrise.am"];
const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday",
  "saturday"];

export function windowDayFromHtml(html) {
  const m = /<meta\s+name=["']ln:window-day["']\s+content=["']([a-z]+)["']/i
    .exec(html || "");
  const day = m ? m[1].toLowerCase() : "";
  return DOW.includes(day) ? day : "wednesday";
}

export function timeStubScript(day) {
  const d = DOW.includes(String(day || "").toLowerCase())
    ? String(day).toLowerCase() : "wednesday";
  return "<script>(function(){var HOSTS=" + JSON.stringify(TIME_HOSTS) +
    ";var DAY=" + JSON.stringify(d) +
    ";var orig=window.fetch&&window.fetch.bind(window);" +
    "window.fetch=function(input,init){" +
    "var u=(input&&input.url)?String(input.url):String(input);" +
    "for(var i=0;i<HOSTS.length;i++){if(u.indexOf(HOSTS[i])!==-1){" +
    "var now=new Date();" +
    "var p={day_of_week:DAY,datetime:now.toISOString()," +
    "unixtime:Math.floor(now.getTime()/1000)};" +
    "return Promise.resolve({ok:true,status:200,url:u," +
    "json:function(){return Promise.resolve(p)}," +
    "text:function(){return Promise.resolve(JSON.stringify(p))}});" +
    "}}" +
    "if(orig)return orig(input,init);" +
    "return Promise.reject(new Error('fetch-unavailable'));};})();" +
    "<" + "/script>";
}

export function injectTimeStub(html, dayOverride) {
  const text = String(html || "");
  const d = DOW.includes(String(dayOverride || "").toLowerCase())
    ? String(dayOverride).toLowerCase() : windowDayFromHtml(text);
  const stub = timeStubScript(d);
  const m = /<head[^>]*>/i.exec(text);
  if (m) {
    const at = m.index + m[0].length;
    return text.slice(0, at) + stub + text.slice(at);
  }
  const s = /<script/i.exec(text);
  if (s) return text.slice(0, s.index) + stub + text.slice(s.index);
  return stub + text;
}

export function decodeUnlockKey(text) {
  const b64 = String(text == null ? "" : text).replace(/\s+/g, "");
  if (!b64) throw new Error("empty-key");
  let bin;
  try {
    bin = atob(b64);
  } catch {
    throw new Error("not-base64");
  }
  if (bin.length !== 32) throw new Error("not-32-bytes");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function previewUnlockHandler({ stage, getKey }) {
  return function (ev) {
    if (!stage || !stage.contentWindow || ev.source !== stage.contentWindow) return;
    const m = ev.data;
    if (!m || m.type !== "ln-unlock-request" || m.v !== 1) return;
    let sameOrigin = false;
    try {
      void stage.contentWindow.location;
      sameOrigin = true;
    } catch { /* cross-origin frame */ }
    if (!sameOrigin) {
      try {
        ev.source.postMessage(
          { type: "ln-unlock-response", v: 1, ok: false, reason: "no-key" }, "*");
      } catch { /* frame is gone */ }
      return;
    }
    const key = getKey();
    const resp = key
      ? { type: "ln-unlock-response", v: 1, ok: true, key }
      : { type: "ln-unlock-response", v: 1, ok: false, reason: "no-key" };
    try {
      ev.source.postMessage(resp, "*");
    } catch { /* frame is gone */ }
  };
}
