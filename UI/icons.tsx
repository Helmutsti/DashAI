import {
  Bug,
  ChatCircle,
  Cloud,
  Code,
  Database,
  FilmSlate,
  Folder,
  GearSix,
  GitBranch,
  Globe,
  Lightning,
  Package,
  Play,
  Robot,
  Rocket,
  Star,
  Terminal,
  Wrench
} from '@phosphor-icons/react'

/** Set curato di icone selezionabili per progetti e comandi. */
export const ICONS = {
  Folder,
  Terminal,
  Rocket,
  Code,
  Play,
  GitBranch,
  Database,
  Globe,
  Bug,
  Star,
  Lightning,
  FilmSlate,
  Package,
  Wrench,
  Robot,
  Cloud,
  ChatCircle,
  GearSix
} as const

export type IconName = keyof typeof ICONS
export const ICON_NAMES = Object.keys(ICONS) as IconName[]

export interface IconProps {
  name: IconName
  size?: number
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  color?: string
  style?: React.CSSProperties
}

export function Icon({ name, size = 16, weight, color, style }: IconProps): React.ReactElement {
  const C = ICONS[name] ?? Folder
  return <C size={size} weight={weight} color={color} style={style} />
}
