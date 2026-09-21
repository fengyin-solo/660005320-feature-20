export interface Device {
  id: number; type: string; status: string; position: number[]
  temperature: number; vibration: number; pressure: number
  production_count: number; fault_count: number
  uptime: number; quality_rate: number
}

export interface Anomaly {
  timestamp: number; triggers: { device_id: number; rule: string; value: number; threshold: string }[]
  device_type: string
}

export interface OEEItem {
  id: number; type: string; oee: number
  availability: number; performance: number; quality: number
}

export interface FactoryData {
  devices: Device[]
  production: number
  anomalies: Anomaly[]
  oee: OEEItem[]
}

export const DEVICE_COLORS: Record<string, string> = {
  CNC: '#e74c3c', RobotArm: '#3498db', Conveyor: '#f39c12',
  AGV: '#2ecc71', InjectionMolding: '#9b59b6', QCStation: '#1abc9c'
}

export const STATUS_COLORS: Record<string, string> = {
  RUNNING: '#2ecc71', IDLE: '#f1c40f', FAULT: '#e74c3c', OFFLINE: '#95a5a6'
}

// ===== 轨迹回放 / 记录留存 =====
export interface ReplayFrame {
  t: number            // 帧时间戳(毫秒)
  p: [number, number, number] // 位置
  s: string            // 运行状态
  temp: number
  vib: number
}

export interface ReplaySegment {
  id: string
  deviceId: number
  deviceType: string
  start: number        // 起始时间(毫秒)
  end: number          // 结束时间(毫秒)
  status: string       // 该段运行状态(段内以状态恒定为原则)
  frames: ReplayFrame[]
  closed: boolean
  conflict?: boolean   // 与同设备其他段时段冲突
}

export const REPLAY_STORAGE_KEY = 'factory-replay-v1'
export const REPLAY_SELECT_KEY = 'factory-replay-selected-v1'
export const SEGMENT_MAX_MS = 20000        // 单段最长时长(达到即切段)
export const REPLAY_MAX_SEGMENTS = 60      // 最多留存段数(每设备)
export const REPLAY_FRAME_STEP_MS = 1000   // 抽帧间隔