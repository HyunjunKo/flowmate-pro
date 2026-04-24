'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Plus, Trash2, Loader2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Provider {
  id: string
  key: string
  display_name: string
  description_ko: string
  icon_url: string | null
  category: string
  auth_type: string
  is_korean_service: boolean
  required_plan: string
}

interface UserIntegration {
  id: string
  provider_id: string
  display_name: string | null
  status: string
  external_account_email: string | null
  last_used_at: string | null
}

interface Toast {
  type: 'success' | 'error'
  message: string
}

const PROVIDER_ICONS: Record<string, string> = {
  kakao: '💛',
  naver: '🟢',
  kakaotalk_biz: '📣',
  gmail: '📧',
  outlook: '📫',
  slack: '💼',
  notion: '📓',
  google_sheets: '📊',
  google_calendar: '📅',
  google_drive: '📁',
  flowmate: '⚡',
}

const CONNECTED_LABELS: Record<string, string> = {
  kakao: '카카오',
  naver: '네이버',
  gmail: 'Gmail',
  google_sheets: 'Google Sheets',
  slack: 'Slack',
}

const OAUTH_URLS: Record<string, string> = {
  kakao: `https://kauth.kakao.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? `${location.origin}/oauth/kakao` : '')}&response_type=code`,
  naver: `https://nid.naver.com/oauth2.0/authorize?client_id=${process.env.NEXT_PUBLIC_NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? `${location.origin}/oauth/naver` : '')}&response_type=code&state=naver`,
  gmail: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? `${location.origin}/oauth/google` : '')}&response_type=code&scope=https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email&access_type=offline&prompt=consent`,
  google_sheets: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? `${location.origin}/oauth/google` : '')}&response_type=code&scope=https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email&access_type=offline&prompt=consent`,
  slack: `https://slack.com/oauth/v2/authorize?client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&scope=chat:write&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? `${location.origin}/oauth/slack` : '')}`,
}

const CATEGORY_LABELS: Record<string, string> = {
  messaging: '메시지',
  email: '이메일',
  productivity: '생산성',
  calendar: '일정',
  storage: '저장소',
  custom: '기타',
}

const ERROR_MESSAGES: Record<string, string> = {
  kakao_denied: '카카오 연동이 취소됐습니다',
  kakao_failed: '카카오 연동 중 오류가 발생했습니다',
  naver_denied: '네이버 연동이 취소됐습니다',
  naver_failed: '네이버 연동 중 오류가 발생했습니다',
  google_denied: 'Google 연동이 취소됐습니다',
  google_failed: 'Google 연동 중 오류가 발생했습니다',
  slack_denied: 'Slack 연동이 취소됐습니다',
  slack_failed: 'Slack 연동 중 오류가 발생했습니다',
}

function IntegrationsContent() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [connected, setConnected] = useState<UserIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadData()

    // OAuth 콜백 결과 처리
    const connectedKey = searchParams.get('connected')
    const errorKey = searchParams.get('error')
    if (connectedKey) {
      showToast('success', `${CONNECTED_LABELS[connectedKey] ?? connectedKey} 연동이 완료됐습니다!`)
      router.replace('/dashboard/integrations')
    } else if (errorKey) {
      showToast('error', ERROR_MESSAGES[errorKey] ?? '연동 중 오류가 발생했습니다')
      router.replace('/dashboard/integrations')
    }
  }, [])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const [pRes, iRes] = await Promise.all([
      supabase.from('integration_providers').select('*').eq('is_available', true).order('is_korean_service', { ascending: false }),
      supabase.from('user_integrations').select('*').eq('user_id', user!.id).eq('status', 'active'),
    ])
    setProviders(pRes.data ?? [])
    setConnected(iRes.data ?? [])
    setLoading(false)
  }

  const getIntegration = (providerId: string) =>
    connected.find(c => c.provider_id === providerId)

  const handleConnect = (providerKey: string) => {
    const url = OAUTH_URLS[providerKey]
    if (url) {
      window.location.href = url
    } else {
      showToast('error', '해당 서비스 연동은 준비 중입니다')
    }
  }

  const handleDisconnect = async (integrationId: string, providerName: string) => {
    if (!confirm(`${providerName} 연동을 해제하시겠습니까?`)) return
    setDisconnecting(integrationId)
    const { error } = await supabase
      .from('user_integrations')
      .update({ status: 'revoked' })
      .eq('id', integrationId)
    if (error) {
      showToast('error', '연동 해제 중 오류가 발생했습니다')
    } else {
      setConnected(prev => prev.filter(c => c.id !== integrationId))
      showToast('success', `${providerName} 연동이 해제됐습니다`)
    }
    setDisconnecting(null)
  }

  // 카테고리별 그룹핑 (순서 유지)
  const grouped = providers.reduce<Record<string, Provider[]>>((acc, p) => {
    const cat = p.is_korean_service ? '한국 서비스' : (CATEGORY_LABELS[p.category] ?? p.category)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl relative">
      {/* 토스트 */}
      {toast && (
        <div className={cn(
          'fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all',
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        )}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">연동 서비스</h1>
        <p className="text-gray-500 mt-1">계정을 연결하면 워크플로우에서 자동으로 사용할 수 있어요</p>
      </div>

      {/* 연결된 서비스 요약 */}
      {connected.length > 0 && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-8 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-violet-600 shrink-0" />
          <span className="text-sm text-violet-700">
            <strong>{connected.length}개</strong> 서비스가 연결됐습니다 — 워크플로우에서 바로 사용할 수 있어요
          </span>
        </div>
      )}

      {/* 서비스 목록 */}
      <div className="space-y-8">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{category}</h2>
            <div className="grid grid-cols-1 gap-2">
              {items.map(provider => {
                const integration = getIntegration(provider.id)
                const isConnected = !!integration

                return (
                  <div
                    key={provider.id}
                    className={cn(
                      'bg-white border rounded-xl p-4 flex items-center gap-4 transition-all',
                      isConnected ? 'border-green-200 bg-green-50/30' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                    )}
                  >
                    {/* 아이콘 */}
                    <div className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 shrink-0">
                      {PROVIDER_ICONS[provider.key] ?? '🔌'}
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{provider.display_name}</span>
                        {provider.required_plan !== 'free' && (
                          <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100 font-medium">
                            {provider.required_plan}
                          </span>
                        )}
                        {provider.is_korean_service && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                            🇰🇷 한국
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5 truncate">{provider.description_ko}</p>
                      {integration?.external_account_email && (
                        <p className="text-xs text-green-600 mt-1 font-medium">✓ {integration.external_account_email}</p>
                      )}
                    </div>

                    {/* 버튼 */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isConnected ? (
                        <>
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> 연결됨
                          </span>
                          <button
                            onClick={() => handleDisconnect(integration!.id, provider.display_name)}
                            disabled={disconnecting === integration!.id}
                            className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            {disconnecting === integration!.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleConnect(provider.key)}
                          className="flex items-center gap-1.5 text-sm font-medium bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          연결
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  )
}
