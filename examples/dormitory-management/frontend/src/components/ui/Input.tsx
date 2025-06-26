/** @jsx createElement */
import { createElement } from 'axii'
import './Input.css'

interface InputProps {
  value?: string
  onChange?: (value: string) => void
  onInput?: (e: Event) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
}

export const Input = ({
  value = '',
  onChange,
  onInput,
  type = 'text',
  placeholder = '',
  disabled = false,
  readOnly = false,
  error = false,
  size = 'md',
  fullWidth = false,
  className = ''
}: InputProps) => {
  const classList = ['input', `input-${size}`]
  if (error) classList.push('input-error')
  if (fullWidth) classList.push('input-full')
  if (className) classList.push(className)
  const classes = classList.join(' ')

  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    onChange?.(target.value)
  }

  return (
    <input
      type={type}
      className={classes}
      value={value}
      onChange={handleChange}
      onInput={onInput}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
    />
  )
}

interface TextareaProps {
  value?: string
  onChange?: (value: string) => void
  onInput?: (e: Event) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  error?: boolean
  rows?: number
  fullWidth?: boolean
  className?: string
}

export const Textarea = ({
  value = '',
  onChange,
  onInput,
  placeholder = '',
  disabled = false,
  readOnly = false,
  error = false,
  rows = 3,
  fullWidth = false,
  className = ''
}: TextareaProps) => {
  const classList = ['textarea']
  if (error) classList.push('textarea-error')
  if (fullWidth) classList.push('textarea-full')
  if (className) classList.push(className)
  const classes = classList.join(' ')

  const handleChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement
    onChange?.(target.value)
  }

  return (
    <textarea
      className={classes}
      value={value}
      onChange={handleChange}
      onInput={onInput}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      rows={rows}
    />
  )
} 