export const site = {
  name: "Legendary Collectibles",
  shortName: "Legendary",
  description:
    "Buy Pokémon, Yu-Gi-Oh!, Magic: The Gathering, and Funko Pop collectibles online. Trusted marketplace for TCG and pop culture fans.",
  url: "https://legendarycollectibles.com",
  ogImage: "/og-image.jpg",
  twitter: "@LegendaryShop", // ✅ added for layout.tsx
  email: "support@legendarycollectibles.com",        // primary
  adminEmail: "admin@legendary-collectibles.com", 
  phone: "+1-800-555-0123",

  address: {
    street: "123 Main Street",
    locality: "Orlando",
    region: "FL",
    postalCode: "32801",
    country: "US",
  },

  socials: {
    twitter: "https://twitter.com/LegendaryShop",
    facebook: "https://facebook.com/LegendaryCollectibles",
    instagram: "https://instagram.com/LegendaryCollectibles",
    tiktok: "https://tiktok.com/@LegendaryCollectibles",
    youtube: "https://www.youtube.com/@LegendaryCollectibles",
  },

  nav: [
     { label: "Home", href: "/" },
    { label: "Pokémon Sets", href: "/categories/pokemon/sets" },
    { label: "Search", href: "/search" }, // we'll add this page below
    { label: "Cart", href: "/cart" }, 
  ],

  cf: {
    accountHash: process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH || "",
  },
};
