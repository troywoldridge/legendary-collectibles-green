// src/data/featured.ts
export type FeaturedProduct = {
  title: string;
  tag: string;
  price: string;
  href: string;
  cfId: string;
  alt: string;
};

export const FEATURED: FeaturedProduct[] = [
  {
    title: "POKEMON TCG: SCARLET AND VIOLET WHITE FLARE ELITE TRAINER BOX",
    tag: "Restock",
    price: "$82.99",
    href: "/products/sv-white-flare-etb",
    cfId: "f048bf2f-336c-4604-41ac-aa5ad1148700",
    alt: "POKEMON TCG: SCARLET AND VIOLET WHITE FLARE ELITE TRAINER BOX",
  },
  {
    title: "Yu-Gi-Oh! 25th Anniversary Tin",
    tag: "Hot",
    price: "$19.99",
    href: "/products/ygo-25th-tin",
    cfId: "9ecfc824-f626-4ea5-6e42-db0abf50b800",
    alt: "Yu-Gi-Oh! 25th Anniversary Tin",
  },
  {
    title: "MTG: Modern Horizons 3 Play Booster Box",
    tag: "Limited",
    price: "$219.99",
    href: "/products/mtg-mh3-play",
    cfId: "507d47c4-35ce-4ca7-e493-515d7e87d200",
    alt: "MTG Modern Horizons 3 Play Booster Box",
  },
  {
    title: "One Piece OP-07 Booster",
    tag: "New",
    price: "$99.99",
    href: "/products/op-07",
    cfId: "af2241bf-1004-41c1-d1a7-f1c8545f9500",
    alt: "One Piece OP-07 Booster Box",
  },
  {
    title: "PSA 10 Charizard V (SWSH 050)",
    tag: "Auction",
    price: "Bid Now",
    href: "/products/psa-charizard-060",
    cfId: "6c3585ed-4374-44e2-f0cd-fc0ee1006600",
    alt: "PSA 10 Charizard SWSH 060 slab",
  },
];
