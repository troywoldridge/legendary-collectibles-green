"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  /** current per-page value */
  value: number;
  /** list of allowed choices */
  options?: number[];
  /** query param name to use (default: "perPage") */
  paramName?: string;
  /** also reset this param to "1" on change (default: "page") */
  resetPageParam?: string;
  /** extra className (optional) */
  className?: string;
};

export default function PerPageSelect({
  value,
  options = [24, 30, 48, 60, 96, 120],
  paramName = "perPage",
  resetPageParam = "page",
  className = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams?.toString());
    next.set(paramName, e.target.value);
    next.set(resetPageParam, "1");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="text-white/80">Per page</span>
      <select
        value={String(value)}
        onChange={handleChange}
        className="rounded border border-white/20 bg-white/10 text-white px-2 py-1"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
