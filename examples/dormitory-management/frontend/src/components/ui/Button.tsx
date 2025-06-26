/** @jsx createElement */
import { createElement } from 'axii'
import './Button.css'

interface ButtonProps {
  children: any
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  className?: string
}

export const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  className = ''
}: ButtonProps) => {
  const classList = ['btn', `btn-${variant}`, `btn-${size}`]
  if (disabled || loading) classList.push('btn-disabled')
  if (fullWidth) classList.push('btn-full')
  if (className) classList.push(className)
  const classes = classList.join(' ')

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <span className="btn-loading">
          <span className="btn-spinner"></span>
          加载中...
        </span>
      ) : children}
    </button>
  )
} 