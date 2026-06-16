"""
AI-Powered Transaction Categorization Service

Uses OpenAI structured output to categorize bank transactions into 6 simplified categories.
Implements self-learning via user corrections and rule-based fallback.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from openai import OpenAI
from sqlalchemy.orm import Session
from . import models
from .logging_utils import redact_description
from .transaction_categories import is_valid_category
import re
import logging

logger = logging.getLogger(__name__)


class TransactionCategorization(BaseModel):
    """Structured output for single transaction categorization"""
    category: str = Field(
        description=(
            "One of: salary, side_income, investment_income, reimbursements, other_income, "
            "groceries, household_home, dining_takeaways, shopping_clothing, "
            "travel_accommodation, entertainment, health_wellness, bills, "
            "subscriptions, transport, savings, loan_repayment, refund, transfers"
        )
    )
    confidence: float = Field(
        description="Confidence score between 0.0 and 1.0",
        ge=0.0,
        le=1.0
    )
    reasoning: Optional[str] = Field(
        description="Brief explanation of why this category was chosen",
        default=None
    )


class TransactionCategorizer:
    """AI-powered transaction categorization with rule-based fallback"""

    CATEGORIES = {
        # Income categories (CREDIT transactions)
        "salary": "Regular salary, wages, employer payments",
        "side_income": "Freelance income, consulting fees, side jobs, secondary income",
        "investment_income": "Dividends, interest received, rental income",
        "reimbursements": "Travel per diems, expense claims, friends paying you back for costs you fronted",
        "other_income": "Gifts received, bonuses, miscellaneous windfall credits",
        # Expense categories (DEBIT transactions)
        "groceries": "Food and drink purchased for home — supermarkets, butchers, delis, fresh produce stores",
        "household_home": "Recurring home costs and once-off home spend — electricity, cleaning services, garden supplies, homeware",
        "dining_takeaways": "Food or drink consumed out of home — restaurants, coffee shops, takeaways, Uber Eats, bar tabs",
        "shopping_clothing": "Retail purchases for personal use — clothing, accessories, homeware décor, online shopping (Takealot, Temu)",
        "travel_accommodation": "Trip-related costs — Airbnb, hotels, and any accommodation or travel bookings outside daily commuting",
        "entertainment": "Events, activities, and leisure spend — concert tickets, Webtickets, sports events, social outings",
        "health_wellness": "Physical health and body maintenance — physio, pharmacy, doctor visits, recovery treatments, personal care products",
        "bills": "Fixed essential obligations — levies, rates, insurance premiums, medical aid, bank charges",
        "subscriptions": "Recurring digital and membership services — streaming, phone contracts, gym memberships, software",
        "transport": "Getting around — fuel, Uber rides, parking, tolls, vehicle-related costs",
        "savings": "Money put to work for the future — TFSA, retirement annuity, unit trusts, investment contributions",
        "loan_repayment": "Debt servicing — bond repayments, personal loans, vehicle finance instalments",
        # Neutral
        "refund": "Merchant refunds, cashbacks, money back from retailers or services",
        "transfers": "Money movements between your own accounts, bank-to-bank transfers, inter-account transfers"
    }

    def __init__(self, openai_api_key: str, db: Session):
        self.client = OpenAI(api_key=openai_api_key)
        self.db = db

    def categorize_transaction(
        self,
        transaction: Dict,
        user_id: int,
        user_rules: Optional[List[models.CategorizationRule]] = None
    ) -> Dict:
        """
        Categorize a single transaction with rule-based + AI hybrid approach.

        Process:
        1. Check user-defined rules first (substring/regex match)
        2. If no rule match, use OpenAI with structured output
        3. Track user corrections as new rules (self-learning)

        Args:
            transaction: Transaction dict with 'description', 'amount', 'type'
            user_id: User ID for personalization
            user_rules: Optional pre-loaded user rules (for batch performance)

        Returns:
            {
                'category': str,
                'confidence': float,
                'method': 'rule'|'ai',
                'reasoning': str (optional)
            }
        """
        description = transaction.get('description', '')
        amount = transaction.get('amount', 0)
        txn_type = transaction.get('type', 'DEBIT')

        # Load rules if not provided
        if user_rules is None:
            user_rules = self._load_user_rules(user_id)

        # Step 1: Check user-defined rules (sorted by priority)
        for rule in sorted(user_rules, key=lambda r: r.priority, reverse=True):
            if not is_valid_category(rule.category):
                continue
            if self._matches_rule(description, rule.pattern):
                # Increment usage count
                rule.usage_count += 1
                self.db.commit()

                logger.info(
                    "Transaction matched rule: %s",
                    rule.category,
                    extra={
                        "description_preview": redact_description(description),
                        "rule_pattern": rule.pattern,
                    },
                )

                return {
                    'category': rule.category,
                    'confidence': 1.0,
                    'method': 'rule',
                    'reasoning': f'Matched rule: {rule.pattern}'
                }

        # Step 2: Use OpenAI for categorization
        return self._categorize_with_ai(description, amount, txn_type, user_id)

    def _matches_rule(self, description: str, pattern: str) -> bool:
        """Check if description matches rule pattern (case-insensitive substring or regex)"""
        try:
            # Try regex match first
            return bool(re.search(pattern, description, re.IGNORECASE))
        except re.error:
            # If invalid regex, fall back to substring match
            return pattern.lower() in description.lower()

    def _categorize_with_ai(
        self,
        description: str,
        amount: float,
        txn_type: str,
        user_id: int
    ) -> Dict:
        """
        Use OpenAI structured output to categorize transaction.

        Uses few-shot learning with user's historical corrections.
        """
        # Get user's past corrections for few-shot examples
        corrections = self._get_user_corrections(user_id, limit=5)

        # Build prompt with category definitions and examples
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(description, amount, txn_type, corrections)

        try:
            # Call OpenAI with structured output
            response = self.client.beta.chat.completions.parse(
                model="gpt-4o-2024-08-06",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=TransactionCategorization,
                temperature=0.3  # Low temperature for consistency
            )

            categorization = response.choices[0].message.parsed

            logger.info(
                "AI categorization completed: %s (confidence: %.2f)",
                categorization.category,
                categorization.confidence,
                extra={"description_preview": redact_description(description)},
            )

            return {
                'category': categorization.category,
                'confidence': categorization.confidence,
                'method': 'ai',
                'reasoning': categorization.reasoning
            }

        except Exception as e:
            logger.exception(
                "OpenAI categorization failed: %s: %s",
                type(e).__name__,
                e,
            )
            # Fallback to simple heuristic based on transaction type
            return self._fallback_categorization(txn_type)

    def _build_system_prompt(self) -> str:
        """Build system prompt with category definitions"""
        categories_desc = "\n".join([
            f"- **{cat}**: {desc}"
            for cat, desc in self.CATEGORIES.items()
        ])

        return f"""You are a financial transaction categorizer for South African banking transactions.

