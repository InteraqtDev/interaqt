/** @jsx createElement */
import { createElement } from 'axii'
import './Select.css'

interface SelectProps {
  value?: any
  onChange?: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
}

export const Select = ({
  value = '',
  onChange,
  options = [],
  placeholder = '请选择',
  disabled = false,
  error = false,
  size = 'md',
  fullWidth = false,
  className = ''
}: SelectProps) => {
  const classList = ['select', `select-${size}`]
  if (error) classList.push('select-error')
  if (fullWidth) classList.push('select-full')
  if (className) classList.push(className)
  const classes = classList.join(' ')

  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    onChange?.(target.value)
  }

  return (
    <select
      className={classes}
      value={value}
      onChange={handleChange}
      disabled={disabled}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
} 