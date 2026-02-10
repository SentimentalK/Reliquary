import { create } from 'zustand'

export interface Device {
    device_id: string
    user_id: string
    display_name?: string
    connected: boolean
    connected_at?: string
    keycode?: number
    language?: string
    server_url?: string
    api_key?: string
    pipeline?: string
    platform?: string  // "android", "macos", "windows" etc.
}

interface DevicesState {
    devices: Device[]
    selectedDevice: Device | null
    sheetOpen: boolean
    setDevices: (devices: Device[]) => void
    selectDevice: (device: Device | null) => void
    updateDevice: (deviceId: string, updates: Partial<Device>) => void
    openSheet: (device: Device) => void
    closeSheet: () => void
}

export const useDevicesStore = create<DevicesState>((set) => ({
    devices: [],
    selectedDevice: null,
    sheetOpen: false,

    setDevices: (devices) => set({ devices }),

    selectDevice: (device) => set({ selectedDevice: device }),

    updateDevice: (deviceId, updates) =>
        set((state) => ({
            devices: state.devices.map((d) =>
                d.device_id === deviceId ? { ...d, ...updates } : d
            ),
            selectedDevice:
                state.selectedDevice?.device_id === deviceId
                    ? { ...state.selectedDevice, ...updates }
                    : state.selectedDevice,
        })),

    openSheet: (device) => set({ selectedDevice: device, sheetOpen: true }),

    closeSheet: () => set({ sheetOpen: false }),
}))
