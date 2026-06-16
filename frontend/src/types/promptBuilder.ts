export type PromptBuilderFieldId =
  | 'plan'
  | 'location'
  | 'companion'
  | 'vibe'
  | 'budget'

export type PromptBuilderState = Record<PromptBuilderFieldId, string[]> & {
  custom: Record<PromptBuilderFieldId, string>
}

export type PromptBuilderSection = {
  id: PromptBuilderFieldId
  title: string
  chips: string[]
  customLabel: string
  helperText: string
  placeholder: string
  multiSelect: boolean
}

export type PromptBuilderOutputs = {
  aiPrompt: string
  searchKeyword: string
  galaTayoSearchPhrase: string
}

export type ExternalLink = {
  label: string
  href: string
  helper?: string
}
