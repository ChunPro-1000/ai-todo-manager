// 할 일 추가/편집 폼을 제공한다.
"use client"

import { useMemo, useState, useEffect } from "react"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"

import type { TodoFormValues, TodoItem, TodoPriority } from "./types"

type TodoFormProps = {
  initialValue?: TodoItem
  submitLabel?: string
  onSubmit: (values: TodoFormValues) => void | Promise<void>
  onCancel?: () => void
}

// datetime-local input 형식으로 변환 (YYYY-MM-DDTHH:mm)
const formatDateForInput = (dateString?: string): string => {
  if (!dateString) return ""
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return ""
    // 로컬 시간대로 변환하여 YYYY-MM-DDTHH:mm 형식으로 반환
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch {
    return ""
  }
}

/** 할 일을 생성하거나 수정하기 위한 입력 폼을 렌더링한다. */
const TodoForm = ({
  initialValue,
  submitLabel = initialValue ? "할 일 수정" : "할 일 추가",
  onSubmit,
  onCancel,
}: TodoFormProps) => {

  const [title, setTitle] = useState(initialValue?.title ?? "")
  const [description, setDescription] = useState(initialValue?.description ?? "")
  const [priority, setPriority] = useState<TodoPriority>(initialValue?.priority ?? "medium")
  const [category, setCategory] = useState(initialValue?.category ?? "")
  const [dueDate, setDueDate] = useState(formatDateForInput(initialValue?.dueDate))
  const [completed, setCompleted] = useState(initialValue?.completed ?? false)

  // AI 할 일 생성 관련 상태
  const [aiInput, setAiInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const isEditing = useMemo(() => Boolean(initialValue?.id), [initialValue?.id])

  // initialValue가 변경될 때 폼 상태 업데이트
  useEffect(() => {
    if (initialValue) {
      setTitle(initialValue.title ?? "")
      setDescription(initialValue.description ?? "")
      setPriority(initialValue.priority ?? "medium")
      setCategory(initialValue.category ?? "")
      setDueDate(formatDateForInput(initialValue.dueDate))
      setCompleted(initialValue.completed ?? false)
    } else {
      // 초기화 (새 할 일 추가 모드)
      setTitle("")
      setDescription("")
      setPriority("medium")
      setCategory("")
      setDueDate("")
      setCompleted(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue?.id, initialValue?.title, initialValue?.description, initialValue?.priority, initialValue?.category, initialValue?.dueDate, initialValue?.completed])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({
      id: initialValue?.id,
      title,
      description,
      priority,
      category,
      dueDate,
      completed,
    })
  }

  // AI 기반 할 일 생성 핸들러
  const handleGenerateWithAI = async () => {
    const trimmedInput = aiInput.trim()
    
    // 입력 검증
    if (!trimmedInput) {
      setAiError("내용을 정확히 입력해 주세요.")
      return
    }

    // 최소 길이 검증 (2자)
    if (trimmedInput.length < 2) {
      setAiError("입력 내용은 최소 2자 이상이어야 합니다.")
      return
    }

    // 최대 길이 검증 (500자)
    if (trimmedInput.length > 500) {
      setAiError(`입력 내용은 500자 이하여야 합니다. (현재: ${trimmedInput.length}자)`)
      return
    }

    // 의미있는 텍스트인지 검증
    // 제어 문자 제거 후 검증
    const cleanedText = trimmedInput.replace(/[\x00-\x1F\x7F]/g, "")
    
    // 1. 한글, 영문, 숫자 포함 여부 확인
    const hasMeaningfulContent = /[가-힣a-zA-Z0-9]/.test(cleanedText)
    
    if (!hasMeaningfulContent) {
      setAiError("잘못된 입력입니다. 할 일을 설명하는 내용을 입력해주세요.")
      return
    }

    // 2. 반복되는 문자만 있는 경우 체크 (예: "00", "ㅇㅇ", "aaa", "111")
    const isRepeatingChars = /^(.)\1+$/.test(cleanedText)
    if (isRepeatingChars) {
      setAiError("잘못된 입력입니다. 의미있는 할 일 내용을 입력해주세요.")
      return
    }

    // 3. 의미없는 한글 자음/모음만 반복 (예: "ㅇㅇ", "ㄱㄱ", "ㅏㅏ")
    const isOnlyHangulJamo = /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(cleanedText)
    if (isOnlyHangulJamo) {
      setAiError("잘못된 입력입니다. 완성된 단어나 문장을 입력해주세요.")
      return
    }

    // 4. 숫자만 반복하거나 의미없는 숫자 조합 (예: "00", "11", "123", "1234")
    const isOnlyNumbers = /^[0-9]+$/.test(cleanedText)
    if (isOnlyNumbers && cleanedText.length <= 4) {
      setAiError("잘못된 입력입니다. 할 일을 설명하는 내용을 입력해주세요.")
      return
    }

    setIsGenerating(true)
    setAiError(null)

    try {
      const response = await fetch("/api/todos/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: trimmedInput }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || "할 일 생성에 실패했습니다."
        setAiError(errorMessage)
        return
      }

      const data = await response.json()

      // 날짜와 시간을 결합하여 datetime-local 형식으로 변환
      const combinedDateTime = data.due_date && data.due_time
        ? `${data.due_date}T${data.due_time}`
        : ""

      // 폼 필드 자동 채우기
      setTitle(data.title || "")
      setDescription(data.description || "")
      setPriority(data.priority || "medium")
      setCategory(data.category || "")
      setDueDate(combinedDateTime)

      // AI 입력 필드 초기화
      setAiInput("")
    } catch (error: any) {
      console.error("AI 할 일 생성 오류:", error)
      setAiError(error?.message || "할 일 생성 중 오류가 발생했습니다.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* AI 기반 할 일 생성 섹션 (수정 모드가 아닐 때만 표시) */}
      {!isEditing && (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <Label htmlFor="ai-input" className="text-sm font-semibold">
              AI로 할 일 생성
            </Label>
          </div>
          <Textarea
            id="ai-input"
            value={aiInput}
            onChange={(event) => {
              setAiInput(event.target.value)
              setAiError(null)
            }}
            placeholder="예: 내일 오후 3시까지 중요한 팀 회의 준비하기"
            rows={2}
            disabled={isGenerating}
            className="resize-none"
          />
          {aiError && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-sm">{aiError}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateWithAI}
            disabled={isGenerating || !aiInput.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Spinner className="mr-2 size-4" />
                생성 중...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-4" />
                AI로 생성하기
              </>
            )}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="todo-title">제목</Label>
          <Input
            id="todo-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 팀 회의 준비"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="todo-description">설명</Label>
          <Textarea
            id="todo-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="할 일에 대한 구체적인 설명을 입력하세요."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="todo-priority">우선순위</Label>
          <Select value={priority} onValueChange={(value) => setPriority(value as TodoPriority)}>
            <SelectTrigger id="todo-priority" className="w-full">
              <SelectValue placeholder="우선순위 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">높음</SelectItem>
              <SelectItem value="medium">보통</SelectItem>
              <SelectItem value="low">낮음</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="todo-category">카테고리</Label>
          <Select value={category || ""} onValueChange={(value) => setCategory(value)}>
            <SelectTrigger id="todo-category" className="w-full">
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="업무">업무</SelectItem>
              <SelectItem value="개인">개인</SelectItem>
              <SelectItem value="학습">학습</SelectItem>
              <SelectItem value="기타">기타</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="todo-due">마감일시</Label>
          <Input
            id="todo-due"
            type="datetime-local"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <div className="space-y-2 flex items-center gap-2 md:col-span-2">
          <Checkbox id="todo-completed" checked={completed} onCheckedChange={() => setCompleted((prev) => !prev)} />
          <Label htmlFor="todo-completed" className="m-0 cursor-pointer">
            완료 처리
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
        ) : null}
        <Button type="submit" variant="default" className="min-w-28">
          {isEditing ? submitLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}

export { TodoForm }

