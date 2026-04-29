'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Execution {
  id: string
  workflow_id: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'canceled'
  started_at: string | null
  finished_at: string | null
  nodes_total: number
  nodes_success: number
  nodes_failed: number
  workflows: { name: string; icon: string | null } | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}일 전`
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

const STATUS_META = {
  success:  { icon: CheckCircle, cls: 'text-green-500', label: '성공', bg: 'bg-green-50' },
  failed:   { icon: XCircle,     cls: 'text-red-400',   label: '실패', bg: 'bg-red-50' },
  running:  { icon: Loader2,     cls: 'text-violet-500 animate-spin', label: '실행 중', bg: 'bg-violet-50' },
  queued:   { icon: Clock,       cls: 'text-gray-400',  label: '대기', bg: 'bg-gray-50' },
  canceled: { icon: Clock,       cls: 'text-gray-400',  label: '취소', bg: 'bg-gray-50' },
}

export default function RecentExecutions({ executions }: { executions: Execution[] }) {
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? executions : executions.slice(0, 5)

  if (executions.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-400">
        아직 실행 기록이 없어요. 워크플로우를 실행해보세요!
      </div>
    )
  }

  return (
    <div>
      <div className="divide-y divide-gray-50">
        {visible.map(exec => {
          const meta = STATUS_META[exec.status] ?? STATUS_META.queued
          const Icon = meta.icon

          return (
            <div key={exec.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/80 transition-colors">
              {/* 상태 아이콘 */}
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', meta.bg)}>
                <Icon className={cn('w-3.5 h-3.5', meta.cls)} />
              </div>

              {/* 워크플로우 이름 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  <span>{exec.workflows?.icon ?? '⚡'}</span>
                  <span className="truncate">{exec.workflows?.name ?? '알 수 없는 워크플로우'}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {timeAgo(exec.started_at)}
                  {exec.nodes_total > 0 && (
                    <span className="ml-2">
                      노드 {exec.nodes_success}/{exec.nodes_total}
                      {exec.nodes_failed > 0 && (
                        <span className="text-red-400 ml-1">({exec.nodes_failed}개 실패)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* 소요 시간 */}
              <div className="text-xs text-gray-400 shrink-0">
                {duration(exec.started_at, exec.finished_at)}
              </div>

              {/* 상태 배지 */}
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full shrink-0',
                exec.status === 'success' ? 'text-green-600 bg-green-50' :
                exec.status === 'failed'  ? 'text-red-500 bg-red-50' :
                exec.status === 'running' ? 'text-violet-600 bg-violet-50' :
                'text-gray-500 bg-gray-100'
              )}>
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>

      {executions.length > 5 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-gray-400 hover:text-gray-600 transition-colors border-t border-gray-50"
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? '접기' : `${executions.length - 5}개 더 보기`}
        </button>
      )}
    </div>
  )
}
