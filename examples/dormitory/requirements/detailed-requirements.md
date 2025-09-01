# Detailed Requirements Analysis - Dormitory Management System

Following the read-centric methodology, this analysis derives specific requirements from the refined goals identified in goal-clarification.md.

```json
{
  "system_name": "Dormitory Management System",
  "analysis_version": "1.0.0",
  "analysis_date": "2025-09-01",
  
  "goals": [
    {
      "id": "G001",
      "description": "Manage system users with authentication and role-based access",
      "stakeholder": "Global Administrator"
    },
    {
      "id": "G002",
      "description": "Create and manage dormitories with 4-6 beds each",
      "stakeholder": "Global Administrator"
    },
    {
      "id": "G003",
      "description": "Assign users to dormitory beds with one-user-per-bed constraint",
      "stakeholder": "Global Administrator"
    },
    {
      "id": "G004",
      "description": "Implement scoring system for user behavior with deduction rules",
      "stakeholder": "System"
    },
    {
      "id": "G005",
      "description": "Enable dormitory leaders to request user removal and administrators to approve/reject",
      "stakeholder": "Dormitory Leader, Global Administrator"
    },
    {
      "id": "G006",
      "description": "Provide administrative dashboards for system overview",
      "stakeholder": "Global Administrator, Dormitory Leader"
    },
    {
      "id": "G007",
      "description": "Ensure validation and error handling for all operations",
      "stakeholder": "System"
    },
    {
      "id": "G008",
      "description": "Track all significant actions for compliance and monitoring",
      "stakeholder": "Global Administrator"
    }
  ],
  
  "requirements": {
    "read": [
      {
        "id": "RR001",
        "description": "View all users with their roles and assignments",
        "derived_from": ["G001", "G006"],
        "data_scope": "User data including role, current dormitory assignment, behavior score",
        "access_patterns": ["search", "filter", "sort"]
      },
      {
        "id": "RR002",
        "description": "View all dormitories with bed occupancy status",
        "derived_from": ["G002", "G006"],
        "data_scope": "Dormitory data including bed count, current occupants, leader assignment",
        "access_patterns": ["search", "filter", "sort"]
      },
      {
        "id": "RR003",
        "description": "View available beds for assignment",
        "derived_from": ["G003", "G006"],
        "data_scope": "Unoccupied beds across all dormitories",
        "access_patterns": ["filter", "search"]
      },
      {
        "id": "RR004",
        "description": "View user behavior scores and scoring history",
        "derived_from": ["G004", "G006"],
        "data_scope": "Current score, score changes, scoring events with reasons",
        "access_patterns": ["search", "filter", "sort", "aggregate"]
      },
      {
        "id": "RR005",
        "description": "View pending and processed removal requests",
        "derived_from": ["G005", "G006"],
        "data_scope": "Removal requests with requester, target user, reason, status",
        "access_patterns": ["search", "filter", "sort"]
      },
      {
        "id": "RR006",
        "description": "View system audit trail and action logs",
        "derived_from": ["G008", "G006"],
        "data_scope": "All system actions with timestamp, actor, action type, affected entities",
        "access_patterns": ["search", "filter", "sort", "aggregate"]
      },
      {
        "id": "RR007",
        "description": "View dormitory-specific user list and scores",
        "derived_from": ["G005", "G006"],
        "data_scope": "Users assigned to a specific dormitory with their current scores",
        "access_patterns": ["search", "filter", "sort"]
      },
      {
        "id": "RR008",
        "description": "View current user profile and assignment status",
        "derived_from": ["G001", "G003"],
        "data_scope": "Individual user's own profile, dormitory assignment, current score",
        "access_patterns": ["search"]
      }
    ],
    "write": [
      {
        "id": "WR001",
        "description": "Create new user accounts with role assignment",
        "derived_from": ["G001"],
        "enables_reads": ["RR001", "RR008"],
        "operation_type": "create",
        "data_affected": "User entity with authentication credentials and role"
      },
      {
        "id": "WR002",
        "description": "Assign dormitory leader role to users",
        "derived_from": ["G001"],
        "enables_reads": ["RR001", "RR002"],
        "operation_type": "update",
        "data_affected": "User role and dormitory leadership assignment"
      },
      {
        "id": "WR003",
        "description": "Create new dormitories with bed specifications",
        "derived_from": ["G002"],
        "enables_reads": ["RR002", "RR003"],
        "operation_type": "create",
        "data_affected": "Dormitory entity with bed count and configuration"
      },
      {
        "id": "WR004",
        "description": "Assign users to dormitory beds",
        "derived_from": ["G003"],
        "enables_reads": ["RR001", "RR002", "RR003", "RR008"],
        "operation_type": "create",
        "data_affected": "BedAssignment relation between user and bed"
      },
      {
        "id": "WR005",
        "description": "Apply behavior score deductions with reasons",
        "derived_from": ["G004"],
        "enables_reads": ["RR004", "RR007"],
        "operation_type": "create",
        "data_affected": "ScoreEvent entity and user's current score"
      },
      {
        "id": "WR006",
        "description": "Create removal requests for problematic users",
        "derived_from": ["G005"],
        "enables_reads": ["RR005"],
        "operation_type": "create",
        "data_affected": "RemovalRequest entity with requester and target user"
      },
      {
        "id": "WR007",
        "description": "Approve or reject removal requests",
        "derived_from": ["G005"],
        "enables_reads": ["RR005"],
        "operation_type": "update",
        "data_affected": "RemovalRequest status and approval details"
      },
      {
        "id": "WR008",
        "description": "Remove users from dormitory assignments",
        "derived_from": ["G005"],
        "enables_reads": ["RR001", "RR002", "RR003"],
        "operation_type": "delete",
        "data_affected": "BedAssignment relation removal"
      },
      {
        "id": "WR009",
        "description": "Log all significant system actions",
        "derived_from": ["G008"],
        "enables_reads": ["RR006"],
        "operation_type": "create",
        "data_affected": "AuditLog entity for compliance tracking"
      }
    ]
  },
  
  "interactions": [
    {
      "id": "I001",
      "name": "CreateUser",
      "fulfills_requirements": ["WR001", "RR001"],
      "specification": {
        "role": "Global Administrator",
        "action": "Create",
        "data": "User account with role assignment",
        "payload": {
          "username": "string",
          "email": "string",
          "password": "string",
          "role": "string",
          "fullName": "string"
        },
        "conditions": [
          "Username must be unique",
          "Email must be unique and valid format",
          "Role must be one of: administrator, dormitory_leader, regular_user",
          "Password must meet security requirements"
        ]
      }
    },
    {
      "id": "I002",
      "name": "AssignDormitoryLeader",
      "fulfills_requirements": ["WR002", "RR001"],
      "specification": {
        "role": "Global Administrator",
        "action": "Update",
        "data": "User role and dormitory leadership assignment",
        "payload": {
          "userId": "string",
          "dormitoryId": "string"
        },
        "conditions": [
          "User must exist and be active",
          "Dormitory must exist",
          "User cannot be currently assigned to a bed in any dormitory",
          "Dormitory cannot already have an assigned leader"
        ]
      }
    },
    {
      "id": "I003",
      "name": "CreateDormitory",
      "fulfills_requirements": ["WR003", "RR002"],
      "specification": {
        "role": "Global Administrator",
        "action": "Create",
        "data": "Dormitory with bed specifications",
        "payload": {
          "name": "string",
          "bedCount": "number",
          "building": "string",
          "floor": "number"
        },
        "conditions": [
          "Dormitory name must be unique",
          "Bed count must be between 4 and 6 inclusive",
          "Building and floor must be specified"
        ]
      }
    },
    {
      "id": "I004",
      "name": "AssignUserToBed",
      "fulfills_requirements": ["WR004", "RR003"],
      "specification": {
        "role": "Global Administrator",
        "action": "Create",
        "data": "Bed assignment for user",
        "payload": {
          "userId": "string",
          "dormitoryId": "string",
          "bedNumber": "number"
        },
        "conditions": [
          "User must exist and be active",
          "User must not already be assigned to any bed",
          "Dormitory must exist",
          "Bed must exist and be unoccupied",
          "Bed number must be valid for the dormitory"
        ]
      }
    },
    {
      "id": "I005",
      "name": "ApplyScoreDeduction",
      "fulfills_requirements": ["WR005", "RR004"],
      "specification": {
        "role": "Dormitory Leader",
        "action": "Create",
        "data": "Behavior score deduction event",
        "payload": {
          "userId": "string",
          "deductionAmount": "number",
          "reason": "string",
          "category": "string"
        },
        "conditions": [
          "User must be assigned to requester's dormitory",
          "Deduction amount must be positive",
          "Reason must be provided and non-empty",
          "Category must be from predefined list"
        ]
      }
    },
    {
      "id": "I006",
      "name": "CreateRemovalRequest",
      "fulfills_requirements": ["WR006", "RR005"],
      "specification": {
        "role": "Dormitory Leader",
        "action": "Create",
        "data": "User removal request",
        "payload": {
          "targetUserId": "string",
          "reason": "string",
          "urgency": "string"
        },
        "conditions": [
          "Target user must be assigned to requester's dormitory",
          "Target user's score must be below removal threshold",
          "Reason must be provided",
          "No pending removal request for same user"
        ]
      }
    },
    {
      "id": "I007",
      "name": "ProcessRemovalRequest",
      "fulfills_requirements": ["WR007", "RR005"],
      "specification": {
        "role": "Global Administrator",
        "action": "Update",
        "data": "Removal request approval status",
        "payload": {
          "requestId": "string",
          "decision": "string",
          "notes": "string"
        },
        "conditions": [
          "Request must exist and be in pending status",
          "Decision must be 'approved' or 'rejected'",
          "Notes are required for rejection"
        ]
      }
    },
    {
      "id": "I008",
      "name": "RemoveUserFromDormitory",
      "fulfills_requirements": ["WR008", "RR003"],
      "specification": {
        "role": "Global Administrator",
        "action": "Delete",
        "data": "User bed assignment",
        "payload": {
          "userId": "string",
          "effective": "date"
        },
        "conditions": [
          "User must have current bed assignment",
          "Must have approved removal request or administrative override",
          "Effective date cannot be in the past"
        ]
      }
    },
    {
      "id": "I009",
      "name": "ViewUserList",
      "fulfills_requirements": ["RR001"],
      "specification": {
        "role": "Global Administrator",
        "action": "Retrieve",
        "data": "List of all users with assignments and scores",
        "payload": {
          "filters": "object",
          "sortBy": "string",
          "sortOrder": "string"
        },
        "conditions": [
          "Must have administrator privileges"
        ]
      }
    },
    {
      "id": "I010",
      "name": "ViewDormitoryList",
      "fulfills_requirements": ["RR002"],
      "specification": {
        "role": "Global Administrator, Dormitory Leader",
        "action": "Retrieve",
        "data": "List of dormitories with occupancy status",
        "payload": {
          "filters": "object"
        },
        "conditions": [
          "Dormitory leaders can only view their assigned dormitory"
        ]
      }
    },
    {
      "id": "I011",
      "name": "ViewMyDormitoryUsers",
      "fulfills_requirements": ["RR007"],
      "specification": {
        "role": "Dormitory Leader",
        "action": "Retrieve",
        "data": "Users assigned to leader's dormitory",
        "payload": {},
        "conditions": [
          "Must be assigned as leader to a dormitory"
        ]
      }
    },
    {
      "id": "I012",
      "name": "ViewMyProfile",
      "fulfills_requirements": ["RR008"],
      "specification": {
        "role": "Regular User, Dormitory Leader",
        "action": "Retrieve",
        "data": "Own profile and assignment information",
        "payload": {},
        "conditions": [
          "Must be authenticated"
        ]
      }
    },
    {
      "id": "I013",
      "name": "ViewAuditLog",
      "fulfills_requirements": ["RR006"],
      "specification": {
        "role": "Global Administrator",
        "action": "Retrieve",
        "data": "System audit trail and action logs",
        "payload": {
          "dateRange": "object",
          "actionType": "string",
          "userId": "string"
        },
        "conditions": [
          "Must have administrator privileges"
        ]
      }
    }
  ],
  
  "data_concepts": {
    "dictionaries": [
      {
        "name": "SystemSettings",
        "keys": ["scoringRules", "removalThreshold", "maxDormitorySize", "minDormitorySize"],
        "used_by": ["I005", "I006", "I003"]
      }
    ],
    "entities": [
      {
        "name": "User",
        "properties": [
          {
            "name": "id",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "username",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "email",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "fullName",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "role",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "currentScore",
            "type": "number",
            "required": true,
            "derived": true
          },
          {
            "name": "isActive",
            "type": "boolean",
            "required": true,
            "derived": false
          },
          {
            "name": "createdAt",
            "type": "date",
            "required": true,
            "derived": false
          }
        ],
        "referenced_in": ["RR001", "RR008", "WR001", "WR002", "I001", "I002", "I004", "I005", "I006", "I008", "I009", "I012"]
      },
      {
        "name": "Dormitory",
        "properties": [
          {
            "name": "id",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "name",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "bedCount",
            "type": "number",
            "required": true,
            "derived": false
          },
          {
            "name": "building",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "floor",
            "type": "number",
            "required": true,
            "derived": false
          },
          {
            "name": "occupiedBeds",
            "type": "number",
            "required": true,
            "derived": true
          },
          {
            "name": "availableBeds",
            "type": "number",
            "required": true,
            "derived": true
          }
        ],
        "referenced_in": ["RR002", "RR003", "WR003", "I003", "I004", "I010"]
      },
      {
        "name": "ScoreEvent",
        "properties": [
          {
            "name": "id",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "amount",
            "type": "number",
            "required": true,
            "derived": false
          },
          {
            "name": "reason",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "category",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "timestamp",
            "type": "date",
            "required": true,
            "derived": false
          }
        ],
        "referenced_in": ["RR004", "WR005", "I005"]
      },
      {
        "name": "RemovalRequest",
        "properties": [
          {
            "name": "id",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "reason",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "urgency",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "status",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "createdAt",
            "type": "date",
            "required": true,
            "derived": false
          },
          {
            "name": "processedAt",
            "type": "date",
            "required": false,
            "derived": false
          },
          {
            "name": "notes",
            "type": "string",
            "required": false,
            "derived": false
          }
        ],
        "referenced_in": ["RR005", "WR006", "WR007", "I006", "I007"]
      },
      {
        "name": "AuditLog",
        "properties": [
          {
            "name": "id",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "actionType",
            "type": "string",
            "required": true,
            "derived": false
          },
          {
            "name": "timestamp",
            "type": "date",
            "required": true,
            "derived": false
          },
          {
            "name": "details",
            "type": "string",
            "required": false,
            "derived": false
          }
        ],
        "referenced_in": ["RR006", "WR009", "I013"]
      }
    ],
    "relations": [
      {
        "name": "BedAssignment",
        "from_entity": "User",
        "to_entity": "Dormitory",
        "cardinality": "many-to-one",
        "properties": [
          {
            "name": "bedNumber",
            "type": "number",
            "required": true,
            "derived": false
          },
          {
            "name": "assignedAt",
            "type": "date",
            "required": true,
            "derived": false
          }
        ],
        "referenced_in": ["RR003", "WR004", "WR008", "I004", "I008"]
      },
      {
        "name": "DormitoryLeadership",
        "from_entity": "User",
        "to_entity": "Dormitory",
        "cardinality": "one-to-one",
        "properties": [
          {
            "name": "assignedAt",
            "type": "date",
            "required": true,
            "derived": false
          }
        ],
        "referenced_in": ["RR002", "WR002", "I002"]
      },
      {
        "name": "UserScoring",
        "from_entity": "User",
        "to_entity": "ScoreEvent",
        "cardinality": "one-to-many",
        "properties": [],
        "referenced_in": ["RR004", "WR005", "I005"]
      },
      {
        "name": "RemovalRequesting",
        "from_entity": "User",
        "to_entity": "RemovalRequest",
        "cardinality": "one-to-many",
        "properties": [
          {
            "name": "role",
            "type": "string",
            "required": true,
            "derived": false
          }
        ],
        "referenced_in": ["RR005", "WR006", "I006"]
      },
      {
        "name": "AuditTracking",
        "from_entity": "User",
        "to_entity": "AuditLog",
        "cardinality": "one-to-many",
        "properties": [],
        "referenced_in": ["RR006", "WR009", "I013"]
      }
    ]
  },
  
  "roles": [
    {
      "name": "Global Administrator",
      "description": "System-wide management authority with full access to all operations",
      "permissions": ["I001", "I002", "I003", "I004", "I007", "I008", "I009", "I010", "I013"]
    },
    {
      "name": "Dormitory Leader",
      "description": "Dormitory-specific management authority with user oversight responsibilities",
      "permissions": ["I005", "I006", "I010", "I011", "I012"]
    },
    {
      "name": "Regular User",
      "description": "Standard dormitory resident with limited self-service capabilities",
      "permissions": ["I012"]
    }
  ]
}
```