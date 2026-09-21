import type { ReplaySegment } from '@/types'

export function formatTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}分${s % 60}秒` : `${s}秒`
}

const STATUS_LABEL: Record<string, string> = {
  RUNNING: '运行中', IDLE: '待机', FAULT: '故障', OFFLINE: '离线',
}
export function statusLabel(s: string) {
  return STATUS_LABEL[s] || s
}

/**
 * 把一段回放打包成留存文件。
 * 关键约束：文件中的设备编号 / 起止时段 / 运行状态 / 位置与状态帧
 * 必须与回放清单里该段显示的完全一致 —— 直接序列化同一个 seg 对象。
 */
export function buildSegmentFile(seg: ReplaySegment) {
  return {
    文件名: `轨迹回放_设备${seg.deviceId}_${seg.start}.json`,
    文件类型: '轨迹回放记录',
    导出版本: '1.0',
    导出时间: formatTime(Date.now()),
    记录内容: {
      设备编号: seg.deviceId,
      设备类型: seg.deviceType,
      起始时间: formatTime(seg.start),
      结束时间: formatTime(seg.end),
      时段时长秒: Math.round((seg.end - seg.start) / 1000),
      运行状态: seg.status,
      运行状态说明: statusLabel(seg.status),
      帧数量: seg.frames.length,
      位置与状态帧: seg.frames.map(f => ({
        时间: formatTime(f.t),
        位置: { x: f.p[0], y: f.p[1], z: f.p[2] },
        运行状态: f.s,
        温度: f.temp,
        振动: f.vib,
      })),
    },
    备注: seg.conflict ? '该段时段与同设备其他回放段存在冲突，请核对' : undefined,
  }
}

/**
 * 触发下载。同一时间点对同一段只允许产生一份文件：
 * 内部记录进行中的段 id，连续点击直接忽略。
 */
const downloading = new Set<string>()
export function downloadSegment(seg: ReplaySegment): boolean {
  if (downloading.has(seg.id)) return false
  downloading.add(seg.id)
  try {
    const payload = JSON.stringify(buildSegmentFile(seg), null, 2)
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `轨迹回放_设备${seg.deviceId}_${new Date(seg.start).getTime()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } finally {
    // 一次点击周期结束后释放；按钮本身也会在本次会话内保持禁用
    setTimeout(() => downloading.delete(seg.id), 800)
  }
}
