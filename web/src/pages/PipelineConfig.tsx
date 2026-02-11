import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Save, Loader2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pipelineConfigApi, type PipelineSchema, type StepSchema } from '@/lib/api'


function StepConfigForm({
    step,
    keywords,
    userPrompt,
    onKeywordsChange,
    onUserPromptChange,
}: {
    step: StepSchema
    keywords: string[]
    userPrompt: string
    onKeywordsChange: (keywords: string[]) => void
    onUserPromptChange: (prompt: string) => void
}) {
    const { t } = useTranslation()

    // Convert keywords array to textarea text (one per line)
    const keywordsText = keywords.join('\n')

    return (
        <div className="space-y-4 border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold font-mono">{step.step_name}</h3>
            </div>

            {/* System prompt hint */}
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                        <div className="font-medium mb-1">{t('pipelineConfig.systemPromptHint')}</div>
                        <pre className="whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                            {step.system_prompt}
                        </pre>
                    </div>
                </div>
            </div>

            {/* Keywords */}
            <div>
                <label className="text-sm font-medium block mb-1.5">
                    {t('pipelineConfig.keywords')}
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    {t('pipelineConfig.keywordsDesc')}
                </p>
                <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={t('pipelineConfig.keywordsPlaceholder')}
                    value={keywordsText}
                    onChange={(e) => {
                        // Support any separator: newline, comma, space
                        const lines = e.target.value
                            .split(/[\n,;，；]+/)
                            .map(l => l.trim())
                            .filter(Boolean)
                        onKeywordsChange(lines.slice(0, 10))
                    }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                    {keywords.length}/10
                </p>
            </div>

            {/* User Prompt */}
            <div>
                <label className="text-sm font-medium block mb-1.5">
                    {t('pipelineConfig.userPrompt')}
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    {t('pipelineConfig.userPromptDesc')}
                </p>
                <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={t('pipelineConfig.userPromptPlaceholder')}
                    value={userPrompt}
                    onChange={(e) => onUserPromptChange(e.target.value)}
                />
            </div>
        </div>
    )
}


export function PipelineConfig() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // State
    const [selectedPipeline, setSelectedPipeline] = useState<string>('')
    const [localConfig, setLocalConfig] = useState<Record<string, Record<string, { keywords: string[]; user_prompt: string }>>>({})
    const [hasChanges, setHasChanges] = useState(false)

    // Fetch schema (available pipelines & steps)
    const { data: schemaData, isLoading: schemaLoading } = useQuery({
        queryKey: ['pipeline-config-schema'],
        queryFn: pipelineConfigApi.getSchema,
    })

    // Fetch user config
    const { data: configData, isLoading: configLoading } = useQuery({
        queryKey: ['pipeline-config'],
        queryFn: pipelineConfigApi.get,
    })

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: pipelineConfigApi.update,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-config'] })
            setHasChanges(false)
        },
    })

    // Available pipelines from schema
    const pipelines = schemaData?.pipelines || {}
    const pipelineKeys = Object.keys(pipelines)

    // Auto-select first pipeline
    useEffect(() => {
        if (pipelineKeys.length > 0 && !selectedPipeline) {
            setSelectedPipeline(pipelineKeys[0])
        }
    }, [pipelineKeys, selectedPipeline])

    // Initialize local config from server data
    useEffect(() => {
        if (configData?.config) {
            setLocalConfig(configData.config)
        }
    }, [configData])

    const selectedSchema = pipelines[selectedPipeline] as PipelineSchema | undefined
    const steps = selectedSchema?.steps || []

    const getStepConfig = (stepName: string) => {
        return localConfig[selectedPipeline]?.[stepName] || { keywords: [], user_prompt: '' }
    }

    const updateStepConfig = (stepName: string, field: 'keywords' | 'user_prompt', value: string[] | string) => {
        setLocalConfig(prev => ({
            ...prev,
            [selectedPipeline]: {
                ...(prev[selectedPipeline] || {}),
                [stepName]: {
                    ...getStepConfig(stepName),
                    [field]: value,
                },
            },
        }))
        setHasChanges(true)
    }

    const handleSave = () => {
        saveMutation.mutate(localConfig)
    }

    const isLoading = schemaLoading || configLoading

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('pipelineConfig.title')}</h1>
                    <p className="text-muted-foreground">
                        {t('pipelineConfig.subtitle')}
                    </p>
                </div>
            </div>

            <Card>
                <CardContent className="p-6 space-y-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : pipelineKeys.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            {t('pipelineConfig.noPipelines')}
                        </div>
                    ) : (
                        <>
                            {/* Pipeline Selector */}
                            <div>
                                <label className="text-sm font-medium block mb-2">
                                    {t('pipelineConfig.selectPipeline')}
                                </label>
                                <select
                                    className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    value={selectedPipeline}
                                    onChange={(e) => setSelectedPipeline(e.target.value)}
                                >
                                    {pipelineKeys.map(key => (
                                        <option key={key} value={key}>{key}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Step configs */}
                            {steps.map((step) => {
                                const cfg = getStepConfig(step.step_name)
                                return (
                                    <StepConfigForm
                                        key={step.step_name}
                                        step={step}
                                        keywords={cfg.keywords}
                                        userPrompt={cfg.user_prompt}
                                        onKeywordsChange={(kw) => updateStepConfig(step.step_name, 'keywords', kw)}
                                        onUserPromptChange={(p) => updateStepConfig(step.step_name, 'user_prompt', p)}
                                    />
                                )
                            })}

                            {/* Save */}
                            <div className="flex items-center gap-3 pt-2">
                                <Button
                                    onClick={handleSave}
                                    disabled={!hasChanges || saveMutation.isPending}
                                    className="gap-2"
                                >
                                    {saveMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    {t('pipelineConfig.save')}
                                </Button>
                                {saveMutation.isSuccess && (
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        {t('pipelineConfig.saved')}
                                    </span>
                                )}
                                {saveMutation.isError && (
                                    <span className="text-sm text-destructive">
                                        {t('pipelineConfig.saveFailed')}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
