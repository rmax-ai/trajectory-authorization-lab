import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Trajectory Authorization Lab" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header><Link href="/">Trajectory Authorization Lab</Link><nav><Link href="/runs">Runs</Link><Link href="/scenarios">Scenarios</Link><Link href="/policies">Policies</Link></nav></header><main>{children}</main><footer>Research harness — read-only inspection UI</footer></body></html>;
}
