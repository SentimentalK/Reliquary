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
        config.headers['X-Vortex-Token'] = token
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
            headers: { 'X-Vortex-Token': token },
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
    user_id: string
    device_id: string
    input_context?: {
        client_config?: { lang?: string }
        audio_meta?: { duration_ms?: number; size_bytes?: number }
    }
    pipeline_trace?: {
        trigger_source?: string
        detected_domain?: string
        raw_whisper_output?: string
        post_process_fix?: string
    }
    result?: {
        final_text?: string
        success?: boolean
        latency_ms?: number
    }
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