Your task is to categorize transactions into ONE of these categories:

{categories_desc}

Guidelines for CREDIT transactions (money IN):
- **salary**: Large regular deposits from an employer. Look for payroll descriptions, company names.
- **side_income**: Payments from clients, freelance platforms, secondary employers.
- **investment_income**: Interest credits from bank, dividend payments, rental deposits.
- **reimbursements**: Money back for costs you fronted — employer per diems, expense claims, friends or colleagues repaying you. NOT merchant refunds.
- **other_income**: Genuine windfalls — gifts, bonuses, once-off payments that are not reimbursements.
- **refund** (neutral, not income): Merchant reversals only — look for "REFUND", "REVERSAL", "CASHBACK" from a retailer or service you previously paid.

Guidelines for DEBIT transactions (money OUT):
- **transfers**: Bank-to-bank transfers, inter-account movements (look for: TRANSFER, FNB, CAPITEC, ABSA, STANDARD BANK, NEDBANK, "FROM/TO ACCOUNT", account numbers)
- **subscriptions**: Netflix, DSTV, Spotify, Apple, Google, Microsoft, gym, phone contracts, any recurring monthly service
- **bills**: Only fixed essential obligations — levies, rates, insurance premiums, medical aid, bank charges. Do NOT put subscriptions here.
- **loan_repayment**: Regular fixed payments to a bank or financial institution for a bond, home loan, personal loan, or vehicle finance. Distinct from bills.
- **groceries**: Food/drink bought for home — Woolworths, Pick n Pay, Checkers, Shoprite, butchers, delis.
- **household_home**: Electricity, cleaning services, garden supplies, homeware and home maintenance.
- **dining_takeaways**: Restaurants, coffee shops, bars, takeaways, Uber Eats, Mr D.
- **shopping_clothing**: Clothing, accessories, décor, online retail like Takealot or Temu.
- **travel_accommodation**: Airbnb, hotels, flights, and accommodation or travel bookings (not daily commuting).
- **entertainment**: Concert tickets, Webtickets, Computicket, sports events, social outings.
- **health_wellness**: Physio, pharmacy (Clicks, Dis-Chem), doctor visits, recovery treatments, personal care.
- **transport**: Fuel (Engen, Shell, BP, Sasol), Uber/Bolt rides, parking, tolls, vehicle costs.
- **savings**: Investment contributions (TFSA, RA, unit trusts). Moving money between your own accounts is transfers, NOT savings.

