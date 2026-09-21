import { ref, computed, watch } from 'vue'
import type { ReplayFrame } from '@/types'
import { REPLAY_SELECT_KEY } from '@/types'
import { segments } from './useReplay'

/**
 * 回放播放器：当前选中段跨刷新保留(localStorage)，
 * 播放中的帧提供给 3D 场景做轨迹标记。
 */
const selectedId = ref<string | null>(null)
const isPlaying = ref(false)
const frameIndex = ref(0)

let timer: ReturnType<typeof setInterval> | null = null

const selectedSegment = computed(() =>
  segments.value.find(s => s.id === selectedId.value) || null)

const currentFrame = computed<ReplayFrame | null>(() => {
  const seg = selectedSegment.value
  if (!seg || !seg.frames.length) return null
  const i = Math.min(frameIndex.value, seg.frames.length - 1)
  return seg.frames[i]
})

function restoreSelection() {
  try {
    const id = localStorage.getItem(REPLAY_SELECT_KEY)
    // 仅当该段在留存清单中仍然存在时才恢复
    if (id && segments.value.some(s => s.id === id)) {
      selectedId.value = id
      frameIndex.value = 0
    } else {
      // 段已不存在(过期清理/存储损坏)：同步清掉存储与内存选中态
      selectedId.value = null
      if (id) localStorage.removeItem(REPLAY_SELECT_KEY)
    }
  } catch { /* ignore */ }
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

function selectSegment(id: string) {
  stopTimer()
  isPlaying.value = false
  selectedId.value = id
  frameIndex.value = 0
}

function play() {
  const seg = selectedSegment.value
  if (!seg || !seg.frames.length || isPlaying.value) return
  isPlaying.value = true
  timer = setInterval(() => {
    const cur = selectedSegment.value
    if (!cur) { pause(); return }
    if (frameIndex.value >= cur.frames.length - 1) {
      // 播完停在末帧，不自动重复，避免连续产生重复状态
      pause()
      return
    }
    frameIndex.value += 1
  }, 1000)
}

function pause() {
  isPlaying.value = false
  stopTimer()
}

function stop() {
  pause()
  frameIndex.value = 0
}

function seek(i: number) {
  const seg = selectedSegment.value
  if (!seg) return
  frameIndex.value = Math.max(0, Math.min(i, seg.frames.length - 1))
}

// 选中段即时持久化，刷新/重进页面后恢复
watch(selectedId, id => {
  try {
    if (id) localStorage.setItem(REPLAY_SELECT_KEY, id)
    else localStorage.removeItem(REPLAY_SELECT_KEY)
  } catch { /* ignore */ }
})

export function useReplayPlayer() {
  return {
    segments, selectedId, selectedSegment,
    isPlaying, frameIndex, currentFrame,
    restoreSelection, selectSegment, play, pause, stop, seek,
  }
}
