// 개별 할 일 카드를 표시한다.
"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { TodoItem } from "./types"

const priorityLabel: Record<TodoItem["priority"], string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
}

type TodoCardProps = {
  todo: TodoItem
  onToggleComplete?: (id: string, nextCompleted: boolean) => void
  onEdit?: (todo: TodoItem) => void
  onDelete?: (id: string) => void
}

/** 할 일 정보를 카드 형태로 보여주고 액션을 제공한다. */
const TodoCard = ({ todo, onToggleComplete, onEdit, onDelete }: TodoCardProps) => {
  const handleToggle = () => {
    onToggleComplete?.(todo.id, !todo.completed)
  }

  return (
    <Card className="gap-4">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={todo.completed}
              onCheckedChange={handleToggle}
              aria-label="완료 표시"
            />
            <div className="space-y-1">
              <CardTitle
                className={cn(
                  "text-base font-semibold",
                  todo.completed && "text-muted-foreground line-through"
                )}
              >
                {todo.title}
              </CardTitle>
              {todo.description ? (
                <CardDescription className={cn(todo.completed && "line-through")}>
                  {todo.description}
                </CardDescription>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="px-2 py-0.5">
                  우선순위 · {priorityLabel[todo.priority]}
                </Badge>
                {todo.category ? (
                  <Badge variant="secondary" className="px-2 py-0.5">
                    {todo.category}
                  </Badge>
                ) : null}
                {todo.dueDate ? <span>마감: {todo.dueDate}</span> : null}
              </div>
            </div>
          </div>
          <CardAction className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit?.(todo)}>
              수정
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete?.(todo.id)}
            >
              삭제
            </Button>
          </CardAction>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {todo.createdAt ? <span>생성: {todo.createdAt}</span> : null}
      </CardContent>
      <CardFooter />
    </Card>
  )
}

export { TodoCard }

