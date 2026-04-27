export interface ApplyPickedPathResult {
  paths: string[]
  duplicate: boolean
}

export const applyPickedPathToEditableList = (
  currentPaths: string[],
  selectedPath: string
): ApplyPickedPathResult => {
  const nextSelectedPath = String(selectedPath || '').trim()
  const sourcePaths = Array.isArray(currentPaths) ? currentPaths.map(item => String(item ?? '')) : []

  if (!nextSelectedPath) {
    return {
      paths: sourcePaths,
      duplicate: false
    }
  }

  const normalizedSelectedPath = nextSelectedPath.toLowerCase()
  const duplicate = sourcePaths.some(item => item.trim().toLowerCase() === normalizedSelectedPath)
  if (duplicate) {
    return {
      paths: sourcePaths,
      duplicate: true
    }
  }

  const emptyIndex = sourcePaths.findIndex(item => item.trim().length === 0)
  if (emptyIndex >= 0) {
    const nextPaths = [...sourcePaths]
    nextPaths[emptyIndex] = nextSelectedPath
    return {
      paths: nextPaths,
      duplicate: false
    }
  }

  return {
    paths: [...sourcePaths, nextSelectedPath],
    duplicate: false
  }
}
