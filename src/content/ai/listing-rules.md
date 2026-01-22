# Listing Rules & Normalization (AI Companion Spec)
Legendary Collectibles — Phase 2 Product Listing Generator Rules

This document defines normalization rules for titles, variants, grading, condition language, and per-game formatting. Use these rules when generating:
- canonicalTitle
- bullets
- description
- conditionNotes
- seoMetaDescription
- merchantShortDescription
- tags

---

## 1) Core Principles (Non-negotiable)

1) Be factual and photo-friendly
- Never claim perfection or guarantee outcomes.
- Avoid subjective hype. Use collector-trust language.

2) Consistency > creativity
- Prefer stable formats and predictable phrasing.
- A listing should “look like Legendary Collectibles wrote it.”

3) Condition and grading rules
- If graded: lead with grader + grade.
- If ungraded: lead with condition.
- Never invent a grade or condition.

4) Marketplace safety
- Merchant-friendly language.
- No prohibited claims like “pack fresh,” “PSA 10 candidate,” “investment,” “guaranteed.”

---

## 2) Condition Normalization

### 2.1 Abbreviation → full text mapping
- NM  -> Near Mint
- LP  -> Lightly Played
- MP  -> Moderately Played
- HP  -> Heavily Played
- DMG -> Damaged

### 2.2 Preferred phrasing
- Use full text in customer-facing output:
  - Title: “Near Mint” (not “NM”)
  - Bullets: “Condition: Near Mint”
  - Description: “listed as Near Mint”

### 2.3 Condition notes template (ungraded)
Always include:
- condition label
- variability note (minor print/handling imperfections possible)
- photo reference

Template:
"This card is listed as {ConditionFull}. Minor manufacturing imperfections or light handling marks may be present—please refer to photos for the exact condition of the copy you’ll receive."

---

## 3) Grading Normalization

### 3.1 Graded output trigger
If product.isGraded = true OR product.grader is not null OR product.gradeX10 is not null:
- treat listing as graded

### 3.2 Grader naming (output)
- Output the grader as a short brand name when possible:
  - PSA, BGS, CGC
- If grader value is unknown, output "Graded" and omit brand.

### 3.3 Grade label rules
- Prefer: "PSA 10", "BGS 9.5", "CGC 9"
- If only gradeX10 exists, display gradeX10 as the grade number.
- Do not add decimals unless provided by your DB (grade_x10 is integer in DB).

### 3.4 PSA grade descriptor (allowed only when exact)
Allowed descriptor terms ONLY when grade is exact:
- PSA 10 -> "Gem Mint"
- PSA 9  -> "Mint"
- PSA 8  -> "Near Mint-Mint"

If grader is not PSA, do not attach PSA-specific descriptors.

### 3.5 Graded condition notes template
Template:
"This card has been professionally graded and encapsulated by {Grader}. The assigned grade reflects {Grader}’s evaluation at the time of grading. Please refer to photos for the exact slab and label details."

---

## 4) Variant / Subtitle Handling

product.subtitle may contain variant hints such as:
- Reverse Holo, Holo, Full Art, Alt Art, Secret Rare, Promo, 1st Edition, Unlimited, Foil, Non-Foil
- For Yu-Gi-Oh: "1st Edition", "Unlimited", "Starlight Rare", "Ghost Rare"
- For MTG: "Foil", "Borderless", "Showcase", "Extended Art"

### 4.1 Where variant info should appear
- Bullets: yes (ideal)
- Tags: yes
- Description: yes (1 sentence max)
- Canonical title: only if needed to disambiguate

### 4.2 When to include variant in canonical title
Include subtitle/variant in title ONLY if:
- it prevents confusion with another common version, OR
- the base name without it would be ambiguous in search results

If included, format it like:
"{Name} {Variant} ({Number}) – {Condition/Grade} {Game} Card"

Example:
"Pikachu Reverse Holo (047/182) – Near Mint Pokémon Card"

---

## 5) Title Construction Rules (Per Format)

### 5.1 Common building blocks
- Name: product.titleBase
- Number: product.cardNumber (from source_number)
- Set: product.setName (from source_set_name)
- ConditionFull: derived from product.condition
- Grade: derived from grader + gradeX10

### 5.2 Singles (ungraded)
Format:
"{Name}{Variant?} ({Number?}) – {ConditionFull} {GameName} Card{ • SetName?}"

Example:
"Misty’s Starmie (047/182) – Near Mint Pokémon Card • Surging Sparks"

