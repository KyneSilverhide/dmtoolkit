#!/usr/bin/env python3
"""
Scraper for standard (non-magical) D&D 5e SRD items from aidedd.org.
Sources:
  - Weapons  : https://www.aidedd.org/regles/armes/
  - Armor    : https://www.aidedd.org/regles/armures/
  - Equipment: https://www.aidedd.org/regles/equipement/
  - Tools    : https://www.aidedd.org/regles/outils/

Usage:
    python scrape_aidedd_standard_items.py -o backend/src/data/aidedd_standard_items.json
"""

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

SOURCES = [
    {
        "url": "https://www.aidedd.org/regles/armes/",
        "category": "Armes",
    },
    {
        "url": "https://www.aidedd.org/regles/armures/",
        "category": "Armures",
    },
    {
        "url": "https://www.aidedd.org/regles/equipement/",
        "category": "Équipement d'aventurier",
    },
    {
        "url": "https://www.aidedd.org/regles/outils/",
        "category": "Outils",
    },
]

DETAIL_BASE_URL = "https://www.aidedd.org/dnd/equipement.php?vf={slug}"


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def slugify_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"['']", "-", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def extract_tables(html: str, category: str) -> list[dict]:
    """Extract all item rows from the page tables."""
    soup = BeautifulSoup(html, "html.parser")
    items = []

    current_section = category  # fallback section name

    for elem in soup.find_all(["h1", "h2", "h3", "h4", "table"]):
        if elem.name in ("h1", "h2", "h3", "h4"):
            current_section = clean_text(elem.get_text(" ", strip=True))
            continue
        # It's a table
        headers = [clean_text(th.get_text(" ", strip=True)) for th in elem.select("thead th")]
        if not headers:
            headers = [clean_text(th.get_text(" ", strip=True)) for th in elem.find_all("th")]
        rows = elem.select("tbody tr") or elem.select("tr")

        for tr in rows:
            tds = tr.find_all("td")
            if not tds:
                continue
            cells = [clean_text(td.get_text(" ", strip=True)) for td in tds]
            name = cells[0] if cells else ""
            if not name or name.lower() in ("nom", "arme", "armure"):
                continue

            list_data = {"section": current_section}
            if headers and len(headers) == len(cells):
                for k, v in zip(headers, cells):
                    if k and k.lower() != "nom":
                        list_data[k.lower()] = v
            else:
                for i, v in enumerate(cells[1:], start=2):
                    list_data[f"col_{i}"] = v

            # Extract price from list_data
            price = (
                list_data.get("prix", "")
                or list_data.get("coût", "")
                or list_data.get("col_2", "")
            )

            items.append({
                "name": name,
                "slug": slugify_name(name),
                "slug_vo": "",
                "name_vo": "",
                "detail_url": DETAIL_BASE_URL.format(slug=slugify_name(name)),
                "item_type": current_section,
                "rarity": "commun",
                "requires_attunement": False,
                "attunement_detail": "",
                "description": "",
                "description_html": "",
                "source": "Player's Handbook (SRD)",
                "list_data": list_data,
                "_category": category,
                "_price_raw": price,
            })

    # Deduplicate by slug
    seen = {}
    for item in items:
        if item["slug"] not in seen:
            seen[item["slug"]] = item
    return list(seen.values())


def main():
    parser = argparse.ArgumentParser(description="Scrape AideDD standard items to JSON.")
    parser.add_argument("-o", "--output", default="aidedd_standard_items.json")
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; AideDD-Scraper/1.0; +local-script)"
    })

    all_items = []
    seen_slugs = set()

    for source in SOURCES:
        print(f"Fetching {source['url']} ...")
        try:
            resp = session.get(source["url"], timeout=args.timeout)
            resp.raise_for_status()
        except Exception as e:
            print(f"  ERROR: {e}")
            continue

        items = extract_tables(resp.text, source["category"])
        added = 0
        for item in items:
            if item["slug"] not in seen_slugs:
                seen_slugs.add(item["slug"])
                # Remove internal helper keys
                item.pop("_category", None)
                item.pop("_price_raw", None)
                all_items.append(item)
                added += 1
        print(f"  -> {added} items extracted")

    payload = {
        "source_list_url": "https://www.aidedd.org/regles/",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "count": len(all_items),
        "items": all_items,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(all_items)} standard items to {args.output}")


if __name__ == "__main__":
    main()

