"use client";

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Stars } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const float = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 120, damping: 14 },
};

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 로그인된 사용자가 접근하면 메인 페이지로 리다이렉트
  // useAuth 훅의 onAuthStateChange에서 자동으로 처리되므로
  // 여기서는 추가적인 리다이렉트를 수행하지 않음 (무한 루프 방지)

  const validateForm = (formData: FormData): string | null => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return "올바른 이메일 형식을 입력해주세요.";
    }

    // 비밀번호 공백 방지
    if (!password || password.trim().length === 0) {
      return "비밀번호를 입력해주세요.";
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const validationError = validateForm(formData);

    if (validationError) {
      setError(validationError);
      return;
    }

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // 사용자 친화적인 오류 메시지로 변환
        let errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
        
        if (signInError.message.includes("Invalid login credentials")) {
          errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
        } else if (signInError.message.includes("Email not confirmed")) {
          errorMessage = "이메일 인증이 완료되지 않았습니다. 이메일을 확인해주세요.";
        } else if (signInError.message.includes("Too many requests")) {
          errorMessage = "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.";
        }

        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      // 로그인 성공 시 메인 페이지로 이동
      // onAuthStateChange에서 자동으로 리다이렉트되므로 여기서는 처리하지 않음
      // 무한 루프 방지를 위해 router.push 제거
    } catch (err) {
      setError("예상치 못한 오류가 발생했습니다. 다시 시도해주세요.");
      console.error("Login error:", err);
      setIsLoading(false);
    }
  };
  // 인증 상태 확인 중이면 로딩 표시
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  // 이미 로그인된 사용자는 리다이렉트 중이므로 아무것도 표시하지 않음
  if (user) {
    return null;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-4 py-10 dark:from-[#050815] dark:via-[#0b1024] dark:to-[#0d162f]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-10 top-12 size-48 rounded-full bg-indigo-300/30 blur-3xl dark:bg-indigo-500/20" />
        <div className="absolute right-6 bottom-16 size-56 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/20" />
        <motion.div
          className="absolute right-1/4 top-10 size-24 rounded-full bg-fuchsia-300/40 blur-3xl dark:bg-fuchsia-500/25"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 md:grid md:grid-cols-[1.1fr_0.9fr] md:items-center md:gap-12">
        <motion.section
          {...float}
          className="space-y-5 text-center md:text-left"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20 dark:bg-primary/20">
            <Sparkles className="size-4" aria-hidden />
            AI Todo Manager
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold leading-tight text-slate-900 dark:text-white sm:text-4xl">
              AI가 도와주는 스마트한 할 일 관리 (by Brian Chun)
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300">
              AI 생성·요약·정렬 기능으로 오늘의 우선순위를 빠르게 정리하세요.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            {[
              { color: "from-emerald-400 to-teal-500", label: "자연어 → 할 일" },
              { color: "from-sky-400 to-blue-500", label: "우선순위·마감 집중" },
              { color: "from-fuchsia-400 to-pink-500", label: "AI 일·주간 요약" },
            ].map((item) => (
              <motion.span
                key={item.label}
                className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${item.color} px-3 py-1 text-xs font-semibold text-white shadow-md shadow-black/10`}
                whileHover={{ scale: 1.05, y: -2 }}
                transition={{ type: "spring", stiffness: 250, damping: 18 }}
              >
                <Stars className="size-3.5" aria-hidden />
                {item.label}
              </motion.span>
            ))}
          </div>
        </motion.section>

        <motion.div {...float}>
          <Card className="relative overflow-hidden border-primary/10 bg-white/90 shadow-xl backdrop-blur-sm dark:border-primary/20 dark:bg-zinc-900/80">
            <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/15 blur-3xl dark:bg-primary/20" />
            <div className="pointer-events-none absolute -left-12 bottom-0 size-32 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

            <CardHeader className="relative pb-2">
              <CardTitle className="text-2xl font-semibold">로그인</CardTitle>
              <CardDescription>
                이메일과 비밀번호로 바로 시작해 보세요.
              </CardDescription>
            </CardHeader>

            <CardContent className="relative space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">비밀번호</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="8자 이상"
                    required
                    autoComplete="current-password"
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Spinner className="mr-2" />
                      로그인 중...
                    </>
                  ) : (
                    "로그인"
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="relative flex flex-col gap-3 border-t pt-4 text-sm text-slate-600 dark:border-zinc-800 dark:text-slate-300">
              <div className="flex w-full flex-col items-center justify-between gap-2 sm:flex-row">
                <span>처음 오셨나요?</span>
                <Link
                  href="/signup"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  회원가입 하러가기
                </Link>
              </div>
              <p className="text-center text-xs text-muted-foreground sm:text-left">
                한 번의 로그인으로 맞춤형 할 일 목록과 AI 요약을 받아보세요.
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

