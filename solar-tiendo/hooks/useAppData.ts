'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Item, Progress, GanttDate, Zone, Project } from '@/lib/supabase'
import {
  getItemsWithSteps, getZones, getProgress, getGanttDates,
  upsertProgress, upsertGantt, subscribeProgress, subscribeGantt
} from '@/lib/queries'

const PROJECT_ID = '00000000-0000-0000-0000-000000000001'

export function useAppData() {
  const [project,     setProject]     = useState<Project | null>(null)
  const [zones,       setZones]       = useState<Zone[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({})
  const [ganttMap,    setGanttMap]    = useState<Record<string, GanttDate>>({})
  const [loading,     setLoading]     = useState(true)
  const [projectId,   setProjectId]   = useState<string>(PROJECT_ID)

  // Load initial data
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Get or create project
        let { data: proj } = await supabase.from('projects').select('*').single()
        if (!proj) {
          const { data: newProj } = await supabase.from('projects').insert({
            id:         PROJECT_ID,
            name:       'Điện mặt trời Louvre',
            client:     'Công ty TNHH Dệt Sợi Louvre',
            factory:    'Nhà máy Dệt Sợi Louvre',
            contractor: 'TTCE-HTE',
            start_date: new Date().toISOString().split('T')[0],
            total_days: 60,
          }).select().single()
          proj = newProj

          // Add current user as admin
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('project_members').insert({
              project_id: proj!.id, user_id: user.id, role: 'admin'
            })
          }
        }

        setProject(proj)
        setProjectId(proj!.id)

        const [z, it, pr, gd] = await Promise.all([
          getZones(),
          getItemsWithSteps(),
          getProgress(proj!.id),
          getGanttDates(proj!.id),
        ])

        setZones(z)
        setItems(it as Item[])

        // Build lookup maps
        const pm: Record<string, Progress> = {}
        for (const p of pr) pm[p.step_id] = p as Progress
        setProgressMap(pm)

        const gm: Record<string, GanttDate> = {}
        for (const g of gd) gm[g.item_id] = g as GanttDate
        setGanttMap(gm)

      } catch (err) {
        console.error('Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Realtime subscriptions
  useEffect(() => {
    if (!projectId) return
    const subP = subscribeProgress(projectId, (p) => {
      setProgressMap(prev => ({ ...prev, [p.step_id]: p }))
    })
    const subG = subscribeGantt(projectId, (g) => {
      setGanttMap(prev => ({ ...prev, [g.item_id]: g }))
    })
    return () => {
      supabase.removeChannel(subP)
      supabase.removeChannel(subG)
    }
  }, [projectId])

  // Actions
  const toggleStep = useCallback(async (stepId: string, currentDone: boolean) => {
    // Optimistic update
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
    setGanttMap(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], item_id: itemId, project_id: projectId, [field]: value || null } as GanttDate
    }))
    await upsertGantt(projectId, itemId, field, value)
  }, [projectId])

  return {
    project, zones, items, progressMap, ganttMap,
    loading, toggleStep, toggleNA, updateGantt,
  }
}
