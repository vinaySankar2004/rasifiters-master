"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/lib/auth/auth-provider";

const headlineText = "Hi, welcome to RaSi Fiters";
const subheadlineText =
  "Track your fitness journey by logging workouts and monitoring your progress!";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function SplashPage() {
  const router = useRouter();
  const { session, isBootstrapping } = useAuth();
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [ctaVisible, setCtaVisible] = useState(false);
  const [headlineComplete, setHeadlineComplete] = useState(false);

  useEffect(() => {
    if (!isBootstrapping && session) {
      router.replace("/programs");
    }
  }, [isBootstrapping, session, router]);

  useEffect(() => {
    let isMounted = true;
    setHeadline("");
    setSubheadline("");
    setCtaVisible(false);
    setHeadlineComplete(false);

    const typeText = async (
      text: string,
      setter: React.Dispatch<React.SetStateAction<string>>
    ) => {
      for (const char of text) {
        if (!isMounted) return;
        setter((prev) => prev + char);
        await sleep(42);
      }
    };

    const run = async () => {
      await typeText(headlineText, setHeadline);
      if (!isMounted) return;
      setHeadlineComplete(true);
      await sleep(350);
      await typeText(subheadlineText, setSubheadline);
      await sleep(280);
      if (!isMounted) return;
      setCtaVisible(true);
    };

    run();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col justify-between px-6 pb-10 pt-14 text-rf-text sm:px-10 sm:pt-16">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="space-y-3">
          <motion.h1
            className={`text-xl font-bold leading-snug text-balance sm:text-2xl ${
              headlineComplete ? "text-rf-text-muted" : "text-rf-text"
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {headline}
          </motion.h1>
          <p className="text-xl font-bold leading-snug text-rf-text text-balance sm:text-2xl">
            {subheadline}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <BrandMark size={150} />
      </div>

      <div className="flex justify-center pt-2">
        {ctaVisible && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <Link
              href="/login"
              className="button-primary button-primary--dark-white inline-flex min-w-[220px] items-center justify-center rounded-full px-10 py-3 text-base font-semibold"
            >
              Sign in
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
