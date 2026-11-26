"""Build a self-contained HTML browser for the library with hover/tap citations."""
import sys, json, yaml, datetime

lib = yaml.safe_load(open(sys.argv[1]))
out = sys.argv[2]

def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items() if k != "embedding"}
    if isinstance(o, list):
        return [clean(v) for v in o]
    if isinstance(o, (datetime.date, datetime.datetime)):
        return o.isoformat()
    return o

data = clean(lib)
payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")

html = r"""<!DOCTYPE html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pedagogy Library: Scotland sample (P7 English, S1 history)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f5ef;--card:#fff;--ink:#1f2a2e;--muted:#5d6a6e;--line:#e2ded3;--accent:#1d5c63;--accent2:#e8f1f0;
--strong:#2e7d4f;--moderate:#3a6ea5;--emerging:#8a6d1d;--contested:#b0592b;--practitioner:#6b5b95;--no:#a33a3a}
@media (prefers-color-scheme:dark){:root{--bg:#141a1c;--card:#1c2427;--ink:#e8ecea;--muted:#9fb0b2;--line:#2c373a;--accent:#7cc4c9;--accent2:#20393b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 'Atkinson Hyperlegible',system-ui,sans-serif}
header{padding:28px 20px 12px;max-width:980px;margin:0 auto}
h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:clamp(1.5rem,4vw,2.2rem);margin:0 0 6px;line-height:1.15}
.sub{color:var(--muted);margin:0 0 14px}
.stats{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:.9rem}
.stats b{color:var(--ink);font-size:1.1rem}
.controls{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 20px}
.controls .in{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
input[type=search]{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit}
.chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}
.chip{flex:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:5px 12px;font:inherit;font-size:.88rem;cursor:pointer}
.chip[aria-pressed=true]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
main{max-width:980px;margin:0 auto;padding:14px 20px 60px}
.count{color:var(--muted);font-size:.9rem;margin:4px 0 12px}
details.entry{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:0 0 10px;overflow:hidden}
details.entry>summary{list-style:none;cursor:pointer;padding:14px 16px}
details.entry>summary::-webkit-details-marker{display:none}
.ttl{font-weight:700;font-size:1.05rem}
.meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.tag{font-size:.75rem;padding:2px 8px;border-radius:6px;background:var(--accent2);color:var(--ink)}
.badge{font-size:.75rem;padding:2px 8px;border-radius:6px;color:#fff;font-weight:700}
.b-strong{background:var(--strong)}.b-moderate{background:var(--moderate)}.b-emerging{background:var(--emerging)}
.b-contested{background:var(--contested)}.b-practitioner_wisdom{background:var(--practitioner)}.b-not_recommended{background:var(--no)}
.summ{color:var(--muted);margin-top:6px}
.body{padding:0 16px 16px;border-top:1px solid var(--line)}
h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 6px}
.claim{margin:0 0 8px}
.cite{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;
border:1.5px solid var(--accent);color:var(--accent);font:700 12px/1 Georgia,serif;font-style:italic;cursor:pointer;margin-left:4px;vertical-align:1px;background:none;padding:0}
.cite:hover,.cite:focus{background:var(--accent);color:var(--bg);outline:none}
.recipes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.recipe{border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:.92rem}
.recipe b{display:block;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--accent)}
ul.risks{margin:0;padding-left:20px}
.rel a{color:var(--accent);cursor:pointer;text-decoration:underline;margin-right:8px;font-size:.9rem}
#pop{position:fixed;z-index:20;max-width:min(420px,92vw);background:var(--card);border:1px solid var(--line);border-radius:12px;
box-shadow:0 10px 30px rgba(0,0,0,.18);padding:12px 14px;font-size:.9rem;display:none}
#pop .q{border-left:3px solid var(--accent);padding-left:10px;margin:6px 0}
#pop .src{color:var(--muted)}
#pop a{color:var(--accent)}
.ver{font-size:.75rem;font-weight:700}
.ok{color:var(--strong)}.warn{color:var(--contested)}
.legend{font-size:.85rem;color:var(--muted);margin-top:10px}
</style></head><body>
<header>
<h1>Pedagogy Library: Scotland sample</h1>
<p class="sub">P7 Literacy and English (Second Level) and S1 history (Third Level). Draft for educator review. Tap <span class="cite" aria-hidden="true">i</span> to see the source behind any statement.</p>
<div class="stats" id="stats"></div>
<p class="legend">Every source was opened by a research agent. Verbatim quotes are marked as quotes; everything else is a paraphrase with a locator to check. Locators marked UNCONFIRMED need a human check.</p>
</header>
<div class="controls"><div class="in">
<input type="search" id="q" placeholder="Search, e.g. source analysis, spacing, vocabulary" aria-label="Search the library">
<div class="chips" id="stageChips"></div>
<div class="chips" id="typeChips"></div>
</div></div>
<main><div class="count" id="count"></div><div id="list"></div></main>
<div id="pop" role="dialog" aria-live="polite"></div>
<script>
const L = __DATA__;
const by = (arr)=>Object.fromEntries(arr.map(x=>[x.id,x]));
const E=by(L.entries), C=by(L.claims), P=by(L.passages), S=by(L.sources);
const TYPES={principle:"Principles",signature_pedagogy:"Signature pedagogies",activity_type:"Activity types",exemplar:"Exemplars",adaptation:"Adaptations",format_rule:"Format rules",caution:"Cautions",curriculum_ref:"Curriculum"};
const STAGES={all:"All stages",p7:"P7 English",s1:"S1 history"};
let fStage="all", fType="all";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nice=s=>String(s).replace(/_/g," ");
function stats(){
  const v=L.passages.filter(p=>p.verified_by_fetch).length;
  const unc=L.passages.filter(p=>/UNCONFIRMED|TODO/.test(p.locator||"")).length;
  document.getElementById("stats").innerHTML=
   `<span><b>${L.entries.length}</b> entries</span><span><b>${L.claims.length}</b> cited claims</span><span><b>${L.sources.length}</b> sources</span><span><b>${v}</b>/${L.passages.length} passages fetched</span><span><b>${unc}</b> locators to confirm</span>`;
}
function chips(id,obj,get,set){
  const el=document.getElementById(id);
  el.innerHTML=Object.entries(obj).map(([k,v])=>`<button class="chip" data-k="${k}" aria-pressed="${get()===k}">${v}</button>`).join("");
  el.onclick=e=>{const b=e.target.closest(".chip");if(!b)return;set(b.dataset.k);chips(id,obj,get,set);render();};
}
function matchStage(e){
  if(fStage==="all")return true;
  const st=(e.facets&&e.facets.stage)||[], area=(e.facets&&e.facets.curriculum_area)||[];
  if(!st.includes(fStage))return false;
  if(fStage==="p7"&&area.includes("social_studies"))return false;
  if(fStage==="s1"&&area.includes("languages")&&!st.includes("s1"))return false;
  return true;
}
function render(){
  const q=document.getElementById("q").value.toLowerCase().trim();
  const items=L.entries.filter(e=>(fType==="all"||e.type===fType)&&matchStage(e)&&
    (!q||JSON.stringify([e.title,e.summary,e.body,e.facets,e.artefact_recipes]).toLowerCase().includes(q)));
  document.getElementById("count").textContent=`${items.length} entries`;
  document.getElementById("list").innerHTML=items.map(card).join("");
}
function card(e){
  const ev=e.evidence&&e.evidence.rating;
  const f=e.facets||{};
  const tags=[TYPES[e.type]||e.type,...(f.stage||[]).map(s=>s.toUpperCase()),...(f.subject||[]),...(f.access_dimension?[f.access_dimension]:[])];
  const claims=(e.claims||[]).map(id=>C[id]).filter(Boolean).map(c=>`<p class="claim">${esc(c.text)}<button class="cite" data-c="${c.id}" aria-label="Show source">i</button></p>`).join("");
  const rec=e.artefact_recipes?Object.entries(e.artefact_recipes).filter(([k,v])=>v).map(([k,v])=>`<div class="recipe"><b>${nice(k)}</b>${esc(v)}</div>`).join(""):"";
  const risks=(e.risks||[]).length?`<h3>Risks and cautions</h3><ul class="risks">${e.risks.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>`:"";
  const rels=Object.entries(e.relations||{}).flatMap(([k,v])=>(v||[]).filter(t=>E[t]).map(t=>`<a data-go="${t}">${esc(E[t].title)}</a>`)).join("");
  return `<details class="entry" id="${e.id}"><summary><div class="ttl">${esc(e.title)}</div>
  <div class="meta">${ev?`<span class="badge b-${ev}">${nice(ev)}</span>`:""}${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>
  <div class="summ">${esc(e.summary)}</div></summary><div class="body">
  ${e.evidence&&e.evidence.rationale?`<h3>Evidence</h3><p>${esc(e.evidence.rationale)}</p>`:""}
  ${claims?`<h3>Cited statements</h3>${claims}`:""}
  ${rec?`<h3>As classroom artefacts</h3><div class="recipes">${rec}</div>`:""}
  ${risks}${rels?`<h3>Related</h3><div class="rel">${rels}</div>`:""}
  <h3>Record</h3><p style="font-size:.8rem;color:var(--muted)">${e.id} · ${esc(e.status)}</p></div></details>`;
}
const pop=document.getElementById("pop");
function showPop(btn){
  const c=C[btn.dataset.c];
  const html=(c.supported_by||[]).map(pid=>{const p=P[pid];if(!p)return"";const s=S[p.source_id]||{};
    const unc=/UNCONFIRMED|TODO/.test(p.locator||"");
    return `<div class="q">${p.excerpt_type==="quote"?`“${esc(p.text)}”`:esc(p.text)}<br><span class="src">${p.excerpt_type==="quote"?"Quote":"Paraphrase"} · ${esc(p.locator)}</span></div>
    <div class="src"><b>${esc(s.title)}</b>, ${esc(s.publisher||"")}${s.year?` (${s.year})`:""}<br>
    ${s.url?`<a href="${esc(p.fetched_url||s.url)}" target="_blank" rel="noopener">Open source</a> · `:""}
    <span class="ver ${p.verified_by_fetch&&!unc?"ok":"warn"}">${p.verified_by_fetch?(unc?"Fetched, locator to confirm":"Fetched and located"):"Not fetched"}</span>
    ${c.support_type==="inference_by_curator"?' · <span class="ver warn">Curator inference</span>':""}</div>`;}).join("<hr style='border:0;border-top:1px solid var(--line)'>");
  pop.innerHTML=html; pop.style.display="block";
  const r=btn.getBoundingClientRect(), w=pop.offsetWidth, h=pop.offsetHeight;
  let x=Math.min(Math.max(8,r.left-w/2),innerWidth-w-8), y=r.bottom+8; if(y+h>innerHeight-8)y=Math.max(8,r.top-h-8);
  pop.style.left=x+"px"; pop.style.top=y+"px";
}
document.addEventListener("click",e=>{
  const b=e.target.closest(".cite"); if(b&&b.dataset.c){e.preventDefault();e.stopPropagation();showPop(b);return;}
  const g=e.target.closest("[data-go]"); if(g){const t=document.getElementById(g.dataset.go);if(!t){fType="all";fStage="all";init();}
    const el=document.getElementById(g.dataset.go); if(el){el.open=true;el.scrollIntoView({behavior:"smooth",block:"start"});} return;}
  if(!e.target.closest("#pop"))pop.style.display="none";
});
document.addEventListener("mouseover",e=>{const b=e.target.closest(".cite");if(b&&b.dataset.c&&matchMedia("(hover:hover)").matches)showPop(b);});
addEventListener("scroll",()=>{pop.style.display="none"},{passive:true});
document.getElementById("q").addEventListener("input",render);
function init(){
  chips("stageChips",STAGES,()=>fStage,v=>fStage=v);
  chips("typeChips",{all:"All types",...TYPES},()=>fType,v=>fType=v);
  render();
}
stats(); init();
</script></body></html>"""
open(out, "w").write(html.replace("__DATA__", payload))
print("written", out)