### 5.3 Graded (slab)
Format:
"{Name}{Variant?} ({Number?}) – {Grader} {Grade} {GameName} Card{ • SetName?}"

Example:
"Charizard VMAX (SV107) – PSA 10 Pokémon Card"

### 5.4 Sealed product
If sealed = true OR format indicates sealed:
Format:
"{ProductName} – Sealed {GameName} Product{ • SetName?}"

If you have product types (ETB, Booster Box, Booster Pack, Tin), include that in Name/Variant.

Example:
"Scarlet & Violet Booster Box – Sealed Pokémon Product"

### 5.5 Accessories
Format:
"{Name} – {GameName} Accessory"

Example:
"Ultra Pro Deck Box – Pokémon Accessory"

### 5.6 GameName mapping (display)
- pokemon -> Pokémon
- yugioh -> Yu-Gi-Oh!
- mtg -> Magic: The Gathering
- sports -> Sports Card
- other -> Trading Card

---

## 6) Card Number Normalization (source_number)

source_number may look like:
- "047/182" (common Pokémon)
- "SV107" (promo style)
- "13/98" (older set style)
- "019/??" (unknown denominator)
- "DRI-047" (set shorthand)
- null

Rules:
- If source_number exists, output it exactly (trimmed).
- Do not “fix” it.
- Do not infer missing denominator.
- If it contains whitespace, collapse spaces.

Use in bullets as:
"Card Number: {source_number}"

Use in title as:
"({source_number})"

---

## 7) Set Name Normalization (source_set_name)

Rules:
- Output set name exactly as stored, trimmed.
- Avoid adding "Set:" in the title; use "• {SetName}" suffix when room.
- In bullets use:
"Set: {SetName}"

---

## 8) Bullets Rules (Per Game)

### 8.1 Bullet count & length
- 4–6 bullets total
- Each bullet <= 55 characters
- No emojis, no exclamation points

### 8.2 Bullet order (preferred)
1. Official release line (game-specific)
2. Set line (if present)
3. Card number line (if present)
4. Rarity/variant line (if present)
5. Condition or Grade line
6. Shipping/packaging line

### 8.3 Official release bullet templates
- Pokémon: "Official Pokémon TCG release"
- Yu-Gi-Oh!: "Official Yu-Gi-Oh! TCG release"
- MTG: "Official Magic: The Gathering release"
- Sports: "Authentic sports trading card"
- Other: "Authentic trading card product"

### 8.4 Yu-Gi-Oh card_kind support
If card_kind is present:
- Add bullet: "Card Type: Monster" (or Spell/Trap)

---

## 9) Description Rules (Per Game)

### 9.1 Length
- 3–5 sentences
- Plain English, collector-forward

### 9.2 Must include
- What it is (name + game)
- Set context (if setName exists)
- Who it’s for (collector/player/set builder)
- Photo reference (1 short sentence)
- Shipping trust line (sleeved/secured)

### 9.3 Shipping line options (choose one)
- "Ships sleeved and securely packaged for safe delivery."
- "Carefully packed to protect corners and surface during transit."
- For graded: "Ships securely protected to safeguard the slab."

### 9.4 Avoid
- "pack fresh"
- "investment"
- "guaranteed"
- "perfect centering"
- "PSA 10 candidate"

---

## 10) SEO Meta Description Rules

- Target 140–160 characters
- Include:
  - Name
  - Condition/Grade
  - Set if available
  - "Legendary Collectibles"
- No keyword stuffing

Examples:
- "Buy {Name} ({Number}) from {SetName} in {ConditionFull} condition. Authentic Pokémon card, securely shipped by Legendary Collectibles."

---

## 11) Merchant Short Description Rules

- 90–170 characters
- Factual, plain, compliant
- No hype, no exclamations, no all caps

Examples:
- "Near Mint {Name} ({Number}) Pokémon card from {SetName}. Authentic single, sleeved and securely packaged for shipping."

---

## 12) Tags Rules

- 6–12 tags
- lowercase
- max 3 words each
- include:
  - game tag (pokemon / yugioh / mtg)
  - set name (lowercased) if present
  - condition or grade
  - format (single / sealed / graded)
  - key variant (reverse holo, foil, 1st edition) if present
  - card number if present

Examples:
- "pokemon"
- "pokemon single"
- "surging sparks"
- "near mint"
- "047/182"
- "reverse holo" (if applicable)
- "psa 10" (if graded)

---

## 13) Banned Claims List (Must not appear)
- pack fresh
- minty
- perfect centering
- investment
- guaranteed
- psa 10 candidate
- flawless
- pristine

END OF RULES
