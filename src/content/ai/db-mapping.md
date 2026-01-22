# Legendary Collectibles Database Reference (AI-Readable)

This document defines the database fields relevant to generating product listings and how to map them into the Listing Generator input JSON.

## 1) Table: public.products

### Primary key
- products.id (uuid, NOT NULL)

### Core listing identity
- products.title (text, NOT NULL)  
  Human-facing product title currently stored in DB. May be raw/unstandardized.
- products.slug (text, NOT NULL, UNIQUE)  
  URL slug for product page.
- products.sku (text, nullable, UNIQUE when not null/empty)  
  SKU identifier.

### Classification
- products.game (enum game, NOT NULL)  
  Game type (e.g., pokemon, yugioh, mtg, etc.).
- products.format (enum product_format, NOT NULL)  
  Product format (e.g., single, sealed, etc.).
- products.sealed (boolean, NOT NULL, default false)  
  True if sealed product.
- products.card_kind (text, nullable)  
  Constraint: if present must be one of: monster | spell | trap (Yu-Gi-Oh specific).

### Grading / condition
- products.is_graded (boolean, NOT NULL, default false)  
  True if graded/slabbed.
- products.grader (enum grader, nullable)  
  Grading company (e.g., PSA/BGS/CGC depending on enum).
- products.grade_x10 (integer, nullable)  
  Numeric grade on a 10-scale (e.g., 10, 9, 8). (Interpretation depends on grader.)
- products.condition (enum card_condition, nullable)  
  Raw condition (e.g., nm/lp/mp/hp/dmg depending on enum).

### Pricing / inventory
- products.price_cents (integer, NOT NULL)  
  Listing price in cents.
- products.compare_at_cents (integer, nullable)  
  Optional "compare at" price in cents.
- products.inventory_type (enum inventory_type, NOT NULL, default 'stock')  
  Inventory model/type.
- products.quantity (integer, NOT NULL, default 0)  
  Current available quantity.
- products.status (enum product_status, NOT NULL, default 'draft')  
  Listing status (e.g., draft/active/etc.).

### Content fields (may be empty or AI-generated later)
- products.subtitle (text, nullable)  
  Extra variant text or short descriptor.
- products.description (text, nullable)  
  Long description currently stored in DB (may be overwritten/filled by generator).

### Shipping fields
- products.shipping_weight_lbs (numeric(6,2), nullable)  
  Shipping weight in lbs.
- products.shipping_class (text, nullable)  
  Shipping class label/category.

### Source (card DB reference fields)
These fields link a product to external card data sources.
- products.source_card_id (text, nullable)  
  External card identifier (e.g., tcgdex/scryfall/other).
- products.source_set_code (text, nullable)  
  External set code.
- products.source_set_name (text, nullable)  
  External set name (human readable).
- products.source_number (text, nullable)  
  External card number (e.g., "047/182" or "SV107").

### Timestamps
- products.created_at (timestamptz, NOT NULL, default now())
- products.updated_at (timestamptz, NOT NULL, default now())

---

## 2) Table: public.product_images

Used to attach one or more images to products.

### Columns
- product_images.id (uuid, NOT NULL)  
- product_images.product_id (uuid, NOT NULL)  
  FK -> products.id
- product_images.url (text, NOT NULL)  
  Image URL.
- product_images.alt (text, nullable)  
  Optional alt text.
- product_images.sort (integer, NOT NULL, default 0)  
  Lower sort = earlier / primary image.

### Indexing hints
- (product_id, sort) supports "get images in order"
- (product_id, url) is unique per product

---

# 3) Listing Generator Input JSON (Mapped from DB)

The generator consumes a single JSON object called `product`.

## 3.1 Canonical input shape (what the generator expects)

- id: string (uuid)
- titleBase: string
- slug: string
- sku: string | null

- game: string
- format: string
- sealed: boolean

- isGraded: boolean
- grader: string | null
- gradeX10: number | null
- condition: string | null

- priceCents: number
- compareAtCents: number | null
- quantity: number
- status: string

- subtitle: string | null
- description: string | null

- shippingWeightLbs: number | null
- shippingClass: string | null

- sourceCardId: string | null
- setCode: string | null
- setName: string | null
- cardNumber: string | null

- images: array of:
  - url: string
  - alt: string | null
  - sort: number

---

## 3.2 Exact DB -> JSON mapping rules

### Identity / routing
- product.id = products.id
- product.slug = products.slug
- product.sku = products.sku

### Base naming
- product.titleBase:
  - Preferred: products.title (trimmed)
  - If products.subtitle exists and contains variant info, subtitle is NOT appended here (subtitle stays separate)
- product.subtitle = products.subtitle
- product.description = products.description

### Classification
- product.game = products.game::text
- product.format = products.format::text
- product.sealed = products.sealed

### Grade / condition
- product.isGraded = products.is_graded
- product.grader = products.grader::text (or null)
- product.gradeX10 = products.grade_x10 (or null)
- product.condition = products.condition::text (or null)

### Pricing / inventory
- product.priceCents = products.price_cents
- product.compareAtCents = products.compare_at_cents
- product.quantity = products.quantity
- product.status = products.status::text

### Shipping
- product.shippingWeightLbs = products.shipping_weight_lbs (numeric)
- product.shippingClass = products.shipping_class

### Source fields -> listing fields
- product.sourceCardId = products.source_card_id
- product.setCode = products.source_set_code
- product.setName = products.source_set_name
- product.cardNumber = products.source_number

### Images
- product.images = SELECT product_images where product_images.product_id = products.id
  ordered by product_images.sort asc, created_at asc
  Each image includes: url, alt, sort

---

# 4) Notes for AI generation

- If product.isGraded = true:
  - Prefer grade output (grader + gradeX10) and avoid raw condition language unless condition is present AND relevant.
- If product.isGraded = false:
  - Prefer condition output and do not invent grades.
- If product.setName or product.cardNumber is missing:
  - Title generator should omit those parts cleanly.
- If product.subtitle contains "Reverse Holo", "Holo", "1st Edition", etc.:
  - Include that as a variant detail in bullets/tags where appropriate, but do not bloat the canonical title unless needed for disambiguation.
- Never invent claims like "pack fresh" or "perfect centering".
- Always reference photos implicitly for condition clarity.

END OF DB REFERENCE
