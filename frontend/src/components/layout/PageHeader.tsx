import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'

interface PageHeaderProps {
  title: string
  subtitle?: string
  backTo?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, backTo, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {backTo && (
          <Link
            to={backTo}
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-teal-brand hover:underline"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Retour
          </Link>
        )}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-slate-600">{subtitle}</p>
        )}
      </div>
      {action}
    </header>
  )
}
