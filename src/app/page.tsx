import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";

export default function Home() {
  const principal = getPrincipal();
  redirect(principal ? "/dashboard" : "/login");
}
