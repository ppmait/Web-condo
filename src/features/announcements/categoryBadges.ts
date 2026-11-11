import type { TFunction } from 'i18next'
import { categoryBadge } from '../../announcements/rules'
import type { Category } from '../../announcements/types'
import type { Status } from '../../components/StatusBadge'

export interface CategoryBadgeInfo {
  status: Status
  label: string
}

export function announcementBadge(category: Category, t: TFunction): CategoryBadgeInfo {
  return {
    status: categoryBadge(category),
    label: t(`announcements.category.${category}`),
  }
}
