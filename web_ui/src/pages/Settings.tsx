import { useState } from 'react'
import { Key, Database, Cpu, Save, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Settings() {
    const [groqKey, setGroqKey] = useState('')
    const [storageRoot, setStorageRoot] = useState('./data')
    const [pipeline, setPipeline] = useState('raw')
    const [isSaving, setIsSaving] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        // TODO: Call settings API
        await new Promise((resolve) => setTimeout(resolve, 1000))
        setIsSaving(false)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">全局设置</h1>
                <p className="text-muted-foreground">
                    配置 Vortex 服务端参数
                </p>
            </div>

            {/* API Keys */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        API 密钥
                    </CardTitle>
                    <CardDescription>
                        配置用于语音识别的 API 密钥
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="groq-key">Groq API Key</Label>
                        <Input
                            id="groq-key"
                            type="password"
                            placeholder="gsk_..."
                            value={groqKey}
                            onChange={(e) => setGroqKey(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            从 <a href="https://console.groq.com" target="_blank" rel="noopener" className="underline">console.groq.com</a> 获取
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Storage */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        存储配置
                    </CardTitle>
                    <CardDescription>
                        日志文件存储位置
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="storage-root">Storage Root</Label>
                        <Input
                            id="storage-root"
                            placeholder="./data"
                            value={storageRoot}
                            onChange={(e) => setStorageRoot(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            支持本地路径或 NAS 挂载点 (如 /Volumes/NAS/vortex)
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Pipeline */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cpu className="h-5 w-5" />
                        处理管道
                    </CardTitle>
                    <CardDescription>
                        选择语音识别后处理流程
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="pipeline">Default Pipeline</Label>
                        <select
                            id="pipeline"
                            value={pipeline}
                            onChange={(e) => setPipeline(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="raw">Raw Whisper (原始输出)</option>
                            <option value="groq_llama">Groq LLaMA (智能修正)</option>
                        </select>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    保存设置
                </Button>
            </div>
        </div>
    )
}
