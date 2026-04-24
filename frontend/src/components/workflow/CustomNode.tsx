'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'

const typeColors: Record<string, string> = {
  trigger: 'border-violet-400 bg-violet-50',
  action:  'border-blue-400 bg-blue-50',
  condition: 'border-yellow-400 bg-yellow-50',
  transform: 'border-green-400 bg-green-50',
  delay: 'border-gray-400 bg-gray-50',
  ai: 'border-pink-400 bg-pink-50',
}

const typeLabels: Record<string, string> = {
  trigger: '트리거',
  action: '액션',
  condition: '조건',
  transform: '변환',
  delay: '대기',
  ai: 'AI',
}

export default function CustomNode({ data, selected }: NodeProps) {
  const nodeData = data as { label: string; description: string; nodeType: string; icon: string }
  const colorClass = typeColors[nodeData.nodeType] ?? 'border-gray-400 bg-gray-50'

  return (
    <div
      className={cn(
        'min-w-[180px] rounded-xl border-2 shadow-sm bg-white overflow-hidden transition-shadow',
        colorClass,
        selected && 'shadow-lg ring-2 ring-violet-400 ring-offset-1'
      )}
    >
      {nodeData.nodeType !== 'trigger' && (
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-gray-400" />
      )}

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{nodeData.icon}</span>
          <div>
            <div className="text-xs font-medium text-gray-400">
              {typeLabels[nodeData.nodeType] ?? nodeData.nodeType}
            </div>
            <div className="text-sm font-semibold text-gray-900 leading-tight">
              {nodeData.label}
            </div>
          </div>
        </div>
        {nodeData.description && (
          <p className="text-xs text-gray-500 mt-1">{nodeData.description}</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-gray-400" />
    </div>
  )
}
