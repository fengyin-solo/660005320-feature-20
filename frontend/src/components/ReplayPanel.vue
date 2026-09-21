<template>
  <div class="replay-panel" :class="{ collapsed }">
    <div class="rp-header" @click="collapsed = !collapsed">
      <span class="rp-title">🎬 轨迹回放 · 记录留存</span>
      <span class="rp-count" v-if="listSorted.length">共 {{ listSorted.length }} 段</span>
      <span class="rp-arrow">{{ collapsed ? '▸' : '▾' }}</span>
    </div>

    <div v-show="!collapsed" class="rp-body">
      <!-- 清单为空：写明原因，不留空白 -->
      <div v-if="!listSorted.length" class="rp-empty">
        <template v-if="!store.connected">
          ⚠️ 暂无回放段：实时数据连接未建立，尚未采集到任何设备轨迹。
        </template>
        <template v-else-if="!store.data">
          ⚠️ 暂无回放段：尚未收到设备数据，请稍候（系统每秒采集一帧）。
        </template>
        <template v-else>
          ℹ️ 暂无回放段：正在采集中，设备运行满 {{ segMaxSec }} 秒或状态变化后会生成第一段。
        </template>
      </div>

      <div v-else class="rp-scroll">
        <div
          v-for="seg in listSorted" :key="seg.id"
          class="rp-seg"
          :class="{ active: seg.id === player.selectedId.value, conflict: seg.conflict }"
          @click="player.selectSegment(seg.id)"
        >
          <div class="rp-seg-top">
            <span class="rp-dev">{{ seg.deviceType }} #{{ seg.deviceId }}</span>
            <span class="rp-status" :style="{ color: STATUS_COLORS[seg.status] || '#95a5a6' }">
              ● {{ statusLabel(seg.status) }}
            </span>
          </div>
          <div class="rp-time">{{ formatTime(seg.start) }} ~ {{ formatTime(seg.end) }}</div>
          <div class="rp-meta">
            <span>{{ formatDuration(seg.end - seg.start) }}</span>
            <span>{{ seg.frames.length }} 帧</span>
          </div>
          <div v-if="seg.conflict" class="rp-conflict-flag">
            ⚠ 该段时段与本设备其他回放段冲突，数据可能重复，请核对后留存
          </div>
        </div>
      </div>

      <!-- 选中段操作区 -->
      <div v-if="sel" class="rp-detail">
        <div class="rp-detail-head">
          <span>{{ sel.deviceType }} #{{ sel.deviceId }}</span>
          <span :style="{ color: STATUS_COLORS[sel.status] || '#95a5a6' }">
            {{ statusLabel(sel.status) }}
          </span>
        </div>
        <div class="rp-detail-time">
          {{ formatTime(sel.start) }} ~ {{ formatTime(sel.end) }}
        </div>

        <div class="rp-controls">
          <button class="rp-btn" v-if="!player.isPlaying.value" @click="player.play()">▶ 播放</button>
          <button class="rp-btn" v-else @click="player.pause()">⏸ 暂停</button>
          <button class="rp-btn" @click="player.stop()">⏹ 复位</button>
          <button
            class="rp-btn rp-dl"
            :disabled="downloaded.has(sel.id)"
            @click="onDownload"
          >
            {{ downloaded.has(sel.id) ? '✓ 已留存本时段' : '⬇ 留存本时段' }}
          </button>
        </div>

        <input
          class="rp-seek" type="range" min="0"
          :max="Math.max(0, sel.frames.length - 1)"
          :value="player.frameIndex.value"
          @input="onSeek"
        />
        <div class="rp-frame-info">
          第 {{ Math.min(player.frameIndex.value + 1, sel.frames.length) }} / {{ sel.frames.length }} 帧
          <template v-if="frame">
            ｜位置 ({{ frame.p[0].toFixed(1) }}, {{ frame.p[1].toFixed(1) }}, {{ frame.p[2].toFixed(1) }})
            ｜{{ frame.temp.toFixed(1) }}°C
          </template>
        </div>
        <div v-if="sel.conflict" class="rp-detail-warn">
          ⚠ 时段冲突：该段与设备 #{{ sel.deviceId }} 的其他段时间重叠，留存文件已标注此情况。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFactoryStore } from '../store/factory'
