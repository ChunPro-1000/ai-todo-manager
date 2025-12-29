"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export interface AuthUser {
  email: string;
  name: string;
  id: string;
}

export function useAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const redirectingRef = useRef(false);

  // 초기 사용자 상태 확인 및 인증 상태 리스너 설정
  useEffect(() => {
    const supabase = createClient();

    // 초기 사용자 상태 확인
    const checkUser = async () => {
      // 이미 리다이렉트 중이면 실행하지 않음
      if (redirectingRef.current) return;

      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        if (error || !authUser) {
          setUser(null);
          // 로그인 페이지가 아닌 경우에만 리다이렉트
          if (pathname !== "/login" && pathname !== "/signup") {
            redirectingRef.current = true;
            router.push("/login");
            // 리다이렉트 후 플래그 리셋 (약간의 지연 후)
            setTimeout(() => {
              redirectingRef.current = false;
            }, 1000);
          }
        } else {
          // 사용자 정보 설정
          const userEmail = authUser.email || "";
          const userName = authUser.user_metadata?.name || userEmail.split("@")[0] || "사용자";
          setUser({
            email: userEmail,
            name: userName,
            id: authUser.id,
          });

          // 로그인 페이지에 접근한 경우 메인 페이지로 리다이렉트
          if (pathname === "/login" || pathname === "/signup") {
            redirectingRef.current = true;
            router.push("/");
            // 리다이렉트 후 플래그 리셋 (약간의 지연 후)
            setTimeout(() => {
              redirectingRef.current = false;
            }, 1000);
          }
        }
      } catch (err) {
        console.error("User check error:", err);
        setUser(null);
        if (pathname !== "/login" && pathname !== "/signup") {
          redirectingRef.current = true;
          router.push("/login");
          setTimeout(() => {
            redirectingRef.current = false;
          }, 1000);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();

    // 인증 상태 변화 실시간 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const userEmail = session.user.email || "";
        const userName = session.user.user_metadata?.name || userEmail.split("@")[0] || "사용자";
        setUser({
          email: userEmail,
          name: userName,
          id: session.user.id,
        });
        setIsLoading(false);
        // 로그인 페이지에 있으면 메인 페이지로 이동 (리다이렉트 중이 아닐 때만)
        if (!redirectingRef.current) {
          const currentPath = window.location.pathname;
          if (currentPath === "/login" || currentPath === "/signup") {
            redirectingRef.current = true;
            router.push("/");
            setTimeout(() => {
              redirectingRef.current = false;
            }, 1000);
          }
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setIsLoading(false);
        // 로그인 페이지가 아니면 로그인 페이지로 이동 (리다이렉트 중이 아닐 때만)
        if (!redirectingRef.current) {
          const currentPath = window.location.pathname;
          if (currentPath !== "/login" && currentPath !== "/signup") {
            redirectingRef.current = true;
            router.push("/login");
            setTimeout(() => {
              redirectingRef.current = false;
            }, 1000);
          }
        }
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // 토큰 갱신 시 사용자 정보 업데이트
        const userEmail = session.user.email || "";
        const userName = session.user.user_metadata?.name || userEmail.split("@")[0] || "사용자";
        setUser({
          email: userEmail,
          name: userName,
          id: session.user.id,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]);

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout error:", error);
        throw new Error("로그아웃 중 오류가 발생했습니다.");
      }

      // 로그아웃 성공 시 상태는 onAuthStateChange에서 자동으로 처리됨
      // 여기서는 router.push를 호출하지 않아 무한 루프 방지
      // onAuthStateChange의 SIGNED_OUT 이벤트에서 리다이렉트 처리
    } catch (err) {
      console.error("Logout error:", err);
      throw err;
    } finally {
      setIsLoggingOut(false);
    }
  };

  return {
    user,
    isLoading,
    isLoggingOut,
    logout,
    isAuthenticated: !!user,
  };
}

