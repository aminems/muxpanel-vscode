# Muxpanel - Systems Engineering & Project Management for VS Code

<p align="center">
  <strong>Enterprise-grade systems engineering toolkit with AI-powered Copilot integration</strong>
</p>

---

## 🚀 What is Muxpanel?

Muxpanel brings **professional-grade systems engineering capabilities** directly into VS Code. Inspired by industry leaders like **Jama Connect**, **IBM DOORS**, and **Polarion**, Muxpanel provides a comprehensive toolkit for managing requirements, projects, tasks, and documentation—all enhanced with **GitHub Copilot AI integration**.

Whether you're building safety-critical systems, managing complex software projects, or just want better project organization, Muxpanel has you covered.

---

## ✨ Key Features

### 📋 Requirements Management
- **Hierarchical Requirements** - Organize requirements in a tree structure with parent-child relationships
- **12 Requirement Types** - Functional, Non-functional, Interface, Constraint, Business, Stakeholder, System, Software, Hardware, Performance, Safety, Security
- **Full Lifecycle Tracking** - Draft → Proposed → Under Review → Approved → Implemented → Verified → Released
- **Rich Metadata** - Priority, rationale, acceptance criteria, risk level, complexity, and custom fields

### 🔗 Traceability & Impact Analysis
- **Bidirectional Trace Links** - Connect requirements to other requirements, tasks, test cases, documents, and external items
- **20+ Link Types** - Derives-from, Satisfies, Verifies, Implements, Refines, Depends-on, Conflicts-with, and more
- **Suspect Link Detection** - Automatically flags links when source or target requirements change
- **Impact Analysis** - Visualize downstream effects of requirement changes

### 📊 Project Management
- **Interactive Gantt Charts** - Visualize project timelines with milestones and task dependencies
- **Milestone Tracking** - Create milestones displayed as diamonds on the timeline
- **Task Management** - Track tasks with priorities, due dates, assignees, and follow-ups
- **Progress Monitoring** - Real-time progress calculation and status dashboards

### 🤖 AI-Powered Copilot Integration
- **Natural Language Commands** - Create, update, and manage items using plain English
- **Autonomous Project Planning** - Describe your project and let AI generate requirements, milestones, and tasks
- **15 Integrated Tools** - Full CRUD operations available to the AI assistant
- **Smart Suggestions** - Context-aware follow-up suggestions

### 📝 Notes & Documentation
- **Structured Notes** - Meeting notes, decisions, technical notes, reviews, ideas, and issues
- **Markdown Support** - Rich text editing with full markdown support
- **Project Linking** - Associate notes with specific projects for context

### 🛡️ Baseline & Configuration Management
- **Requirement Baselines** - Snapshot requirements at specific points in time
- **Version History** - Track all changes with full audit trail
- **Change Records** - Detailed logging of who changed what and when

---

## 🎯 Use Cases

- **Systems Engineering** - Requirements management for safety-critical systems (aerospace, automotive, medical devices)
- **Software Development** - Track features, user stories, and technical requirements
- **Regulatory Compliance** - Maintain traceability for audits and certifications
- **Product Management** - Organize product requirements and roadmaps
- **Research Projects** - Document objectives, methods, and findings

---

## 🚦 Getting Started

### Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Muxpanel"
4. Click Install

### Quick Start

1. **Open the Muxpanel sidebar** - Click the Muxpanel icon in the Activity Bar
2. **Create a project** - Right-click in the Projects view → "Add Project"
3. **Add requirements** - Right-click in the Requirements view → "Add Requirement"
4. **Use Copilot** - Open chat and type `@muxpanel /plan Create a mobile app project`

---

## 💬 Copilot Commands

| Command | Description |
|---------|-------------|
| `@muxpanel /create` | Create requirements, tasks, notes, or projects |
| `@muxpanel /bulk` | Generate multiple related items at once |
| `@muxpanel /plan` | **Autonomously plan a complete project** |
| `@muxpanel /update` | Modify existing items |
| `@muxpanel /delete` | Remove items |
| `@muxpanel /schedule` | Manage milestones and timelines |
| `@muxpanel /trace` | Create and manage trace links |
| `@muxpanel /review` | Create baselines and clear suspect links |
| `@muxpanel /list` | List items with filters |
| `@muxpanel /status` | Show project statistics |
| `@muxpanel /find` | Search items or find suspect links |
| `@muxpanel /analyze` | Analyze coverage and impact |
| `@muxpanel /switch` | Change active project |

### Example: Autonomous Project Planning

```
@muxpanel /plan Create a project for a smart home automation system 
with user authentication, device control, scheduling, and energy monitoring
```

This single command will generate:
- ✅ A new project with start/end dates
- ✅ 3-5 milestones (Design, Development, Testing, Launch)
- ✅ 10-15 requirements covering all features
- ✅ 15-20 tasks linked to milestones
- ✅ Trace links between related requirements
- ✅ Initial project documentation notes

---

## ⚙️ Data Storage

Muxpanel stores all data in a `.muxpanel` folder within your workspace:

```
your-project/
├── .muxpanel/
│   ├── data.json       # All project data
│   └── backups/        # Automatic backups
└── ...
```

This means:
- ✅ Your data stays with your project
- ✅ Works offline
- ✅ Can be version controlled
- ✅ Easy to backup and migrate

---

## 🔧 Performance

Muxpanel is built for performance with:
- **Debounced saves** - Prevents rapid disk writes
- **LRU caching** - Fast access to frequently used items
- **Indexed collections** - O(1) lookups by ID, status, project
- **Atomic writes** - Data integrity protection
- **Pagination support** - Handles large datasets efficiently

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🔗 Links

- **Website:** [https://muxpanel.com](https://muxpanel.com)
- **Marketplace:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=muxpanel.muxpanel)

---

<p align="center">
  Made with ❤️ by the Muxpanel Team
</p>