import { useReplayRecorder } from '../composables/useReplay'
import { useReplayPlayer } from '../composables/useReplayPlayer'
import { downloadSegment, formatTime, formatDuration, statusLabel } from '../utils/replayFile'
import { STATUS_COLORS, SEGMENT_MAX_MS } from '../types'

const store = useFactoryStore()
useReplayRecorder().start()
const player = useReplayPlayer()
player.restoreSelection()

const collapsed = ref(false)
/** 本次会话已成功留存的段：按钮置位为「已留存」，连续点击不会产生多份文件 */
const downloaded = ref<Set<string>>(new Set())

const segMaxSec = Math.round(SEGMENT_MAX_MS / 1000)

const listSorted = computed(() =>
  [...player.segments.value].sort((a, b) => b.start - a.start))

const sel = computed(() => player.selectedSegment.value)
const frame = computed(() => player.currentFrame.value)

function onSeek(e: Event) {
  player.seek(Number((e.target as HTMLInputElement).value))
}

function onDownload() {
  const seg = sel.value
  if (!seg || downloaded.value.has(seg.id)) return
  const ok = downloadSegment(seg)
  if (ok) downloaded.value = new Set(downloaded.value).add(seg.id)
}
</script>

<style scoped>
.replay-panel{position:absolute;left:12px;top:12px;width:300px;max-height:calc(100% - 24px);
  display:flex;flex-direction:column;background:rgba(13,27,42,.92);border:1px solid #1e3a5f;
  border-radius:8px;backdrop-filter:blur(4px);z-index:10;font-size:12px;color:#e0e6ed;
  box-shadow:0 4px 16px rgba(0,0,0,.4)}
.rp-header{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;
  border-bottom:1px solid #1e3a5f;user-select:none}
.rp-title{color:#64b5f6;font-weight:600;font-size:13px}
.rp-count{color:#94a3b8;font-size:11px;flex:1}
.rp-arrow{color:#94a3b8;font-size:10px}
.rp-body{display:flex;flex-direction:column;min-height:0;flex:1}
.rp-empty{padding:12px;color:#fbbf24;font-size:11px;line-height:1.6}
.rp-scroll{max-height:220px;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:6px}
.rp-seg{padding:6px 8px;background:#112233;border:1px solid transparent;border-left:3px solid #334466;
  border-radius:4px;cursor:pointer;transition:border-color .15s}
.rp-seg:hover{background:#152a40}
.rp-seg.active{border-color:#64b5f6;border-left-color:#64b5f6;background:#15304d}
.rp-seg.conflict{border-left-color:#f59e0b}
.rp-seg-top{display:flex;justify-content:space-between;align-items:center}
.rp-dev{font-weight:600;font-size:12px}
.rp-status{font-size:11px}
.rp-time{color:#94a3b8;font-size:10px;margin-top:2px}
.rp-meta{display:flex;gap:10px;color:#64748b;font-size:10px;margin-top:2px}
.rp-conflict-flag{color:#f59e0b;font-size:10px;margin-top:3px;line-height:1.4}
.rp-detail{border-top:1px solid #1e3a5f;padding:8px 12px 10px;background:#0c1826}
.rp-detail-head{display:flex;justify-content:space-between;font-size:12px;font-weight:600}
.rp-detail-time{color:#94a3b8;font-size:10px;margin:3px 0 6px}
.rp-controls{display:flex;gap:6px;margin-bottom:6px}
.rp-btn{flex:1;padding:4px 6px;font-size:11px;background:#1e3a5f;color:#e0e6ed;border:1px solid #2e5180;
  border-radius:4px;cursor:pointer}
.rp-btn:hover{background:#274a75}
.rp-btn:disabled{opacity:.6;cursor:default;background:#1a2f47}
.rp-dl{flex:1.2}
.rp-seek{width:100%;accent-color:#64b5f6}
.rp-frame-info{color:#94a3b8;font-size:10px;margin-top:3px;line-height:1.5}
.rp-detail-warn{color:#f59e0b;font-size:10px;margin-top:4px;line-height:1.4}
</style>
