#!/usr/bin/env python3
import argparse
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup, Tag

LIST_URL = "https://www.aidedd.org/dnd-filters/sorts.php"
DETAIL_BASE_URL = "https://www.aidedd.org/dnd/sorts.php?vf={slug}"


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def slugify_spell_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"['']", "-", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def links_to_em(node: Tag) -> None:
    """Replace <a> tags with <em> so spell name links keep italic emphasis."""
    for a in list(node.find_all("a")):
        em = Tag(name="em")
        for child in list(a.children):
            em.append(child.extract())
        a.replace_with(em)


def convert_row_divs_to_tables(node: Tag) -> None:
    """
    Detect AideDD's CSS-table pattern: consecutive sibling <div> elements
    each containing exactly N >= 2 direct <p> children (and no other tags).
    Converts them to a proper HTML <table> (first row → <thead>, rest → <tbody>).
    Mutates the node in-place.
    """
    changed = True
    while changed:
        changed = False
        candidates = list(node.find_all(True)) + [node]
        for parent in candidates:
            tag_children = [c for c in parent.children if isinstance(c, Tag)]
            i = 0
            while i < len(tag_children):
                child = tag_children[i]
                if child.name != "div":
                    i += 1
                    continue
                ps = [c for c in child.children if isinstance(c, Tag) and c.name == "p"]
                others = [c for c in child.children if isinstance(c, Tag) and c.name != "p"]
                if len(ps) < 2 or others:
                    i += 1
                    continue
                ncols = len(ps)
                rows = [child]
                j = i + 1
                while j < len(tag_children):
                    sib = tag_children[j]
                    if sib.name != "div":
                        break
                    sib_ps = [c for c in sib.children if isinstance(c, Tag) and c.name == "p"]
                    sib_oth = [c for c in sib.children if isinstance(c, Tag) and c.name != "p"]
                    if len(sib_ps) != ncols or sib_oth:
                        break
                    rows.append(sib)
                    j += 1
                if len(rows) >= 2:
                    tbl = Tag(name="table")
                    thead = Tag(name="thead")
                    tbody = Tag(name="tbody")
                    tbl.append(thead)
                    tbl.append(tbody)
                    for ri, rd in enumerate(rows):
                        tr = Tag(name="tr")
                        rdps = [c for c in rd.children if isinstance(c, Tag) and c.name == "p"]
                        for p in rdps:
                            cell = Tag(name="th" if ri == 0 else "td")
                            for ch in list(p.children):
                                cell.append(ch.extract())
                            tr.append(cell)
                        (thead if ri == 0 else tbody).append(tr)
                    rows[0].replace_with(tbl)
                    for rd in rows[1:]:
                        rd.decompose()
                    changed = True
                    break
            if changed:
                break


def table_to_text(table_tag) -> str:
    rows = table_tag.find_all("tr")
    lines = []
    for row in rows:
        cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
        if cells:
            lines.append(" | ".join(cells))
    return "\n".join(lines)


def description_to_text(desc_node) -> str:
    if not desc_node:
        return ""

    parts = []
    for child in desc_node.children:
        if isinstance(child, str):
            text = re.sub(r"\s+", " ", child).strip()
            if text:
                parts.append(text)
        elif child.name == "br":
            pass
        elif child.name == "table":
            parts.append(table_to_text(child))
        elif child.name in ("p", "div", "span", "em", "strong", "b", "i", "u"):
            inner_table = child.find("table")
            if inner_table:
                raw = child.get_text(" ", strip=True)
                parts.append(re.sub(r"\s+", " ", raw).strip())
            else:
                text = re.sub(r"\s+", " ", child.get_text(" ", strip=True)).strip()
                if text:
                    parts.append(text)
        elif child.name in ("ul", "ol"):
            for li in child.find_all("li"):
                text = re.sub(r"\s+", " ", li.get_text(" ", strip=True)).strip()
                if text:
                    parts.append(f"• {text}")
        else:
            text = re.sub(r"\s+", " ", child.get_text(" ", strip=True)).strip()
            if text:
                parts.append(text)

    result = "\n\n".join(p for p in parts if p)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def description_to_html(desc_node) -> str:
    if not desc_node:
        return ""
    for br in desc_node.find_all("br"):
        br.replace_with("\n")
    inner = desc_node.decode_contents()
    inner = re.sub(r"\n{3,}", "\n\n", inner)
    return inner.strip()


def extract_list_rows(html: str):
    soup = BeautifulSoup(html, "html.parser")
    spells = []

    for table in soup.select("table"):
        headers = [clean_text(th.get_text(" ", strip=True)) for th in table.select("thead th")]
        rows = table.select("tbody tr") or table.select("tr")

        for tr in rows:
            tds = tr.find_all("td")
            if not tds:
                continue
            cells = [clean_text(td.get_text(" ", strip=True)) for td in tds]
            name = cells[0] if cells else ""
            if not name:
                continue
            row_data = {}
            if headers and len(headers) == len(cells):
                for k, v in zip(headers, cells):
                    row_data[k] = v
            else:
                for i, v in enumerate(cells, start=1):
                    row_data[f"col_{i}"] = v
            spells.append({"name": name, "list_data": row_data})

    if not spells:
        for a in soup.select('a[href*="sorts.php"]'):
            name = clean_text(a.get_text(" ", strip=True))
            if name and len(name) > 1:
                spells.append({"name": name, "list_data": {}})

    unique = {}
    for s in spells:
        key = clean_text(s["name"]).lower()
        if key not in unique:
            unique[key] = s
    return list(unique.values())


