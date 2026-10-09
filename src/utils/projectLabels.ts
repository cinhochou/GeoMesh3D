import type { ProjectSource } from '@/types/project'

/**
 * 项目来源 → 展示文案。
 * 后端存英文枚举（USER/COLLAB/PUBLIC_RESOURCE），文案改动只改这里，不动数据。
 */
export const PROJECT_SOURCE_LABELS: Record<ProjectSource, string> = {
  USER: '用户自主创建',
  COLLAB: '协作关联创建',
  PUBLIC_RESOURCE: '公开资源创建',
}

/** 兜底：未知来源按「用户自主创建」展示，避免界面出现空白 */
export const getProjectSourceLabel = (source?: string | null): string => {
  if (source && source in PROJECT_SOURCE_LABELS) {
    return PROJECT_SOURCE_LABELS[source as ProjectSource]
  }
  return PROJECT_SOURCE_LABELS.USER
}

/**
 * 项目来源 → 徽章样式修饰类（配合 pl-source-badge 使用）。
 * 三种来源用不同色系区分，便于在列表中一眼识别。
 */
export const getProjectSourceClass = (source?: string | null): string => {
  switch (source) {
    case 'COLLAB':
      return 'is-collab'
    case 'PUBLIC_RESOURCE':
      return 'is-public-resource'
    default:
      return 'is-user'
  }
}
