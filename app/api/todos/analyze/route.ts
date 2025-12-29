import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 응답 스키마 정의
const TodoAnalysisSchema = z.object({
  summary: z.string().describe("기간별 차별화된 요약 (오늘/이번 주에 맞는 집중도와 우선순위 제시)"),
  urgentTasks: z.array(z.string()).describe("긴급한 할 일 목록 (제목만, 최대 5개)"),
  insights: z.array(z.string()).describe("상세한 인사이트 배열 (완료율 분석, 시간 관리, 생산성 패턴 포함)"),
  recommendations: z.array(z.string()).describe("실행 가능한 구체적인 추천 사항 (시간 관리 팁, 우선순위 조정, 분산 전략 포함)"),
  positiveFeedback: z.string().optional().describe("사용자가 잘하고 있는 부분을 강조하는 긍정적인 피드백"),
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
        { error: "잘못된 요청 형식입니다." },
        { status: 400 }
      );
    }

    const { period, userId } = body; // period: "today" | "week"

    // 입력 검증
    if (!period || !["today", "week"].includes(period)) {
      return NextResponse.json(
        { error: "분석 기간을 올바르게 지정해주세요. (today 또는 week)" },
        { status: 400 }
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "사용자 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // Supabase 클라이언트 생성 (API Route에서는 request를 전달)
    const supabase = await createClient(request);
    
    // 인증 확인
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    // 현재 날짜/시간 정보 생성 (한국 시간 기준)
    const now = new Date();
    const koreaDateString = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const todayStart = new Date(koreaDateString + "T00:00:00");
    const todayEnd = new Date(koreaDateString + "T23:59:59");

    // 할 일 목록 조회
    let query = supabase
      .from("todos")
      .select("*")
      .eq("user_id", userId);

    if (period === "today") {
      // 오늘의 할 일만 조회 (due_date가 오늘인 것만)
      query = query.gte("due_date", todayStart.toISOString()).lte("due_date", todayEnd.toISOString());
    } else if (period === "week") {
      // 이번 주 할 일 조회 (오늘부터 7일 후까지)
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      query = query.gte("due_date", todayStart.toISOString()).lte("due_date", weekEnd.toISOString());
    }

    const { data: todos, error: fetchError } = await query;

    if (fetchError) {
      console.error("할 일 목록 조회 오류:", fetchError);
      return NextResponse.json(
        { error: "할 일 목록을 불러오는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    if (!todos || todos.length === 0) {
      return NextResponse.json({
        summary: period === "today" 
          ? "오늘 예정된 할 일이 없습니다." 
          : "이번 주 예정된 할 일이 없습니다.",
        urgentTasks: [],
        insights: [],
        recommendations: [],
      });
    }

    // 이전 기간 데이터 조회 (비교 분석용)
    let previousPeriodTodos: any[] = [];
    try {
      if (period === "today") {
        // 어제 데이터 조회
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const yesterdayEnd = new Date(yesterdayStart);
        yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
        const { data: yesterdayTodos, error: yesterdayError } = await supabase
          .from("todos")
          .select("*")
          .eq("user_id", userId)
          .gte("due_date", yesterdayStart.toISOString())
          .lt("due_date", yesterdayEnd.toISOString());
        if (!yesterdayError) {
          previousPeriodTodos = yesterdayTodos || [];
        }
      } else if (period === "week") {
        // 지난 주 데이터 조회
        const lastWeekStart = new Date(todayStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(todayStart);
        const { data: lastWeekTodos, error: lastWeekError } = await supabase
          .from("todos")
          .select("*")
          .eq("user_id", userId)
          .gte("due_date", lastWeekStart.toISOString())
          .lt("due_date", lastWeekEnd.toISOString());
        if (!lastWeekError) {
          previousPeriodTodos = lastWeekTodos || [];
        }
      }
    } catch (e) {
      // 이전 기간 데이터 조회 실패 시 빈 배열로 처리
      console.warn("이전 기간 데이터 조회 실패:", e);
      previousPeriodTodos = [];
    }

    // 할 일 데이터 전처리 및 통계 계산
    const totalCount = todos.length;
    const completedCount = todos.filter(t => t.completed).length;
    const completionRate = totalCount > 0 ? (completedCount / totalCount * 100).toFixed(1) : "0";

    // 이전 기간 완료율 계산
    const previousTotalCount = previousPeriodTodos.length;
    const previousCompletedCount = previousPeriodTodos.filter(t => t.completed).length;
    const previousCompletionRate = previousTotalCount > 0 ? (previousCompletedCount / previousTotalCount * 100).toFixed(1) : "0";
    const completionRateChange = previousTotalCount > 0 
      ? (parseFloat(completionRate) - parseFloat(previousCompletionRate)).toFixed(1) 
      : "0";

    // 우선순위별 완료 패턴 분석
    const priorityCompletion = {
      high: {
        total: todos.filter(t => t.priority === "high").length,
        completed: todos.filter(t => t.priority === "high" && t.completed).length,
      },
      medium: {
        total: todos.filter(t => t.priority === "medium").length,
        completed: todos.filter(t => t.priority === "medium" && t.completed).length,
      },
      low: {
        total: todos.filter(t => t.priority === "low").length,
        completed: todos.filter(t => t.priority === "low" && t.completed).length,
      },
    };

    // 우선순위별 완료율
    const priorityCompletionRates = {
      high: priorityCompletion.high.total > 0 
        ? (priorityCompletion.high.completed / priorityCompletion.high.total * 100).toFixed(1) 
        : "0",
      medium: priorityCompletion.medium.total > 0 
        ? (priorityCompletion.medium.completed / priorityCompletion.medium.total * 100).toFixed(1) 
        : "0",
      low: priorityCompletion.low.total > 0 
        ? (priorityCompletion.low.completed / priorityCompletion.low.total * 100).toFixed(1) 
        : "0",
    };

    // 미완료 우선순위 분포
    const priorityCounts = {
      high: todos.filter(t => t.priority === "high" && !t.completed).length,
      medium: todos.filter(t => t.priority === "medium" && !t.completed).length,
      low: todos.filter(t => t.priority === "low" && !t.completed).length,
    };

    // 마감일 준수율 계산 (마감일이 지났지만 완료되지 않은 것)
    const overdueCount = todos.filter(t => {
      if (!t.due_date || t.completed) return false;
      try {
        const dueDate = new Date(t.due_date);
        if (isNaN(dueDate.getTime())) return false;
        return dueDate < todayStart;
      } catch {
        return false;
      }
    }).length;
    const deadlineComplianceRate = totalCount > 0 
      ? ((totalCount - overdueCount) / totalCount * 100).toFixed(1) 
      : "100";

    // 연기된 할 일 분석 (마감일이 지났지만 미완료)
    const postponedTasks = todos
      .filter(t => {
        if (!t.due_date || t.completed) return false;
        try {
          const dueDate = new Date(t.due_date);
          if (isNaN(dueDate.getTime())) return false;
          return dueDate < todayStart;
        } catch {
          return false;
        }
      })
      .map(t => {
        try {
          const dueDate = new Date(t.due_date);
          const daysOverdue = Math.floor((todayStart.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          return {
            title: t.title,
            daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
            priority: t.priority,
          };
        } catch {
          return {
            title: t.title,
            daysOverdue: 0,
            priority: t.priority,
          };
        }
      });

    // 시간대별 집중도 분석 (더 세분화)
    const timeSlots: Record<string, number> = {
      "새벽(00:00-06:00)": 0,
      "아침(06:00-09:00)": 0,
      "오전(09:00-12:00)": 0,
      "점심(12:00-14:00)": 0,
      "오후(14:00-18:00)": 0,
      "저녁(18:00-21:00)": 0,
      "밤(21:00-24:00)": 0,
    };

    todos.forEach(todo => {
      if (todo.due_date && !todo.completed) {
        try {
          const dueDate = new Date(todo.due_date);
          if (!isNaN(dueDate.getTime())) {
            const hour = dueDate.getHours();
            if (hour >= 0 && hour < 6) timeSlots["새벽(00:00-06:00)"]++;
            else if (hour >= 6 && hour < 9) timeSlots["아침(06:00-09:00)"]++;
            else if (hour >= 9 && hour < 12) timeSlots["오전(09:00-12:00)"]++;
            else if (hour >= 12 && hour < 14) timeSlots["점심(12:00-14:00)"]++;
            else if (hour >= 14 && hour < 18) timeSlots["오후(14:00-18:00)"]++;
            else if (hour >= 18 && hour < 21) timeSlots["저녁(18:00-21:00)"]++;
            else if (hour >= 21) timeSlots["밤(21:00-24:00)"]++;
          }
        } catch (e) {
          // 날짜 파싱 오류 무시
        }
      }
    });

    // 요일별 생산성 패턴 분석 (주간 분석 시)
    const dayOfWeekPattern: Record<string, { total: number; completed: number }> = {
      "일요일": { total: 0, completed: 0 },
      "월요일": { total: 0, completed: 0 },
      "화요일": { total: 0, completed: 0 },
      "수요일": { total: 0, completed: 0 },
      "목요일": { total: 0, completed: 0 },
      "금요일": { total: 0, completed: 0 },
      "토요일": { total: 0, completed: 0 },
    };

    if (period === "week") {
      todos.forEach(todo => {
        if (todo.due_date) {
          try {
            const dueDate = new Date(todo.due_date);
            if (!isNaN(dueDate.getTime())) {
              const dayOfWeek = dueDate.getDay();
              const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
              const dayName = dayNames[dayOfWeek];
              if (dayOfWeekPattern[dayName]) {
                dayOfWeekPattern[dayName].total++;
                if (todo.completed) {
                  dayOfWeekPattern[dayName].completed++;
                }
              }
            }
          } catch {
            // 날짜 파싱 오류 무시
          }
        }
      });
    }

    // 완료된 작업의 공통 특징 분석
    const completedTasks = todos.filter(t => t.completed);
    const completedTaskCategories = completedTasks.reduce((acc: Record<string, number>, t) => {
      const cat = t.category || "기타";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const incompleteTasks = todos.filter(t => !t.completed);
    const incompleteTaskCategories = incompleteTasks.reduce((acc: Record<string, number>, t) => {
      const cat = t.category || "기타";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    // 긴급한 할 일 (미완료 + high priority 또는 마감일 임박)
    const urgentTasks = todos
      .filter(t => {
        if (t.completed) return false;
        if (t.priority === "high") return true;
        if (t.due_date) {
          try {
            const dueDate = new Date(t.due_date);
            if (!isNaN(dueDate.getTime())) {
              return dueDate <= todayEnd;
            }
          } catch {
            // 날짜 파싱 오류 무시
          }
        }
        return false;
      })
      .map(t => t.title)
      .slice(0, 5);

    // AI 분석을 위한 데이터 준비
    const todosForAI = todos.map(t => ({
      title: t.title || "제목 없음",
      completed: t.completed || false,
      priority: t.priority || "medium",
      due_date: t.due_date || null,
      category: t.category || "기타",
      created_date: t.created_date || null,
    }));

    // 가장 생산적인 시간대 찾기
    const mostProductiveTimeSlot = Object.entries(timeSlots).reduce((max, [slot, count]) => 
      count > max[1] ? [slot, count] : max, ["없음", 0]
    );

    // 가장 생산적인 요일 찾기 (주간 분석 시)
    let mostProductiveDay = "없음";
    if (period === "week") {
      const dayCompletionRates = Object.entries(dayOfWeekPattern).map(([day, data]) => ({
        day,
        rate: data.total > 0 ? (data.completed / data.total * 100) : 0,
        total: data.total,
      }));
      const bestDay = dayCompletionRates.reduce((max, day) => 
        day.rate > max.rate ? day : max, { day: "없음", rate: 0, total: 0 }
      );
      mostProductiveDay = bestDay.total > 0 ? bestDay.day : "없음";
    }

    // 현재 시간 문자열 생성 (안전하게)
    let currentTimeString = "";
    try {
      currentTimeString = now.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
    } catch {
      currentTimeString = new Date().toLocaleTimeString("ko-KR");
    }

    // Gemini API를 사용하여 분석
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: TodoAnalysisSchema,
      prompt: `당신은 할 일 관리 전문가이자 동기부여 코치입니다. 사용자의 할 일 데이터를 깊이 있게 분석하여 실용적이고 실행 가능한 인사이트를 제공해주세요.

=== 분석 기간 및 현재 상황 ===
분석 기간: ${period === "today" ? "오늘" : "이번 주"}
현재 날짜: ${koreaDateString || "날짜 정보 없음"}
현재 시간: ${currentTimeString || "시간 정보 없음"}

=== 할 일 목록 데이터 ===
${JSON.stringify(todosForAI, null, 2)}

=== 상세 통계 정보 ===

1. 완료율 분석:
   - 총 할 일: ${totalCount}개
   - 완료: ${completedCount}개
   - 완료율: ${completionRate}%
   ${previousTotalCount > 0 ? `- 이전 기간(${period === "today" ? "어제" : "지난 주"}) 완료율: ${previousCompletionRate}%` : ""}
   ${previousTotalCount > 0 ? `- 완료율 변화: ${parseFloat(completionRateChange) > 0 ? "+" : ""}${completionRateChange}%p` : ""}

2. 우선순위별 완료 패턴:
   - 높은 우선순위: 총 ${priorityCompletion.high.total}개 중 ${priorityCompletion.high.completed}개 완료 (${priorityCompletionRates.high}%)
   - 보통 우선순위: 총 ${priorityCompletion.medium.total}개 중 ${priorityCompletion.medium.completed}개 완료 (${priorityCompletionRates.medium}%)
   - 낮은 우선순위: 총 ${priorityCompletion.low.total}개 중 ${priorityCompletion.low.completed}개 완료 (${priorityCompletionRates.low}%)
   - 미완료 우선순위 분포: 높음 ${priorityCounts.high}개, 보통 ${priorityCounts.medium}개, 낮음 ${priorityCounts.low}개

3. 시간 관리 분석:
   - 마감일 준수율: ${deadlineComplianceRate}%
   - 연기된 할 일: ${overdueCount}개
   ${postponedTasks.length > 0 ? `- 연기된 할 일 상세: ${JSON.stringify(postponedTasks, null, 2)}` : ""}
   - 시간대별 업무 집중도: ${JSON.stringify(timeSlots, null, 2)}
   - 가장 집중도가 높은 시간대: ${mostProductiveTimeSlot[0]} (${mostProductiveTimeSlot[1]}개)

4. 생산성 패턴:
   ${period === "week" ? `- 요일별 완료 패턴: ${JSON.stringify(dayOfWeekPattern, null, 2)}` : ""}
   ${period === "week" ? `- 가장 생산적인 요일: ${mostProductiveDay}` : ""}
   - 완료하기 쉬운 작업 카테고리: ${JSON.stringify(completedTaskCategories, null, 2)}
   - 자주 미루는 작업 카테고리: ${JSON.stringify(incompleteTaskCategories, null, 2)}

5. 긴급한 할 일:
   ${urgentTasks.length > 0 ? `- ${urgentTasks.join(", ")}` : "- 없음"}

=== 분석 요구사항 ===

1. summary (기간별 차별화):
   ${period === "today" 
     ? `- 오늘의 요약: 당일 집중도와 남은 할 일 우선순위를 명확히 제시
     - 오늘의 완료율과 어제 대비 개선도를 포함
     - 남은 시간을 고려한 현실적인 조언 포함` 
     : `- 이번 주 요약: 주간 패턴 분석 및 다음 주 계획 제안
     - 주간 완료율과 지난 주 대비 개선도 포함
     - 요일별 생산성 패턴 요약`}

2. urgentTasks:
   - 긴급한 할 일 제목 목록 (최대 5개)
   - 제공된 긴급 할 일 목록을 우선 사용하되, AI가 판단하여 추가/조정 가능

3. insights (다음 항목들을 모두 포함):
   a) 완료율 분석:
      - 일일/주간 완료율 계산 결과 해석
      - 우선순위별 완료 패턴 분석 (어떤 우선순위에서 완료율이 높은지/낮은지)
      ${previousTotalCount > 0 ? `- 이전 기간 대비 개선도 비교 (${completionRateChange}%p 변화의 의미)` : ""}
   
   b) 시간 관리 분석:
      - 마감일 준수율 계산 결과 해석
      - 연기된 할 일의 빈도 및 패턴 파악 (어떤 유형의 작업이 자주 연기되는지)
      - 시간대별 업무 집중도 분포 분석 (어느 시간대에 가장 집중하는지)
   
   c) 생산성 패턴:
      ${period === "week" ? `- 가장 생산적인 요일과 시간대 도출 (${mostProductiveDay}, ${mostProductiveTimeSlot[0]})` : `- 가장 생산적인 시간대 도출 (${mostProductiveTimeSlot[0]})`}
      - 자주 미루는 작업 유형 식별 (카테고리, 우선순위 관점)
      - 완료하기 쉬운 작업의 공통 특징 도출 (완료된 작업들의 패턴 분석)

4. recommendations (실행 가능한 구체적인 추천):
   - 시간 관리 팁 제공 (구체적인 시간대 활용 전략)
   - 우선순위 조정 및 일정 재배치 제안 (데이터 기반)
   - 업무 과부하를 줄이는 분산 전략 포함
   - 각 추천은 구체적이고 실천 가능해야 함

5. positiveFeedback (긍정적인 피드백):
   - 사용자가 잘하고 있는 부분 강조 (완료율이 높은 영역, 개선된 부분 등)
   - 개선점을 격려하는 긍정적 톤으로 제시
   - 동기부여 메시지 포함
   - 비판보다는 격려와 응원의 톤 유지

=== 작성 규칙 ===

1. 문체:
   - 친근하고 자연스러운 한국어 사용
   - 존댓말 사용
   - 사용자가 이해하기 쉽고, 바로 실천할 수 있는 문장으로 구성
   - 전문 용어는 피하고 일상적인 표현 사용

2. 톤:
   - 긍정적이고 격려하는 톤
   - 비판보다는 개선 제안에 초점
   - 사용자의 노력을 인정하고 동기부여

3. 구조:
   - 각 인사이트는 독립적으로 이해 가능해야 함
   - 구체적인 수치와 데이터를 언급하여 신뢰성 확보
   - 실행 가능한 액션 아이템 중심

4. 길이:
   - summary: 2-3문장 (간결하고 핵심적)
   - insights: 각 항목당 1-2문장 (총 5-8개)
   - recommendations: 각 항목당 1문장 (총 3-5개)
   - positiveFeedback: 2-3문장 (격려와 동기부여)

=== 분석 결과 생성 ===`,
    });

    // 응답 반환
    return NextResponse.json({
      summary: result.object.summary,
      urgentTasks: result.object.urgentTasks.length > 0 ? result.object.urgentTasks : urgentTasks,
      insights: result.object.insights,
      recommendations: result.object.recommendations,
      positiveFeedback: result.object.positiveFeedback || "",
      // 통계 데이터 추가
      stats: {
        totalCount,
        completedCount,
        completionRate: parseFloat(completionRate),
        previousCompletionRate: previousTotalCount > 0 ? parseFloat(previousCompletionRate) : null,
        completionRateChange: previousTotalCount > 0 ? parseFloat(completionRateChange) : null,
        priorityCompletion,
        priorityCompletionRates,
        priorityCounts,
        overdueCount,
        deadlineComplianceRate: parseFloat(deadlineComplianceRate),
        timeSlots,
        dayOfWeekPattern: period === "week" ? dayOfWeekPattern : null,
        mostProductiveTimeSlot: mostProductiveTimeSlot[0],
        mostProductiveDay: period === "week" ? mostProductiveDay : null,
      },
    });
  } catch (error: any) {
    console.error("AI 할 일 분석 오류:", error);
    console.error("오류 상세:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause,
    });

    // 오류 타입별 처리
    if (error?.message?.includes("quota") || error?.message?.includes("rate limit") || error?.status === 429) {
      return NextResponse.json(
        {
          error: "AI API 사용량 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    if (error?.message?.includes("API key") || error?.message?.includes("authentication") || error?.message?.includes("401")) {
      return NextResponse.json(
        {
          error: "AI API 인증에 실패했습니다. 관리자에게 문의해주세요.",
          code: "AUTH_ERROR",
        },
        { status: 500 }
      );
    }

    // 스키마 검증 오류
    if (error?.message?.includes("schema") || error?.message?.includes("validation") || error?.message?.includes("zod")) {
      console.error("스키마 검증 오류:", error);
      return NextResponse.json(
        {
          error: "AI 응답 형식 오류가 발생했습니다. 다시 시도해주세요.",
          code: "SCHEMA_ERROR",
          details: process.env.NODE_ENV === "development" ? error?.message : undefined,
        },
        { status: 500 }
      );
    }

    // 개발 환경에서는 상세 오류 정보 제공
    return NextResponse.json(
      {
        error: "할 일 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        code: "INTERNAL_ERROR",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