Provide your categorization with confidence score (0.0 to 1.0) and brief reasoning."""

    def _build_user_prompt(
        self,
        description: str,
        amount: float,
        txn_type: str,
        corrections: List[Dict]
    ) -> str:
        """Build user prompt with transaction details and few-shot examples"""
        prompt = f"""Categorize this transaction:

Description: {description}
Amount: R{amount:.2f}
Type: {txn_type}"""

        # Add few-shot examples from user corrections (self-learning)
        if corrections:
            prompt += "\n\nExamples of similar transactions you've categorized before:\n"
            for ex in corrections:
                prompt += f"\n- \"{ex['description']}\" (R{ex['amount']:.2f}) → {ex['category']}"

        return prompt

    def _get_user_corrections(self, user_id: int, limit: int = 5) -> List[Dict]:
        """Get user's past manual corrections for few-shot learning"""
        corrections = self.db.query(models.BankTransaction).filter(
            models.BankTransaction.user_id == user_id,
            models.BankTransaction.user_corrected == True
        ).order_by(models.BankTransaction.created_at.desc()).limit(limit).all()

        return [
            {
                'description': c.description,
                'amount': c.amount,
                'category': c.category
            }
            for c in corrections
        ]

    def _load_user_rules(self, user_id: int) -> List[models.CategorizationRule]:
        """Load user's categorization rules from database"""
        return self.db.query(models.CategorizationRule).filter(
            models.CategorizationRule.user_id == user_id,
            models.CategorizationRule.is_active == True
        ).all()

    def _fallback_categorization(self, txn_type: str) -> Dict:
        """Simple fallback when AI fails - categorize by transaction type"""
        if txn_type == "CREDIT":
            category = "other_income"
        else:
            # Leave debits uncategorized so they surface for manual review.
            # Uncategorized is represented as None (NULL), not the string "uncategorized".
            category = None

        return {
            'category': category,
            'confidence': 0.3,
            'method': 'fallback',
            'reasoning': 'Fallback categorization due to AI failure'
        }

    def categorize_batch(
        self,
        transactions: List[Dict],
        user_id: int
    ) -> List[Dict]:
        """
        Categorize multiple transactions efficiently.

        Args:
            transactions: List of transaction dicts
            user_id: User ID

        Returns:
            List of transactions with added categorization fields
        """
        # Load user rules once
        user_rules = self._load_user_rules(user_id)

        results = []

        for txn in transactions:
            categorization = self.categorize_transaction(txn, user_id, user_rules)
            results.append({
                **txn,
                'category': categorization['category'],
                'confidence': categorization['confidence'],
                'method': categorization['method']
            })

        logger.info(
            "Batch categorization completed: %d transactions",
            len(results),
            extra={"user_id": user_id},
        )
        return results

    def create_rule_from_transaction(
        self,
        transaction: models.BankTransaction,
        pattern: Optional[str] = None
    ) -> models.CategorizationRule:
        """
        Create a categorization rule from a transaction.

        Args:
            transaction: BankTransaction with user-corrected category
            pattern: Optional custom pattern (defaults to merchant name extraction)

        Returns:
            Created CategorizationRule
        """
        # Default pattern: use the merchant name from description
        if not pattern:
            pattern = self._extract_merchant_pattern(transaction.description)

        rule = models.CategorizationRule(
            user_id=transaction.user_id,
            pattern=pattern,
            category=transaction.category,
            priority=10,  # User-created rules get high priority
            created_from_correction=True
        )

        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)

        logger.info(
            "Rule created from transaction: %s",
            transaction.category,
            extra={"pattern": redact_description(pattern)},
        )

        return rule

    def _extract_merchant_pattern(self, description: str) -> str:
        """
        Extract merchant name pattern from transaction description.

        Simple heuristic: take first 2-3 words (merchant name) before location/extra info.
        """
        # Remove common prefixes
        cleaned = description.strip()
        for prefix in ["SMW ", "POS ", "CARD "]:
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):]

        # Take first 2-3 words
        words = cleaned.split()
        if len(words) >= 3:
            return " ".join(words[:3])
        return cleaned
