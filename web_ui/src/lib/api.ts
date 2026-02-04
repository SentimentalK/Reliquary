import axios from 'axios'

// Create axios instance with base configuration
export const api = axios.create({
    baseURL: '/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
})

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('[API Error]', error.response?.data || error.message)
        return Promise.reject(error)
    }
)

// ============== Device API ==============

export interface DeviceInfo {
    device_id: string
    user_id: string
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
        config: { keycode?: number; server_url?: string; language?: string }
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

// ============== Settings API ==============

export interface ServerSettings {
    groq_api_key?: string
    storage_root?: string
    default_pipeline?: string
}

export const settingsApi = {
    get: async (): Promise<ServerSettings> => {
        const { data } = await api.get<ServerSettings>('/settings')
        return data
    },

    update: async (settings: Partial<ServerSettings>): Promise<void> => {
        await api.patch('/settings', settings)
    },
}
