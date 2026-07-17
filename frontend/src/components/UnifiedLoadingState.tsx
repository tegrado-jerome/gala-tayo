import { InlineSkeleton, PageShellSkeleton } from './loading/SkeletonStates'

type UnifiedLoadingStateProps = {
  title?: string
  message?: string
  eyebrow?: string
  variant?: 'page' | 'section' | 'inline'
  className?: string
}

function UnifiedLoadingState({ variant = 'section', className = '' }: UnifiedLoadingStateProps) {
  if (variant === 'inline') {
    return <InlineSkeleton className={className} />
  }

  return <PageShellSkeleton className={className} />
}

export default UnifiedLoadingState
