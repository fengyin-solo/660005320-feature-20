<template>
  <div class="panel replay-panel">
    <div class="head">
      <h4>🛰️ 轨迹回放记录</h4>
      <button class="refresh-btn" :disabled="loading" @click="loadSegments">
        {{ loading ? '加载中…' : '刷新' }}
      </button>
    </div>

    <div v-if="loadError" class="notice error">回放清单加载失败：{{ loadError }}</div>
    <div v-else-if="!segments.length" class="notice">
      暂无回放段：设备轨迹尚未积累成完整记录，请稍候再试
    </div>
    <template v-else>
      <div v-if="conflictIds.size" class="notice warn">
        ⚠ 检测到 {{ conflictIds.size }} 个回放段时段互相冲突（{{ conflictDevices }}），对应段已标记且不可下载
      </div>
      <div class="seg-list">
        <div
          v-for="seg in segments" :key="seg.id"
          class="seg-row"
          :class="{ selected: seg.id === selectedId, conflict: conflictIds.has(seg.id) }"
          @click="select(seg)"
        >
          <div class="seg-top">
            <span class="seg-dev">{{ seg.device_type }} #{{ seg.device_id }}</span>
            <span class="seg-status" :style="{ color: STATUS_COLORS[seg.status] || '#95a5a6' }">{{ seg.status }}</span>
            <span v-if="conflictIds.has(seg.id)" class="seg-warn">⚠ 时段冲突</span>
          </div>
          <div class="seg-sub">
            <span>{{ fmtTime(seg.start) }} ~ {{ fmtTime(seg.end) }}</span>
            <span>{{ seg.point_count }} 个记录点</span>
          </div>
        </div>
      </div>
      <div class="foot">
        <button class="dl-btn" :disabled="!canDownload" @click="downloadSelected">
          ⬇ 下载选中段记录
        </button>
        <span v-if="selectedSegment && conflictIds.has(selectedSegment.id)" class="foot-note">
          该段时段冲突，不可下载
        </span>
        <span v-else-if="coolingDown" class="foot-note">文件已生成，请稍候…</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { STATUS_COLORS } from '../types'
import type { TrajectorySegment } from '../types'

const STORAGE_KEY = 'trajectory.selectedSegmentId'
const DOWNLOAD_COOLDOWN = 1500

const segments = ref<TrajectorySegment[]>([])
const loading = ref(false)
const loadError = ref('')
const selectedId = ref<string>(localStorage.getItem(STORAGE_KEY) || '')
const coolingDown = ref(false)
let lastDownloadAt = 0
let timer: number | undefined

const selectedSegment = computed(() => segments.value.find(s => s.id === selectedId.value))

// 同一设备的回放段起止时段重叠即为冲突，需标明原因而不是显示空白清单
const conflictIds = computed(() => {
  const byDev = new Map<number, TrajectorySegment[]>()
  for (const s of segments.value) {
    const arr = byDev.get(s.device_id) || []
    arr.push(s)
    byDev.set(s.device_id, arr)
  }
  const bad = new Set<string>()
  for (const arr of byDev.values()) {
    const sorted = [...arr].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start <= sorted[i - 1].end + 1e-6) {
        bad.add(sorted[i].id)
        bad.add(sorted[i - 1].id)
      }
    }
  }
  return bad
})

const conflictDevices = computed(() => {
  const ids = new Set<number>()
  for (const s of segments.value) if (conflictIds.value.has(s.id)) ids.add(s.device_id)
  return '设备 ' + [...ids].sort((a, b) => a - b).map(i => `#${i}`).join('、')
})

const canDownload = computed(() =>
  !!selectedSegment.value && !conflictIds.value.has(selectedSegment.value.id) && !coolingDown.value
)

function fmtTime(t: number) {
  const d = new Date(t * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fileTime(t: number) {
  const d = new Date(t * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function loadSegments() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await fetch('/api/trajectory/segments')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    segments.value = data.segments || []
    loadError.value = ''
    // 上次选中的段已不存在（如服务重启），清掉避免残留无效选择
    if (selectedId.value && segments.value.length && !segments.value.some(s => s.id === selectedId.value)) {
      selectedId.value = ''
    }
  } catch (e: any) {
    loadError.value = e?.message || '网络异常'
  } finally {
    loading.value = false
  }
}

function select(seg: TrajectorySegment) {
  selectedId.value = seg.id
}

function downloadSelected() {
  const seg = selectedSegment.value
  if (!seg || conflictIds.value.has(seg.id)) return
  const now = Date.now()
  if (now - lastDownloadAt < DOWNLOAD_COOLDOWN) return
  lastDownloadAt = now
  coolingDown.value = true
  setTimeout(() => { coolingDown.value = false }, DOWNLOAD_COOLDOWN)

  // 文件内容直接取自清单中该段展示的同一份数据，保证两者一致
  const payload = {
    device_id: seg.device_id,
    device_type: seg.device_type,
    status: seg.status,
    start_time: fmtTime(seg.start),
    end_time: fmtTime(seg.end),
    start_ts: seg.start,
    end_ts: seg.end,
    point_count: seg.point_count,
    points: seg.points.map(p => ({ time: fmtTime(p.t), position: p.position, status: p.status }))
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trajectory_DEV${seg.device_id}_${fileTime(seg.start)}-${fileTime(seg.end)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

watch(selectedId, id => {
  if (id) localStorage.setItem(STORAGE_KEY, id)
  else localStorage.removeItem(STORAGE_KEY)
})

onMounted(() => {
  loadSegments()
  timer = window.setInterval(loadSegments, 5000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<style scoped>
.panel{background:#0d1b2a;border-radius:8px;padding:12px;border:1px solid #1e3a5f}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.panel h4{color:#64b5f6;font-size:13px}
.refresh-btn{background:#1e3a5f;color:#94a3b8;border:1px solid #2d4a6f;border-radius:4px;font-size:11px;padding:2px 8px;cursor:pointer}
.refresh-btn:disabled{opacity:0.5;cursor:default}
.notice{color:#64748b;font-size:12px;padding:6px 0}
.notice.error{color:#fca5a5}
.notice.warn{color:#fbbf24;background:#78350f22;border:1px solid #78350f55;border-radius:4px;padding:4px 8px;margin-bottom:6px}
.seg-list{display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto}
.seg-row{padding:6px 8px;background:#112233;border-radius:4px;border-left:3px solid #1e3a5f;cursor:pointer}
.seg-row:hover{border-left-color:#64b5f6}
.seg-row.selected{border-left-color:#64b5f6;background:#152c44;outline:1px solid #64b5f655}
.seg-row.conflict{border-left-color:#f59e0b}
.seg-top{display:flex;gap:8px;align-items:center}
.seg-dev{font-size:12px;color:#e0e6ed;font-weight:600}
.seg-status{font-size:11px;font-weight:600}
.seg-warn{font-size:10px;color:#f59e0b}
.seg-sub{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:2px}
.foot{display:flex;align-items:center;gap:10px;margin-top:8px}
.dl-btn{background:#1d4ed8;color:#fff;border:none;border-radius:4px;font-size:12px;padding:5px 12px;cursor:pointer}
.dl-btn:disabled{background:#1e3a5f;color:#64748b;cursor:not-allowed}
.foot-note{font-size:11px;color:#94a3b8}
</style>
