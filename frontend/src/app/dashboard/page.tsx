import { createClient } from '@/lib/supabase/server'
import { Zap, CheckCircle, XCircle, TrendingUp, Plus } from 'lucide-react'
import Link from 'next/link'
import WorkflowList from '@/components/dashboard/WorkflowList'
import RecentExecutions from '@/components/dashboard/RecentExecutions'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: workflows }, { data: executions }] = await Promise.all([
    supabase
      .from('workflows')
      .select('*')
      .eq('user_id', user!.id)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false }),
    supabase
      .from('executions')
      .select('id, workflow_id, status, started_at, finished_at, nodes_total, nodes_success, nodes_failed, workflows(name, icon)')
      .eq('triggered_by', user!.id)
      .order('started_at', { ascending: false })
      .limit(20),
  ])

  const wfList = workflows ?? []
  const execList = executions ?? []

  const totalRuns   = wfList.reduce((s, w) => s + (w.total_runs ?? 0), 0)
  const totalSuccess = wfList.reduce((s, w) => s + (w.success_runs ?? 0), 0)
  const totalFail   = wfList.reduce((s, w) => s + (w.fail_runs ?? 0), 0)
  const activeCount = wfList.filter(w => w.status === 'active').length
  const successRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 100) : null

  const stats = [
    {
      label: '전체 워크플로우',
      value: wfList.length,
      sub: `${activeCount}개 활성`,
      icon: Zap,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: '누적 실행',
      value: totalRuns,
      sub: successRate !== null ? `성공률 ${successRate}%` : '아직 실행 없음',
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '성공',
      value: totalSuccess,
      sub: '정상 완료된 실행',
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: '실패',
      value: totalFail,
      sub: '오류 발생한 실행',
      icon: XCircle,
      color: 'text-red-500',
      bg: 'bg-red-50',
    },
  ]

  // 사용자 이름 추출
  const displayName = user?.user_metadata?.full_name
    ?? user?.email?.split('@')[0]
    ?? '사용자'

  return (
    <div className="p-8 max-w-5xl">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">안녕하세요, {displayName} 👋</h1>
        <p className="text-gray-400 mt-1 text-sm">{user?.email} · 오늘도 자동화로 시간을 아껴보세요</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{label}</div>
            <div className="text-xs text-gray-400 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* 워크플로우 목록 (3/5) */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">내 워크플로우</h2>
            <Link
              href="/dashboard/workflows/new"
              className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-1.5 rounded-lg transition-colors font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> 새 워크플로우
            </Link>
          </div>
          <WorkflowList initial={wfList} />
        </div>

        {/* 최근 실행 히스토리 (2/5) */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">최근 실행</h2>
            <p className="text-xs text-gray-400 mt-0.5">전체 워크플로우 최근 20건</p>
          </div>
          <RecentExecutions executions={execList as any} />
        </div>
      </div>
    </div>
  )
}
