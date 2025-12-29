// 할 일 목록을 렌더링한다.
"use client"

import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

import type { TodoItem } from "./types"
import { TodoCard } from "./TodoCard"

type TodoListProps = {
  todos: TodoItem[]
  isLoading?: boolean
  emptyMessage?: string
  onToggleComplete?: (id: string, nextCompleted: boolean) => void
  onEdit?: (todo: TodoItem) => void
  onDelete?: (id: string) => void
}

/** 할 일 배열을 카드 목록으로 보여준다. */
const TodoList = ({
  todos,
  isLoading = false,
  emptyMessage = "등록된 할 일이 없습니다.",
  onToggleComplete,
  onEdit,
  onDelete,
}: TodoListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    )
  }

  if (!todos.length) {
    return (
      <Empty className="border">
        <EmptyContent>
          <EmptyTitle>할 일이 비어 있어요</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      {todos.map((todo) => (
        <TodoCard
          key={todo.id}
          todo={todo}
          onToggleComplete={onToggleComplete}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

export { TodoList }

