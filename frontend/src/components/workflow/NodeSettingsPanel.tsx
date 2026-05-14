'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, Info, CheckCircle, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface SchemaProperty {
  type: string
  title?: string
  description?: string
  enum?: string[]
  default?: unknown
  minimum?: number
  maximum?: number
  items?: { type: string; properties?: Record<string, SchemaProperty>; required?: string[] }
  properties?: Record<string, SchemaProperty>
  required?: string[]
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
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // 노드가 바뀌면 저장 상태 초기화
    setSaved(false)
    setValues(nodeData.config ?? {})

    if (!nodeData.nodeKey) {
      setLoading(false)
      return
    }
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('node_definitions')
      .select('input_schema, ui_config')
      .eq('key', nodeData.nodeKey)
      .single()
      .then(({ data }) => {
        if (data?.input_schema) {
          const inputSchema = data.input_schema as InputSchema
          setSchema(inputSchema)
          // 기존 config가 없을 때만 기본값 채우기
          if (!nodeData.config || Object.keys(nodeData.config).length === 0) {
            const defaults: Record<string, unknown> = {}
            Object.entries(inputSchema.properties ?? {}).forEach(([key, prop]) => {
              if (prop.default !== undefined) defaults[key] = prop.default
              else if (prop.type === 'array') defaults[key] = []
            })
            setValues(defaults)
          }
        }
        setLoading(false)
      })
  }, [nodeId, nodeData.nodeKey])

  const handleChange = (key: string, value: unknown) => {
    setSaved(false)
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const handleApply = () => {
    onUpdate(nodeId, values)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const properties = schema?.properties ?? {}
  const required = schema?.required ?? []
  const isTrigger = nodeData.nodeType === 'trigger'

  return (
    <div className="w-80 bg-white border-l border-gray-100 flex flex-col h-full shrink-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">{nodeData.icon}</span>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm truncate">{nodeData.label}</div>
            <div className="text-xs text-gray-400 truncate">{nodeData.nodeKey}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-600 shrink-0 ml-2">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 폼 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isTrigger && Object.keys(properties).length === 0 ? (
          <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 text-sm text-violet-700">
            <p className="font-medium mb-1">트리거 노드</p>
            <p className="text-xs text-violet-500">
              {nodeData.nodeKey === 'trigger.manual'
                ? '상단 ▶ 버튼을 누르면 즉시 실행됩니다.'
                : nodeData.nodeKey === 'trigger.schedule'
                ? '설정한 일정에 자동으로 실행됩니다.'
                : '외부 이벤트가 발생하면 자동으로 실행됩니다.'}
            </p>
          </div>
        ) : Object.keys(properties).length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">설정할 항목이 없습니다</div>
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

        {/* 변수 참조 힌트 */}
        {!loading && Object.keys(properties).length > 0 && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs text-gray-400 font-medium mb-1">💡 이전 노드 출력 참조</p>
            <p className="text-xs text-gray-400 font-mono">{'{{노드ID.필드명}}'}</p>
            <p className="text-xs text-gray-400 mt-0.5">예: {'{{node-1234.text}}'}</p>
          </div>
        )}
      </div>

      {/* 적용 버튼 */}
      {!loading && Object.keys(properties).length > 0 && (
        <div className="px-4 py-4 border-t border-gray-100">
          <button
            onClick={handleApply}
            className={cn(
              'w-full font-medium py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2',
              saved
                ? 'bg-green-500 text-white'
                : 'bg-violet-600 hover:bg-violet-700 text-white'
            )}
          >
            {saved ? (
              <><CheckCircle className="w-4 h-4" /> 적용됨</>
            ) : '적용하기'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── 필드 렌더러 ────────────────────────────────────────────────────────────────

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

      {/* enum → 드롭다운 */}
      {prop.enum ? (
        <SelectField value={value as string} options={prop.enum} onChange={onChange} />

      /* boolean → 토글 */
      ) : prop.type === 'boolean' ? (
        <ToggleField value={!!value} onChange={onChange} />

      /* integer / number */
      ) : prop.type === 'integer' || prop.type === 'number' ? (
        <input
          type="number"
          value={(value as number) ?? (prop.default as number) ?? ''}
          min={prop.minimum}
          max={prop.maximum}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

      /* array → items가 object면 조건 목록, 아니면 태그 입력 */
      ) : prop.type === 'array' ? (
        prop.items?.type === 'object' && prop.items.properties
          ? <ObjectArrayField
              value={value as Record<string, unknown>[]}
              itemProperties={prop.items.properties}
              itemRequired={prop.items.required ?? []}
              onChange={onChange}
            />
          : <TagArrayField
              value={value as string[]}
              placeholder={`${label} 입력 후 Enter`}
              onChange={onChange}
            />

      /* textarea — message, content, body, prompt, text, template, subject 포함 필드 */
      ) : ['message', 'content', 'body', 'prompt', 'text', 'template', 'subject', 'description'].some(k => fieldKey.toLowerCase().includes(k)) ? (
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
          type={fieldKey.includes('email') ? 'email' : fieldKey.includes('url') ? 'url' : 'text'}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label}을 입력하세요`}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      )}
    </div>
  )
}

// ── 서브 컴포넌트들 ────────────────────────────────────────────────────────────

function SelectField({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: unknown) => void
}) {
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
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
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
    <div className="flex items-center gap-3">
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
      <span className="text-sm text-gray-600">{value ? '켜짐' : '꺼짐'}</span>
    </div>
  )
}

// 단순 문자열 배열 태그 입력 (예: Google Sheets values)
function TagArrayField({ value, placeholder, onChange }: {
  value: string[]; placeholder: string; onChange: (v: unknown) => void
}) {
  const arr = Array.isArray(value) ? value : []
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim()
    if (!v) return
    onChange([...arr, v])
    setInput('')
  }

  const remove = (i: number) => onChange(arr.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {arr.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {arr.map((item, i) => (
            <span key={i} className="flex items-center gap-1 bg-violet-50 text-violet-700 text-xs px-2 py-1 rounded-full border border-violet-100">
              {item}
              <button onClick={() => remove(i)} className="hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// 오브젝트 배열 입력 (예: 조건 목록 [{field, operator, value}])
function ObjectArrayField({ value, itemProperties, itemRequired, onChange }: {
  value: Record<string, unknown>[]
  itemProperties: Record<string, SchemaProperty>
  itemRequired: string[]
  onChange: (v: unknown) => void
}) {
  const arr = Array.isArray(value) ? value : []

  const addRow = () => {
    const newRow: Record<string, unknown> = {}
    Object.entries(itemProperties).forEach(([k, p]) => {
      newRow[k] = p.default ?? (p.enum ? p.enum[0] : '')
    })
    onChange([...arr, newRow])
  }

  const updateRow = (i: number, key: string, val: unknown) => {
    const updated = arr.map((row, idx) => idx === i ? { ...row, [key]: val } : row)
    onChange(updated)
  }

  const removeRow = (i: number) => onChange(arr.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      {arr.map((row, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400 font-medium">조건 {i + 1}</span>
            <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {Object.entries(itemProperties).map(([key, prop]) => (
            <div key={key}>
              <label className="text-xs text-gray-500 mb-1 block">
                {prop.title ?? key}
                {itemRequired.includes(key) && <span className="text-red-400 ml-1">*</span>}
              </label>
              {prop.enum ? (
                <SelectField value={row[key] as string} options={prop.enum} onChange={(v) => updateRow(i, key, v)} />
              ) : (
                <input
                  type="text"
                  value={(row[key] as string) ?? ''}
                  onChange={(e) => updateRow(i, key, e.target.value)}
                  placeholder={prop.description ?? key}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-violet-400 hover:text-violet-500 transition-colors"
      >
        <Plus className="w-4 h-4" /> 조건 추가
      </button>
    </div>
  )
}
