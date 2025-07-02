# Frontend Page Design Guide

## Overview

This document guides how to systematically design frontend page architecture and user interaction flows based on the backend definitions (entities, relations, interactions, etc.) of interaqt applications. It focuses on conceptual design aspects such as page division, user interaction points, and data flow, rather than specific technical implementation.

## Design Principles

### 1. Data-Driven Page Design
- **Entity-Centric**: Each core entity typically requires corresponding management pages
- **Relations Determine Navigation**: Relationships between entities determine page navigation and data associations
- **Interaction Maps to Functions**: Each Interaction should have a corresponding operation entry in the interface

### 2. Reactive Data Display
- **Reactive Computations**: All properties with `computedData` should be displayed in real-time in the interface
- **State-Aware**: Dynamically display different operation options based on entity state
- **Permission Control**: Control interface element visibility based on Attributive definitions

### 3. User Experience Consistency
- **Operation Feedback**: Every interaction operation should have clear feedback
- **Status Indication**: Clearly display current state and executable operations
- **Error Handling**: Friendly error messages and recovery guidance

---

## Page Design Methodology

### Step 1: Entity Analysis Method

#### 1.1 Identify Core Entities
Extract all entities from the application definition and categorize by importance:

**Primary Entities**: Core business objects directly operated by users
- Usually require complete CRUD pages
- Need list page, detail page, create/edit page

**Supporting Entities**: Objects that support business processes
- Usually embedded as components in primary entity pages
- May only need simple management interfaces

**System Entities**: Framework or system-level objects
- Usually don't need independent pages
- Handled in system settings or admin backend

#### 1.2 Entity Page Planning Template

**For each primary entity, consider the following pages:**

```
Entity Name: [EntityName]

Required Pages:
□ List Page ([EntityName]ListPage) - Display entity collection
□ Detail Page ([EntityName]DetailPage) - Display complete information of single entity
□ Create Page (Create[EntityName]Page) - Create new entity
□ Edit Page (Edit[EntityName]Page) - Modify existing entity

Optional Pages:
□ Search Page ([EntityName]SearchPage) - Complex search functionality
□ Analytics Page ([EntityName]AnalyticsPage) - Data analysis display
```

### Step 2: Relationship Navigation Design

#### 2.1 Relationship Types and Navigation Patterns

**One-to-One Relationship (1:1)**
- Embed associated entity information in main entity page
- Provide quick jump entry to associated entity

**One-to-Many Relationship (1:n)**
- Display preview list of "many" in the "one" detail page
- Provide "View All" link to jump to filtered list page

**Many-to-Many Relationship (n:n)**
- Bidirectional navigation: both entity pages should display association information
- Provide operation entries for adding/removing associations

**Symmetric Relationship**
- Special many-to-many relationship, pay attention to state consistency
- Usually used for friend relationships, mutual following, etc.

#### 2.2 Relationship Navigation Examples

```
User 1:n Post
├─ User Detail Page: Display preview list of user's posts
├─ Post Detail Page: Display author information, click to jump to user detail
└─ User Posts List Page: Display all posts by the user

User n:n Tag
├─ User Detail Page: Display user's tags, support add/delete
├─ Tag Detail Page: Display list of users using this tag
└─ Tag Users List Page: Display all users with this tag
```

### Step 3: Interaction Operation Mapping

#### 3.1 Interaction Types and Interface Positions

**Create Interactions**
- Primary position: Dedicated creation page
- Secondary position: "New" button on list page, quick create form

**Update Interactions**
- Primary position: Edit page, edit mode on detail page
- Secondary position: Quick edit on list page, inline editing

**Delete Interactions**
- Primary position: Delete button on detail page, edit page
- Secondary position: Batch delete on list page, context menu

**Query Interactions**
- Primary position: List page, search page
- Secondary position: Filter components, search boxes

**Business Process Interactions**
- Design dedicated operation buttons based on business logic
- Consider state machine state transitions

#### 3.2 Interaction Operation Design Template

```
Interaction Name: [InteractionName]
Operation Type: [Create/Update/Delete/Query/Business]

Trigger Positions:
□ Primary Entry: [Page Name - Specific Location]
□ Secondary Entry: [Page Name - Specific Location]

Prerequisites:
□ User Permissions: [Describe permission requirements]
□ Data State: [Describe necessary data state]
□ Business Rules: [Describe business constraints]

Operation Flow:
1. [Step 1 description]
2. [Step 2 description]
3. [Step n description]

Operation Results:
□ Success Feedback: [Describe interface changes after success]
□ Failure Handling: [Describe error messages on failure]
```

---

## Common Page Patterns

### 1. List Page Pattern

#### 1.1 Basic Structure
```
Page Title + Action Button Area
├─ Global Actions: New, Batch Operations, Import/Export
├─ Filter Area: Search box, filters, sort options
├─ List Area: Data table/card list
└─ Pagination Area: Pagination controls, display count selection
```

