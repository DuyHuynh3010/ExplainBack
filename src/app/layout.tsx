import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
export const metadata: Metadata = { title: "ExplainBack — Understand by explaining", description: "Analyze learning sources and explore topic summaries, reference knowledge and source evidence." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="en"><body>{children}</body></html>;
}
