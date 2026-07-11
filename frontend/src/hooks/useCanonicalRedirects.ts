import { useEffect } from 'react'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import {
  getCanonicalAskAiPath,
  getCanonicalAuthPath,
  getCanonicalForgotPasswordPath,
  getCanonicalHomePath,
  getCanonicalMemberPath,
  getCanonicalPromptBuilderPath,
  getCanonicalPublicGalaPlanPath,
  getCanonicalResetPasswordPath,
  getCanonicalSettingsPath,
} from '../utils/routes'

const canonicalRedirects = [
  { getPath: getCanonicalAuthPath, useReplace: false },
  { getPath: getCanonicalSettingsPath, useReplace: false },
  { getPath: getCanonicalHomePath, useReplace: true },
  { getPath: getCanonicalForgotPasswordPath, useReplace: true },
  { getPath: getCanonicalResetPasswordPath, useReplace: true },
  { getPath: getCanonicalAskAiPath, useReplace: true },
  { getPath: getCanonicalPromptBuilderPath, useReplace: true },
  { getPath: getCanonicalMemberPath, useReplace: true },
]

export function useCanonicalRedirects(pathname: string) {
  useEffect(() => {
    for (const { getPath, useReplace } of canonicalRedirects) {
      const canonicalPath = getPath(pathname)

      if (canonicalPath && pathname !== canonicalPath) {
        if (useReplace) {
          replaceWithPath(canonicalPath)
        } else {
          navigateToPath(canonicalPath)
        }
        return
      }
    }
  }, [pathname])

  useEffect(() => {
    const canonicalPublicGalaPlanPath = getCanonicalPublicGalaPlanPath(pathname)

    if (canonicalPublicGalaPlanPath) {
      replaceWithPath(canonicalPublicGalaPlanPath)
    }
  }, [pathname])
}
