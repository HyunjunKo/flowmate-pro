'use client'

import { useState, useEffect } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { fetchNodeDefinitions, type NodeDefinition } from '@/lib/api/nodes'

interface NodeItem {
  label: string
  description: string
  nodeType: string
  icon: string
  nodeKey: string
}

interface Props {
  onAdd: (node: NodeItem) => void
  onClose: () => void
}

export default function NodePanel({ onAdd, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [nodes, setNodes] = useState<NodeDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNodeDefinitions()
      .then(setNodes)
      .finally(() => setLoading(false))
  }, [])

  // DB 데이터를 카테고리별로 그룹핑
  const grouped = nodes.reduce<Record<string, NodeDefinition[]>>((acc, node) => {
    const cat = node.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(node)
    return acc
  }, {})

  const filtered = Object.entries(grouped)
    .map(([category, items]) => ({
      category,
      items: items.filter(
        (n) =>
          n.display_name_ko.includes(search) ||
          (n.description_ko ?? '').includes(search) ||
          category.includes(search)
      ),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="w-72 bg-white border-l border-gray-100 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">노드 추가</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-3 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="노드 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            검색 결과가 없습니다
          </div>
        ) : (
          filtered.map(({ category, items }) => (
            <div key={category}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                {category}
              </div>
              <div className="space-y-1">
                {items.map((node) => (
                  <button
                    key={node.key}
                    onClick={() => onAdd({
                      label: node.display_name_ko,
                      description: node.description_ko,
                      nodeType: node.node_type,
                      icon: node.ui_config?.icon ?? '⚙️',
                      nodeKey: node.key,
                    })}
                    className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50 transition-colors group"
                  >
                    <span className="text-xl mt-0.5">{node.ui_config?.icon ?? '⚙️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 group-hover:text-violet-700">
                        {node.display_name_ko}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{node.description_ko}</div>
                      {node.ui_config?.hint && (
                        <div className="text-xs text-violet-400 mt-0.5">{node.ui_config.hint}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
