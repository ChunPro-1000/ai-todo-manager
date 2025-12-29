import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

// 응답 스키마 정의
const TodoGenerateSchema = z.object({
  title: z.string().describe("할 일의 제목"),
  description: z.string().optional().describe("할 일에 대한 상세 설명"),
  due_date: z.string().describe("마감일 (YYYY-MM-DD 형식)"),
  due_time: z.string().describe("마감 시간 (HH:mm 형식, 기본값: 09:00)"),
  priority: z.enum(["high", "medium", "low"]).describe("우선순위 (high, medium, low)"),
  category: z.string().optional().describe("카테고리 (업무, 개인, 학습, 기타 등)"),
});

export async function POST(request: NextRequest) {
  try {
    // API 키 확인
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_GENERATIVE_AI_API_KEY 환경 변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    // 요청 본문 파싱
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "잘못된 입력입니다. 요청 형식을 확인해주세요." },
        { status: 400 }
      );
    }

    let { text } = body;

    // 1. 입력 검증
    // 빈 문자열 체크 (타입 검증)
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "내용을 정확히 입력해 주세요." },
        { status: 400 }
      );
    }

    // 2. 전처리
    // 앞뒤 공백 제거
    const originalText = text;
    text = text.trim();
    
    // 빈 문자열 체크 (전처리 후)
    if (text.length === 0) {
      return NextResponse.json(
        { error: "내용을 정확히 입력해 주세요." },
        { status: 400 }
      );
    }

    // 최소 길이 제한 (2자)
    if (text.length < 2) {
      return NextResponse.json(
        { error: "입력 내용은 최소 2자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    // 최대 길이 제한 (500자)
    if (text.length > 500) {
      return NextResponse.json(
        { error: `입력 내용은 500자 이하여야 합니다. (현재: ${text.length}자)` },
        { status: 400 }
      );
    }

    // 연속된 공백을 하나로 통합
    text = text.replace(/\s+/g, " ");

    // 대소문자 정규화 (한글은 영향 없지만 영어의 경우 첫 글자만 대문자로)
    // 한글 입력이 주류이므로 원본 유지, 필요시 추가 처리

    // 특수 문자나 이모지 처리 (허용하되 검증)
    // 제어 문자나 위험한 문자는 제거
    const cleanedText = text.replace(/[\x00-\x1F\x7F]/g, "");
    
    // 1. 한글, 영문, 숫자 포함 여부 확인
    const hasMeaningfulContent = /[가-힣a-zA-Z0-9]/.test(cleanedText);
    
    if (!hasMeaningfulContent) {
      // 이모지만 있거나 의미없는 특수문자만 있는 경우
      return NextResponse.json(
        { error: "잘못된 입력입니다. 할 일을 설명하는 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    // 2. 반복되는 문자만 있는 경우 체크 (예: "00", "ㅇㅇ", "aaa", "111")
    const isRepeatingChars = /^(.)\1+$/.test(cleanedText);
    if (isRepeatingChars) {
      return NextResponse.json(
        { error: "잘못된 입력입니다. 의미있는 할 일 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    // 3. 의미없는 한글 자음/모음만 반복 (예: "ㅇㅇ", "ㄱㄱ", "ㅏㅏ")
    const isOnlyHangulJamo = /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(cleanedText);
    if (isOnlyHangulJamo) {
      return NextResponse.json(
        { error: "잘못된 입력입니다. 완성된 단어나 문장을 입력해주세요." },
        { status: 400 }
      );
    }

    // 4. 숫자만 반복하거나 의미없는 숫자 조합 (예: "00", "11", "123", "1234")
    const isOnlyNumbers = /^[0-9]+$/.test(cleanedText);
    if (isOnlyNumbers && cleanedText.length <= 4) {
      return NextResponse.json(
        { error: "잘못된 입력입니다. 할 일을 설명하는 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    // 전처리된 텍스트 사용
    text = cleanedText;

    // 현재 날짜/시간 정보 생성 (한국 시간 기준)
    const now = new Date();
    // 한국 시간대로 변환하여 YYYY-MM-DD 형식으로 변환
    const koreaDateString = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD 형식
    const koreaTimeString = now.toLocaleTimeString("en-US", { 
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }); // HH:mm 형식
    
    const currentDate = koreaDateString;
    const currentTime = koreaTimeString;

    // 현재 요일 계산 (한국 시간 기준)
    const koreaDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const dayOfWeek = koreaDate.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
    const daysOfWeek = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

    // Gemini API를 사용하여 자연어를 구조화된 데이터로 변환
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: TodoGenerateSchema,
      prompt: `다음 자연어 입력을 할 일 데이터로 변환해주세요. 반드시 JSON 형식으로 응답해야 합니다.

입력: "${text}"

현재 날짜/시간: ${currentDate} ${currentTime} (한국 시간)
현재 요일: ${daysOfWeek[dayOfWeek]}

=== 필수 변환 규칙 ===

1. 날짜 처리 규칙 (due_date):
   - "오늘" → ${currentDate} (현재 날짜)
   - "내일" → ${getTomorrowDate(currentDate)} (현재 날짜 + 1일)
   - "모레" → ${getDayAfterTomorrow(currentDate)} (현재 날짜 + 2일)
   - "이번 주 [요일]" → 가장 가까운 해당 요일의 날짜 (YYYY-MM-DD 형식)
   - "다음 주 [요일]" → 다음 주의 해당 요일 날짜 (YYYY-MM-DD 형식)
   - 날짜가 명시되지 않은 경우 → ${currentDate} (오늘 날짜)
   - 반드시 YYYY-MM-DD 형식으로 출력

2. 시간 처리 규칙 (due_time):
   - "아침" → 09:00
   - "점심" → 12:00
   - "오후" → 14:00
   - "저녁" → 18:00
   - "밤" → 21:00
   - "오전 N시" → 0N:00 형식 (예: "오전 10시" → 10:00)
   - "오후 N시" → (N+12):00 형식 (예: "오후 3시" → 15:00)
   - 시간이 명시되지 않은 경우 → 09:00 (기본값)
   - 반드시 HH:mm 형식으로 출력

3. 우선순위 판단 규칙 (priority):
   - "high": 다음 키워드가 포함된 경우 → "급하게", "중요한", "빨리", "꼭", "반드시"
   - "medium": 다음 키워드가 포함된 경우 → "보통", "적당히", 또는 키워드 없음
   - "low": 다음 키워드가 포함된 경우 → "여유롭게", "천천히", "언젠가"
   - 키워드가 없으면 문맥상 중요도 판단 (마감일이 가까우면 high, 멀면 low)

4. 카테고리 분류 규칙 (category):
   - "업무": "회의", "보고서", "프로젝트", "업무" 키워드 포함
   - "개인": "쇼핑", "친구", "가족", "개인" 키워드 포함
   - "건강": "운동", "병원", "건강", "요가" 키워드 포함
   - "학습": "공부", "책", "강의", "학습" 키워드 포함
   - 판단이 어려우면 "기타" 사용

5. 출력 형식:
   - 반드시 JSON 형식으로 응답
   - 모든 필드는 스키마에 정의된 형식을 정확히 준수
   - title: 할 일의 핵심 내용을 간결하게 추출 (10-30자 권장)
   - description: 필요시 상세 설명 추가 (선택사항)

=== 예시 ===
입력: "내일 오후 3시까지 중요한 팀 회의 준비하기"
출력: {
  "title": "팀 회의 준비",
  "description": "내일 오후 3시까지 있을 팀 회의를 위해 자료 준비",
  "due_date": "${getTomorrowDate(currentDate)}",
  "due_time": "15:00",
  "priority": "high",
  "category": "업무"
}

입력: "이번 주 금요일 점심에 친구 만나기"
출력: {
  "title": "친구 만나기",
  "description": "이번 주 금요일 점심에 친구와 약속",
  "due_date": "${getNextFriday(currentDate, dayOfWeek)}",
  "due_time": "12:00",
  "priority": "medium",
  "category": "개인"
}

=== 변환 결과 (JSON 형식으로 반환):`,
    });

    // 결과 검증 및 후처리
    const generated = result.object;

    // 3. 후처리
    // 날짜 검증 및 보정
    let dueDate = generated.due_date;
    try {
      // YYYY-MM-DD 형식 검증
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        // 형식이 맞지 않으면 Date 객체로 파싱 시도
        const dateObj = new Date(dueDate);
        if (isNaN(dateObj.getTime())) {
          // 유효하지 않은 날짜인 경우 오늘 날짜 사용
          dueDate = currentDate;
        } else {
          // YYYY-MM-DD 형식으로 정규화
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getDate()).padStart(2, "0");
          dueDate = `${year}-${month}-${day}`;
        }
      } else {
        // 형식은 맞지만 유효한 날짜인지 확인
        const dateObj = new Date(dueDate + "T00:00:00");
        if (isNaN(dateObj.getTime())) {
          dueDate = currentDate;
        }
      }

      // 생성된 날짜가 과거인지 확인 (오늘 이전이면 오늘로 변경)
      const dueDateObj = new Date(dueDate + "T00:00:00");
      const todayObj = new Date(currentDate + "T00:00:00");
      if (dueDateObj < todayObj) {
        // 과거 날짜인 경우 오늘 날짜로 변경
        dueDate = currentDate;
      }
    } catch {
      dueDate = currentDate;
    }

    // 시간 검증 및 보정
    let dueTime = generated.due_time;
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
      // 유효하지 않은 시간 형식인 경우 기본값 사용
      dueTime = "09:00";
    }

    // 우선순위 검증
    let priority = generated.priority;
    if (!["high", "medium", "low"].includes(priority)) {
      priority = "medium";
    }

    // 제목 후처리
    let title = generated.title || "할 일";
    // 제목이 너무 짧은 경우 (2자 미만)
    if (title.length < 2) {
      title = "할 일";
    }
    // 제목이 너무 긴 경우 (100자 초과 시 자르기)
    if (title.length > 100) {
      title = title.substring(0, 97) + "...";
    }
    // 제목 앞뒤 공백 제거 및 연속 공백 통합
    title = title.trim().replace(/\s+/g, " ");

    // 설명 후처리
    let description = generated.description;
    if (description) {
      // 설명이 너무 긴 경우 (500자 초과 시 자르기)
      if (description.length > 500) {
        description = description.substring(0, 497) + "...";
      }
      // 설명 앞뒤 공백 제거 및 연속 공백 통합
      description = description.trim().replace(/\s+/g, " ");
    }

    // 카테고리 후처리
    let category = generated.category || "기타";
    // 카테고리 앞뒤 공백 제거
    category = category.trim();
    if (category.length === 0) {
      category = "기타";
    }

    // 필수 필드 누락 시 기본값 설정 (이미 처리됨)
    // - title: "할 일" (기본값)
    // - due_date: currentDate (기본값)
    // - due_time: "09:00" (기본값)
    // - priority: "medium" (기본값)
    // - category: "기타" (기본값)

    // 응답 반환
    return NextResponse.json({
      title: title,
      description: description,
      due_date: dueDate,
      due_time: dueTime,
      priority: priority,
      category: category,
    });
  } catch (error: any) {
    console.error("AI 할 일 생성 오류:", error);

    // 4. 오류 응답 처리
    // 400: 잘못된 입력 (이미 위에서 처리됨)
    
    // 429: API 호출 한도 초과
    if (
      error?.message?.includes("quota") ||
      error?.message?.includes("rate limit") ||
      error?.message?.includes("429") ||
      error?.status === 429 ||
      error?.code === 429
    ) {
      return NextResponse.json(
        {
          error: "AI API 사용량 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // 500: AI 처리 실패
    if (
      error?.message?.includes("API key") ||
      error?.message?.includes("authentication") ||
      error?.message?.includes("unauthorized") ||
      error?.status === 401 ||
      error?.code === 401
    ) {
      return NextResponse.json(
        {
          error: "AI API 인증에 실패했습니다. 관리자에게 문의해주세요.",
          code: "AUTH_ERROR",
        },
        { status: 500 }
      );
    }

    // 기타 AI 처리 실패
    if (
      error?.message?.includes("model") ||
      error?.message?.includes("generation") ||
      error?.message?.includes("timeout")
    ) {
      return NextResponse.json(
        {
          error: "AI 처리 중 오류가 발생했습니다. 입력 내용을 확인하고 다시 시도해주세요.",
          code: "AI_PROCESSING_ERROR",
        },
        { status: 500 }
      );
    }

    // 일반적인 서버 오류
    return NextResponse.json(
      {
        error: "할 일 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        code: "INTERNAL_ERROR",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

// 내일 날짜를 계산하는 헬퍼 함수
function getTomorrowDate(currentDate: string): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

// 모레 날짜를 계산하는 헬퍼 함수
function getDayAfterTomorrow(currentDate: string): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 2);
  return date.toISOString().split("T")[0];
}

// 다음 금요일 날짜를 계산하는 헬퍼 함수
function getNextFriday(currentDate: string, currentDayOfWeek: number): string {
  const date = new Date(currentDate);
  const daysUntilFriday = (5 - currentDayOfWeek + 7) % 7 || 7; // 금요일(5)까지의 일수
  date.setDate(date.getDate() + daysUntilFriday);
  return date.toISOString().split("T")[0];
}