#### 1.2 Design Points
- **Filter Design**: Design filter conditions based on entity properties and relationships
- **Sort Options**: Prioritize support for common sorts like time, popularity, name
- **Batch Operations**: Consider which operations are suitable for batch execution
- **Status Display**: Display different visual styles based on entity status

#### 1.3 Reactive Data
- Auto-update computed properties of list items (like statistics)
- Real-time reflection of entity state changes
- Support real-time updates for list item additions, deletions, and modifications

### 2. Detail Page Pattern

#### 2.1 Basic Structure
```
Entity Basic Information Area
├─ Primary property display
├─ Reactive computed data display
├─ Status indicators
└─ Primary action buttons

Associated Data Area
├─ One-to-many relationship data preview
├─ Many-to-many relationship data display
└─ Related operation entries

Operation History Area (Optional)
├─ State change records
├─ Operation logs
└─ Approval processes (if applicable)
```

#### 2.2 Design Points
- **Permission Control**: Dynamically display action buttons based on Attributive
- **State Awareness**: Display different operation options based on entity state
- **Association Display**: Reasonably display associated entities, avoid information overload
- **Operation Feedback**: Clear operation result notifications

### 3. Create/Edit Page Pattern

#### 3.1 Basic Structure
```
Form Area
├─ Basic property input
├─ Associated data selection
├─ Optional property configuration
└─ Form validation prompts

Preview Area (Optional)
├─ Real-time preview effects
└─ Formatted display

Action Area
├─ Save, Cancel buttons
├─ Save draft functionality (if applicable)
└─ Reset form functionality
```

#### 3.2 Design Points
- **Form Validation**: Based on PayloadItem validation rules
- **Association Selection**: Provide friendly associated entity selection interface
- **Draft Saving**: Provide draft functionality for complex content
- **Progress Saving**: Support step-by-step saving for long forms

---

## Special Functionality Page Design

### 1. Workflow Pages

When the application includes Activity definitions, consider workflow-related pages:

#### 1.1 Process Instance Pages
- **Process Overview**: Display current state, progress indicators
- **Executable Operations**: Display available interactions based on current state
- **History Records**: Display state transition history and operation records
- **Participant Information**: Display users and roles involved in the process

#### 1.2 Task List Pages
- **Pending Tasks**: Tasks requiring processing by current user
- **Completed Tasks**: History of tasks processed by user
- **Task Filtering**: Filter by process type, status, time, etc.
- **Batch Operations**: Support batch approval and other operations

### 2. Statistics and Analysis Pages

For applications with complex reactive computations:

#### 2.1 Data Dashboard
- **Key Indicators**: Display important computed property data
- **Trend Charts**: Show data changes over time
- **Comparative Analysis**: Data comparison across different dimensions
- **Real-time Updates**: Real-time data refresh based on reactive computations

#### 2.2 Report Pages
- **Data Export**: Support data export in various formats
- **Custom Reports**: Allow users to customize statistical dimensions
- **Scheduled Reports**: Automatic report generation and sending functionality

### 3. Permission Management Pages

For applications with complex permission control:

#### 3.1 Role Management Pages
- **Role Definition**: Create and edit user roles
- **Permission Assignment**: Assign specific permissions to roles
- **User Assignment**: Assign roles to users

#### 3.2 Permission Audit Pages
- **Permission Checking**: Check user permissions for specific resources
- **Operation Logs**: Record permission-related operation history
- **Exception Monitoring**: Permission exceptions and security event monitoring

---

## Inter-Page Navigation Design

### 1. Navigation Hierarchy

#### 1.1 Main Navigation Design
Design main navigation based on application's core entities and functional modules:

```
Main Navigation Example:
├─ Home/Dashboard
├─ [Primary Entity 1] Management
├─ [Primary Entity 2] Management
├─ [Special Function Module]
├─ Settings/Configuration
└─ User Center
```

#### 1.2 Breadcrumb Navigation
Provide breadcrumb navigation for complex page hierarchies:

```
Breadcrumb Examples:
Home > User Management > User Detail > Edit User
Home > Content Management > Article List > Article Detail
```

### 2. Page Jump Rules

#### 2.1 Entity Association Jumps
- Clicking associated entity B from entity A detail page jumps to entity B detail page
- Clicking "View Associated Entity B" from entity A list page jumps to filtered entity B list page

#### 2.2 Post-Operation Jumps
- After successful creation, jump to new entity's detail page
- After successful editing, jump to entity detail page
- After successful deletion, jump to entity list page

#### 2.3 Permission-Restricted Jumps
- Jump to permission prompt page when access is unauthorized
- Jump to login page when login times out
- Prompt for permission application when specific role is required

---

## Reactive Data Display Strategy

### 1. Real-time Data Updates

#### 1.1 Computed Property Display
For properties containing `computedData`:
- **Real-time Display**: Real-time display of computation results in interface
- **Change Indicators**: Provide visual feedback when data changes
- **Loading States**: Display loading indicators during computation

#### 1.2 Associated Data Synchronization
- **Cascading Updates**: Auto-update display when related entities change
- **State Synchronization**: Maintain data consistency across all related pages
- **Conflict Handling**: Handle concurrent modification conflicts

