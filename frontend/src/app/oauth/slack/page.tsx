'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

function SlackCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error || !code) {
      router.replace('/dashboard/integrations?error=slack_denied')
      return
    }

    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('로그인이 필요합니다')

        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'
        const res = await fetch(`${baseUrl}/api/v1/integrations/oauth/slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, user_id: user.id, redirect_uri: `${location.origin}/oauth/slack` }),
        })
        if (!res.ok) throw new Error('Slack 연동 실패')
        router.replace('/dashboard/integrations?connected=slack')
      } catch (e) {
        console.error(e)
        router.replace('/dashboard/integrations?error=slack_failed')
      }
    })()
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      <p className="text-sm text-gray-500">Slack 워크스페이스 연결 중...</p>
    </div>
  )
}

export default function SlackOAuthCallback() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        <p className="text-sm text-gray-500">Slack 워크스페이스 연결 중...</p>
      </div>
    }>
      <SlackCallback />
    </Suspense>
  )
}
