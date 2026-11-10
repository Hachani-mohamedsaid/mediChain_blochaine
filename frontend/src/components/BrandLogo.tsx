import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

interface BrandLogoProps {
  className?: string
  /** conservé pour compat — l’icône est supprimée */
  wordmark?: boolean
  size?: 'md' | 'lg' | 'xl'
  light?: boolean
  to?: string
}

const word = {
  md: 'text-2xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl',
  xl: 'text-4xl sm:text-5xl',
}

/** Wordmark seul — plus d’icône */
export function BrandLogo({
  className,
  size = 'lg',
  light = false,
  to = '/',
}: BrandLogoProps) {
  const content = (
    <motion.span
      className={cn(
        'inline-block font-display font-bold tracking-tight',
        word[size],
        light ? 'text-white drop-shadow-md' : 'text-charcoal',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ opacity: 0.9 }}
    >
      Medi
      <span className={light ? 'text-cyan-brand' : 'text-teal-brand'}>
        Chain
      </span>
    </motion.span>
  )

  return to ? <Link to={to}>{content}</Link> : content
}
