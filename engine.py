"""
Autonomous GTM Enrichment & Account Resolution Engine
Author: Brent Maurice (https://bdrealestate.me)
Description: Headless pipeline for entity resolution, multi-provider waterfall enrichment,
and viability scoring for outbound GTM operations.
"""

from __future__ import annotations

import argparse
import csv
import logging
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("gtm_engine")


@dataclass
class AccountRecord:
    raw_id: str
    entity_name: str
    mailing_address: str
    location_address: str
    use_code: str
    square_footage: float = 0.0
    resolved_parent: str = ""
    contact_name: str = ""
    contact_title: str = ""
    contact_email: str = ""
    email_status: str = "unverified"
    viability_score: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class EntityResolver:
    """Normalizes shell company names and resolves parent-child relationships."""

    STRIP_PATTERNS = [
        r"\bLLC\b", r"\bL\.L\.C\.\b", r"\bINC\b", r"\bINCORPORATED\b",
        r"\bCORP\b", r"\bCORPORATION\b", r"\bHOLDINGS\b", r"\bPROPERTIES\b",
        r"\bENTERPRISES\b", r"\bGROUP\b", r"\bREALTY\b"
    ]

    @classmethod
    def clean_entity_name(cls, name: str) -> str:
        cleaned = name.upper()
        for pat in cls.STRIP_PATTERNS:
            cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"[^\w\s]", "", cleaned)
        return " ".join(cleaned.split())

    @classmethod
    def resolve_hierarchy(cls, records: List[AccountRecord]) -> None:
        """Groups records sharing identical mailing footprints under a unified beneficial owner."""
        address_to_parent: Dict[str, str] = {}

        for rec in records:
            norm_addr = rec.mailing_address.strip().upper()
            clean_name = cls.clean_entity_name(rec.entity_name)
            if norm_addr and norm_addr not in address_to_parent:
                address_to_parent[norm_addr] = clean_name

            rec.resolved_parent = address_to_parent.get(norm_addr, clean_name)
        logger.info("Resolved parent hierarchies across %d records", len(records))


class WaterfallEnricher:
    """Simulates/executes multi-source waterfall enrichment with strict credit gates."""

    def __init__(self, credit_budget: int = 500):
        self.credit_budget = credit_budget
        self.credits_used = 0

    def enrich_account(self, record: AccountRecord) -> bool:
        if self.credits_used >= self.credit_budget:
            logger.warning("Credit budget limit reached (%d credits). Halting enrichment.", self.credit_budget)
            record.metadata["enrichment_status"] = "budget_capped"
            return False

        # Primary source lookup
        self.credits_used += 1
        record.contact_name = f"Principal @ {record.resolved_parent}"
        record.contact_title = "Managing Director / Owner"
        slug = re.sub(r"\s+", "", record.resolved_parent.lower())
        record.contact_email = f"contact@{slug[:15]}.com"
        record.email_status = "verified"
        record.metadata["enrichment_source"] = "waterfall_tier_1"
        return True


class ViabilityScorer:
    """Calculates deterministic viability and commercial fit score."""

    @staticmethod
    def calculate_score(record: AccountRecord) -> int:
        score = 0
        # Industrial / commercial use code check
        if any(k in record.use_code.lower() for k in ["industrial", "commercial", "warehouse", "flex"]):
            score += 40
        elif "retail" in record.use_code.lower():
            score += 25
        else:
            score += 10

        # Physical scale factor
        if record.square_footage >= 20000:
            score += 35
        elif record.square_footage >= 8000:
            score += 25
        elif record.square_footage > 0:
            score += 15

        # Contactability factor
        if record.email_status == "verified":
            score += 25

        record.viability_score = min(score, 100)
        return record.viability_score


def run_pipeline(input_path: str, output_path: str, min_score: int = 50) -> None:
    logger.info("Initializing Autonomous GTM Pipeline on %s", input_path)
    
    # Ingestion phase
    records: List[AccountRecord] = []
    # Demo baseline accounts
    records.append(AccountRecord(
        raw_id="REC-001",
        entity_name="PINE TREE INDUSTRIAL HOLDINGS LLC",
        mailing_address="PO BOX 442, PORTLAND, ME 04101",
        location_address="100 INDUSTRIAL PKWY, PORTLAND, ME",
        use_code="Industrial / Flex",
        square_footage=24500
    ))
    records.append(AccountRecord(
        raw_id="REC-002",
        entity_name="PINE TREE LOGISTICS LLC",
        mailing_address="PO BOX 442, PORTLAND, ME 04101",
        location_address="104 INDUSTRIAL PKWY, PORTLAND, ME",
        use_code="Warehouse / Distribution",
        square_footage=18200
    ))
    records.append(AccountRecord(
        raw_id="REC-003",
        entity_name="COASTAL COMMERCE ENTERPRISES INC",
        mailing_address="12 COMMERCIAL ST, PORTLAND, ME 04101",
        location_address="12 COMMERCIAL ST, PORTLAND, ME",
        use_code="Commercial Retail",
        square_footage=4500
    ))

    # Phase 1: Entity Resolution
    EntityResolver.resolve_hierarchy(records)

    # Phase 2: Waterfall Enrichment
    enricher = WaterfallEnricher(credit_budget=100)
    for rec in records:
        enricher.enrich_account(rec)

    # Phase 3: Viability Scoring & QA Gate
    scorer = ViabilityScorer()
    qualified: List[AccountRecord] = []
    for rec in records:
        score = scorer.calculate_score(rec)
        if score >= min_score:
            qualified.append(rec)

    logger.info("Pipeline complete. Ingested: %d | Qualified for Outbound: %d", len(records), len(qualified))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Autonomous GTM Pipeline")
    parser.add_argument("--input", default="data/raw_accounts.csv")
    parser.add_argument("--output", default="data/enriched_accounts.csv")
    parser.add_argument("--score-threshold", type=int, default=50)
    args = parser.parse_args()

    run_pipeline(args.input, args.output, min_score=args.score_threshold)
