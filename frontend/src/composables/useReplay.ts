import { ref } from 'vue'
import type { Device, ReplayFrame, ReplaySegment } from '@/types'
import {
  REPLAY_STORAGE_KEY, SEGMENT_MAX_MS, REPLAY_MAX_SEGMENTS,
} from '@/types'

/**
 * 轨迹回放录制器：
 * - 按设备把实时帧打包成「段」，状态变化或达到 SEGMENT_MAX_MS 即切段
 * - 段(含帧)持久化到 localStorage，刷新/重进页面后回放清单仍在
 */
export const segments = ref<ReplaySegment[]>([])
const openIds = new Map<number, string>() // deviceId -> 未闭合段 id
let lastFrameAt = new Map<number, number>()
let saveTimer: ReturnType<typeof setInterval> | null = null
let started = false

function makeId(deviceId: number, start: number) {
  return `seg_${deviceId}_${start}_${Math.random().toString(36).slice(2, 8)}`
}

function load() {
  try {
    const raw = localStorage.getItem(REPLAY_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as ReplaySegment[]
      // 只恢复闭合且有帧的段；刷新前未闭合的段补闭合(以最后一帧时间为准)
      segments.value = saved
        .filter(s => Array.isArray(s.frames) && s.frames.length > 0)
        .map(s => ({ ...s, closed: true, end: s.end || s.frames[s.frames.length - 1].t }))
      markConflicts()
    }
  } catch {
    segments.value = []
  }
}

function persist() {
  try {
    markConflicts()
    // 只持久化闭合段，未闭合段等待闭合后再写入，避免半成品数据
    const closed = segments.value.filter(s => s.closed)
    localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(closed))
  } catch {
    // 存储超限时丢弃最早的段后重试一次
    try {
      segments.value = segments.value.slice(-Math.floor(REPLAY_MAX_SEGMENTS / 2))
      localStorage.setItem(REPLAY_STORAGE_KEY,
        JSON.stringify(segments.value.filter(s => s.closed)))
    } catch { /* 忽略：留存失败不应影响监控主流程 */ }
  }
}

/** 检查同一设备各段时段是否互相重叠(端点相接不算冲突) */
function markConflicts() {
  const byDevice = new Map<number, ReplaySegment[]>()
  for (const seg of segments.value) {
    const list = byDevice.get(seg.deviceId) || []
    list.push(seg)
    byDevice.set(seg.deviceId, list)
  }
  for (const list of byDevice.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start)
    sorted.forEach(s => { s.conflict = false })
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        sorted[i].conflict = true
        sorted[i - 1].conflict = true
      }
    }
  }
}

function closeSegment(seg: ReplaySegment, endAt: number) {
  if (seg.frames.length === 0) {
    segments.value = segments.value.filter(s => s.id !== seg.id)
    return
  }
  seg.end = endAt
  seg.closed = true
}

function trimDevice(deviceId: number) {
  const mine = segments.value.filter(s => s.deviceId === deviceId && s.closed)
  if (mine.length > REPLAY_MAX_SEGMENTS) {
    const drop = new Set(mine.slice(0, mine.length - REPLAY_MAX_SEGMENTS).map(s => s.id))
    segments.value = segments.value.filter(s => !drop.has(s.id))
  }
}

export function ingestDevices(devices: Device[]) {
  const now = Date.now()
  for (const dev of devices) {
    const last = lastFrameAt.get(dev.id) ?? 0
    // 每秒一帧数据，抽帧间隔做保护，避免重复时间点
    if (last && now - last < 900) continue
    lastFrameAt.set(dev.id, now)

    let segId = openIds.get(dev.id)
    let seg = segId ? segments.value.find(s => s.id === segId) : undefined

    const statusChanged = seg && seg.status !== dev.status
    const tooLong = seg && now - seg.start >= SEGMENT_MAX_MS
    if (seg && (statusChanged || tooLong)) {
      closeSegment(seg, now)
      markConflicts()
      trimDevice(dev.id)
      openIds.delete(dev.id)
      seg = undefined
    }

    if (!seg) {
      seg = {
        id: makeId(dev.id, now),
        deviceId: dev.id,
        deviceType: dev.type,
        start: now,
        end: now,
        status: dev.status,
        frames: [],
        closed: false,
      }
      segments.value.push(seg)
      openIds.set(dev.id, seg.id)
    }

    const frame: ReplayFrame = {
      t: now,
      p: [Number(dev.position[0]), Number(dev.position[1]), Number(dev.position[2])],
      s: dev.status,
      temp: dev.temperature,
      vib: dev.vibration,
    }
    // 段内不应混入不同状态的帧(防御)
    if (frame.s === seg.status) seg.frames.push(frame)
  }
}

export function useReplayRecorder() {
  function start() {
    if (started) return
    started = true
    load()
    // 定时落盘 + 页面隐藏/关闭前落盘，保证刷新后清单仍在
    saveTimer = setInterval(persist, 5000)
    window.addEventListener('beforeunload', persist)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist()
    })
  }

  return { segments, start, persist }
}
