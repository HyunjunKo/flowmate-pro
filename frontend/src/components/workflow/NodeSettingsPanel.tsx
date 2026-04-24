'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface SchemaProperty {
  type: string
  title?: string
  description?: string
  enum?: string[]
  default?: unknown
  minimum?: number
  items?: { type: string }
}

interface InputSchema {
  type: string
  properties: Record<string, SchemaProperty>
  required?: string[]
}

interface NodeData {
  label: string
  description: string
  nodeType: string
  icon: string
  nodeKey?: string
  config?: Record<string, unknown>
}

interface Props {
  nodeId: string
  nodeData: NodeData
  onClose: () => void
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void
}

export default function NodeSettingsPanel({ nodeId, nodeData, onClose, onUpdate }: Props) {
  const [schema, setSchema] = useState<InputSchema | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>(nodeData.config ?? {})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!nodeData.nodeKey) {
      setLoading(false)
      return
    }
    const supabase = createClient()
    supabase
      .from('node_definitions')
      .select('input_schema, ui_config')
      .eq('key', nodeData.nodeKey)
      .single()
      .then(({ data }) => {
        if (data?.input_schema) {
          setSchema(data.input_schema as InputSchema)
          // 기본값 세팅
          const defaults: Record<string, unknown> = {}
          Object.entries((data.input_schema as InputSchema).properties ?? {}).forEach(([key, prop]) => {
            if (prop.default !== undefined && values[key] === undefined) {
              defaults[key] = prop.default
            }
          })
          if (Object.keys(defaults).length > 0) {
            setValues(prev => ({ ...defaults, ...prev }))
          }
        }
        setLoading(false)
      })
  }, [nodeData.nodeKey])

  const handleChange = (key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const handleApply = () => {
    onUpdate(nodeId, values)
    onClose()
  }

  const properties = schema?.properties ?? {}
  const required = schema?.required ?? []

  return (
    <div className="w-80 bg-white border-l border-gray-100 flex flex-col h-full shrink-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">{nodeData.icon}</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">{nodeData.label}</div>
            <div className="text-xs text-gray-400">{nodeData.description}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 폼 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-8">불러오는 중...</div>
        ) : Object.keys(properties).length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">
            설정할 항목이 없습니다
          </div>
        ) : (
          Object.entries(properties).map(([key, prop]) => (
            <FieldRenderer
              key={key}
              fieldKey={key}
              prop={prop}
              value={values[key]}
              required={required.includes(key)}
              onChange={(v) => handleChange(key, v)}
            />
          ))
        )}
      </div>

      {/* 적용 버튼 */}
      {!loading && Object.keys(properties).length > 0 && (
        <div className="px-4 py-4 border-t border-gray-100">
          <button
            onClick={handleApply}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            적용하기
          </button>
        </div>
      )}
    </div>
  )
}

function FieldRenderer({
  fieldKey, prop, value, required, onChange,
}: {
  fieldKey: string
  prop: SchemaProperty
  value: unknown
  required: boolean
  onChange: (v: unknown) => void
}) {
  const label = prop.title ?? fieldKey
  const hint = prop.description

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {hint && (
        <p className="text-xs text-gray-400 mb-2 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          {hint}
        </p>
      )}

      {/* enum → 선택 드롭다운 */}
      {prop.enum ? (
        <SelectField value={value as string} options={prop.enum} onChange={onChange} />

      /* boolean → 토글 */
      ) : prop.type === 'boolean' ? (
        <ToggleField value={value as boolean} onChange={onChange} />

      /* integer/number → 숫자 입력 */
      ) : prop.type === 'integer' || prop.type === 'number' ? (
        <input
          type="number"
          value={(value as number) ?? prop.default ?? ''}
          min={prop.minimum}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

      /* 긴 텍스트 (message, content, body 등) → textarea */
      ) : ['message', 'content', 'body', 'prompt', 'text'].some(k => fieldKey.includes(k)) ? (
        <textarea
          rows={4}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label}을 입력하세요`}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
        />

      /* 기본 텍스트 */
      ) : (
        <input
          type={fieldKey.includes('email') ? 'email' : fieldKey.includes('phone') ? 'tel' : 'text'}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label}을 입력하세요`}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      )}
    </div>
  )
}

function SelectField({ value, options, onChange }: { value: string; options: string[]; onChange: (v: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const selected = value ?? options[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>{selected ?? '선택하세요'}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-violet-50 hover:text-violet-700 transition-colors',
                selected === opt && 'bg-violet-50 text-violet-700 font-medium'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToggleField({ value, onChange }: { value: boolean; onChange: (v: unknown) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        value ? 'bg-violet-600' : 'bg-gray-200'
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        value ? 'translate-x-6' : 'translate-x-1'
      )} />
    </button>
  )
}
