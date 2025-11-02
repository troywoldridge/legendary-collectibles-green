"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative h-[90vh] flex items-center justify-center text-center overflow-hidden">
      {/* Background image */}
      <Image
        src="/mythic_background.png"
        alt="Legendary Collectibles Hero Background"
        fill
        priority
        className="object-cover brightness-[.75] saturate-150 contrast-125"
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-neutral-950/60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]" />

      {/* Hero Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 px-4 text-neutral-100 max-w-3xl mx-auto"
      >
        <h1 className="text-3xl md:text-5xl font-bold mb-4">
          WELCOME TO <span className="text-primary-400">LEGENDARY COLLECTIBLES</span>
        </h1>

        <p className="text-2xl md:text-4xl font-semibold mb-3">
          Rip, trade, and collect{" "}
          <span className="text-primary-300">Legendary cards</span>
        </p>

        <p className="text-base md:text-lg mb-8 text-neutral-200">
          Sealed heat, graded grails, and weekly drops—curated for real collectors. <br />
          Fast shipping. Authenticity guaranteed.
        </p>

        {/* Buttons */}
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          <Link
            href="/categories"
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition"
          >
            Browse Categories
          </Link>
          <Link href="/search" className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition">
            Search the Vault
          </Link>
          <Link
            href="/cart"
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
          >
            View Cart
          </Link>
        </div>

        {/* Quick tags */}
        <div className="flex flex-wrap justify-center gap-2 text-sm text-neutral-300">
          {["Pokémon", "Yu-Gi-Oh!", "Magic: The Gathering", "One Piece", "Dragon Ball", "Funko"].map(
            (tag) => (
              <span
                key={tag}
                className="border border-white/20 rounded-full px-3 py-1 hover:bg-white/10 transition"
              >
                {tag}
              </span>
            )
          )}
        </div>
      </motion.div>
    </section>
  );
}
