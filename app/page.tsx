"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Sparkles, LogOut, Search, Filter, Plus, XIcon, Brain, TrendingUp, Target, AlertTriangle, Lightbulb, CheckCircle2, Clock, Calendar, BarChart3, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

import { TodoForm } from "@/components/todo/TodoForm";
import { TodoList } from "@/components/todo/TodoList";
import type { TodoItem, TodoFormValues, TodoPriority } from "@/components/todo/types";

// Supabase DB 스키마와 TodoItem 타입 간 변환 함수
type SupabaseTodo = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_date: string | null;
  due_date: string | null;
  priority: TodoPriority;
  category: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

function supabaseToTodoItem(row: SupabaseTodo): TodoItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    createdAt: row.created_date || row.created_at,
    dueDate: row.due_date || undefined,
    priority: row.priority,
    category: row.category || undefined,
    completed: row.completed,
  };
}

function todoItemToSupabase(values: TodoFormValues, userId: string, isUpdate: boolean = false): Partial<SupabaseTodo> {
  const data: Partial<SupabaseTodo> = {
    title: values.title,
    description: values.description || null,
    due_date: values.dueDate ? new Date(values.dueDate).toISOString() : null,
    priority: values.priority,
    category: values.category || null,
    completed: values.completed ?? false,
  };
  
  // 수정 시에는 created_date를 포함하지 않음 (기존 값 유지)
  // 추가 시에만 created_date를 설정
  if (!isUpdate) {
    data.created_date = new Date().toISOString();
  }
  
  return data;
}

type FilterStatus = "all" | "completed" | "inProgress" | "overdue";
type SortOption = "createdAt" | "dueDate" | "title" | "priority";

