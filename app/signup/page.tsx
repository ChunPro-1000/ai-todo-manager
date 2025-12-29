"use client";

import { useState, FormEvent } from "react";
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

const float = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 120, damping: 14 },
};

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateForm = (formData: FormData): string | null => {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // 이름 검증
    if (!name || name.trim().length === 0) {
      return "이름을 입력해주세요.";
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return "올바른 이메일 형식을 입력해주세요.";
    }

    // 비밀번호 길이 검증
    if (!password || password.length < 8) {
      return "비밀번호는 8자 이상이어야 합니다.";
    }

    // 비밀번호 확인 일치 검증
    if (password !== confirmPassword) {
      return "비밀번호가 일치하지 않습니다.";
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);
    const validationError = validateForm(formData);

    if (validationError) {
      setError(validationError);
      return;
    }

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name.trim(),
          },
        },
      });

      if (signUpError) {
        // 사용자 친화적인 오류 메시지로 변환
        let errorMessage = "회원가입 중 오류가 발생했습니다.";
        
        if (signUpError.message.includes("already registered")) {
          errorMessage = "이미 등록된 이메일입니다.";
        } else if (signUpError.message.includes("invalid email")) {
          errorMessage = "올바른 이메일 형식을 입력해주세요.";
        } else if (signUpError.message.includes("password")) {
          errorMessage = "비밀번호가 너무 짧거나 약합니다.";
        } else {
          errorMessage = signUpError.message;
        }

        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      // 성공 처리
      if (data.user) {
        // 이메일 확인이 필요한 경우
        if (data.user.email_confirmed_at === null) {
          setSuccessMessage(
            "회원가입이 완료되었습니다. 이메일을 확인하여 계정을 활성화해주세요."
          );
          // 3초 후 로그인 페이지로 이동
          setTimeout(() => {
            router.push("/login");
          }, 3000);
        } else {
          // 즉시 로그인된 경우 메인 페이지로 이동
          router.push("/");
        }
      }
    } catch (err) {
      setError("예상치 못한 오류가 발생했습니다. 다시 시도해주세요.");
      console.error("Signup error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-purple-50 via-white to-rose-50 px-4 py-10 dark:from-[#0f0515] dark:via-[#150b1f] dark:to-[#1a0f28]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-10 top-12 size-48 rounded-full bg-purple-300/30 blur-3xl dark:bg-purple-500/20" />
        <div className="absolute right-6 bottom-16 size-56 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-500/20" />
        <motion.div
          className="absolute right-1/4 top-10 size-24 rounded-full bg-amber-300/40 blur-3xl dark:bg-amber-500/25"
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
              AI 할 일 관리 웹 서비스(by Brain Chun)
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300">
              지금 시작하면 AI가 할 일을 자동으로 생성하고 요약해 드립니다.
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
            <div className="pointer-events-none absolute -left-12 bottom-0 size-32 rounded-full bg-purple-300/20 blur-3xl dark:bg-purple-500/10" />

            <CardHeader className="relative pb-2">
              <CardTitle className="text-2xl font-semibold">회원가입</CardTitle>
              <CardDescription>
                이메일과 비밀번호로 계정을 만들어 시작해 보세요.
              </CardDescription>
            </CardHeader>

            <CardContent className="relative space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {successMessage && (
                <Alert>
                  <AlertDescription>{successMessage}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="홍길동"
                    required
                    autoComplete="name"
                    disabled={isLoading}
                  />
                </div>
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
                    autoComplete="new-password"
                    disabled={isLoading}
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">비밀번호 확인</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
                    required
                    autoComplete="new-password"
                    disabled={isLoading}
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Spinner className="mr-2" />
                      처리 중...
                    </>
                  ) : (
                    "회원가입"
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="relative flex flex-col gap-3 border-t pt-4 text-sm text-slate-600 dark:border-zinc-800 dark:text-slate-300">
              <div className="flex w-full flex-col items-center justify-between gap-2 sm:flex-row">
                <span>이미 계정이 있으신가요?</span>
                <Link
                  href="/login"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  로그인 하러가기
                </Link>
              </div>
              <p className="text-center text-xs text-muted-foreground sm:text-left">
                회원가입 후 바로 AI 할 일 관리 기능을 사용할 수 있습니다.
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

