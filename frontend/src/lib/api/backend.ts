const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? '요청 실패')
  }
  return res.json()
}

export interface Execution {
  execution_id: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'canceled'
}

export interface ExecutionDetail extends Execution {
  started_at: string | null
  finished_at: string | null
  nodes_total: number
  nodes_success: number
  nodes_failed: number
  error_message: string | null
  execution_node_logs: NodeLog[]
}

export interface NodeLog {
  id: string
  node_id: string
  node_key: string
  status: string
  input_data: Record<string, unknown>
  output_data: Record<string, unknown>
  error_message: string | null
  started_at: string
  finished_at: string
}

export async function startExecution(workflowId: string, userId: string): Promise<Execution> {
  return request('/api/v1/executions/', {
    method: 'POST',
    body: JSON.stringify({ workflow_id: workflowId, triggered_by: userId }),
  })
}

export async function getExecution(executionId: string): Promise<ExecutionDetail> {
  return request(`/api/v1/executions/${executionId}`)
}

export async function listExecutions(workflowId: string): Promise<ExecutionDetail[]> {
  return request(`/api/v1/executions/?workflow_id=${workflowId}`)
}
