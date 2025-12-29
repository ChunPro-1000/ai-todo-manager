// 할 일 도메인 타입을 정의한다.

export type TodoPriority = "high" | "medium" | "low"

export type TodoItem = {
  id: string
  title: string
  description?: string
  createdAt?: string
  dueDate?: string
  priority: TodoPriority
  category?: string
  completed: boolean
}

export type TodoFormValues = Omit<TodoItem, "id" | "createdAt"> & {
  id?: string
}

