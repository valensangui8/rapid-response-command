import { Press_Start_2P, VT323 } from "next/font/google";
import ResyDashboard from "@/components/ResyDashboard";

const body = VT323({ weight: "400", subsets: ["latin"], variable: "--font-pixel" });
const head = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-pixel-head" });

export const metadata = { title: "Resy Down — Fallback Host" };

export default function Page() {
  return (
    <div className={`${body.variable} ${head.variable}`}>
      <ResyDashboard />
    </div>
  );
}
