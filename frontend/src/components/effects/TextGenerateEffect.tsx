import { motion } from 'motion/react'
import { cn } from '../../lib/utils'

interface TextGenerateEffectProps {
  words: string
  className?: string
  delay?: number
}

export function TextGenerateEffect({
  words,
  className,
  delay = 0.04,
}: TextGenerateEffectProps) {
  const tokens = words.split(' ')

  return (
    <span className={cn('inline', className)}>
      {tokens.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          whileInView={{ opacity: 1, filter: 'blur(0px)' }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: i * delay }}
          className="mr-[0.25em] inline-block"
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}