def extract_attributes(detail_soup: BeautifulSoup):
    attrs = {}

    class_map = {
        "d": "duree",
        "t": "temps_incantation",
        "c": "composantes",
        "r": "portee",
        "ecole": "ecole",
    }
    for css_class, out_key in class_map.items():
        node = detail_soup.select_one(f"div.{css_class}")
        if node:
            value = clean_text(node.get_text(" ", strip=True))
            if value:
                attrs[out_key] = value

    for tr in detail_soup.select("table tr"):
        th = tr.find("th")
        td = tr.find("td")
        if th and td:
            k = clean_text(th.get_text(" ", strip=True))
            v = clean_text(td.get_text(" ", strip=True))
            if k and v and k not in attrs:
                attrs[k] = v

    for dt in detail_soup.select("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            k = clean_text(dt.get_text(" ", strip=True))
            v = clean_text(dd.get_text(" ", strip=True))
            if k and v and k not in attrs:
                attrs[k] = v

    return attrs


def fetch_detail(session: requests.Session, name: str, timeout: float):
    slug = slugify_spell_name(name)
    url = DETAIL_BASE_URL.format(slug=quote(slug))
    r = session.get(url, timeout=timeout)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    col1 = soup.select_one("div.col1")

    title_node = col1.find("h1") if col1 else soup.find("h1")
    title = clean_text(title_node.get_text(" ", strip=True)) if title_node else name

    # Nom VO
    trad_node = col1.select_one("div.trad a") if col1 else soup.select_one("div.trad a")
    name_vo = clean_text(trad_node.get_text(" ", strip=True)) if trad_node else ""
    slug_vo = ""
    if trad_node and trad_node.get("href"):
        vo_match = re.search(r"vo=([^&]+)", trad_node["href"])
        if vo_match:
            slug_vo = vo_match.group(1)

    # Description — rich HTML version
    desc_node = col1.select_one("div.description") if col1 else soup.select_one("div.description")

    if desc_node:
        # Préparer une copie pour le HTML (avec conversions de tableaux et liens)
        desc_for_html = BeautifulSoup(str(desc_node), "html.parser").select_one("div.description")
        links_to_em(desc_for_html)
        convert_row_divs_to_tables(desc_for_html)
        description_html = description_to_html(desc_for_html)

        # Préparer une copie pour le texte brut
        desc_for_text = BeautifulSoup(str(desc_node), "html.parser").select_one("div.description")
        convert_row_divs_to_tables(desc_for_text)
        description = description_to_text(desc_for_text)
    else:
        # Fallback générique
        description_html = ""
        candidates = []
        for sel in ["article", "main", "#contenu", ".contenu", ".boxcontent", ".content"]:
            for n in soup.select(sel):
                txt = clean_text(n.get_text(" ", strip=True))
                if len(txt) > 60:
                    candidates.append(txt)
        description = max(candidates, key=len) if candidates else clean_text(soup.get_text(" ", strip=True))

    return {
        "name": name,
        "slug": slug,
        "slug_vo": slug_vo,
        "name_vo": name_vo,
        "detail_url": url,
        "attributes": extract_attributes(soup),
        "description": description,
        "description_html": description_html,
    }


def main():
    parser = argparse.ArgumentParser(description="Scrape AideDD spells list + details to JSON.")
    parser.add_argument("-o", "--output", default="aidedd_spells.json", help="Output JSON file path")
    parser.add_argument("--delay", type=float, default=0.35, help="Delay between detail requests (seconds)")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of spells (0 = all, for testing)")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; AideDD-Scraper/1.0; +local-script)"
    })

    print(f"Fetching list from {LIST_URL} ...")
    list_resp = session.get(LIST_URL, timeout=args.timeout)
    list_resp.raise_for_status()
    list_spells = extract_list_rows(list_resp.text)
    print(f"Found {len(list_spells)} spells in list.")

    if args.limit:
        list_spells = list_spells[:args.limit]

    result_spells = []
    total = len(list_spells)

    for i, item in enumerate(list_spells, start=1):
        name = item["name"]
        try:
            detail = fetch_detail(session, name, args.timeout)
            detail["list_data"] = item.get("list_data", {})
            result_spells.append(detail)
            print(f"[{i}/{total}] OK  {name}")
        except Exception as exc:
            print(f"[{i}/{total}] ERR {name} -> {exc}")
            result_spells.append({
                "name": name,
                "slug": slugify_spell_name(name),
                "detail_url": DETAIL_BASE_URL.format(slug=quote(slugify_spell_name(name))),
                "error": str(exc),
                "list_data": item.get("list_data", {}),
            })

        time.sleep(max(0.0, args.delay))

    payload = {
        "source_list_url": LIST_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "count": len(result_spells),
        "spells": result_spells,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(result_spells)} spells to {args.output}")


if __name__ == "__main__":
    main()
