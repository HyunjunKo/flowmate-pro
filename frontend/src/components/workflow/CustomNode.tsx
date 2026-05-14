'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'

const typeColors: Record<string, { border: string; bg: string; badge: string }> = {
  trigger:   { border: 'border-violet-400', bg: 'bg-white',      badge: 'bg-violet-100 text-violet-600' },
  action:    { border: 'border-blue-400',   bg: 'bg-white',      badge: 'bg-blue-100 text-blue-600' },
  condition: { border: 'border-yellow-400', bg: 'bg-white',      badge: 'bg-yellow-100 text-yellow-700' },
  transform: { border: 'border-green-400',  bg: 'bg-white',      badge: 'bg-green-100 text-green-700' },
  delay:     { border: 'border-gray-400',   bg: 'bg-white',      badge: 'bg-gray-100 text-gray-600' },
  ai:        { border: 'border-pink-400',   bg: 'bg-white',      badge: 'bg-pink-100 text-pink-600' },
}

const typeLabels: Record<string, string> = {
  trigger:   '트리거',
  action:    '액션',
  condition: '조건',
  transform: '변환',
  delay:     '대기',
  ai:        'AI',
}

// config에서 사람이 읽기 쉬운 요약 한 줄 추출
function getConfigSummary(nodeKey: string = '', config: Record<string, unknown> = {}): string | null {
  if (!config || Object.keys(config).length === 0) return null

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = config[k]
      if (v && String(v).trim()) return String(v).trim()
    }
    return null
  }

  if (nodeKey.includes('kakao'))       return pick('message', 'content', 'template_name')
  if (nodeKey.includes('gmail'))       return pick('to', 'subject')
  if (nodeKey.includes('slack'))       return pick('channel', 'message')
  if (nodeKey.includes('sheets'))      return pick('spreadsheet_id', 'sheet_name')
  if (nodeKey.includes('ai.generate')) return pick('prompt')
  if (nodeKey.includes('ai.summarize'))return pick('text')
  if (nodeKey.includes('ai.translate'))return `→ ${pick('target_language') ?? ''}`
  if (nodeKey.includes('ai.sentiment'))return pick('text')
  if (nodeKey.includes('delay'))       return `${pick('amount') ?? '?'}${pick('unit') ?? '분'}`
  if (nodeKey.includes('condition'))   {
    const conds = config['conditions'] as unknown[]
    return conds?.length ? `${conds.length}개 조건` : null
  }
  if (nodeKey.includes('transform.text')) {
    const ops = config['operations'] as string[]
    return ops?.length ? ops.slice(0, 2).join(', ') : null
  }
  if (nodeKey.includes('format_date')) return pick('format')
  return pick('to', 'channel', 'message', 'prompt', 'text', 'subject', 'spreadsheet_id')
}

export default function CustomNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label: string
    description: string
    nodeType: string
    icon: string
    nodeKey?: string
    config?: Record<string, unknown>
  }

  const colors = typeColors[nodeData.nodeType] ?? typeColors.action
  const summary = getConfigSummary(nodeData.nodeKey, nodeData.config ?? {})
  const isConfigured = !!summary

  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[240px] rounded-xl border-2 shadow-sm overflow-hidden transition-all',
        colors.border,
        colors.bg,
        selected && 'shadow-lg ring-2 ring-violet-400 ring-offset-1'
      )}
    >
      {nodeData.nodeType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white"
        />
      )}

      <div className="px-3 py-3">
        {/* 헤더 */}
        <div className="flex items-start gap-2.5">
          <span className="text-xl shrink-0 leading-none mt-0.5">{nodeData.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', colors.badge)}>
                {typeLabels[nodeData.nodeType] ?? nodeData.nodeType}
              </span>
              {isConfigured && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="설정됨" />
              )}
            </div>
            <div className="text-sm font-semibold text-gray-900 leading-tight truncate">
              {nodeData.label}
            </div>
          </div>
        </div>

        {/* 설정값 요약 */}
        {summary ? (
          <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 truncate border border-gray-100">
            {summary}
          </div>
        ) : (
          <div className="mt-2 text-xs text-gray-300 italic">
            {nodeData.nodeType === 'trigger' ? '실행 준비됨' : '클릭해서 설정'}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white"
      />
    </div>
  )
}
