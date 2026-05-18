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

LIST_URL = "https://www.aidedd.org/dnd-filters/objets-magiques.php"
DETAIL_BASE_URL = "https://www.aidedd.org/dnd/om.php?vf={slug}"


ALLOWED_HTML_TAGS = frozenset({
    "table", "thead", "tbody", "tr", "th", "td",
    "br", "strong", "b", "em", "i",
    "ul", "ol", "li", "p",
})


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def links_to_em(node: Tag) -> None:
    """Replace <a> tags with <em> so spell/item name links keep italic emphasis.
    Mutates the node in-place."""
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
    Runs repeatedly until no more conversions are possible.
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


def slugify_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"['']", "-", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def extract_list_rows(html: str):
    soup = BeautifulSoup(html, "html.parser")
    items = []

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

            items.append({"name": name, "list_data": row_data})

    # Fallback : liens directs om.php
    if not items:
        for a in soup.select('a[href*="om.php"]'):
            name = clean_text(a.get_text(" ", strip=True))
            if name and len(name) > 1:
                items.append({"name": name, "list_data": {}})

    # Dédoublonnage
    unique = {}
    for item in items:
        key = clean_text(item["name"]).lower()
        if key not in unique:
            unique[key] = item
    return list(unique.values())

def table_to_text(table_tag) -> str:
    """Convertit un <table> HTML en texte formaté avec pipes."""
    rows = table_tag.find_all("tr")
    lines = []
    for row in rows:
        cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
        if cells:
            lines.append(" | ".join(cells))
    return "\n".join(lines)


def description_to_text(desc_node) -> str:
    """Convertit le div.description en texte propre, tableaux inclus."""
    if not desc_node:
        return ""

    parts = []
    for child in desc_node.children:
        if isinstance(child, str):
            text = re.sub(r"\s+", " ", child).strip()
            if text:
                parts.append(text)
        elif child.name == "br":
            # Saut de ligne — ignorer les br isolés, ils seront gérés par la jointure
            pass
        elif child.name == "table":
            parts.append(table_to_text(child))
        elif child.name in ("p", "div", "span", "em", "strong", "b", "i", "u"):
            # Vérifier s'il contient un tableau imbriqué
            inner_table = child.find("table")
            if inner_table:
                # Texte avant le tableau
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

    # Joindre les parties, aplatir les lignes vides multiples
    result = "\n\n".join(p for p in parts if p)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def description_to_html(desc_node) -> str:
    """Retourne le HTML nettoyé du div.description (sans le div lui-même)."""
    if not desc_node:
        return ""
    # Supprimer les <br> isolés en début/fin
    for br in desc_node.find_all("br"):
        # Remplacer br par \n dans le HTML
        br.replace_with("\n")
    inner = desc_node.decode_contents()
    # Nettoyer les lignes vides multiples
    inner = re.sub(r"\n{3,}", "\n\n", inner)
    return inner.strip()

def fetch_detail(session: requests.Session, name: str, timeout: float):
    slug = slugify_name(name)
    url = DETAIL_BASE_URL.format(slug=quote(slug))
    r = session.get(url, timeout=timeout)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    col1 = soup.select_one("div.col1")

    # Titre
    title_node = col1.find("h1") if col1 else soup.find("h1")
    title = clean_text(title_node.get_text(" ", strip=True)) if title_node else name

    # Type (ex: "Objet merveilleux, commun (nécessite un lien)")
    type_node = col1.select_one("div.type") if col1 else soup.select_one("div.type")
    item_type_raw = clean_text(type_node.get_text(" ", strip=True)) if type_node else ""

    # Parsing du type : "Armure (cotte de mailles), peu commun (nécessite un lien)"
    item_type = ""
    rarity = ""
    requires_attunement = False
    attunement_detail = ""

    if item_type_raw:
        # Chercher la rareté : commun|peu commun|peu courant|rare|très rare|légendaire|artefact
        rarity_pattern = re.compile(
            r"(commun|peu commun|peu courant|rare|très rare|légendaire|artefact)",
            re.IGNORECASE
        )
        rarity_match = rarity_pattern.search(item_type_raw)
        if rarity_match:
            rarity = rarity_match.group(1).lower()
            # Le type = tout ce qui précède la rareté
            item_type = item_type_raw[:rarity_match.start()].strip().rstrip(",").strip()
        else:
            item_type = item_type_raw

        # Lien (attunement)
        if "nécessite un lien" in item_type_raw.lower():
            requires_attunement = True
            # Détail du lien entre parenthèses après "nécessite un lien"
            attune_match = re.search(r"nécessite un lien\s*\(([^)]+)\)", item_type_raw, re.IGNORECASE)
            attunement_detail = attune_match.group(1).strip() if attune_match else ""

    # Description
    desc_node = col1.select_one("div.description") if col1 else soup.select_one("div.description")
    description = description_to_text(desc_node)
    description_html = description_to_html(BeautifulSoup(str(desc_node), "html.parser").select_one("div.description") if desc_node else None)

    # Source
    source_node = col1.select_one("div.source") if col1 else soup.select_one("div.source")
    source = clean_text(source_node.get_text(" ", strip=True)) if source_node else ""

    # Nom VO (lien trad)
    trad_node = col1.select_one("div.trad a") if col1 else soup.select_one("div.trad a")
    name_vo = clean_text(trad_node.get_text(" ", strip=True)) if trad_node else ""
    slug_vo = ""
    if trad_node and trad_node.get("href"):
        vo_match = re.search(r"vo=([^&]+)", trad_node["href"])
        if vo_match:
            slug_vo = vo_match.group(1)

    return {
        "name": title,
        "slug": slug,
        "slug_vo": slug_vo,
        "name_vo": name_vo,
        "detail_url": url,
        "item_type": item_type,
        "rarity": rarity,
        "requires_attunement": requires_attunement,
        "attunement_detail": attunement_detail,
        "description": description,
        "description_html": description_html,
        "source": source,
    }


def main():
    parser = argparse.ArgumentParser(description="Scrape AideDD magic items to JSON.")
    parser.add_argument("-o", "--output", default="aidedd_magic_items.json", help="Output JSON file path")
    parser.add_argument("--delay", type=float, default=0.35, help="Delay between requests (seconds)")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of items (0 = all, for testing)")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; AideDD-Scraper/1.0; +local-script)"
    })

    print(f"Fetching list from {LIST_URL} ...")
    list_resp = session.get(LIST_URL, timeout=args.timeout)
    list_resp.raise_for_status()
    list_items = extract_list_rows(list_resp.text)
    print(f"Found {len(list_items)} items in list.")

    if args.limit:
        list_items = list_items[:args.limit]

    results = []
    total = len(list_items)

    for i, item in enumerate(list_items, start=1):
        name = item["name"]
        try:
            detail = fetch_detail(session, name, args.timeout)
            detail["list_data"] = item.get("list_data", {})
            results.append(detail)
            print(f"[{i}/{total}] OK  {name}")
        except Exception as exc:
            print(f"[{i}/{total}] ERR {name} -> {exc}")
            results.append({
                "name": name,
                "slug": slugify_name(name),
                "detail_url": DETAIL_BASE_URL.format(slug=quote(slugify_name(name))),
                "error": str(exc),
                "list_data": item.get("list_data", {}),
            })

        time.sleep(max(0.0, args.delay))

    payload = {
        "source_list_url": LIST_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "count": len(results),
        "items": results,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(results)} magic items to {args.output}")


if __name__ == "__main__":
    main()