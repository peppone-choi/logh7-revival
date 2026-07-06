# -*- coding: utf-8 -*-
"""공식 매뉴얼 PDF 전체 페이지 텍스트+주석 덤프 도구.

docs/reference/*.pdf 3종(유니크)에서 페이지별 임베디드 텍스트와
Text 주석(annotation)을 전부 뽑아 JSON으로 저장한다.
manual_saved.pdf(=gin7manual-saved-starchart.pdf)는 갤럭시 데이터가
특수 Text 주석으로 들어있는 것으로 알려져 있으므로 주석을 반드시 포함.
"""
import json
import sys

import fitz  # PyMuPDF

PDFS = {
    "gin7manual.pdf": r"E:\logh7-revival\docs\reference\gin7manual.pdf",
    "gin7manual-cd-original.pdf": r"E:\logh7-revival\docs\reference\gin7manual-cd-original.pdf",
    "manual_saved.pdf": r"E:\logh7-revival\docs\reference\manual_saved.pdf",
}

OUT = r"E:\logh7-revival\.omo\work\manual-dump"


def dump(name, path):
    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        annots = []
        for a in page.annots() or []:
            info = a.info or {}
            annots.append({
                "type": a.type[1] if a.type else None,
                "title": info.get("title", ""),
                "content": info.get("content", ""),
                "rect": list(a.rect),
            })
        pages.append({
            "page": i + 1,  # 1-indexed
            "text": text,
            "annots": annots,
        })
    doc.close()
    return {"pdf": name, "page_count": len(pages), "pages": pages}


def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    for name, path in PDFS.items():
        d = dump(name, path)
        out = os.path.join(OUT, name.replace(".pdf", "") + ".json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        n_text = sum(1 for p in d["pages"] if p["text"].strip())
        n_annot = sum(len(p["annots"]) for p in d["pages"])
        print(f"{name}: {d['page_count']}p, text-pages={n_text}, annots={n_annot} -> {out}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
