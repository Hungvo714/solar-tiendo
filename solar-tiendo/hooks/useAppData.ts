'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Item, Progress, GanttDate, Zone, Project } from '@/lib/supabase'
import {
  getItemsWithSteps, getZones, getProgress, getGanttDates,
  upsertProgress, upsertGantt, subscribeProgress, subscribeGantt
} from '@/lib/queries'

export function useAppData() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState<string>('')

  useEffect(() => {
    // Lấy project ID từ URL params (?project=xxx)
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('project')

    async function load() {
      setLoading(true)
      try {
        let proj: Project | null = null

        if (pid) {
          // Dùng project ID từ URL
          const { data } = await supabase.from('projects').select('*').eq('id', pid).single()
          proj = data
        } else {
          // Lấy project đầu tiên của user
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data } = await supabase
              .from('project_members')
              .select('project_id, projects(*)')
              .eq('user_id', user.id)
              .limit(1)
              .single()
            proj = (data as any)?.projects ?? null
          }
        }

        if (!proj) {
          // Không có project → về trang chọn dự án
          window.location.href = '/projects'
          return
        }

        setProject(proj)
        setProjectId(proj.id)

        const [z, it, pr, gd] = await Promise.all([
          getZones(),
          getItemsWithSteps(),
          getProgress(proj.id),
          getGanttDates(proj.id),
        ])

        setZones(z)
        setItems(it as Item[])

        const pm: Record<string, Progress> = {}
        for (const p of pr) pm[(p as Progress).step_id] = p as Progress
        setProgressMap(pm)

        const gm: Record<string, GanttDate> = {}
        for (const g of gd) gm[(g as GanttDate).item_id] = g as GanttDate
        setGanttMap(gm)

      } catch (err) {
        console.error('Load error:', err)
        window.location.href = '/projects'
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Realtime
  useEffect(() => {
    if (!projectId) return
    const subP = subscribeProgress(projectId, (p) => {
      setProgressMap(prev => ({ ...prev, [(p as Progress).step_id]: p as Progress }))
    })
    const subG = subscribeGantt(projectId, (g) => {
      setGanttMap(prev => ({ ...prev, [(g as GanttDate).item_id]: g as GanttDate }))
    })
    return () => {
      supabase.removeChannel(subP)
      supabase.removeChannel(subG)
    }
  }, [projectId])

  const toggleStep = useCallback(async (stepId: string, currentDone: boolean) => {
    if (!projectId) return
    setProgressMap(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        step_id: stepId,
        project_id: projectId,
        is_done: !currentDone,
        is_na: false,
        done_at: !currentDone ? new Date().toISOString() : null,
      } as Progress
    }))
    await upsertProgress(projectId, stepId, !currentDone)
  }, [projectId])

  const toggleNA = useCallback(async (stepId: string, currentNA: boolean) => {
    if (!projectId) return
    setProgressMap(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        step_id: stepId,
        project_id: projectId,
        is_na: !currentNA,
        is_done: false,
      } as Progress
    }))
    await upsertProgress(projectId, stepId, false, !currentNA)
  }, [projectId])

  const updateGantt = useCallback(async (itemId: string, field: string, value: string) => {
    if (!projectId) return
    setGanttMap(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], item_id: itemId, project_id: projectId, [field]: value || null } as GanttDate
    }))
    await upsertGantt(projectId, itemId, field, value)
  }, [projectId])

  return {
    project, zones, items, progressMap, ganttMap,
    loading, projectId, toggleStep, toggleNA, updateGantt,
  }
}
