import { createClient } from '@/lib/supabase/client'

export interface NodeDefinition {
  id: string
  key: string
  display_name_ko: string
  description_ko: string
  category: string
  node_type: string
  ui_config: { icon: string; color: string; hint?: string }
  required_integration: string | null
  required_plan: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
}

export async function fetchNodeDefinitions(): Promise<NodeDefinition[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('node_definitions')
    .select('id, key, display_name_ko, description_ko, category, node_type, ui_config, required_integration, required_plan, input_schema, output_schema')
    .eq('is_available', true)
    .order('category')

  if (error) throw error
  return data ?? []
}
