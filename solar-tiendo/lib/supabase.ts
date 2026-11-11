import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(url, key)

export type Zone     = { id:string; label:string; icon:string; color:string; light:string; sort_order:number }
export type Item     = { id:string; stt:number; name:string; zone_id:string; weight:number; steps?:Step[]; no?:number|null; group_type?:string; project_id?:string|null; hidden?:boolean; order_days?:number; sort_order?:number }
export type Step     = { id:string; item_id:string; step_index:number; name:string; weight:number; qty_total?:number|null; qty_unit?:string|null; qty_materials?:string[] }
export type Progress = { id:string; project_id:string; step_id:string; is_done:boolean; is_na:boolean; done_at:string|null; progress_pct?:number|string|null }
export type GanttDate= { id:string; project_id:string; item_id:string; plan_start:string|null; plan_end:string|null; actual_start:string|null; actual_end:string|null }
export type Project  = { id:string; name:string; client:string; contractor:string; start_date:string; total_days:number; location?:string|null; capacity_kwp?:number|string|null; panel_count?:number|null }
