# Axii Framework API Reference

This document provides a comprehensive API reference for the Axii framework, designed for AI agents to understand and utilize the framework effectively.

## Table of Contents

1. [Core APIs](#core-apis)
   - [Reactive State](#reactive-state)
   - [Reactive Collections](#reactive-collections)
   - [Render Context](#render-context)
   - [Utility Functions](#utility-functions)
2. [DOM APIs](#dom-apis)
   - [Reactive DOM Listeners](#reactive-dom-listeners)
   - [DOM Event Listeners](#dom-event-listeners)
   - [DOM Utilities](#dom-utilities)
3. [Ecosystem APIs](#ecosystem-apis)
   - [Router (router0)](#router-router0)
   - [Actions (action0)](#actions-action0)
   - [State Machine (statemachine0)](#state-machine-statemachine0)

## Core APIs

### Reactive State

#### atom

Creates a reactive atom state.

**Syntax**:
```typescript
function atom<T>(initialValue: T): Atom<T>
```

**Parameters**:
- `initialValue: T` - Initial value

**Returns**:
- `Atom<T>` - Reactive atom object

**Methods**:
- `()` - Get current value
- `(newValue: T)` - Set new value
- `.raw` - Get raw value (without triggering dependency tracking)

**Example**:
```typescript
const count = atom(0)

// Get value
console.log(count()) // 0

// Set value
count(10)
console.log(count()) // 10

// Raw value access
console.log(count.raw) // 10, doesn't trigger dependency tracking
```

**Type Definition**:
```typescript
interface Atom<T> {
    (): T
    (value: T): void
    raw: T
}
```

#### computed

Creates a computed property that automatically calculates value based on other reactive states.

**Syntax**:
```typescript
function computed<T>(computeFn: () => T): ComputedRef<T>
```

**Parameters**:
- `computeFn: () => T` - Computation function

**Returns**:
- `ComputedRef<T>` - Computed property object

**Features**:
- Lazy computation: Only calculates when accessed
- Result caching: Returns cached value when dependencies haven't changed
- Automatic dependency tracking: Automatically tracks reactive states used in computation

**Example**:
```typescript
const firstName = atom('John')
const lastName = atom('Doe')

const fullName = computed(() => `${firstName()} ${lastName()}`)

console.log(fullName()) // "John Doe"

firstName('Jane')
console.log(fullName()) // "Jane Doe"
```

**Type Definition**:
```typescript
interface ComputedRef<T> {
    (): T
    readonly raw: T
}
```

#### Object State Management

For complex object states, use `atom` with immutable update patterns.

**Syntax**:
```typescript
const objectState = atom<T>(initialObject)
```

**Update Patterns**:
```typescript
// Shallow update
objectState({...objectState(), property: newValue})

// Deep update
objectState({
    ...objectState(),
    nested: {
        ...objectState().nested,
        property: newValue
    }
})
```

**Example**:
```typescript
const user = atom({
    name: 'Alice',
    age: 30,
    profile: {
        bio: 'Developer',
        avatar: '/avatar.jpg'
    }
})

// Reactive access
const userInfo = computed(() => `${user().name}, ${user().age} years old`)

// Modify properties
user({...user(), name: 'Bob'})
user({
    ...user(),
    profile: {
        ...user().profile,
        bio: 'Senior Developer'
    }
})

console.log(userInfo()) // "Bob, 30 years old"
```

#### onChange

Watches reactive state changes.

**Syntax**:
```typescript
function onChange<T>(
    source: Atom<T> | ComputedRef<T> | (() => T),
    callback: (newValue: T, oldValue: T) => void,
    options?: ChangeOptions
): () => void
```

**Parameters**:
- `source` - Reactive source to watch
- `callback` - Callback function when changed
- `options` - Optional configuration

**Returns**:
- `() => void` - Function to stop watching

**Configuration Options**:
```typescript
interface ChangeOptions {
    immediate?: boolean  // Execute callback immediately
    deep?: boolean      // Deep watch (for objects)
}
```

**Example**:
```typescript
const count = atom(0)

const dispose = onChange(count, (newVal, oldVal) => {
    console.log(`Count changed from ${oldVal} to ${newVal}`)
})

count(1) // Output: "Count changed from 0 to 1"
count(2) // Output: "Count changed from 1 to 2"

// Stop watching
dispose()
count(3) // No output
```

#### autorun

Automatically runs a function and re-executes when its reactive dependencies change.

**Syntax**:
```typescript
function autorun(fn: () => void): () => void
```

**Parameters**:
- `fn: () => void` - Function to auto-run

**Returns**:
- `() => void` - Function to stop auto-running

**Features**:
- Executes immediately once
- Automatically tracks reactive dependencies inside function
- Re-executes when dependencies change

**Example**:
```typescript
const name = atom('Alice')
const age = atom(25)

const dispose = autorun(() => {
    console.log(`User: ${name()}, Age: ${age()}`)
})
// Immediate output: "User: Alice, Age: 25"

name('Bob')    // Output: "User: Bob, Age: 25"
age(30)        // Output: "User: Bob, Age: 30"

dispose()      // Stop auto-running
```

### Reactive Collections

#### RxList

Reactive array that provides all array methods in a reactive manner.

**Constructor**:
```typescript
new RxList<T>(initialItems?: T[])
```

**Properties**:
- `length(): number` - Get array length

**Methods**:

##### Access Methods
- `at(index: number): T | undefined` - Get element at index
- `toArray(): T[]` - Convert to regular array
- `indexOf(item: T): number` - Find element index
- `includes(item: T): boolean` - Check if contains element
- `find(predicate: (item: T) => boolean): T | undefined` - Find element
- `findIndex(predicate: (item: T) => boolean): number` - Find element index

##### Mutation Methods
- `push(...items: T[]): number` - Add elements at end
- `pop(): T | undefined` - Remove and return last element
- `unshift(...items: T[]): number` - Add elements at start
- `shift(): T | undefined` - Remove and return first element
- `splice(start: number, deleteCount?: number, ...items: T[]): T[]` - Delete/insert elements

##### Functional Methods
- `map<U>(mapper: (item: T, index: Atom<number>) => U): RxList<U>` - Map transformation
- `filter(predicate: (item: T) => boolean): RxList<T>` - Filter elements
- `reduce<U>(reducer: (acc: U, item: T) => U, initial: U): ComputedRef<U>` - Accumulate calculation

**Example**:
```typescript
const items = new RxList([1, 2, 3])

// Basic operations
console.log(items.length()) // 3
console.log(items.at(0))    // 1

items.push(4, 5)
console.log(items.toArray()) // [1, 2, 3, 4, 5]

// Reactive transformation
const doubled = items.map(x => x * 2)
console.log(doubled.toArray()) // [2, 4, 6, 8, 10]

items.push(6)
console.log(doubled.toArray()) // [2, 4, 6, 8, 10, 12]
```

#### RxMap

Reactive Map that provides all Map methods in a reactive manner.

**Constructor**:
```typescript
new RxMap<K, V>(entries?: [K, V][] | Map<K, V>)
```

**Properties**:
- `size(): number` - Get Map size

**Methods**:

##### Access Methods
- `get(key: K): V | undefined` - Get value
- `has(key: K): boolean` - Check if key exists
- `keys(): IterableIterator<K>` - Get all keys
- `values(): IterableIterator<V>` - Get all values
- `entries(): IterableIterator<[K, V]>` - Get all key-value pairs

##### Mutation Methods
- `set(key: K, value: V): this` - Set key-value pair
- `delete(key: K): boolean` - Delete key-value pair
- `clear(): void` - Clear Map

##### Iteration Methods
- `forEach(callback: (value: V, key: K, map: RxMap<K, V>) => void): void` - Iterate over Map

**Example**:
```typescript
const userMap = new RxMap<string, { name: string, age: number }>()

// Set values
userMap.set('alice', { name: 'Alice', age: 25 })
userMap.set('bob', { name: 'Bob', age: 30 })

console.log(userMap.size()) // 2
console.log(userMap.get('alice')) // { name: 'Alice', age: 25 }

// Reactive computation
const totalAge = computed(() => {
    let sum = 0
    for (const user of userMap.values()) {
        sum += user.age
    }
    return sum
})

console.log(totalAge()) // 55

userMap.set('charlie', { name: 'Charlie', age: 35 })
console.log(totalAge()) // 90
```

#### RxSet

Reactive Set that provides all Set methods in a reactive manner.

**Constructor**:
```typescript
new RxSet<T>(values?: T[] | Set<T>)
```

**Properties**:
- `size(): number` - Get Set size

**Methods**:

##### Access Methods
- `has(value: T): boolean` - Check if value exists
- `values(): IterableIterator<T>` - Get all values
- `keys(): IterableIterator<T>` - Get all values (same as values)
- `entries(): IterableIterator<[T, T]>` - Get all key-value pairs

##### Mutation Methods
- `add(value: T): this` - Add value
- `delete(value: T): boolean` - Delete value
- `clear(): void` - Clear Set

##### Iteration Methods
- `forEach(callback: (value: T, value2: T, set: RxSet<T>) => void): void` - Iterate over Set

**Example**:
```typescript
const tags = new RxSet<string>()

tags.add('react')
tags.add('vue')
tags.add('axii')

console.log(tags.size()) // 3
console.log(tags.has('react')) // true

// Reactive computation
const tagList = computed(() => Array.from(tags.values()).sort())

console.log(tagList()) // ['axii', 'react', 'vue']

tags.add('angular')
console.log(tagList()) // ['angular', 'axii', 'react', 'vue']
```

### Render Context

#### RenderContext

Render context interface providing methods and tools for component rendering.

**Type Definition**:
```typescript
interface RenderContext {
    createElement: CreateElement
    createRef: <T = any>() => RefObject<T>
    createRxRef: <T = any>() => RxRefObject<T>
    useEffect: (effect: EffectFunction, deps?: any[]) => void
    useLayoutEffect: (effect: EffectFunction, deps?: any[]) => void
    onCleanup: (cleanup: () => void) => void
}
```

#### createElement

Creates virtual DOM elements.

**Syntax**:
```typescript
function createElement(
    type: string | ComponentFunction,
    props?: Record<string, any> | null,
    ...children: any[]
): VNode
```

**Parameters**:
- `type` - Element type or component function
- `props` - Properties object
- `children` - Child elements

**Example**:
```typescript
function MyComponent({}, { createElement }: RenderContext) {
    return createElement('div', { className: 'container' },
        createElement('h1', null, 'Hello World'),
        createElement('p', null, 'This is a paragraph')
    )
}

// JSX syntax (recommended)
function MyComponent({}, { createElement }: RenderContext) {
    return (
        <div className="container">
            <h1>Hello World</h1>
            <p>This is a paragraph</p>
        </div>
    )
}
```

#### createRef

Creates DOM reference.

**Syntax**:
```typescript
function createRef<T = any>(): RefObject<T>
```

**Returns**:
```typescript
interface RefObject<T> {
    current: T | null
}
```

**Example**:
```typescript
function InputComponent({}, { createElement, createRef }: RenderContext) {
    const inputRef = createRef<HTMLInputElement>()
    
    const focusInput = () => {
        inputRef.current?.focus()
    }
    
    return (
        <div>
            <input ref={inputRef} />
            <button onClick={focusInput}>Focus Input</button>
        </div>
    )
}
```

#### createRxRef

Creates reactive DOM reference.

**Syntax**:
```typescript
function createRxRef<T = any>(): RxRefObject<T>
```

**Returns**:
```typescript
interface RxRefObject<T> {
    current: T | null  // Reactive current value
    ref: (element: T | null) => void  // ref callback function
}
```

**Example**:
```typescript
function ResponsiveComponent({}, { createElement, createRxRef }: RenderContext) {
    const containerRef = createRxRef<HTMLDivElement>()
    
    const elementInfo = computed(() => {
        const element = containerRef.current
        if (!element) return null
        
        const rect = element.getBoundingClientRect()
        return {
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        }
    })
    
    return (
        <div>
            <div ref={containerRef.ref} style={{ padding: 20, border: '1px solid #ccc' }}>
                Responsive Container
            </div>
            {() => {
                const info = elementInfo()
                return info && (
                    <div>
                        Size: {info.width} × {info.height}
                    </div>
                )
            }}
        </div>
    )
}
```

#### useEffect

Registers side effect function that executes asynchronously after component renders.

**Syntax**:
```typescript
function useEffect(effect: EffectFunction, deps?: any[]): void

type EffectFunction = () => void | (() => void)
```

**Parameters**:
- `effect` - Side effect function, can return cleanup function
- `deps` - Dependency array (optional)

**Example**:
```typescript
function DataComponent({}, { createElement, useEffect }: RenderContext) {
    const data = atom(null)
    const loading = atom(false)
    
    useEffect(() => {
        loading(true)
        
        fetch('/api/data')
            .then(response => response.json())
            .then(result => data(result))
            .finally(() => loading(false))
        
        // Cleanup function
        return () => {
            console.log('Component cleanup')
        }
    })
    
    return (
        <div>
            {() => loading() ? 'Loading...' : JSON.stringify(data())}
        </div>
    )
}
```

#### useLayoutEffect

Registers layout side effect function that executes synchronously after DOM updates.

**Syntax**:
```typescript
function useLayoutEffect(effect: EffectFunction, deps?: any[]): void
```

**Use Cases**:
- DOM measurements
- Synchronous DOM operations
- Style updates that should not flicker

**Example**:
```typescript
function MeasureComponent({}, { createElement, useLayoutEffect, createRef }: RenderContext) {
    const elementRef = createRef<HTMLDivElement>()
    const dimensions = atom({ width: 0, height: 0 })
    
    useLayoutEffect(() => {
        const element = elementRef.current
        if (element) {
            const rect = element.getBoundingClientRect()
            dimensions({
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            })
        }
    })
    
    return (
        <div>
            <div ref={elementRef} style={{ padding: 20, border: '1px solid #ccc' }}>
                Content to measure
            </div>
            <div>
                Dimensions: {dimensions().width} × {dimensions().height}
            </div>
        </div>
    )
}
```

#### onCleanup

Registers cleanup function that executes when component is destroyed.

**Syntax**:
```typescript
function onCleanup(cleanup: () => void): void
```

**Example**:
```typescript
function TimerComponent({}, { createElement, onCleanup }: RenderContext) {
    const count = atom(0)
    
    const timer = setInterval(() => {
        count(count() + 1)
    }, 1000)
    
    onCleanup(() => {
        clearInterval(timer)
        console.log('Timer cleaned up')
    })
    
    return <div>Count: {count}</div>
}
```

### Utility Functions

#### Type Utilities

**Host Interface**:
```typescript
interface Host<T> {
    content: T
    __axii_host__: true
}
```

**Get Host Object**:
```typescript
function getHost<T>(value: T): Host<T> | null
```

**Check if Host Object**:
```typescript
function isHost(value: any): value is Host<any>
```

**Raw Value Access**:
```typescript
function getRaw<T>(value: T): T
```

#### Debug Utilities

**Development Mode Check**:
```typescript
const __DEV__: boolean
```

**Debug Information**:
```typescript
function getDebugInfo(component: any): {
    name: string
    props: Record<string, any>
    state: Record<string, any>
}
```

## DOM APIs

### Reactive DOM Listeners

#### RxDOMSize

Reactive object that monitors element size changes.

**Constructor**:
```typescript
new RxDOMSize(element?: Element | null, options?: ResizeObserverOptions)
```

**Parameters**:
- `element` - Element to monitor (optional)
- `options` - ResizeObserver options

**Properties**:
- `ref: (element: Element | null) => void` - ref callback for binding element
- `value(): DOMRectReadOnly | null` - Get current size information

**Methods**:
- `observe(element: Element): void` - Start monitoring element
- `unobserve(element: Element): void` - Stop monitoring element
- `disconnect(): void` - Disconnect all monitoring

**Example**:
```typescript
function SizeMonitor({}, { createElement }: RenderContext) {
    const sizeMonitor = new RxDOMSize()
    
    return (
        <div>
            <div 
                ref={sizeMonitor.ref}
                style={{
                    resize: 'both',
                    overflow: 'auto',
                    border: '1px solid #ccc',
                    minWidth: 100,
                    minHeight: 100,
                    padding: 20
                }}
            >
                Resizable container
            </div>
            {() => {
                const size = sizeMonitor.value()
                return size && (
                    <div>
                        Size: {Math.round(size.width)} × {Math.round(size.height)}
                    </div>
                )
            }}
        </div>
    )
}
```

#### RxDOMRect

Reactive object that monitors element position and size changes.

**Constructor**:
```typescript
new RxDOMRect(element?: Element | null, options?: {
    type?: 'observer' | 'interval'
    duration?: number  // Interval duration when type is 'interval'
})
```

**Parameters**:
- `element` - Element to monitor
- `options` - Monitor options
  - `type` - Monitor type: 'observer' (uses ResizeObserver) or 'interval' (periodic check)
  - `duration` - Check interval in milliseconds, default 100ms

**Properties**:
- `ref: (element: Element | null) => void` - ref callback for binding element
- `value(): DOMRectReadOnly | null` - Get current position and size information

**Example**:
```typescript
function PositionTracker({}, { createElement }: RenderContext) {
    const rectMonitor = new RxDOMRect(null, { type: 'interval', duration: 100 })
    const position = atom({ x: 100, y: 100 })
    
    const currentRect = computed(() => {
        const rect = rectMonitor.value()
        return rect ? {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        } : null
    })
    
    return (
        <div style={{ position: 'relative', height: 400, border: '1px solid #ccc' }}>
            <div
                ref={rectMonitor.ref}
                style={{
                    position: 'absolute',
                    left: position().x,
                    top: position().y,
                    width: 100,
                    height: 60,
                    backgroundColor: '#007bff',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'move'
                }}
                onMouseDown={(e) => {
                    const startX = e.clientX - position().x
                    const startY = e.clientY - position().y
                    
                    const handleMouseMove = (e: MouseEvent) => {
                        position({
                            x: e.clientX - startX,
                            y: e.clientY - startY
                        })
                    }
                    
                    const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove)
                        document.removeEventListener('mouseup', handleMouseUp)
                    }
                    
                    document.addEventListener('mousemove', handleMouseMove)
                    document.addEventListener('mouseup', handleMouseUp)
                }}
            >
                Drag me
            </div>
            
            {() => {
                const rect = currentRect()
                return rect && (
                    <div style={{ position: 'absolute', top: 10, right: 10 }}>
                        Position: ({rect.left}, {rect.top})<br/>
                        Size: {rect.width} × {rect.height}
                    </div>
                )
            }}
        </div>
    )
}
```

#### RxDOMHovered

Reactive object that monitors element hover state.

**Constructor**:
```typescript
new RxDOMHovered(element?: Element | null)
```

**Properties**:
- `ref: (element: Element | null) => void` - ref callback for binding element
- `value(): boolean` - Get current hover state

**Example**:
```typescript
function HoverEffect({}, { createElement }: RenderContext) {
    const hoverMonitor = new RxDOMHovered()
    const isHovered = hoverMonitor.value
    
    return (
        <div
            ref={hoverMonitor.ref}
            style={{
                padding: 20,
                border: '2px solid #ccc',
                borderRadius: 8,
                backgroundColor: isHovered() ? '#f0f8ff' : '#ffffff',
                borderColor: isHovered() ? '#007bff' : '#ccc',
                transform: isHovered() ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
            }}
        >
            {() => isHovered() ? 'Mouse hovering 🎯' : 'Mouse not hovering ⭕'}
        </div>
    )
}
```

#### RxDOMFocused

Reactive object that monitors element focus state.

**Constructor**:
```typescript
new RxDOMFocused(element?: Element | null)
```

**Properties**:
- `ref: (element: Element | null) => void` - ref callback for binding element
- `value(): boolean` - Get current focus state

**Example**:
```typescript
function FocusIndicator({}, { createElement }: RenderContext) {
    const focusMonitor = new RxDOMFocused()
    const isFocused = focusMonitor.value
    
    return (
        <div>
            <input
                ref={focusMonitor.ref}
                placeholder="Click to focus"
                style={{
                    padding: 10,
                    border: `2px solid ${isFocused() ? '#007bff' : '#ccc'}`,
                    borderRadius: 4,
                    outline: 'none',
                    boxShadow: isFocused() ? '0 0 0 3px rgba(0, 123, 255, 0.1)' : 'none',
                    transition: 'all 0.3s ease'
                }}
            />
            <div style={{ marginTop: 10, color: isFocused() ? '#007bff' : '#666' }}>
                Status: {() => isFocused() ? 'Focused ✅' : 'Not focused ⭕'}
            </div>
        </div>
    )
}
```

#### RxDOMScrollPosition

Reactive object that monitors element scroll position.

**Constructor**:
```typescript
new RxDOMScrollPosition(element?: Element | null)
```

**Properties**:
- `ref: (element: Element | null) => void` - ref callback for binding element
- `value(): ScrollPosition | null` - Get current scroll position information

**Type Definition**:
```typescript
interface ScrollPosition {
    scrollTop: number
    scrollLeft: number
    scrollWidth: number
    scrollHeight: number
    clientWidth: number
    clientHeight: number
}
```

**Example**:
```typescript
function ScrollTracker({}, { createElement }: RenderContext) {
    const scrollMonitor = new RxDOMScrollPosition()
    
    const scrollInfo = computed(() => {
        const pos = scrollMonitor.value()
        if (!pos) return null
        
        const { scrollTop, scrollHeight, clientHeight } = pos
        const maxScroll = scrollHeight - clientHeight
        const percentage = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * 100) : 0
        
        return {
            scrollTop: Math.round(scrollTop),
            percentage,
            maxScroll: Math.round(maxScroll)
        }
    })
    
    return (
        <div>
            <div
                ref={scrollMonitor.ref}
                style={{
                    height: 200,
                    overflow: 'auto',
                    border: '1px solid #ccc',
                    padding: 10
                }}
            >
                <div style={{ height: 800, background: 'linear-gradient(to bottom, #ff7f7f, #7f7fff)' }}>
                    <h3>Scrollable content area</h3>
                    <p>This is a long content area to demonstrate scroll monitoring.</p>
                    {Array.from({ length: 20 }, (_, i) => (
                        <p key={i}>Paragraph {i + 1}</p>
                    ))}
                </div>
            </div>
            
            {() => {
                const info = scrollInfo()
                return info && (
                    <div style={{ marginTop: 10 }}>
                        <div>Scroll position: {info.scrollTop}px</div>
                        <div>Scroll progress: {info.percentage}%</div>
                        <div style={{
                            width: '100%',
                            height: 6,
                            backgroundColor: '#e0e0e0',
                            borderRadius: 3,
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${info.percentage}%`,
                                height: '100%',
                                backgroundColor: '#007bff',
                                transition: 'width 0.1s ease'
                            }} />
                        </div>
                    </div>
                )
            }}
        </div>
    )
}
```

### DOM Event Listeners

#### RxDOMEventListener

Creates reactive DOM event listeners.

**Constructor**:
```typescript
new RxDOMEventListener<T extends Event>(
    target: EventTarget,
    eventType: string,
    callback: (event: T) => void,
    options?: AddEventListenerOptions
)
```

**Parameters**:
- `target` - Event target (Element, Document, Window, etc.)
- `eventType` - Event type
- `callback` - Event callback function
- `options` - Event listener options

**Methods**:
- `dispose(): void` - Remove event listener

**Example**:
```typescript
function KeyboardMonitor({}, { createElement }: RenderContext) {
    const pressedKeys = new RxSet<string>()
    
    // Listen for keydown
    const keydownListener = new RxDOMEventListener(
        document,
        'keydown',
        (event: KeyboardEvent) => {
            if (!event.repeat) {
                pressedKeys.add(event.key)
            }
        }
    )
    
    // Listen for keyup
    const keyupListener = new RxDOMEventListener(
        document,
        'keyup',
        (event: KeyboardEvent) => {
            pressedKeys.delete(event.key)
        }
    )
    
    // Cleanup on component destroy
    onCleanup(() => {
        keydownListener.dispose()
        keyupListener.dispose()
    })
    
    const keyList = computed(() => Array.from(pressedKeys.values()).sort())
    
    return (
        <div style={{ padding: 20, border: '1px solid #ccc', borderRadius: 4 }}>
            <h3>Keyboard key monitor</h3>
            <p>Press any key on the keyboard:</p>
            <div style={{
                minHeight: 40,
                padding: 10,
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: 4,
                fontFamily: 'monospace'
            }}>
                {() => keyList().length > 0 ? (
                    keyList().map(key => (
                        <span key={key} style={{
                            display: 'inline-block',
                            margin: 2,
                            padding: '4px 8px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            borderRadius: 3,
                            fontSize: 12
                        }}>
                            {key}
                        </span>
                    ))
                ) : (
                    <span style={{ color: '#6c757d' }}>No keys pressed</span>
                )}
            </div>
        </div>
    )
}
```

### DOM Utilities

#### findParentBySelector

Finds parent element matching selector.

**Syntax**:
```typescript
function findParentBySelector(
    element: Element, 
    selector: string
): Element | null
```

**Parameters**:
- `element` - Starting element
- `selector` - CSS selector

**Example**:
```typescript
function BubbleExample({}, { createElement }: RenderContext) {
    const clickedElement = atom<string | null>(null)
    
    const handleClick = (event: Event) => {
        const target = event.target as Element
        
        // Find nearest parent element with data-item attribute
        const itemElement = findParentBySelector(target, '[data-item]')
        
        if (itemElement) {
            const itemName = itemElement.getAttribute('data-item')
            clickedElement(itemName)
        }
    }
    
    return (
        <div onClick={handleClick}>
            <h3>Event bubbling example</h3>
            <div data-item="container" style={{ padding: 20, border: '2px solid #007bff' }}>
                Container
                <div data-item="header" style={{ padding: 10, backgroundColor: '#f8f9fa' }}>
                    Header
                    <span data-item="title">Title text</span>
                </div>
                <div data-item="content" style={{ padding: 10, backgroundColor: '#e9ecef' }}>
                    Content area
                    <button data-item="button">Button</button>
                </div>
            </div>
            {() => clickedElement() && (
                <div style={{ marginTop: 10, color: '#007bff' }}>
                    Clicked: {clickedElement()}
                </div>
            )}
        </div>
    )
}
```

#### getElementOffset

Gets element offset relative to document.

**Syntax**:
```typescript
function getElementOffset(element: Element): { top: number, left: number }
```

**Example**:
```typescript
function OffsetTracker({}, { createElement, createRef }: RenderContext) {
    const elementRef = createRef<HTMLDivElement>()
    const offset = atom({ top: 0, left: 0 })
    
    const updateOffset = () => {
        if (elementRef.current) {
            const newOffset = getElementOffset(elementRef.current)
            offset(newOffset)
        }
    }
    
    useLayoutEffect(() => {
        updateOffset()
        
        // Listen for scroll and window resize
        const handleUpdate = () => updateOffset()
        window.addEventListener('scroll', handleUpdate)
        window.addEventListener('resize', handleUpdate)
        
        return () => {
            window.removeEventListener('scroll', handleUpdate)
            window.removeEventListener('resize', handleUpdate)
        }
    })
    
    return (
        <div>
            <div style={{ height: 1000, padding: 20 }}>
                <div style={{ height: 200 }} />
                <div 
                    ref={elementRef}
                    style={{
                        width: 200,
                        height: 100,
                        backgroundColor: '#007bff',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    Track my position
                </div>
                <div style={{ height: 800 }} />
            </div>
            
            <div style={{
                position: 'fixed',
                top: 10,
                right: 10,
                padding: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                borderRadius: 4
            }}>
                Offset: ({offset().left}, {offset().top})
            </div>
        </div>
    )
}
```

#### measureText

Measures text dimensions.

**Syntax**:
```typescript
function measureText(
    text: string, 
    font?: string, 
    context?: CanvasRenderingContext2D
): { width: number, height: number }
```

**Parameters**:
- `text` - Text to measure
- `font` - Font style (CSS font format)
- `context` - Optional Canvas context

**Example**:
```typescript
function TextMeasurer({}, { createElement }: RenderContext) {
    const inputText = atom('Hello World')
    const fontSize = atom(16)
    const fontFamily = atom('Arial')
    
    const textDimensions = computed(() => {
        const font = `${fontSize()}px ${fontFamily()}`
        return measureText(inputText(), font)
    })
    
    return (
        <div style={{ padding: 20 }}>
            <h3>Text dimension measurement</h3>
            
            <div style={{ marginBottom: 15 }}>
                <label>Text content:</label>
                <input 
                    value={inputText}
                    onInput={e => inputText(e.target.value)}
                    style={{ width: 200, marginLeft: 10 }}
                />
            </div>
            
            <div style={{ marginBottom: 15 }}>
                <label>Font size:</label>
                <input 
                    type="range"
                    min="10"
                    max="48"
                    value={fontSize}
                    onInput={e => fontSize(parseInt(e.target.value))}
                    style={{ marginLeft: 10 }}
                />
                <span style={{ marginLeft: 10 }}>{fontSize()}px</span>
            </div>
            
            <div style={{ marginBottom: 15 }}>
                <label>Font:</label>
                <select 
                    value={fontFamily}
                    onChange={e => fontFamily(e.target.value)}
                    style={{ marginLeft: 10 }}
                >
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                </select>
            </div>
            
            <div style={{
                padding: 10,
                border: '1px solid #ccc',
                backgroundColor: '#f8f9fa',
                marginBottom: 15
            }}>
                <div style={{ 
                    fontSize: fontSize(), 
                    fontFamily: fontFamily(),
                    display: 'inline-block',
                    border: '1px dashed #007bff'
                }}>
                    {inputText()}
                </div>
            </div>
            
            <div>
                <strong>Measurement result:</strong><br/>
                Width: {textDimensions().width.toFixed(2)}px<br/>
                Height: {textDimensions().height.toFixed(2)}px
            </div>
        </div>
    )
}
```

## Ecosystem APIs

### Router (router0)

#### Router

Main router class that manages application routing state and navigation.

**Constructor**:
```typescript
new Router(
    routes: Route[], 
    history: History, 
    options?: RouterOptions
)
```

**Parameters**:
- `routes: Route[]` - Route configuration array
- `history: History` - History management instance
- `options?: RouterOptions` - Router options

**Type Definitions**:
```typescript
interface Route {
    path: string
    handler: ComponentFunction | (() => Promise<{ default: ComponentFunction }>)
    name?: string
    redirect?: string
    meta?: Record<string, any>
    children?: Route[]
}

interface RouterOptions {
    base?: string
    mode?: 'history' | 'hash'
    fallback?: ComponentFunction
}
```

**Properties**:
- `currentRoute: ComputedRef<RouteMatch>` - Current route match information
- `currentPath: ComputedRef<string>` - Current path
- `params: ComputedRef<Record<string, string>>` - Route parameters
- `query: ComputedRef<Record<string, string>>` - Query parameters

**Methods**:
- `push(path: string | RouteLocation): void` - Navigate to new route
- `replace(path: string | RouteLocation): void` - Replace current route
- `go(delta: number): void` - Go forward or backward in history
- `back(): void` - Go back one step
- `forward(): void` - Go forward one step

**Example**:
```typescript
import { Router, createBrowserHistory } from 'router0'

// Define routes
const routes = [
    {
        path: '/',
        handler: HomeComponent,
        name: 'home'
    },
    {
        path: '/users/:id',
        handler: UserComponent,
        name: 'user'
    },
    {
        path: '/products',
        handler: ProductListComponent,
        children: [
            {
                path: ':id',
                handler: ProductDetailComponent,
                name: 'product-detail'
            }
        ]
    },
    {
        path: '/old-path',
        redirect: '/new-path'
    },
    {
        path: '*',
        handler: NotFoundComponent
    }
]

// Create router
const router = new Router(routes, createBrowserHistory())

// Use in component
function App({}, { createElement }: RenderContext) {
    return (
        <div>
            <nav>
                <button onClick={() => router.push('/')}>Home</button>
                <button onClick={() => router.push('/users/123')}>User</button>
                <button onClick={() => router.push('/products')}>Products</button>
            </nav>
            
            <main>
                {() => {
                    const route = router.currentRoute()
                    const Component = route.component
                    return Component ? <Component {...route.props} /> : null
                }}
            </main>
        </div>
    )
}
```

#### createBrowserHistory

Creates browser history management instance.

**Syntax**:
```typescript
function createBrowserHistory(options?: BrowserHistoryOptions): BrowserHistory
```

**Parameters**:
```typescript
interface BrowserHistoryOptions {
    basename?: string  // Base path
}
```

**Example**:
```typescript
const history = createBrowserHistory({ basename: '/app' })
const router = new Router(routes, history)
```

#### createMemoryHistory

Creates memory history management instance (for testing or server-side rendering).

**Syntax**:
```typescript
function createMemoryHistory(options?: MemoryHistoryOptions): MemoryHistory
```

**Parameters**:
```typescript
interface MemoryHistoryOptions {
    initialEntries?: string[]  // Initial history entries
    initialIndex?: number      // Initial index
}
```

**Example**:
```typescript
const history = createMemoryHistory({
    initialEntries: ['/home', '/about', '/contact'],
    initialIndex: 0
})
```

#### useRouter

Hook function to get router instance.

**Syntax**:
```typescript
function useRouter(): Router
```

**Example**:
```typescript
function NavigationComponent({}, { createElement }: RenderContext) {
    const router = useRouter()
    
    const goToUser = (userId: string) => {
        router.push(`/users/${userId}`)
    }
    
    return (
        <div>
            <button onClick={() => goToUser('123')}>
                View User 123
            </button>
            <div>Current path: {router.currentPath()}</div>
        </div>
    )
}
```

#### Route Component

Route rendering component.

**Properties**:
```typescript
interface RouteProps {
    path?: string
    component?: ComponentFunction
    render?: (props: RouteRenderProps) => any
    redirect?: string
    exact?: boolean
    children?: any
}
```

**Example**:
```typescript
function AppRouter({}, { createElement }: RenderContext) {
    return (
        <div>
            <Route path="/" exact component={HomeComponent} />
            <Route path="/about" component={AboutComponent} />
            <Route path="/users/:id" render={({ params }) => (
                <UserProfile userId={params.id} />
            )} />
            <Route path="/old-route" redirect="/new-route" />
        </div>
    )
}
```

### Actions (action0)

#### Action

Asynchronous action class for managing complex async operations.

**Constructor**:
```typescript
new Action<TArgs extends any[], TResult>(
    executor: (...args: TArgs) => Promise<TResult>,
    options?: ActionOptions
)
```

**Parameters**:
- `executor` - Execution function
- `options` - Configuration options

**Type Definitions**:
```typescript
interface ActionOptions {
    concurrency?: 'serial' | 'parallel' | 'switch'
    retries?: number
    timeout?: number
    onStart?: () => void
    onSuccess?: (result: any) => void
    onError?: (error: Error) => void
    onFinish?: () => void
}
```

**Properties**:
- `isRunning: ComputedRef<boolean>` - Whether action is running
- `lastResult: ComputedRef<TResult | null>` - Last execution result
- `lastError: ComputedRef<Error | null>` - Last error
- `execCount: ComputedRef<number>` - Execution count

**Methods**:
- `run(...args: TArgs): Promise<TResult>` - Execute action
- `cancel(): void` - Cancel current execution
- `reset(): void` - Reset state

**Example**:
```typescript
import { Action } from 'action0'

// Define data fetch action
const fetchUserAction = new Action(async (userId: string) => {
    const response = await fetch(`/api/users/${userId}`)
    if (!response.ok) {
        throw new Error('Failed to fetch user')
    }
    return response.json()
}, {
    concurrency: 'switch', // New requests cancel old ones
    retries: 3,
    timeout: 5000
})

// Define data update action
const updateUserAction = new Action(async (userId: string, userData: any) => {
    const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    })
    
    if (!response.ok) {
        throw new Error('Failed to update user')
    }
    
    return response.json()
}, {
    concurrency: 'serial' // Execute updates serially
})

// Use in component
function UserProfile({ userId }: { userId: string }, { createElement }: RenderContext) {
    const userInfo = atom<any>(null)
    
    // Watch fetch action results
    onChange(fetchUserAction.lastResult, () => {
        const result = fetchUserAction.lastResult()
        if (result) {
            userInfo(result)
        }
    })
    
    // Load user info on mount
    useEffect(() => {
        fetchUserAction.run(userId)
    })
    
    const handleUpdate = async (newData: any) => {
        try {
            await updateUserAction.run(userId, newData)
            // Reload after successful update
            await fetchUserAction.run(userId)
        } catch (error) {
            console.error('Update failed:', error)
        }
    }
    
    return (
        <div>
            {() => fetchUserAction.isRunning() && (
                <div>Loading user info...</div>
            )}
            
            {() => fetchUserAction.lastError() && (
                <div style={{ color: 'red' }}>
                    Error: {fetchUserAction.lastError()!.message}
                </div>
            )}
            
            {() => userInfo() && (
                <div>
                    <h2>{userInfo().name}</h2>
                    <p>{userInfo().email}</p>
                    <button 
                        onClick={() => handleUpdate({ name: 'New Name' })}
                        disabled={updateUserAction.isRunning()}
                    >
                        {() => updateUserAction.isRunning() ? 'Updating...' : 'Update Name'}
                    </button>
                </div>
            )}
        </div>
    )
}
```

#### createParallelAction

Creates parallel execution action combination.

**Syntax**:
```typescript
function createParallelAction<T extends Record<string, Action<any, any>>>(
    actions: T
): ParallelAction<T>
```

**Example**:
```typescript
const fetchAllDataAction = createParallelAction({
    users: fetchUsersAction,
    products: fetchProductsAction,
    orders: fetchOrdersAction
})

// Execute parallel actions
fetchAllDataAction.run().then(results => {
    console.log('All data loaded:', results)
    // results.users, results.products, results.orders
})
```

#### createSerialAction

Creates serial execution action combination.

**Syntax**:
```typescript
function createSerialAction<T extends Action<any, any>[]>(
    actions: T
): SerialAction<T>
```

**Example**:
```typescript
const onboardingAction = createSerialAction([
    createAccountAction,
    setupProfileAction,
    sendWelcomeEmailAction
])

// Execute serial actions
onboardingAction.run(userData).then(results => {
    console.log('Onboarding complete:', results)
})
```

### State Machine (statemachine0)

#### Machine

Finite state machine class.

**Constructor**:
```typescript
new Machine(
    initialState: string,
    transitions: Transition[],
    states?: State[]
)
```

**Parameters**:
- `initialState` - Initial state name
- `transitions` - State transition configuration
- `states` - Custom state instances (optional)

**Type Definitions**:
```typescript
interface Transition {
    name?: string
    from: string
    event: string
    to: string
    middlewares?: Middleware[]
}

type Middleware = (
    next: MiddlewareNext,
    event: TransitionEvent,
    currentState: State,
    nextState: State
) => any | Promise<any>

type MiddlewareNext = (allowed?: boolean, detail?: any) => void
```

**Properties**:
- `current: State` - Current state
- `isTransitioning: ComputedRef<boolean>` - Whether transitioning

**Methods**:
- `receive(event: TransitionEvent): Promise<void>` - Handle event
- `canTransition(eventType: string): boolean` - Check if can transition
- `onChange(callback: (state: State, event?: TransitionEvent) => void): () => void` - Watch state changes
- `onReject(callback: (event: TransitionEvent, reason: any) => void): () => void` - Watch transition rejections
- `addMiddleware(transitionName: string, middleware: Middleware): void` - Add middleware

**Example**:
```typescript
import { Machine, State, createTransitionEvent } from 'statemachine0'

// Define custom states
class LoadingState extends State {
    progress = atom(0)
    
    constructor() {
        super('loading')
    }
    
    onEnter() {
        console.log('Starting loading')
        this.progress(0)
    }
    
    updateProgress(value: number) {
        this.progress(value)
    }
}

class SuccessState extends State {
    result = atom(null)
    
    constructor() {
        super('success')
    }
    
    onEnter(prevState: State, event: TransitionEvent) {
        console.log('Loading successful')
        this.result(event.detail?.result)
    }
}

// Create state machine
const loadingMachine = new Machine('idle', [
    { from: 'idle', event: 'start', to: 'loading' },
    { from: 'loading', event: 'success', to: 'success' },
    { from: 'loading', event: 'error', to: 'error' },
    { from: 'success', event: 'reset', to: 'idle' },
    { from: 'error', event: 'retry', to: 'loading' }
], [
    new State('idle'),
    new LoadingState(),
    new SuccessState(),
    new State('error')
])

// Use in component
function AsyncLoader({}, { createElement }: RenderContext) {
    const currentState = atom(loadingMachine.current.name)
    
    // Watch state changes
    const dispose = loadingMachine.onChange((state) => {
        currentState(state.name)
    })
    
    onCleanup(() => dispose())
    
    const startLoading = async () => {
        try {
            await loadingMachine.receive(createTransitionEvent('start'))
            
            // Simulate loading process
            const loadingState = loadingMachine.current as LoadingState
            for (let i = 0; i <= 100; i += 10) {
                loadingState.updateProgress(i)
                await new Promise(resolve => setTimeout(resolve, 100))
            }
            
            // Complete loading
            await loadingMachine.receive(createTransitionEvent('success', {
                result: 'Loaded data'
            }))
            
        } catch (error) {
            await loadingMachine.receive(createTransitionEvent('error', {
                error: error.message
            }))
        }
    }
    
    return (
        <div>
            <div>Current state: {currentState()}</div>
            
            {() => currentState() === 'idle' && (
                <button onClick={startLoading}>Start Loading</button>
            )}
            
            {() => currentState() === 'loading' && (
                <div>
                    <div>Loading...</div>
                    <div>Progress: {(loadingMachine.current as LoadingState).progress()}%</div>
                </div>
            )}
            
            {() => currentState() === 'success' && (
                <div>
                    <div>Loading successful!</div>
                    <div>Result: {(loadingMachine.current as SuccessState).result()}</div>
                    <button onClick={() => loadingMachine.receive(createTransitionEvent('reset'))}>
                        Reset
                    </button>
                </div>
            )}
            
            {() => currentState() === 'error' && (
                <div>
                    <div style={{ color: 'red' }}>Loading failed</div>
                    <button onClick={() => loadingMachine.receive(createTransitionEvent('retry'))}>
                        Retry
                    </button>
                </div>
            )}
        </div>
    )
}
```

#### State

State base class.

**Constructor**:
```typescript
new State(name: string)
```

**Properties**:
- `name: string` - State name

**Methods**:
- `onEnter(prevState: State | null, event: TransitionEvent): void` - Called when entering state
- `onLeave(nextState: State, event: TransitionEvent): void` - Called when leaving state

**Example**:
```typescript
class CustomState extends State {
    enterCount = atom(0)
    duration = atom(0)
    private enterTime = 0
    
    constructor(name: string) {
        super(name)
    }
    
    onEnter(prevState: State | null, event: TransitionEvent) {
        this.enterCount(this.enterCount() + 1)
        this.enterTime = Date.now()
        console.log(`Entering state: ${this.name}`)
    }
    
    onLeave(nextState: State, event: TransitionEvent) {
        this.duration(Date.now() - this.enterTime)
        console.log(`Leaving state: ${this.name}, duration: ${this.duration()}ms`)
    }
}
```

#### createTransitionEvent

Creates state transition event.

**Syntax**:
```typescript
function createTransitionEvent(type: string, detail?: any): TransitionEvent
```

**Parameters**:
- `type` - Event type
- `detail` - Event detail data

**Example**:
```typescript
// Basic event
const startEvent = createTransitionEvent('start')

// Event with data
const successEvent = createTransitionEvent('success', {
    result: 'Operation successful',
    timestamp: Date.now()
})

// Error event
const errorEvent = createTransitionEvent('error', {
    message: 'Operation failed',
    code: 'NETWORK_ERROR'
})
```

## Summary

This comprehensive API reference covers all the essential APIs in the Axii framework:

1. **Core APIs** provide the foundation for reactive state management, computed properties, and component rendering
2. **DOM APIs** offer powerful tools for reactive DOM monitoring and manipulation
3. **Ecosystem APIs** extend the framework with routing, async actions, and state machines

The Axii framework emphasizes:
- **Reactivity**: All state changes automatically update the UI
- **Simplicity**: Intuitive APIs that are easy to understand and use
- **Performance**: Efficient updates through fine-grained reactivity
- **Flexibility**: Composable APIs that work well together

For AI agents working with Axii, remember:
- Use `atom()` for reactive state
- Use `computed()` for derived values
- Components receive props and RenderContext as parameters
- JSX is supported but requires the createElement function from RenderContext
- All DOM monitoring classes (RxDOM*) provide reactive values
- Router, Action, and Machine classes help structure complex applications
