'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Save, Play, Loader2, CheckCircle } from 'lucide-react'

interface Props {
  workflowName: string
  onNameChange: (name: string) => void
  onSave: () => void
  onAddNode: () => void
  saving?: boolean
  saveMsg?: string
}

export default function EditorToolbar({ workflowName, onNameChange, onSave, onAddNode, saving, saveMsg }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(workflowName)

  const commitName = () => {
    onNameChange(draft)
    setEditing(false)
  }

  return (
    <div className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 shrink-0">
      <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 transition-colors">
        <ChevronLeft className="w-5 h-5" />
      </Link>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
          className="font-semibold text-gray-900 border-b-2 border-violet-500 outline-none bg-transparent"
        />
      ) : (
        <button
          onClick={() => { setDraft(workflowName); setEditing(true) }}
          className="font-semibold text-gray-900 hover:text-violet-700 transition-colors"
        >
          {workflowName}
        </button>
      )}

      <span className="text-xs text-gray-300 ml-1">클릭해서 이름 변경</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onAddNode}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
          노드 추가
        </button>
        {saveMsg && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" />
            {saveMsg}
          </span>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </button>
        <button className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 rounded-lg transition-colors">
          <Play className="w-4 h-4" />
          실행
        </button>
      </div>
    </div>
  )
}
