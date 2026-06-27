"""Build a single-file HTML review page for canon-face identification.

One screen, zero tool-juggling: every UNIQUE canon face (290, deduped) rendered big, an editable
name box + confidence selector under each, known identities pre-filled, filter/search on top, and an
"내보내기(JSON)" button that downloads `portrait-identities.review.json` — which we then ingest back
into content/roster/portrait-identities.json.

Usage:  python tools/logh7_face_review_html.py
Output: content/roster/idkit/review.html  (open in any browser)
"""
from __future__ import annotations

import base64
import io
import json
import struct
from pathlib import Path

from PIL import Image

FACE = Path(".omo/work/logh7-installed/data/image/Face")
IDKIT = Path("content/roster/idkit")
IDENT = Path("content/roster/portrait-identities.json")
ATLAS_LABEL = {"oem": "제국 남성 (oem)", "oam": "동맹 남성 (oam)", "o": "기타/여성/파일럿 (o)"}


def load_hed():
    hed = (FACE / "tcf.hed").read_bytes()
    return [struct.unpack_from("<II", hed, i * 8) for i in range(len(hed) // 8)]


def decode(region: bytes):
    # STRICT exact-size validation (see logh7_tcf_decode.decode_region) — rejects wrong-atlas garbage.
    if len(region) < 18 + 1024:
        return None
    w = struct.unpack_from("<H", region, 0x0c)[0]
    h = struct.unpack_from("<H", region, 0x0e)[0]
    if not (8 <= w <= 256 and 8 <= h <= 256) or 18 + 1024 + w * h != len(region):
        return None
    pal = region[18:18 + 1024]
    px = region[18 + 1024:18 + 1024 + w * h]
    img = Image.new("RGB", (w, h))
    img.putdata([(pal[i * 4 + 2], pal[i * 4 + 1], pal[i * 4 + 0]) for i in px])
    return img.transpose(Image.FLIP_TOP_BOTTOM)


def b64png(img: Image.Image, scale: int = 2) -> str:
    buf = io.BytesIO()
    img.resize((img.width * scale, img.height * scale), Image.NEAREST).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def existing_identities() -> dict[tuple[str, int], dict]:
    try:
        d = json.loads(IDENT.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for e in d.get("identities", []):
        # accept both schemas: vii_slot (review/ours) and vii_index (reverse-trace agent)
        slot = e.get("vii_slot", e.get("vii_index"))
        if slot is None:
            continue
        if "identified_name_romaji" not in e and e.get("identified_name"):
            e = {**e, "identified_name_romaji": e["identified_name"]}
        out[(e.get("vii_atlas"), int(slot))] = e
        for s in e.get("duplicate_slots", []) or []:
            out[(e.get("vii_atlas"), int(s))] = e
    return out


def vi_reference_cards() -> list[dict]:
    """Load the 112 name-labeled LOGH VI portraits (idkit/vi-labeled) as reference cards."""
    vi_dir = IDKIT / "vi-labeled"
    labels_path = vi_dir / "_labels.json"
    if not labels_path.exists():
        return []
    labels = json.loads(labels_path.read_text(encoding="utf-8"))
    # accept {file:name} or [{file,name},...] or {char_id:{name,file}}
    items = []
    if isinstance(labels, dict):
        for k, v in labels.items():
            if isinstance(v, str):
                items.append({"file": k, "name": v})
            elif isinstance(v, dict):
                items.append({"file": v.get("file", k), "name": v.get("name") or v.get("name_kr") or str(k)})
    elif isinstance(labels, list):
        for v in labels:
            items.append({"file": v.get("file") or v.get("png") or "",
                          "name": v.get("name") or v.get("name_kr") or "",
                          "faction": v.get("faction", "")})
    cards = []
    for it in items:
        # label 'file' may be a full relative path (with backslashes) or a bare filename
        raw = str(it["file"]).replace("\\", "/")
        p = Path(raw)
        if not p.exists():
            p = vi_dir / Path(raw).name
        if not p.exists():
            continue
        try:
            img = Image.open(p).convert("RGB")
        except Exception:
            continue
        # normalize height to 160px for the strip
        scale_h = 160 / img.height
        img = img.resize((int(img.width * scale_h), 160))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        faction = {"empire": "帝", "alliance": "同"}.get(it.get("faction", ""), "")
        name = f"[{faction}] {it['name']}" if faction else it["name"]
        cards.append({"name": name, "img": base64.b64encode(buf.getvalue()).decode()})
    cards.sort(key=lambda c: c["name"])
    return cards


GINEI = Path(".omo/work/gineipaedia")


def gineipaedia_reference_cards() -> list[dict]:
    """368 canon characters from the Gineipaedia wiki dump: EN+JA name + labeled portrait image."""
    chars_path = GINEI / "characters.json"
    img_root = GINEI / "images"
    if not chars_path.exists() or not img_root.exists():
        return []
    # index extracted files by normalized basename (MediaWiki: spaces->underscores, hashed subdirs)
    by_name = {}
    for p in img_root.rglob("*"):
        if p.is_file():
            by_name.setdefault(p.name.lower(), p)
    cards = []
    for c in json.loads(chars_path.read_text(encoding="utf-8")):
        img_name = (c.get("img") or "").strip().replace(" ", "_")
        if not img_name:
            continue
        p = by_name.get(img_name.lower())
        if p is None:
            continue
        try:
            img = Image.open(p).convert("RGB")
        except Exception:
            continue
        img = img.resize((max(1, int(img.width * (160 / img.height))), 160))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        faction = "帝" if any("Imperial" in x for x in c.get("cats", [])) else \
                  "同" if any("FPA" in x or "Alliance" in x for x in c.get("cats", [])) else ""
        label = f"[{faction}] {c['en']}" if faction else c["en"]
        if c.get("ja"):
            label += f" / {c['ja']}"
        cards.append({"name": label, "img": base64.b64encode(buf.getvalue()).decode()})
    cards.sort(key=lambda c: c["name"])
    return cards


def build() -> None:
    catalog = json.loads((IDKIT / "faces.json").read_text(encoding="utf-8"))
    hed = load_hed()
    known = existing_identities()
    cards = []
    for atlas in ("oem", "oam", "o"):
        data = (FACE / f"{atlas}.tcf").read_bytes()
        for f in catalog[atlas]["faces"]:
            slot = f["slot"]
            off, sz = hed[slot]
            img = decode(data[off:off + sz])
            if img is None:
                continue
            ident = known.get((atlas, slot), {})
            name = ident.get("identified_name_romaji") or ident.get("identified_name_ja") or ""
            conf = ident.get("confidence", "")
            dup = len(f.get("slots", [slot]))
            cards.append({
                "atlas": atlas, "slot": slot, "slots": f.get("slots", [slot]), "dup": dup,
                "img": b64png(img), "name": name, "conf": conf,
            })
    cards_json = json.dumps(cards, ensure_ascii=False)
    vi_json = json.dumps(vi_reference_cards(), ensure_ascii=False)
    ginei_json = json.dumps(gineipaedia_reference_cards(), ensure_ascii=False)
    html = """<!doctype html><html lang=ko><meta charset=utf-8>
<title>LOGH VII 캐논 얼굴 검수</title>
<style>
 body{background:#16161c;color:#ddd;font-family:'Malgun Gothic',sans-serif;margin:0}
 header{position:sticky;top:0;background:#1f1f29;padding:10px 16px;display:flex;gap:12px;align-items:center;z-index:9;box-shadow:0 2px 8px #0008}
 header input[type=text]{background:#2a2a36;border:1px solid #444;color:#eee;padding:6px 10px;border-radius:6px;width:220px}
 header button{background:#3d6df2;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold}
 header .cnt{color:#9ad;margin-left:auto}
 h2{padding:14px 16px 0;color:#9ad}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:12px 16px}
 .card{background:#222230;border-radius:8px;padding:8px;text-align:center;border:2px solid transparent}
 .card.named{border-color:#3d8a4f}
 .card.confirmed{border-color:#e8c34a}
 .card img{width:128px;height:160px;image-rendering:auto;border-radius:4px}
 .card .slot{font-size:11px;color:#888;margin:4px 0 2px}
 .card input{width:95%;background:#2a2a36;border:1px solid #444;color:#fff;padding:5px;border-radius:5px;font-size:12px}
 .card select{width:98%;background:#2a2a36;border:1px solid #444;color:#bbb;margin-top:4px;font-size:11px;border-radius:5px}
</style>
<header>
 <b>LOGH VII 캐논 얼굴 검수</b>
 <input type=text id=q placeholder="이름/슬롯 검색…" oninput=filter()>
 <label><input type=checkbox id=onlyblank onchange=filter()> 미식별만</label>
 <button onclick=exportJson()>내보내기 (JSON)</button>
 <button onclick=toggleRef() id=refbtn style="background:#555">레퍼런스 ▼</button>
 <span class=cnt id=cnt></span>
</header>
<div id=refpanel style="display:none;position:sticky;top:52px;background:#191922;z-index:8;border-bottom:2px solid #333;padding:6px 16px">
 <div style="margin-bottom:6px">
  <button id=tabvi onclick="refTab('vi')" style="background:#3d6df2;color:#fff;border:0;padding:5px 12px;border-radius:6px;cursor:pointer">은영전6 (112)</button>
  <button id=tabgn onclick="refTab('gn')" style="background:#555;color:#fff;border:0;padding:5px 12px;border-radius:6px;cursor:pointer">애니/위키 (Gineipaedia)</button>
  <input type=text id=refq placeholder="이름 검색… (한국어/영문/일문)" oninput=refFilter()
   style="background:#2a2a36;border:1px solid #444;color:#eee;padding:5px 10px;border-radius:6px;width:260px;margin-left:8px">
 </div>
 <div id=refstrip style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px"></div>
</div>
<div id=root></div>
<script>
const CARDS = __CARDS__;
const VI = __VI__;
const GN = __GN__;
const root = document.getElementById('root');
const LABELS = {"oem":"제국 남성 (oem)","oam":"동맹 남성 (oam)","o":"기타/여성/파일럿 (o)"};
let secs = {};
for (const a of ["oem","oam","o"]) {
  const h = document.createElement('h2'); h.textContent = LABELS[a]; root.appendChild(h);
  const g = document.createElement('div'); g.className='grid'; root.appendChild(g); secs[a]=g;
}
for (const c of CARDS) {
  const d = document.createElement('div');
  d.className = 'card' + (c.conf==='confirmed' ? ' confirmed' : (c.name ? ' named' : ''));
  d.dataset.atlas=c.atlas; d.dataset.slot=c.slot;
  d.innerHTML = `<img src="data:image/png;base64,${c.img}">
   <div class=slot>${c.atlas} #${c.slot}${c.dup>1?' ×'+c.dup:''}</div>
   <input type=text placeholder="이름 (모르면 비움)" value="${c.name.replace(/"/g,'&quot;')}">
   <select><option value="">신뢰도…</option>
     <option ${c.conf==='confirmed'?'selected':''}>confirmed</option>
     <option ${c.conf==='probable'?'selected':''}>probable</option>
     <option ${c.conf==='weak'?'selected':''}>weak</option></select>`;
  d.querySelector('input').addEventListener('input',e=>{
    d.classList.toggle('named', !!e.target.value.trim()); count();});
  secs[c.atlas].appendChild(d);
}
function count(){
  const named=[...document.querySelectorAll('.card input')].filter(i=>i.value.trim()).length;
  document.getElementById('cnt').textContent = `식별 ${named} / ${CARDS.length}`;
}
function filter(){
  const q=document.getElementById('q').value.toLowerCase();
  const ob=document.getElementById('onlyblank').checked;
  for (const d of document.querySelectorAll('.card')){
    const name=d.querySelector('input').value.toLowerCase();
    const hit=!q || name.includes(q) || d.dataset.slot===q;
    const blankok=!ob || !name;
    d.style.display=(hit&&blankok)?'':'none';
  }
}
// In-page labeled reference strips: LOGH VI game portraits (KR names) + Gineipaedia anime/wiki
// portraits (EN+JA names). Tabbed; both searchable — compare without leaving the page.
const strip=document.getElementById('refstrip');
let refMode='vi';
function renderRef(){
  strip.innerHTML='';
  const src = refMode==='vi' ? VI : GN;
  for (const v of src){
    const e=document.createElement('div');
    e.style.cssText='text-align:center;flex:0 0 auto';
    e.innerHTML=`<img src="data:image/png;base64,${v.img}" style="height:160px;border-radius:4px">
      <div style="font-size:12px;color:#ffd97a;max-width:130px">${v.name}</div>`;
    e.dataset.name=v.name.toLowerCase();
    strip.appendChild(e);
  }
  refFilter();
}
function refTab(m){
  refMode=m;
  document.getElementById('tabvi').style.background = m==='vi' ? '#3d6df2' : '#555';
  document.getElementById('tabgn').style.background = m==='gn' ? '#3d6df2' : '#555';
  renderRef();
}
function toggleRef(){
  const p=document.getElementById('refpanel');
  const open=p.style.display==='none';
  p.style.display=open?'':'none';
  document.getElementById('refbtn').textContent='레퍼런스 '+(open?'▲':'▼');
  if(open && !strip.children.length) renderRef();
}
function refFilter(){
  const q=document.getElementById('refq').value.toLowerCase();
  for (const e of strip.children) e.style.display=(!q||e.dataset.name.includes(q))?'':'none';
}
function exportJson(){
  const out=[];
  for (const d of document.querySelectorAll('.card')){
    const name=d.querySelector('input').value.trim();
    if(!name) continue;
    const conf=d.querySelector('select').value||'probable';
    const card=CARDS.find(c=>c.atlas===d.dataset.atlas && String(c.slot)===d.dataset.slot);
    out.push({vii_atlas:d.dataset.atlas, vii_slot:+d.dataset.slot, duplicate_slots:card.slots,
              identified_name_romaji:name, name_source:'human-review-html', confidence:conf});
  }
  const blob=new Blob([JSON.stringify({identities:out},null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='portrait-identities.review.json'; a.click();
}
count();
</script></html>"""
    html = html.replace("__CARDS__", cards_json).replace("__VI__", vi_json).replace("__GN__", ginei_json)
    out = IDKIT / "review.html"
    out.write_text(html, encoding="utf-8")
    print(f"review page -> {out}  ({len(cards)} unique faces, prefilled {sum(1 for c in cards if c['name'])})")


if __name__ == "__main__":
    build()
