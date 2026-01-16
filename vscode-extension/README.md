# interaqt Visualizer Extension

A VS Code/Cursor extension for visualizing `*.data-design.json` files with interactive ER diagrams and beautiful entity cards.

## Features

### 🎨 Interactive ER Diagram
- Visual representation of entities and their relationships
- Color-coded by entity type (business, api-call, api-event, user-profile, polymorphic)
- Clickable nodes that navigate to entity details
- Hover tooltips showing entity purposes and relation types

### 📦 Entity Cards
- Detailed view of each entity with properties table
- Collapsible sections for lifecycle and computation details
- Property control types highlighted (creation-only, computed-reactive, computed-aggregation)
- Data dependencies displayed as tags

### ↔️ Relations View
- Visual diagram showing source → target entity connections
- Cardinality indicators (1:n, n:n, etc.)
- Relation properties table

### 📚 Dictionaries View
- Global configuration objects display
- Keys table with types and purposes

### ✅ Verification
- Visual checklist of all verification flags
- Pass/fail indicators

## Usage

1. Open any `*.data-design.json` file
2. The visualization will appear automatically
3. Use the tabs to switch between views:
   - **ER Diagram** - Visual graph
   - **Entities** - Detailed entity cards
   - **Relations** - Relation details
   - **Dictionaries** - Configuration objects
   - **Verification** - Verification checklist

## Entity Type Colors

| Type | Color |
|------|-------|
| Business | 🟢 Green |
| API Call | 🔵 Blue |
| API Event | 🟣 Purple |
| User Profile | 🟡 Orange |
| Polymorphic | 🩷 Pink |

## Installation

### From VSIX file
```bash
cursor --install-extension interaqt-visualizer-0.0.1.vsix
# or
code --install-extension interaqt-visualizer-0.0.1.vsix
```

### Development
```bash
npm install
npm run compile
npm run package
```

## File Format

This extension is designed for data-design.json files with the following structure:

```json
{
  "analysis_metadata": {
    "timestamp": "2025-12-08",
    "module": "example",
    "version": "1.0.0"
  },
  "entities": {
    "EntityName": {
      "purpose": "Description",
      "entityType": "business",
      "properties": { ... },
      "lifecycle": { ... }
    }
  },
  "relations": {
    "RelationName": {
      "type": "1:n",
      "sourceEntity": "Entity1",
      "targetEntity": "Entity2",
      ...
    }
  },
  "dictionaries": { ... },
  "verification": { ... }
}
```

## License

MIT

