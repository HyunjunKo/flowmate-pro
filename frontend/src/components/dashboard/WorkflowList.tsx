'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, MoreHorizontal, Play, Pause, Copy, Trash2,
  CheckCircle, XCircle, Clock, ChevronRight, Loader2,
} from 'lucide-react'
import { type Workflow, updateWorkflow, deleteWorkflow, duplicateWorkflow } from '@/lib/api/workflows'
import { cn } from '@/lib/utils'

function timeAgo(iso: string): string {
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

const STATUS_STYLE = {
  active:  { label: '활성', cls: 'bg-green-50 text-green-700 border-green-100' },
  paused:  { label: '일시정지', cls: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
  draft:   { label: '임시저장', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  archived:{ label: '보관', cls: 'bg-gray-100 text-gray-400 border-gray-200' },
}

// ── 3점 메뉴 ─────────────────────────────────────────────────────────────────
function WorkflowMenu({
  wf,
  onStatusChange,
  onDuplicate,
  onDelete,
}: {
  wf: Workflow
  onStatusChange: (id: string, status: Workflow['status']) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleStatus = wf.status === 'active' ? 'paused' : 'active'

  return (
    <div ref={ref} className="relative" onClick={e => e.preventDefault()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-100 rounded-xl shadow-lg py-1 text-sm">
          <button
            onClick={() => { onStatusChange(wf.id, toggleStatus); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-gray-700"
          >
            {wf.status === 'active'
              ? <><Pause className="w-4 h-4 text-yellow-500" /> 일시정지</>
              : <><Play className="w-4 h-4 text-green-500" /> 활성화</>}
          </button>
          <button
            onClick={() => { onDuplicate(wf.id); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-gray-700"
          >
            <Copy className="w-4 h-4 text-blue-400" /> 복제
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => { onDelete(wf.id); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 text-red-500"
          >
            <Trash2 className="w-4 h-4" /> 삭제
          </button>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function WorkflowList({ initial }: { initial: Workflow[] }) {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>(initial)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const handleStatusChange = async (id: string, status: Workflow['status']) => {
    setLoadingId(id)
    try {
      await updateWorkflow(id, { status })
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status } : w))
      showToast(status === 'active' ? '워크플로우가 활성화됐습니다' : '일시정지됐습니다')
    } catch {
      showToast('상태 변경에 실패했습니다', 'err')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    setLoadingId(id)
    try {
      const copy = await duplicateWorkflow(id)
      setWorkflows(prev => [copy, ...prev])
      showToast('워크플로우가 복제됐습니다')
    } catch {
      showToast('복제에 실패했습니다', 'err')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('워크플로우를 삭제하시겠습니까? 실행 기록은 유지됩니다.')) return
    setLoadingId(id)
    try {
      await deleteWorkflow(id)
      setWorkflows(prev => prev.filter(w => w.id !== id))
      showToast('삭제됐습니다')
      router.refresh()
    } catch {
      showToast('삭제에 실패했습니다', 'err')
    } finally {
      setLoadingId(null)
    }
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
          <Zap className="w-8 h-8 text-violet-400" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">첫 워크플로우를 만들어보세요</h3>
        <p className="text-sm text-gray-400 mb-5">코딩 없이 반복 작업을 자동화할 수 있어요</p>
        <Link
          href="/dashboard/workflows/new"
          className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          시작하기
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* 토스트 */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2',
          toast.type === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-500 text-white'
        )}>
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {workflows.map((wf) => {
          const statusMeta = STATUS_STYLE[wf.status] ?? STATUS_STYLE.draft
          const isLoading = loadingId === wf.id
          const successRate = wf.total_runs > 0
            ? Math.round((wf.success_runs / wf.total_runs) * 100)
            : null

          return (
            <div key={wf.id} className={cn('flex items-center px-6 py-4 hover:bg-gray-50/80 transition-colors group', isLoading && 'opacity-60 pointer-events-none')}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-400 mr-3 shrink-0" />}

              <Link href={`/dashboard/workflows/${wf.id}`} className="flex-1 min-w-0 flex items-center gap-4">
                {/* 아이콘 */}
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 text-lg">
                  {wf.icon ?? '⚡'}
                </div>

                {/* 이름 + 메타 */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{wf.name}</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeAgo(wf.updated_at)}
                    </span>
                    {wf.total_runs > 0 && (
                      <span className="text-xs text-gray-400">
                        실행 {wf.total_runs}회
                        {successRate !== null && (
                          <span className={successRate >= 80 ? 'text-green-500 ml-1' : 'text-red-400 ml-1'}>
                            ({successRate}% 성공)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* 상태 배지 */}
                <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium border shrink-0', statusMeta.cls)}>
                  {statusMeta.label}
                </span>

                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 shrink-0 transition-colors" />
              </Link>

              {/* 3점 메뉴 */}
              <div className="ml-2">
                <WorkflowMenu
                  wf={wf}
                  onStatusChange={handleStatusChange}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
