import { z } from "zod";

const nullableString = z.string().nullable();
const nullableInt = z.number().int().nullable();
const nullableBool = z.boolean().nullable();

export const ListingJsonSchema = z.object({
  schemaVersion: z.literal("1.0.0"),

  product: z.object({
    id: nullableString,
    sku: nullableString,
    slug: nullableString,
    title: nullableString,
    subtitle: nullableString,
    game: nullableString,
    format: nullableString,
    sealed: nullableBool,

    isGraded: nullableBool,
    grader: nullableString,
    gradeX10: nullableInt,
    gradeLabel: nullableString,
    psaDescriptor: nullableString,

    conditionCode: nullableString,
    conditionLabel: nullableString,

    inventoryType: nullableString,
    quantity: nullableInt,
    status: nullableString,

    priceCents: nullableInt,
    compareAtCents: nullableInt
  }),

  tcg: z.object({
    cardId: nullableString,
    setId: nullableString,
    setName: nullableString,
    setSeries: nullableString,
    setReleaseDate: nullableString,
    number: nullableString,
    rarity: nullableString,
    artist: nullableString,
    imageSmall: nullableString,
    imageLarge: nullableString
  }),

  copy: z.object({
    shortTitle: nullableString,
    listingTitle: nullableString,
    highlights: z.array(z.string()),
    descriptionMd: nullableString,
    conditionNote: nullableString,
    gradingNote: nullableString,
    shippingSafetyNote: nullableString,
    photoAssumptionNote: z.literal("Photos represent the exact item you will receive.")
  }),

  seo: z.object({
    metaTitle: nullableString,
    metaDescription: nullableString,
    keywords: z.array(z.string())
  }),

  integrity: z.object({
    noHypeLanguage: z.literal(true),
    noUnverifiedClaims: z.literal(true),
    noInventedConditionOrGrade: z.literal(true),
    collectorSafe: z.literal(true),
    photoAware: z.literal(true),
    notes: z.array(z.string())
  })
});

export type ListingJson = z.infer<typeof ListingJsonSchema>;
