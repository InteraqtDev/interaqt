/** @jsx createElement */
import { createElement } from 'axii'
import './Card.css'

interface CardProps {
  children?: any
  className?: string
  hover?: boolean
  onClick?: () => void
}

export const Card = ({
  children,
  className = '',
  hover = false,
  onClick
}: CardProps) => {
  const classes = ['card']
  if (hover) classes.push('card-hover')
  if (onClick) classes.push('card-clickable')
  if (className) classes.push(className)

  return (
    <div className={classes.join(' ')} onClick={onClick}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children?: any
  className?: string
}

export const CardHeader = ({ children, className = '' }: CardHeaderProps) => {
  return (
    <div className={`card-header ${className}`}>
      {children}
    </div>
  )
}

interface CardBodyProps {
  children?: any
  className?: string
}

export const CardBody = ({ children, className = '' }: CardBodyProps) => {
  return (
    <div className={`card-body ${className}`}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  children?: any
  className?: string
}

export const CardFooter = ({ children, className = '' }: CardFooterProps) => {
  return (
    <div className={`card-footer ${className}`}>
      {children}
    </div>
  )
} 