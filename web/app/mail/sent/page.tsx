import { redirect } from "next/navigation";

// Úthólfið býr nú í póst-miðstöðinni (/mail?box=sent)
export default function SentRedirect() {
  redirect("/mail?box=sent");
}
