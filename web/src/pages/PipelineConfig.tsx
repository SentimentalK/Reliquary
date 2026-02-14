import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Save, Loader2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pipelineConfigApi, type StepSchema } from '@/lib/api'


function StepConfigForm({
    step,
    keywordsText,
    userPrompt,
    onKeywordsTextChange,
    onUserPromptChange,
}: {
    step: StepSchema
    keywordsText: string
    userPrompt: string
    onKeywordsTextChange: (text: string) => void
    onUserPromptChange: (prompt: string) => void
}) {
    const { t } = useTranslation()

    const keywordCount = keywordsText
        .split(/[\n,;，；]+/)
        .map(l => l.trim())
        .filter(Boolean)
        .length

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
                    onChange={(e) => onKeywordsTextChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                    {keywordCount}/10
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


/** Parse raw keywords text into clean array (max 10) */
function parseKeywords(text: string): string[] {
    return text
        .split(/[\n,;，；]+/)
        .map(l => l.trim())
        .filter(Boolean)
        .slice(0, 10)
}

/** Convert keywords array from server into editable text */
function keywordsToText(keywords: string[]): string {
    return keywords.join('\n')
}


export function PipelineConfig() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // State — keywords stored as raw text for free-form editing
    const [localConfig, setLocalConfig] = useState<Record<string, { keywordsText: string; user_prompt: string }>>({})
    const [hasChanges, setHasChanges] = useState(false)

    // Fetch schema (all configurable steps)
    const { data: schemaData, isLoading: schemaLoading } = useQuery({
        queryKey: ['pipeline-config-schema'],
        queryFn: pipelineConfigApi.getSchema,
    })

    // Fetch user config
    const { data: configData, isLoading: configLoading } = useQuery({
        queryKey: ['pipeline-config'],
        queryFn: pipelineConfigApi.get,
    })

    // Save mutation — parse keywords text into array before sending
    const saveMutation = useMutation({
        mutationFn: (config: Record<string, { keywordsText: string; user_prompt: string }>) => {
            const apiConfig: Record<string, { keywords: string[]; user_prompt: string }> = {}
            for (const [stepName, sc] of Object.entries(config)) {
                apiConfig[stepName] = {
                    keywords: parseKeywords(sc.keywordsText),
                    user_prompt: sc.user_prompt,
                }
            }
            return pipelineConfigApi.update(apiConfig)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-config'] })
            setHasChanges(false)
        },
    })

    // All configurable steps from schema
    const steps = schemaData?.steps || {}
    const stepNames = Object.keys(steps)

    // Initialize local config from server data
    useEffect(() => {
        if (configData?.config) {
            const converted: Record<string, { keywordsText: string; user_prompt: string }> = {}
            for (const [stepName, sc] of Object.entries(configData.config)) {
                converted[stepName] = {
                    keywordsText: keywordsToText(sc.keywords),
                    user_prompt: sc.user_prompt,
                }
            }
            setLocalConfig(converted)
        }
    }, [configData])

    const getStepConfig = (stepName: string) => {
        return localConfig[stepName] || { keywordsText: '', user_prompt: '' }
    }

    const updateStepConfig = (stepName: string, field: 'keywordsText' | 'user_prompt', value: string) => {
        setLocalConfig(prev => ({
            ...prev,
            [stepName]: {
                ...getStepConfig(stepName),
                [field]: value,
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
                    ) : stepNames.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            {t('pipelineConfig.noPipelines')}
                        </div>
                    ) : (
                        <>
                            {/* Step configs */}
                            {stepNames.map((stepName) => {
                                const step = steps[stepName]
                                const cfg = getStepConfig(stepName)
                                return (
                                    <StepConfigForm
                                        key={stepName}
                                        step={step}
                                        keywordsText={cfg.keywordsText}
                                        userPrompt={cfg.user_prompt}
                                        onKeywordsTextChange={(text) => updateStepConfig(stepName, 'keywordsText', text)}
                                        onUserPromptChange={(p) => updateStepConfig(stepName, 'user_prompt', p)}
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
