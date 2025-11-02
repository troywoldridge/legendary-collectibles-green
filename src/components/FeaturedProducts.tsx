"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { FEATURED } from "@/data/featured";
import { cfUrl } from "@/lib/cf";

export default function FeaturedProducts() {
  return (
    <section className="py-12">
      <div className="container mx-auto max-w-7xl px-4">
        <h2 className="text-center text-2xl font-semibold text-slate-900 mb-10">
          Featured Products
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURED.map((item, i) => {
            // Use a real variant you have: "saleCard" (or "card"/"public")
            const src = item.cfId ? cfUrl(item.cfId, "saleCard") : undefined;

            return (
              <motion.div
                key={item.href}
                className="group relative rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-shadow bg-white"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
              >
                <Link href={item.href} className="block">
                  <div className="relative w-full aspect-square">
                    {src ? (
                      <Image
                        src={src}
                        alt={item.alt ?? item.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center bg-slate-100 text-slate-500 text-xs">
                        No image
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-primary-600 text-white text-xs font-medium px-2 py-1 rounded-md">
                      {item.tag}
                    </div>
                  </div>

                  <div className="p-4 text-center">
                    <h3 className="text-sm font-medium text-slate-900 line-clamp-2 mb-1">
                      {item.title}
                    </h3>
                    <p className="text-primary-600 font-semibold text-base">
                      {item.price}
                    </p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