export default function HomePage() {
  const { user, isLoading: isLoadingUser, isLoggingOut, logout } = useAuth();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<TodoPriority | "all">("all");
  const [sortOption, setSortOption] = useState<SortOption>("priority");
  const [editingTodo, setEditingTodo] = useState<TodoItem | undefined>(undefined);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // AI 요약 관련 상태
  const [analysisPeriod, setAnalysisPeriod] = useState<"today" | "week">("today");
  const [analysisData, setAnalysisData] = useState<{
    summary: string;
    urgentTasks: string[];
    insights: string[];
    recommendations: string[];
    positiveFeedback?: string;
    stats?: {
      totalCount: number;
      completedCount: number;
      completionRate: number;
      previousCompletionRate: number | null;
      completionRateChange: number | null;
      priorityCompletion: {
        high: { total: number; completed: number };
        medium: { total: number; completed: number };
        low: { total: number; completed: number };
      };
      priorityCompletionRates: {
        high: string;
        medium: string;
        low: string;
      };
      priorityCounts: {
        high: number;
        medium: number;
        low: number;
      };
      overdueCount: number;
      deadlineComplianceRate: number;
      timeSlots: Record<string, number>;
      dayOfWeekPattern: Record<string, { total: number; completed: number }> | null;
      mostProductiveTimeSlot: string;
      mostProductiveDay: string | null;
    };
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // user.id를 별도로 추출하여 불필요한 재렌더링 방지
  const userId = useMemo(() => user?.id, [user?.id]);
  
  // fetchTodos 함수가 최신 필터 값을 참조할 수 있도록 ref 사용
  const filtersRef = useRef({ searchQuery, statusFilter, priorityFilter, sortOption });
  useEffect(() => {
    filtersRef.current = { searchQuery, statusFilter, priorityFilter, sortOption };
  }, [searchQuery, statusFilter, priorityFilter, sortOption]);

  // Supabase에서 할 일 목록 조회 함수
  const fetchTodos = useCallback(async () => {
    if (!userId) return;
    
    const filters = filtersRef.current;

    setIsLoadingTodos(true);
    setError(null);

    try {
      const supabase = createClient();
      let query = supabase
        .from("todos")
        .select("*")
        .eq("user_id", userId);

      // 검색 필터 (제목에 키워드 포함)
      if (filters.searchQuery.trim()) {
        query = query.ilike("title", `%${filters.searchQuery.trim()}%`);
      }

      // 상태 필터
      // 오늘 날짜의 시작 시간(00:00:00)을 기준으로 비교
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.toISOString();
      
      if (filters.statusFilter === "completed") {
        query = query.eq("completed", true);
      } else if (filters.statusFilter === "inProgress") {
        query = query.eq("completed", false).or(`due_date.is.null,due_date.gte.${todayStart}`);
      } else if (filters.statusFilter === "overdue") {
        // 오늘 날짜보다 이전인 항목만 지연으로 필터링
        query = query.eq("completed", false).lt("due_date", todayStart);
      }

      // 우선순위 필터
      if (filters.priorityFilter !== "all") {
        query = query.eq("priority", filters.priorityFilter);
      }

      // 정렬
      switch (filters.sortOption) {
        case "createdAt":
          query = query.order("created_at", { ascending: false });
          break;
        case "dueDate":
          query = query.order("due_date", { ascending: true, nullsFirst: false });
          break;
        case "title":
          query = query.order("title", { ascending: true });
          break;
        case "priority": {
          // Supabase에서는 직접 정렬이 어려우므로 클라이언트 측에서 정렬
          break;
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        let todoItems = data.map(supabaseToTodoItem);

        // 우선순위 정렬은 클라이언트 측에서 처리
        if (filters.sortOption === "priority") {
          const priorityOrder: Record<TodoPriority, number> = { high: 3, medium: 2, low: 1 };
          todoItems.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
        }

        setTodos(todoItems);
      }
    } catch (err: any) {
      console.error("할 일 목록 조회 오류:", err);
      const errorMessage = err?.message || "할 일 목록을 불러오는 중 오류가 발생했습니다.";
      setError(errorMessage);
      
      // 인증 오류인 경우 - logout을 직접 호출하지 않고 에러만 표시
      if (err?.code === "PGRST301" || err?.message?.includes("JWT")) {
        setError("인증이 만료되었습니다. 다시 로그인해주세요.");
      }
    } finally {
      setIsLoadingTodos(false);
    }
  }, [userId]);

  // 사용자 정보가 로드되거나 필터/정렬 변경 시 할 일 목록 조회
  useEffect(() => {
    if (!userId) return;

    let isCancelled = false;

    const loadTodos = async () => {
      setIsLoadingTodos(true);
      setError(null);

      try {
        const supabase = createClient();
        const filters = filtersRef.current;
        let query = supabase
          .from("todos")
          .select("*")
          .eq("user_id", userId);

        // 검색 필터 (제목에 키워드 포함)
        if (filters.searchQuery.trim()) {
          query = query.ilike("title", `%${filters.searchQuery.trim()}%`);
        }

        // 상태 필터
        const now = new Date().toISOString();
        if (filters.statusFilter === "completed") {
          query = query.eq("completed", true);
        } else if (filters.statusFilter === "inProgress") {
          query = query.eq("completed", false).or(`due_date.is.null,due_date.gte.${now}`);
        } else if (filters.statusFilter === "overdue") {
          query = query.eq("completed", false).lt("due_date", now);
        }

        // 우선순위 필터
        if (filters.priorityFilter !== "all") {
          query = query.eq("priority", filters.priorityFilter);
        }

        // 정렬
        switch (filters.sortOption) {
          case "priority": {
            // Supabase에서는 직접 정렬이 어려우므로 클라이언트 측에서 정렬
            break;
          }
          case "dueDate":
            query = query.order("due_date", { ascending: true, nullsFirst: false });
            break;
          case "createdAt":
            query = query.order("created_at", { ascending: false });
            break;
        }

        const { data, error: fetchError } = await query;

        if (isCancelled) return;

        if (fetchError) {
          throw fetchError;
        }

        if (data) {
          let todoItems = data.map(supabaseToTodoItem);

          // 우선순위 정렬은 클라이언트 측에서 처리
          if (filters.sortOption === "priority") {
            const priorityOrder: Record<TodoPriority, number> = { high: 3, medium: 2, low: 1 };
            todoItems.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
          }

          setTodos(todoItems);
        }
      } catch (err: any) {
        if (isCancelled) return;
        
        console.error("할 일 목록 조회 오류:", err);
        const errorMessage = err?.message || "할 일 목록을 불러오는 중 오류가 발생했습니다.";
        setError(errorMessage);
        
        // 인증 오류인 경우
        if (err?.code === "PGRST301" || err?.message?.includes("JWT")) {
          setError("인증이 만료되었습니다. 다시 로그인해주세요.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTodos(false);
        }
      }
    };

    loadTodos();

    return () => {
      isCancelled = true;
    };
  }, [userId, searchQuery, statusFilter, priorityFilter, sortOption]);

  // 상태별 카운트 계산
  const statusCounts = useMemo(() => {
    // 오늘 날짜의 시작 시간(00:00:00)을 기준으로 비교
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let all = 0;
    let completed = 0;
    let inProgress = 0;
    let overdue = 0;

    todos.forEach((todo) => {
      all++;
      if (todo.completed) {
        completed++;
      } else {
        if (todo.dueDate) {
          const dueDate = new Date(todo.dueDate);
          // 마감일의 날짜만 비교 (시간 제거)
          dueDate.setHours(0, 0, 0, 0);
          // 오늘 날짜보다 이전이면 지연
          if (dueDate < today) {
            overdue++;
          } else {
            inProgress++;
          }
        } else {
          inProgress++;
        }
      }
    });

    return { all, completed, inProgress, overdue };
  }, [todos]);


  // 할 일 추가/수정 핸들러
  const handleSubmit = async (values: TodoFormValues) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    try {
      const supabase = createClient();

      if (editingTodo) {
        // 수정 - created_date는 업데이트하지 않음 (기존 값 유지)
        const todoData = todoItemToSupabase(values, user.id, true);
        const { error: updateError } = await supabase
          .from("todos")
          .update(todoData)
          .eq("id", editingTodo.id)
          .eq("user_id", user.id); // 본인 소유 확인

        if (updateError) {
          throw updateError;
        }

        setEditingTodo(undefined);
        setShowAddForm(false);
        await fetchTodos(); // 목록 새로고침
      } else {
        // 추가
        const todoData = todoItemToSupabase(values, user.id, false);
        const { error: insertError } = await supabase
          .from("todos")
          .insert({
            ...todoData,
            user_id: user.id,
          });

        if (insertError) {
          throw insertError;
        }

        setShowAddForm(false);
        await fetchTodos(); // 목록 새로고침
      }
    } catch (err: any) {
      console.error("할 일 저장 오류:", err);
      const errorMessage = err?.message || "할 일을 저장하는 중 오류가 발생했습니다.";
      alert(errorMessage);
      
      // 인증 오류인 경우 - logout을 직접 호출하지 않고 에러만 표시
      if (err?.code === "PGRST301" || err?.message?.includes("JWT")) {
        alert("인증이 만료되었습니다. 다시 로그인해주세요.");
        // logout() 호출은 무한 루프를 만들 수 있으므로 제거
        // useAuth의 onAuthStateChange에서 자동으로 처리됨
      }
    }
  };

  // 할 일 삭제 핸들러
  const handleDelete = async (id: string) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    // 확인창 표시
    if (!confirm("정말 이 할 일을 삭제하시겠습니까?")) {
      return;
    }

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("todos")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id); // 본인 소유 확인

      if (deleteError) {
        throw deleteError;
      }

      if (editingTodo?.id === id) {
        setEditingTodo(undefined);
      }

      await fetchTodos(); // 목록 새로고침
    } catch (err: any) {
      console.error("할 일 삭제 오류:", err);
      const errorMessage = err?.message || "할 일을 삭제하는 중 오류가 발생했습니다.";
      alert(errorMessage);
      
      // 인증 오류인 경우 - logout을 직접 호출하지 않고 에러만 표시
      if (err?.code === "PGRST301" || err?.message?.includes("JWT")) {
        alert("인증이 만료되었습니다. 다시 로그인해주세요.");
        // logout() 호출은 무한 루프를 만들 수 있으므로 제거
        // useAuth의 onAuthStateChange에서 자동으로 처리됨
      }
    }
  };

  // 할 일 완료 토글 핸들러
  const handleToggleComplete = async (id: string, completed: boolean) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("todos")
        .update({ completed })
        .eq("id", id)
        .eq("user_id", user.id); // 본인 소유 확인

      if (updateError) {
        throw updateError;
      }

      await fetchTodos(); // 목록 새로고침
    } catch (err: any) {
      console.error("할 일 상태 변경 오류:", err);
      const errorMessage = err?.message || "할 일 상태를 변경하는 중 오류가 발생했습니다.";
      alert(errorMessage);
      
      // 인증 오류인 경우 - logout을 직접 호출하지 않고 에러만 표시
      if (err?.code === "PGRST301" || err?.message?.includes("JWT")) {
        alert("인증이 만료되었습니다. 다시 로그인해주세요.");
        // logout() 호출은 무한 루프를 만들 수 있으므로 제거
        // useAuth의 onAuthStateChange에서 자동으로 처리됨
      }
    }
  };

  // 할 일 수정 핸들러
  const handleEdit = (todo: TodoItem) => {
    setEditingTodo(todo);
    setShowAddForm(true); // 모바일에서 편집 시 폼 표시
  };

  // 수정 취소 핸들러
  const handleCancel = () => {
    setEditingTodo(undefined);
    setShowAddForm(false);
  };

  // 할 일 추가 버튼 핸들러
  const handleAddClick = () => {
    setEditingTodo(undefined);
    setShowAddForm(true);
    // 폼이 나타나도록 스크롤
    setTimeout(() => {
      const formElement = document.getElementById("mobile-todo-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      alert("로그아웃 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  // AI 요약 생성 핸들러
  const handleAnalyze = async (period: "today" | "week") => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisPeriod(period);

    try {
      const response = await fetch("/api/todos/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          period,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "분석 중 오류가 발생했습니다.");
      }

      setAnalysisData(data);
    } catch (error: any) {
      console.error("AI 분석 오류:", error);
      setAnalysisError(error?.message || "분석 중 오류가 발생했습니다.");
      setAnalysisData(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 로딩 중이거나 사용자 정보가 없으면 로딩 표시
  if (isLoadingUser || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">AI Todo Manager</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col sm:flex">
                <span className="text-sm font-medium text-foreground whitespace-nowrap">
                  {user.name}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                  {user.email}
                </span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <Spinner className="size-4 mr-2" />
                  로그아웃 중...
                </>
              ) : (
                <>
                  <LogOut className="size-4 mr-2" />
                  로그아웃
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b bg-muted/40">
        <div className="container px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* 검색 */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="제목으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* 필터 및 정렬 */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterStatus)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="inProgress">진행중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="overdue">지연</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={priorityFilter}
                onValueChange={(value) => setPriorityFilter(value as TodoPriority | "all")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="우선순위" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="medium">보통</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="정렬" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">생성일</SelectItem>
                  <SelectItem value="dueDate">마감일</SelectItem>
                  <SelectItem value="title">제목</SelectItem>
                  <SelectItem value="priority">우선순위</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <main className="container flex-1 px-4 py-6 pb-24 lg:pb-6">
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* 좌측: 할 일 추가/수정 폼 (데스크톱만 표시) */}
          <div className="hidden lg:block lg:sticky lg:top-24 lg:h-fit">
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {editingTodo ? "할 일 수정" : "할 일 추가"}
              </h2>
              <TodoForm
                key={editingTodo?.id || "new"}
                initialValue={editingTodo}
                onSubmit={handleSubmit}
                onCancel={editingTodo ? handleCancel : undefined}
                submitLabel={editingTodo ? "수정하기" : "+할 일 추가하기"}
              />
            </Card>
          </div>

          {/* 우측: 할 일 목록 */}
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">할 일 목록</h2>
              {/* 모바일: 할 일 추가 버튼 */}
              <Button
                onClick={handleAddClick}
                size="sm"
                className="lg:hidden"
              >
                <Plus className="mr-2 size-4" />
                할 일 추가
              </Button>
            </div>

            {/* 모바일: 할 일 추가/수정 폼 (검색폼과 목록 사이) */}
            {showAddForm && (
              <div id="mobile-todo-form" className="mb-6 lg:hidden">
                <Card className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">
                      {editingTodo ? "할 일 수정" : "할 일 추가"}
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      className="h-8 w-8 p-0"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                  <TodoForm
                    key={editingTodo?.id || "new"}
                    initialValue={editingTodo}
                    onSubmit={handleSubmit}
                    onCancel={handleCancel}
                    submitLabel={editingTodo ? "수정하기" : "+할 일 추가하기"}
                  />
                </Card>
              </div>
            )}
            
            {/* 상태별 탭 */}
            <Tabs
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as FilterStatus)}
              className="mb-6"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  전체
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs font-semibold"
                  >
                    {statusCounts.all}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="flex items-center gap-2">
                  완료
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 min-w-5 rounded-full bg-green-100 px-1.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    {statusCounts.completed}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="inProgress" className="flex items-center gap-2">
                  진행중
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 min-w-5 rounded-full bg-blue-100 px-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {statusCounts.inProgress}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="overdue" className="flex items-center gap-2">
                  지연
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 min-w-5 rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  >
                    {statusCounts.overdue}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {isLoadingTodos ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="size-8" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-center text-destructive">
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => fetchTodos()}
                >
                  다시 시도
                </Button>
              </div>
            ) : todos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                <p>할 일이 없습니다. 새로운 할 일을 추가해보세요.</p>
              </div>
            ) : (
              <TodoList
                todos={todos}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>

        {/* AI 요약 및 분석 섹션 */}
        <div className="mt-8 lg:col-span-2">
          <Card className="p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">AI 요약 및 분석</h2>
              </div>
            </div>

            <Tabs value={analysisPeriod} onValueChange={(value) => setAnalysisPeriod(value as "today" | "week")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="today">오늘의 요약</TabsTrigger>
                <TabsTrigger value="week">이번 주 요약</TabsTrigger>
              </TabsList>

              <TabsContent value="today" className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleAnalyze("today")}
                    disabled={isAnalyzing || !user}
                    variant="outline"
                  >
                    {isAnalyzing && analysisPeriod === "today" ? (
                      <>
                        <Spinner className="mr-2 size-4" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 size-4" />
                        AI 요약 보기
                      </>
                    )}
                  </Button>
                </div>

                {analysisError && analysisPeriod === "today" && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
                    <p>{analysisError}</p>
                  </div>
                )}

                {isAnalyzing && analysisPeriod === "today" && (
                  <div className="flex items-center justify-center py-12">
                    <Spinner className="size-8" />
                  </div>
                )}

                {!isAnalyzing && analysisData && analysisPeriod === "today" && (
                  <div className="space-y-6">
                    {/* 긍정적인 피드백 */}
                    {analysisData.positiveFeedback && (
                      <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/30 p-2">
                            <TrendingUp className="size-5 text-yellow-700 dark:text-yellow-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-2 font-semibold text-yellow-700 dark:text-yellow-400">
                              잘하고 계세요!
                            </h3>
                            <p className="text-sm text-yellow-600 dark:text-yellow-300">{analysisData.positiveFeedback}</p>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 오늘의 완료율 */}
                    {analysisData.stats && (
                      <Card className="p-4 md:p-6">
                        <div className="mb-4">
                          <h3 className="mb-1 text-base md:text-lg font-semibold">오늘의 완료율</h3>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {analysisData.stats.completedCount}개 완료 / {analysisData.stats.totalCount}개 전체
                          </p>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                              <span className="text-2xl md:text-3xl font-bold text-primary">
                                {analysisData.stats.completionRate.toFixed(1)}%
                              </span>
                              {analysisData.stats.completionRateChange !== null && (
                                <div className="flex items-center gap-1 text-sm">
                                  {analysisData.stats.completionRateChange > 0 ? (
                                    <>
                                      <ArrowUp className="size-4 text-green-600" />
                                      <span className="text-green-600">
                                        {analysisData.stats.completionRateChange > 0 ? "+" : ""}
                                        {analysisData.stats.completionRateChange.toFixed(1)}%p
                                      </span>
                                    </>
                                  ) : analysisData.stats.completionRateChange < 0 ? (
                                    <>
                                      <ArrowDown className="size-4 text-red-600" />
                                      <span className="text-red-600">
                                        {analysisData.stats.completionRateChange.toFixed(1)}%p
                                      </span>
                                    </>
                                  ) : null}
                                  <span className="text-muted-foreground">어제 대비</span>
                                </div>
                              )}
                            </div>
                            <Progress value={analysisData.stats.completionRate} className="h-3" />
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 남은 할 일 목록 */}
                    {analysisData.urgentTasks.length > 0 && (
                      <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2">
                            <AlertTriangle className="size-5 text-red-700 dark:text-red-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-3 font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                              🎯 오늘 집중해야 할 작업
                            </h3>
                            <ul className="space-y-2">
                              {analysisData.urgentTasks.map((task, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 dark:bg-red-900/50 text-xs font-semibold text-red-700 dark:text-red-400">
                                    {index + 1}
                                  </span>
                                  <span className="text-red-700 dark:text-red-300">{task}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 남은 할 일 우선순위별 분포 */}
                    {analysisData.stats && (
                      <Card className="p-4">
                        <h3 className="mb-3 text-sm md:text-base font-semibold flex items-center gap-2">
                          <Target className="size-4" />
                          남은 할 일 우선순위
                        </h3>
                        <div className="grid grid-cols-3 gap-2 md:gap-3">
                          <div className="rounded-lg border-2 border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 p-3 text-center">
                            <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                              {analysisData.stats.priorityCounts.high}
                            </div>
                            <div className="text-xs text-red-600 dark:text-red-300">높음</div>
                          </div>
                          <div className="rounded-lg border-2 border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20 p-3 text-center">
                            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                              {analysisData.stats.priorityCounts.medium}
                            </div>
                            <div className="text-xs text-yellow-600 dark:text-yellow-300">보통</div>
                          </div>
                          <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-3 text-center">
                            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                              {analysisData.stats.priorityCounts.low}
                            </div>
                            <div className="text-xs text-blue-600 dark:text-blue-300">낮음</div>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 요약 */}
                    <Card className="p-4">
                      <h3 className="mb-2 font-semibold flex items-center gap-2">
                        <BarChart3 className="size-4" />
                        요약
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{analysisData.summary}</p>
                    </Card>

                    {/* 인사이트 카드 */}
                    {analysisData.insights.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Lightbulb className="size-4" />
                          인사이트
                        </h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          {analysisData.insights.map((insight, index) => {
                            const icon = insight.includes("완료율") || insight.includes("완료") ? "✅" :
                                       insight.includes("시간") || insight.includes("마감") ? "⏰" :
                                       insight.includes("패턴") || insight.includes("생산") ? "📊" :
                                       insight.includes("주의") || insight.includes("경고") ? "⚠️" : "💡";
                            return (
                              <Card key={index} className="p-4">
                                <div className="flex items-start gap-3">
                                  <span className="text-2xl">{icon}</span>
                                  <p className="flex-1 text-sm leading-relaxed">{insight}</p>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 추천 사항 */}
                    {analysisData.recommendations.length > 0 && (
                      <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
                            <CheckCircle2 className="size-5 text-green-700 dark:text-green-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-3 font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                              💡 추천 사항
                            </h3>
                            <ul className="space-y-2">
                              {analysisData.recommendations.map((recommendation, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                  <span className="mt-0.5 text-green-600 dark:text-green-400">•</span>
                                  <span className="text-green-700 dark:text-green-300 leading-relaxed">{recommendation}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {!isAnalyzing && (!analysisData || analysisPeriod !== "today") && !analysisError && (
                  <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                    <Brain className="mx-auto mb-4 size-12 opacity-50" />
                    <p>AI 요약 보기 버튼을 클릭하여 오늘의 할 일을 분석해보세요.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="week" className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleAnalyze("week")}
                    disabled={isAnalyzing || !user}
                    variant="outline"
                  >
                    {isAnalyzing && analysisPeriod === "week" ? (
                      <>
                        <Spinner className="mr-2 size-4" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 size-4" />
                        AI 요약 보기
                      </>
                    )}
                  </Button>
                </div>

                {analysisError && analysisPeriod === "week" && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
                    <p>{analysisError}</p>
                  </div>
                )}

                {isAnalyzing && analysisPeriod === "week" && (
                  <div className="flex items-center justify-center py-12">
                    <Spinner className="size-8" />
                  </div>
                )}

                {!isAnalyzing && analysisData && analysisPeriod === "week" && (
                  <div className="space-y-6">
                    {/* 긍정적인 피드백 */}
                    {analysisData.positiveFeedback && (
                      <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/30 p-2">
                            <TrendingUp className="size-5 text-yellow-700 dark:text-yellow-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-2 font-semibold text-yellow-700 dark:text-yellow-400">
                              잘하고 계세요!
                            </h3>
                            <p className="text-sm text-yellow-600 dark:text-yellow-300">{analysisData.positiveFeedback}</p>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 주간 완료율 */}
                    {analysisData.stats && (
                      <Card className="p-4 md:p-6">
                        <div className="mb-4">
                          <h3 className="mb-1 text-base md:text-lg font-semibold">이번 주 완료율</h3>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {analysisData.stats.completedCount}개 완료 / {analysisData.stats.totalCount}개 전체
                          </p>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                              <span className="text-2xl md:text-3xl font-bold text-primary">
                                {analysisData.stats.completionRate.toFixed(1)}%
                              </span>
                              {analysisData.stats.completionRateChange !== null && (
                                <div className="flex items-center gap-1 text-sm">
                                  {analysisData.stats.completionRateChange > 0 ? (
                                    <>
                                      <ArrowUp className="size-4 text-green-600" />
                                      <span className="text-green-600">
                                        {analysisData.stats.completionRateChange > 0 ? "+" : ""}
                                        {analysisData.stats.completionRateChange.toFixed(1)}%p
                                      </span>
                                    </>
                                  ) : analysisData.stats.completionRateChange < 0 ? (
                                    <>
                                      <ArrowDown className="size-4 text-red-600" />
                                      <span className="text-red-600">
                                        {analysisData.stats.completionRateChange.toFixed(1)}%p
                                      </span>
                                    </>
                                  ) : null}
                                  <span className="text-muted-foreground">지난 주 대비</span>
                                </div>
                              )}
                            </div>
                            <Progress value={analysisData.stats.completionRate} className="h-3" />
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 요일별 생산성 패턴 */}
                    {analysisData.stats?.dayOfWeekPattern && (
                      <Card className="p-4">
                        <h3 className="mb-4 font-semibold flex items-center gap-2">
                          <Calendar className="size-4" />
                          요일별 생산성 패턴
                        </h3>
                        <div className="space-y-3">
                          {Object.entries(analysisData.stats.dayOfWeekPattern)
                            .filter(([_, data]) => data.total > 0)
                            .map(([day, data]) => {
                              const rate = data.total > 0 ? (data.completed / data.total * 100) : 0;
                              return (
                                <div key={day} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{day}</span>
                                    <span className="text-muted-foreground">
                                      {data.completed}/{data.total} ({rate.toFixed(0)}%)
                                    </span>
                                  </div>
                                  <Progress value={rate} className="h-2" />
                                </div>
                              );
                            })}
                        </div>
                        {analysisData.stats.mostProductiveDay && (
                          <div className="mt-4 rounded-lg bg-primary/10 p-3 text-center">
                            <p className="text-sm font-medium">
                              가장 생산적인 요일: <span className="text-primary">{analysisData.stats.mostProductiveDay}</span>
                            </p>
                          </div>
                        )}
                      </Card>
                    )}

                    {/* 시간대별 집중도 */}
                    {analysisData.stats?.timeSlots && (
                      <Card className="p-4">
                        <h3 className="mb-4 font-semibold flex items-center gap-2">
                          <Clock className="size-4" />
                          시간대별 업무 집중도
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(analysisData.stats.timeSlots)
                            .filter(([_, count]) => count > 0)
                            .sort(([_, a], [__, b]) => b - a)
                            .map(([slot, count]) => {
                              const maxCount = Math.max(...Object.values(analysisData.stats!.timeSlots));
                              const percentage = maxCount > 0 ? (count / maxCount * 100) : 0;
                              return (
                                <div key={slot} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{slot}</span>
                                    <span className="text-muted-foreground">{count}개</span>
                                  </div>
                                  <Progress value={percentage} className="h-2" />
                                </div>
                              );
                            })}
                        </div>
                        {analysisData.stats.mostProductiveTimeSlot && (
                          <div className="mt-4 rounded-lg bg-primary/10 p-3 text-center">
                            <p className="text-sm font-medium">
                              가장 집중도가 높은 시간대: <span className="text-primary">{analysisData.stats.mostProductiveTimeSlot}</span>
                            </p>
                          </div>
                        )}
                      </Card>
                    )}

                    {/* 요약 */}
                    <Card className="p-4">
                      <h3 className="mb-2 font-semibold flex items-center gap-2">
                        <BarChart3 className="size-4" />
                        요약
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{analysisData.summary}</p>
                    </Card>

                    {/* 다음 주 계획 제안 */}
                    {analysisData.recommendations.length > 0 && (
                      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                            <Target className="size-5 text-blue-700 dark:text-blue-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-3 font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                              🎯 다음 주 계획 제안
                            </h3>
                            <ul className="space-y-2">
                              {analysisData.recommendations.map((recommendation, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                  <span className="mt-0.5 text-blue-600 dark:text-blue-400">•</span>
                                  <span className="text-blue-700 dark:text-blue-300 leading-relaxed">{recommendation}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* 인사이트 카드 */}
                    {analysisData.insights.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Lightbulb className="size-4" />
                          인사이트
                        </h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          {analysisData.insights.map((insight, index) => {
                            const icon = insight.includes("완료율") || insight.includes("완료") ? "✅" :
                                       insight.includes("시간") || insight.includes("마감") ? "⏰" :
                                       insight.includes("패턴") || insight.includes("생산") ? "📊" :
                                       insight.includes("주의") || insight.includes("경고") ? "⚠️" : "💡";
                            return (
                              <Card key={index} className="p-4">
                                <div className="flex items-start gap-3">
                                  <span className="text-2xl">{icon}</span>
                                  <p className="flex-1 text-sm leading-relaxed">{insight}</p>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 긴급한 할 일 */}
                    {analysisData.urgentTasks.length > 0 && (
                      <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2">
                            <AlertTriangle className="size-5 text-red-700 dark:text-red-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-3 font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                              ⚠️ 긴급한 할 일
                            </h3>
                            <ul className="space-y-2">
                              {analysisData.urgentTasks.map((task, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                  <span className="mt-0.5 text-red-600 dark:text-red-400">•</span>
                                  <span className="text-red-700 dark:text-red-300">{task}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {!isAnalyzing && (!analysisData || analysisPeriod !== "week") && !analysisError && (
                  <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                    <Brain className="mx-auto mb-4 size-12 opacity-50" />
                    <p>AI 요약 보기 버튼을 클릭하여 이번 주 할 일을 분석해보세요.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </main>

      {/* 모바일: 플로팅 할 일 추가 버튼 */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <Button
          onClick={handleAddClick}
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg"
        >
          <Plus className="size-6" />
        </Button>
      </div>
    </div>
  );
}
