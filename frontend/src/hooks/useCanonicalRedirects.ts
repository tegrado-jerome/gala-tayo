import { useEffect } from 'react'
import { toHomePath } from '../utils/homePath'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import {
  getCanonicalAskAiPath,
  getCanonicalAuthPath,
  getCanonicalCategoryPath,
  getCanonicalForgotPasswordPath,
  getCanonicalMemberPath,
  getCanonicalPromptBuilderPath,
  getCanonicalPublicGalaPlanPath,
  getCanonicalResetPasswordPath,
  getCanonicalSettingsPath,
} from '../utils/routes'

const canonicalRedirects = [
  { getPath: getCanonicalAuthPath, useReplace: false },
  { getPath: getCanonicalSettingsPath, useReplace: false },
  { getPath: getCanonicalForgotPasswordPath, useReplace: true },
  { getPath: getCanonicalResetPasswordPath, useReplace: true },
  { getPath: getCanonicalAskAiPath, useReplace: true },
  { getPath: getCanonicalPromptBuilderPath, useReplace: true },
  { getPath: getCanonicalMemberPath, useReplace: true },
  { getPath: getCanonicalCategoryPath, useReplace: true },
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
    // The host 301s /home to / but drops the query; this keeps it when the app itself opens /home.
    const homePath = toHomePath(pathname)

    if (homePath !== pathname) {
      replaceWithPath(`${homePath}${window.location.search}`)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalPublicGalaPlanPath = getCanonicalPublicGalaPlanPath(pathname)

    if (canonicalPublicGalaPlanPath) {
      replaceWithPath(canonicalPublicGalaPlanPath)
    }
  }, [pathname])
}
