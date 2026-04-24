import { createClient } from '@/lib/supabase/server'
import { Zap, CheckCircle, XCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 워크플로우 목록 (추후 실제 DB 연동)
  const workflows: Array<{id: string; name: string; status: string; total_runs: number; success_runs: number; fail_runs: number; updated_at: string}> = []

  const stats = [
    { label: '전체 워크플로우', value: workflows.length, icon: Zap, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: '이번 달 성공', value: 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '이번 달 실패', value: 0, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '대기 중', value: 0, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">안녕하세요 👋</h1>
        <p className="text-gray-500 mt-1">{user?.email} · 오늘도 자동화로 시간을 아껴보세요</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-5">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* 최근 워크플로우 */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">내 워크플로우</h2>
          <Link
            href="/dashboard/workflows/new"
            className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            + 새 워크플로우
          </Link>
        </div>

        {workflows.length === 0 ? (
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
        ) : (
          <div className="divide-y divide-gray-50">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                href={`/dashboard/workflows/${wf.id}`}
                className="flex items-center px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{wf.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">수정: {wf.updated_at}</div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  wf.status === 'active' ? 'bg-green-50 text-green-700' :
                  wf.status === 'paused' ? 'bg-yellow-50 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {wf.status === 'active' ? '활성' : wf.status === 'paused' ? '일시정지' : '임시저장'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
