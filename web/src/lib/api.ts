import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

// Create axios instance with base configuration
export const api = axios.create({
    baseURL: '/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
})

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token
    if (token) {
        config.headers['X-Reliquary-Token'] = token
    }
    return config
})

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('[API Error]', error.response?.data || error.message)
        // Auto logout on 401
        if (error.response?.status === 401) {
            useAuthStore.getState().logout()
        }
        return Promise.reject(error)
    }
)

// ============== Auth API ==============

export interface RegisterRequest {
    display_name: string
    invite_code: string
}

export interface RegisterResponse {
    master_secret: string
    display_name: string
    role: string
    message: string
}

export interface VerifyResponse {
    valid: boolean
    user?: {
        id: string
        display_name: string
        role: string
        created_at: string
    }
}

export const authApi = {
    register: async (data: RegisterRequest): Promise<RegisterResponse> => {
        const { data: res } = await api.post<RegisterResponse>('/auth/register', data)
        return res
    },

    verify: async (token: string): Promise<VerifyResponse> => {
        const { data } = await api.get<VerifyResponse>('/auth/verify', {
            headers: { 'X-Reliquary-Token': token },
        })
        return data
    },
}

// ============== Device API ==============

export interface DeviceInfo {
    device_id: string
    user_id: string
    display_name?: string
    connected_at: string
    platform?: string
}

export interface DevicesResponse {
    devices: DeviceInfo[]
    count: number
}

export const devicesApi = {
    list: async (userId?: string): Promise<DevicesResponse> => {
        const params = userId ? { user_id: userId } : {}
        const { data } = await api.get<DevicesResponse>('/devices', { params })
        return data
    },

    getStatus: async (deviceId: string): Promise<DeviceInfo & { connected: boolean }> => {
        const { data } = await api.get(`/devices/${deviceId}`)
        return data
    },

    pushConfig: async (
        deviceId: string,
        config: { keycode?: number; server_url?: string; language?: string; api_key?: string; pipeline?: string }
    ): Promise<void> => {
        await api.post(`/devices/${deviceId}/config`, config)
    },

    learnHotkey: async (deviceId: string): Promise<{ success: boolean; message: string }> => {
        const { data } = await api.post(`/devices/${deviceId}/learn_hotkey`)
        return data
    },

    learnHotkeyAndWait: async (
        deviceId: string,
        timeout = 30
    ): Promise<{ success: boolean; key_code?: number; error?: string }> => {
        const { data } = await api.post(`/devices/${deviceId}/learn_hotkey/wait`, null, {
            params: { timeout },
        })
        return data
    },
}

// ============== Logs API ==============

export interface LogEntry {
    id: string
    timestamp: string
    audio_path?: string
    // Ordered pipeline step results
    transcription: Array<{ step: string; text: string; latency_ms: number }>
    latency_stats?: {
        total_ms: number
    }
    // Legacy fields (for backward compatibility)
    user_id?: string
    device_id?: string
}

export interface LogsResponse {
    entries: LogEntry[]
    date: string
    user_id?: string
}

export const logsApi = {
    getByDate: async (date: string, userId?: string): Promise<LogsResponse> => {
        const params: Record<string, string> = { date }
        if (userId) params.user_id = userId
        const { data } = await api.get<LogsResponse>('/logs', { params })
        return data
    },
}

// ============== Pipeline Config API ==============

export interface StepSchema {
    step_name: string
    system_prompt: string
}

export interface PipelineSchema {
    steps: StepSchema[]
}

export interface PipelineConfigSchemaResponse {
    pipelines: Record<string, PipelineSchema>
}

export interface PipelineConfigResponse {
    config: Record<string, Record<string, { keywords: string[]; user_prompt: string }>>
}

export const pipelineConfigApi = {
    getSchema: async (): Promise<PipelineConfigSchemaResponse> => {
        const { data } = await api.get<PipelineConfigSchemaResponse>('/pipeline-config/schema')
        return data
    },

    get: async (): Promise<PipelineConfigResponse> => {
        const { data } = await api.get<PipelineConfigResponse>('/pipeline-config')
        return data
    },

    update: async (config: Record<string, Record<string, { keywords: string[]; user_prompt: string }>>): Promise<void> => {
        await api.put('/pipeline-config', { config })
    },
}
