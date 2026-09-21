import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FactoryData } from '@/types'
import { ingestDevices } from '@/composables/useReplay'

export const useFactoryStore = defineStore('factory', () => {
  const data = ref<FactoryData | null>(null)
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)

  function connect() {
    if (ws.value) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const s = new WebSocket(`${protocol}//${location.hostname}:8000/ws`)
    s.onopen = () => { connected.value = true; console.log('WS connected') }
    s.onmessage = (e) => {
      try {
        data.value = JSON.parse(e.data)
        // 实时帧进入轨迹回放录制(按段留存位置与状态)
        if (data.value?.devices?.length) ingestDevices(data.value.devices)
      } catch {}
    }
    s.onclose = () => { connected.value = false; ws.value = null }
    ws.value = s
  }

  function disconnect() {
    ws.value?.close()
    ws.value = null
    connected.value = false
  }

  return { data, connected, connect, disconnect }
})