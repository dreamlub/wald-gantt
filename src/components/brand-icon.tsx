'use client'

import {
  Building2, Store, Factory, Briefcase, ShoppingBag,
  Coffee, Utensils, Car, Plane, Globe, Music, Film,
  Palette, Camera, HeartPulse, Laptop, Smartphone,
  Gamepad2, BookOpen, Newspaper, Medal, Trophy, Star,
  Zap, Leaf, Flame, Diamond, Crown, Package, Truck,
} from 'lucide-react'
import { brandColor } from '@/lib/brand-color'
import type { LucideIcon } from 'lucide-react'

export const BRAND_ICONS: Record<string, LucideIcon> = {
  'building-2': Building2, 'store': Store, 'factory': Factory,
  'briefcase': Briefcase, 'shopping-bag': ShoppingBag, 'coffee': Coffee,
  'utensils': Utensils, 'car': Car, 'plane': Plane, 'globe': Globe,
  'music': Music, 'film': Film, 'palette': Palette, 'camera': Camera,
  'heart-pulse': HeartPulse, 'laptop': Laptop, 'smartphone': Smartphone,
  'gamepad-2': Gamepad2, 'book-open': BookOpen, 'newspaper': Newspaper,
  'medal': Medal, 'trophy': Trophy, 'star': Star, 'zap': Zap,
  'leaf': Leaf, 'flame': Flame, 'diamond': Diamond, 'crown': Crown,
  'package': Package, 'truck': Truck,
}

interface Props {
  name: string
  logoUrl?: string | null
  lucideIcon?: string | null
  size?: number
  className?: string
}

export function BrandIcon({ name, logoUrl, lucideIcon, size = 16, className = '' }: Props) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        className={`rounded-sm object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  const Icon = lucideIcon ? BRAND_ICONS[lucideIcon] : null
  if (Icon) {
    return <Icon size={size} className={`shrink-0 ${className}`} style={{ color: brandColor(name) }} />
  }

  const initial = name[0]?.toUpperCase() ?? '?'
  const fontSize = Math.round(size * 0.55)
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 text-white font-semibold ${className}`}
      style={{ width: size, height: size, fontSize, background: brandColor(name) }}
    >
      {initial}
    </span>
  )
}
