import { createClient } from '@/lib/supabase/client'

export interface Workflow {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'paused' | 'archived'
  tags: string[]
  icon: string | null
  color: string | null
  current_version_id: string | null
  total_runs: number
  success_runs: number
  fail_runs: number
  updated_at: string
  created_at: string
}

export interface WorkflowVersion {
  id: string
  workflow_id: string
  version_number: number
  nodes: unknown[]
  edges: unknown[]
  variables: Record<string, unknown>
  change_summary: string | null
  created_at: string
}

export async function listWorkflows(): Promise<Workflow[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createWorkflow(name: string): Promise<Workflow> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')

  const { data, error } = await supabase
    .from('workflows')
    .insert({ user_id: user.id, name, status: 'draft' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function updateWorkflow(id: string, updates: Partial<Pick<Workflow, 'name' | 'status' | 'description'>>) {
  const supabase = createClient()
  const { error } = await supabase
    .from('workflows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export async function deleteWorkflow(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('workflows')
    .update({ status: 'archived' })
    .eq('id', id)

  if (error) throw error
}

export async function duplicateWorkflow(id: string): Promise<Workflow> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')

  // 원본 워크플로우 조회
  const { data: original, error: wErr } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()
  if (wErr || !original) throw new Error('워크플로우를 찾을 수 없습니다')

  // 복제 생성
  const { data: copy, error: cErr } = await supabase
    .from('workflows')
    .insert({
      user_id: user.id,
      name: `${original.name} (복사본)`,
      description: original.description,
      status: 'draft',
      tags: original.tags ?? [],
      icon: original.icon,
      color: original.color,
    })
    .select()
    .single()
  if (cErr || !copy) throw cErr ?? new Error('복제 실패')

  // 현재 버전 복제
  if (original.current_version_id) {
    const { data: ver } = await supabase
      .from('workflow_versions')
      .select('nodes, edges, variables')
      .eq('id', original.current_version_id)
      .single()

    if (ver) {
      const { data: newVer } = await supabase
        .from('workflow_versions')
        .insert({
          workflow_id: copy.id,
          version_number: 1,
          nodes: ver.nodes,
          edges: ver.edges,
          variables: ver.variables,
          created_by: user.id,
          change_summary: '복제본 초기 버전',
        })
        .select()
        .single()

      if (newVer) {
        await supabase
          .from('workflows')
          .update({ current_version_id: newVer.id })
          .eq('id', copy.id)
      }
    }
  }

  return { ...copy, current_version_id: copy.current_version_id }
}

export async function saveVersion(
  workflowId: string,
  nodes: unknown[],
  edges: unknown[],
  variables: Record<string, unknown> = {},
  changeSummary?: string
): Promise<WorkflowVersion> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')

  // 현재 최신 버전 번호 조회
  const { data: last } = await supabase
    .from('workflow_versions')
    .select('version_number')
    .eq('workflow_id', workflowId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = last ? last.version_number + 1 : 1

  const { data: version, error: vErr } = await supabase
    .from('workflow_versions')
    .insert({
      workflow_id: workflowId,
      version_number: nextVersion,
      nodes,
      edges,
      variables,
      created_by: user.id,
      change_summary: changeSummary ?? `버전 ${nextVersion}`,
    })
    .select()
    .single()

  if (vErr) throw vErr

  // workflows.current_version_id 업데이트
  const { error: wErr } = await supabase
    .from('workflows')
    .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
    .eq('id', workflowId)

  if (wErr) throw wErr
  return version
}

export async function loadCurrentVersion(workflowId: string): Promise<WorkflowVersion | null> {
  const supabase = createClient()
  const { data: workflow } = await supabase
    .from('workflows')
    .select('current_version_id')
    .eq('id', workflowId)
    .single()

  if (!workflow?.current_version_id) return null

  const { data, error } = await supabase
    .from('workflow_versions')
    .select('*')
    .eq('id', workflow.current_version_id)
    .single()

  if (error) return null
  return data
}
