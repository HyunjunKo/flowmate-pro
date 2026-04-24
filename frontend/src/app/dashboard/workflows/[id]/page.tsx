import WorkflowEditor from '@/components/workflow/WorkflowEditor'

export default function WorkflowEditorPage({ params }: { params: { id: string } }) {
  return <WorkflowEditor workflowId={params.id} />
}
