import { Landing } from "@/components/landing/Landing";

// `/` is the public marketing landing page. The old animated welcome screen is kept
// at /splash (intentionally unlinked — reachable by direct URL only), not deleted.
export default function Home() {
  return <Landing />;
}
