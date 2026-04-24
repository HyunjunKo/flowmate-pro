'use client'

import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import NodePanel from './NodePanel'
import NodeSettingsPanel from './NodeSettingsPanel'
import CustomNode from './CustomNode'
import EditorToolbar from './EditorToolbar'
import {
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  saveVersion,
  loadCurrentVersion,
} from '@/lib/api/workflows'

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

const defaultNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'custom',
    position: { x: 250, y: 100 },
    data: {
      label: '시작',
      description: '워크플로우가 시작되는 지점',
      nodeType: 'trigger',
      icon: '⚡',
      nodeKey: 'trigger.manual',
    },
  },
]

export default function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const router = useRouter()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [workflowName, setWorkflowName] = useState('새 워크플로우')
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(
    workflowId === 'new' ? null : workflowId
  )
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loading, setLoading] = useState(workflowId !== 'new')

  useEffect(() => {
    if (workflowId === 'new') return
    const load = async () => {
      try {
        const [workflow, version] = await Promise.all([
          getWorkflow(workflowId),
          loadCurrentVersion(workflowId),
        ])
        setWorkflowName(workflow.name)
        if (version) {
          setNodes(version.nodes as Node[])
          setEdges(version.edges as Edge[])
        }
      } catch {
        setSaveMsg('워크플로우를 불러오지 못했습니다')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [workflowId, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds) as Edge[]),
    [setEdges]
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setIsPanelOpen(false)
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleNodeUpdate = useCallback((nodeId: string, config: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
      )
    )
  }, [setNodes])

  const addNode = useCallback((nodeData: {
    label: string
    description: string
    nodeType: string
    icon: string
    nodeKey?: string
  }) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: 'custom',
      position: { x: 200 + Math.random() * 150, y: 150 + nodes.length * 130 },
      data: nodeData,
    }
    setNodes((nds) => [...nds, newNode])
    setIsPanelOpen(false)
    setSelectedNode(newNode)  // 추가하면 바로 설정 패널 열기
  }, [nodes.length, setNodes])

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      let wfId = currentWorkflowId
      if (!wfId) {
        const wf = await createWorkflow(workflowName)
        wfId = wf.id
        setCurrentWorkflowId(wfId)
        router.replace(`/dashboard/workflows/${wfId}`)
      } else {
        await updateWorkflow(wfId, { name: workflowName })
      }
      await saveVersion(wfId, nodes, edges)
      setSaveMsg('저장됨')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch {
      setSaveMsg('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-gray-400">불러오는 중...</div>
      </div>
    )
  }

  const rightPanel = selectedNode
    ? (
      <NodeSettingsPanel
        nodeId={selectedNode.id}
        nodeData={selectedNode.data as {
          label: string; description: string; nodeType: string; icon: string; nodeKey?: string; config?: Record<string, unknown>
        }}
        onClose={() => setSelectedNode(null)}
        onUpdate={handleNodeUpdate}
      />
    )
    : isPanelOpen
      ? <NodePanel onAdd={addNode} onClose={() => setIsPanelOpen(false)} />
      : null

  return (
    <div className="flex h-screen flex-col">
      <EditorToolbar
        workflowName={workflowName}
        onNameChange={setWorkflowName}
        onSave={handleSave}
        onAddNode={() => { setSelectedNode(null); setIsPanelOpen(true) }}
        saving={saving}
        saveMsg={saveMsg}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50"
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls className="!bottom-4 !left-4" />
            <MiniMap
              className="!bottom-4 !right-4 !rounded-xl !border !border-gray-200"
              nodeColor="#7c3aed"
            />
          </ReactFlow>

          {nodes.length <= 1 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-20 text-center pointer-events-none">
              <p className="text-sm text-gray-400">노드 추가 버튼을 눌러 작업을 추가해보세요</p>
            </div>
          )}
        </div>

        {rightPanel}
      </div>
    </div>
  )
}