### 2. State-Driven Interface

#### 2.1 Entity State Display
- **Status Indicators**: Clearly display current entity status
- **Status Descriptions**: Provide explanatory text for status meanings
- **Transition Hints**: Display possible state transition operations

#### 2.2 Conditional Operation Display
Based on permission control defined by Attributive:
- **Dynamic Buttons**: Dynamically display action buttons based on permissions
- **Disabled States**: Show disabled operations when conditions aren't met
- **Permission Hints**: Explain why certain operations are unavailable

---

## User Interaction Flow Design

### 1. Typical Interaction Flows

#### 1.1 Creation Flow
```
Create New Entity Flow:
1. User clicks "New" button on list page
2. Jump to creation page
3. User fills in necessary information
4. System validates data validity
5. Call creation interaction
6. Display creation result
7. Jump to new entity detail page
```

#### 1.2 Edit Flow
```
Edit Entity Flow:
1. User clicks "Edit" button on detail page
2. Page switches to edit mode or jumps to edit page
3. User modifies information
4. System validates modified data
5. Call update interaction
6. Display update result
7. Return to detail page or refresh current page
```

#### 1.3 Association Operation Flow
```
Establish Association Flow:
1. User initiates association operation on entity A page
2. System displays list of associable entity B instances
3. User selects target entity B
4. System calls association creation interaction
5. Display association result
6. Update association information display on related pages
```

### 2. Complex Business Flows

#### 2.1 Multi-Step Operations
For complex business operations:
- **Step Indicators**: Display current progress and remaining steps
- **Data Saving**: Support draft saving in intermediate steps
- **Back to Modify**: Support returning to previous step for modifications
- **Final Confirmation**: Provide operation summary and final confirmation

#### 2.2 Approval Processes
For business processes involving approval:
- **Status Tracking**: Display approval progress and current stage
- **Operation History**: Display historical approval comments and operations
- **Notification Mechanism**: Message notifications for relevant personnel
- **Permission Control**: Different roles see different operation options

---

## Error Handling and User Feedback

### 1. Error Handling Strategy

#### 1.1 Data Validation Errors
- **Real-time Validation**: Immediate validation and prompts during input
- **Submit Validation**: Unified display of all errors upon submission
- **Error Location**: Highlight error fields and scroll to error position
- **Correction Suggestions**: Provide specific correction suggestions

#### 1.2 Permission Errors
- **Friendly Messages**: Explain permission restrictions in plain language
- **Solutions**: Provide ways to obtain permissions
- **Contact Information**: Provide administrator contact information
- **Alternative Operations**: Recommend alternative operations users can perform

#### 1.3 System Errors
- **Error Recovery**: Provide retry mechanisms
- **State Preservation**: Save user's current operation state
- **Error Reporting**: Allow users to report error information
- **Fallback Solutions**: Provide alternative solutions for basic functionality

### 2. Operation Feedback Design

#### 2.1 Immediate Feedback
- **Loading States**: Loading prompts during operations
- **Progress Display**: Progress bars for long-running operations
- **Status Changes**: Immediate status updates of interface elements
- **Audio Feedback**: Sound prompts for important operations (optional)

#### 2.2 Result Feedback
- **Success Messages**: Confirmation messages for successful operations
- **Failure Explanations**: Detailed reasons for operation failures
- **Impact Scope**: Explain operation's effect on other data
- **Next Steps**: Suggest user's next actions

---

## Design Checklist

After completing page design, use the following checklist to verify design completeness:

### 1. Entity Coverage Check
- [ ] Each primary entity has corresponding management pages
- [ ] Each entity's CRUD operations have interface entries
- [ ] Relationships between entities have navigation paths
- [ ] All computed properties are displayed in interface

### 2. Interaction Coverage Check
- [ ] Each interaction has corresponding interface operation
- [ ] Interaction permission control is reflected in interface
- [ ] Interaction parameters have input methods in interface
- [ ] Interaction results have feedback in interface

### 3. User Experience Check
- [ ] Users can complete all core business processes
- [ ] Navigation paths between pages are clear and reasonable
- [ ] Error situations have appropriate handling and prompts
- [ ] Operation feedback is timely and clear

### 4. Reactive Feature Check
- [ ] Reactive computation data can update in real-time
- [ ] Data across related pages remains synchronized
- [ ] Status changes are correctly reflected in interface
- [ ] Permission changes can dynamically update interface elements

---

## Summary

Frontend page design based on the interaqt framework should:

1. **Data-Centric**: Design page structure around entities and relationships
2. **Reactive-First**: Fully utilize the framework's reactive computation features
3. **Permission-Aware**: Dynamically adjust interface based on permission control
4. **State-Driven**: Provide corresponding operation options based on entity status
5. **User-Friendly**: Provide clear navigation and timely feedback

Through systematic analysis of the application's backend definitions, you can design frontend interfaces that both fully utilize framework features and conform to user usage habits. The key is understanding the data model and business logic, then transforming them into intuitive user interaction experiences.
