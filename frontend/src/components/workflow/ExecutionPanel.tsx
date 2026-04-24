'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { getExecution, type ExecutionDetail, type NodeLog } from '@/lib/api/backend'
import { cn } from '@/lib/utils'

interface Props {
  executionId: string
  onClose: () => void
}

export default function ExecutionPanel({ executionId, onClose }: Props) {
  const [execution, setExecution] = useState<ExecutionDetail | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    const poll = async () => {
      const data = await getExecution(executionId).catch(() => null)
      if (!data) return
      setExecution(data)
      if (data.status === 'success' || data.status === 'failed' || data.status === 'canceled') {
        clearInterval(interval)
      }
    }

    poll()
    interval = setInterval(poll, 1500)
    return () => clearInterval(interval)
  }, [executionId])

  const statusIcon = {
    queued: <Clock className="w-4 h-4 text-yellow-500" />,
    running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    success: <CheckCircle className="w-4 h-4 text-green-500" />,
    failed: <XCircle className="w-4 h-4 text-red-500" />,
    canceled: <XCircle className="w-4 h-4 text-gray-400" />,
  }

  const statusLabel = {
    queued: '대기 중',
    running: '실행 중...',
    success: '성공',
    failed: '실패',
    canceled: '취소됨',
  }

  return (
    <div className="w-80 bg-white border-l border-gray-100 flex flex-col h-full shrink-0">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">실행 결과</h3>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
      </div>

      {!execution ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* 요약 */}
          <div className="px-4 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2 mb-3">
              {statusIcon[execution.status]}
              <span className="font-medium text-gray-900">{statusLabel[execution.status]}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-gray-900">{execution.nodes_total ?? 0}</div>
                <div className="text-xs text-gray-400">전체</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-lg font-bold text-green-600">{execution.nodes_success ?? 0}</div>
                <div className="text-xs text-gray-400">성공</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <div className="text-lg font-bold text-red-600">{execution.nodes_failed ?? 0}</div>
                <div className="text-xs text-gray-400">실패</div>
              </div>
            </div>
          </div>

          {/* 노드별 로그 */}
          <div className="px-4 py-3 space-y-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">노드 실행 로그</div>
            {(execution.execution_node_logs ?? []).map((log) => (
              <NodeLogItem
                key={log.id}
                log={log}
                expanded={expanded === log.id}
                onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
              />
            ))}
            {(execution.status === 'queued' || execution.status === 'running') && (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                실행 중...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NodeLogItem({ log, expanded, onToggle }: { log: NodeLog; expanded: boolean; onToggle: () => void }) {
  const statusColor = {
    success: 'text-green-600 bg-green-50',
    failed: 'text-red-600 bg-red-50',
    running: 'text-blue-600 bg-blue-50',
    skipped: 'text-gray-400 bg-gray-50',
    pending: 'text-gray-400 bg-gray-50',
  }

  const statusLabel = { success: '성공', failed: '실패', running: '실행 중', skipped: '건너뜀', pending: '대기' }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <span className="text-sm text-gray-700 font-medium">{log.node_key}</span>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor[log.status as keyof typeof statusColor] ?? 'text-gray-400 bg-gray-50')}>
          {statusLabel[log.status as keyof typeof statusLabel] ?? log.status}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-50">
          {log.error_message && (
            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600">{log.error_message}</div>
          )}
          {log.output_data && Object.keys(log.output_data).length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-400 mb-1">출력값</div>
              <pre className="text-xs bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap text-gray-700">
                {JSON.stringify(log.output_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
