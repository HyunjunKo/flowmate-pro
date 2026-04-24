'use client'

import { useCallback, useState } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import NodePanel from './NodePanel'
import CustomNode from './CustomNode'
import EditorToolbar from './EditorToolbar'

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

const initialNodes = [
  {
    id: 'trigger-1',
    type: 'custom',
    position: { x: 250, y: 100 },
    data: {
      label: '시작',
      description: '워크플로우가 시작되는 지점',
      nodeType: 'trigger',
      icon: '⚡',
    },
  },
]

export default function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [workflowName, setWorkflowName] = useState(
    workflowId === 'new' ? '새 워크플로우' : '워크플로우 로딩 중...'
  )

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds) as Edge[]),
    [setEdges]
  )

  const addNode = useCallback((nodeData: {
    label: string
    description: string
    nodeType: string
    icon: string
    nodeKey?: string
  }) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      position: { x: 250 + Math.random() * 100, y: 200 + nodes.length * 120 },
      data: nodeData,
    }
    setNodes((nds) => [...nds, newNode])
    setIsPanelOpen(false)
  }, [nodes.length, setNodes])

  const handleSave = () => {
    // TODO: API 저장
    alert('저장됨 (API 연동 예정)')
  }

  return (
    <div className="flex h-screen flex-col">
      <EditorToolbar
        workflowName={workflowName}
        onNameChange={setWorkflowName}
        onSave={handleSave}
        onAddNode={() => setIsPanelOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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

          {/* 노드 추가 힌트 */}
          {nodes.length <= 1 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-20 text-center pointer-events-none">
              <p className="text-sm text-gray-400">+ 노드 추가 버튼을 눌러 작업을 추가해보세요</p>
            </div>
          )}
        </div>

        {isPanelOpen && (
          <NodePanel onAdd={addNode} onClose={() => setIsPanelOpen(false)} />
        )}
      </div>
    </div>
  )
}
