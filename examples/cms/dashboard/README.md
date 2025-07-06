# Axii Boilerplate

This is a boilerplate project for the [Axii](https://github.com/axiijs/axii) framework, a reactive UI library for building web applications.

## Features

- Minimal setup with Vite for fast development
- TypeScript support
- Integration with Axii UI component library
- Axii UI theme (Inc) for consistent styling
- Cursor AI integration for enhanced development experience

## Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/axii-boilerplate.git
# or use create-axii-app
npx create-axii-app my-app

# Install dependencies
cd my-app
npm install

# Start development server
npm run dev
```

## Cursor AI Integration

This project includes a `cursor.json` file that provides intelligent code assistance when using [Cursor](https://cursor.sh/) as your code editor. The Cursor AI has been trained on:

1. **Axii Core Concepts** - Understanding reactive state management, components, and rendering
2. **Reactive Data Structures** - Working with RxList, RxObject, and other reactive primitives
3. **Axii UI Components** - Using the official component library
4. **Styling with styleSystem** - Applying consistent styling using the theme system
5. **Advanced Patterns** - Custom hooks, component composition, and best practices

When using Cursor with this project, you'll get intelligent code completion, suggestions, and guidance specific to Axii development.

## Project Structure

```
axii-boilerplate/
├── node_modules/
├── src/
│   └── App.tsx       # Main application component
├── index.html        # HTML entry point
├── index.tsx         # Application entry point
├── tsconfig.json     # TypeScript configuration
├── vite.config.ts    # Vite configuration
├── cursor.json       # Cursor AI configuration
└── package.json      # Project dependencies
```

## Learn More

- [Axii Documentation](https://github.com/axiijs/site/tree/main/docs/tutorial)
- [Axii GitHub Repository](https://github.com/axiijs/axii)
- [Axii UI Components](https://github.com/axiijs/ui/tree/main/packages/components)

## License

MIT 